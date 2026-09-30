-- Multi-account review for administrators using data the game already stores.
-- Shared school/mobile networks are weak evidence and never trigger an automatic ban.
-- No device fingerprinting and no automatic sanctions.

begin;

create index if not exists pixel_history_multiaccount_recent_idx
    on public.pixel_history (user_id, created_at desc, season_id, x, y);

create index if not exists pixel_history_multiaccount_cell_idx
    on public.pixel_history (season_id, x, y, created_at, user_id);

create or replace function public.admin_get_multiaccount_risk()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
    v_result jsonb;
begin
    if auth.uid() is null or not exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'admin'
          and coalesce(p.banned, false) = false
    ) then
        raise exception 'ADMIN_REQUIRED';
    end if;

    with
    recent_ips as (
        select *
        from public.student_ip_addresses
        where last_seen >= clock_timestamp() - interval '90 days'
    ),
    profile_names as (
        select
            p.id,
            regexp_replace(
                lower(coalesce(p.username, '')),
                '[0-9_.-]+$',
                ''
            ) as username_stem
        from public.profiles p
        where coalesce(p.role, 'student') <> 'admin'
    ),
    base_signals as (
        select distinct
            a.user_id as user_a_id,
            b.user_id as user_b_id,
            'same_ip'::text as signal_code,
            'Одинаковый IP-адрес'::text as signal_label,
            15::integer as points
        from recent_ips a
        join recent_ips b
          on b.ip_address = a.ip_address
         and a.user_id < b.user_id

        union all

        select
            case when sr.inviter_id < sr.invited_id
                then sr.inviter_id else sr.invited_id end,
            case when sr.inviter_id < sr.invited_id
                then sr.invited_id else sr.inviter_id end,
            'referral_link',
            'Аккаунты связаны рефералом',
            5
        from public.student_referrals sr

        union all

        select
            a.id,
            b.id,
            'similar_login',
            'Очень похожие логины',
            20
        from profile_names a
        join profile_names b
          on a.id < b.id
         and length(a.username_stem) >= 4
         and a.username_stem = b.username_stem
    ),
    candidates as (
        select distinct user_a_id, user_b_id
        from base_signals
    ),
    subnet_signals as (
        select distinct
            c.user_a_id,
            c.user_b_id,
            'same_network'::text as signal_code,
            'Одна сеть /24 или /64'::text as signal_label,
            2::integer as points
        from candidates c
        join recent_ips a on a.user_id = c.user_a_id
        join recent_ips b on b.user_id = c.user_b_id
        where family(a.ip_address) = family(b.ip_address)
          and (
              (family(a.ip_address) = 4
               and set_masklen(a.ip_address, 24) = set_masklen(b.ip_address, 24))
              or
              (family(a.ip_address) = 6
               and set_masklen(a.ip_address, 64) = set_masklen(b.ip_address, 64))
          )
          and a.ip_address <> b.ip_address
    ),
    registration_signals as (
        select
            c.user_a_id,
            c.user_b_id,
            'close_registration'::text as signal_code,
            'Регистрация с разницей менее 30 минут'::text as signal_label,
            10::integer as points
        from candidates c
        join auth.users a on a.id = c.user_a_id
        join auth.users b on b.id = c.user_b_id
        where abs(extract(epoch from (a.created_at - b.created_at))) <= 1800
    ),
    same_cell_counts as (
        select
            c.user_a_id,
            c.user_b_id,
            count(*)::bigint as close_repaints
        from candidates c
        join public.pixel_history a
          on a.user_id = c.user_a_id
         and a.created_at >= clock_timestamp() - interval '14 days'
        join public.pixel_history b
          on b.user_id = c.user_b_id
         and b.season_id = a.season_id
         and b.x = a.x
         and b.y = a.y
         and b.created_at between
             a.created_at - interval '15 seconds'
             and a.created_at + interval '15 seconds'
        group by c.user_a_id, c.user_b_id
        having count(*) >= 8
    ),
    same_cell_signals as (
        select
            user_a_id,
            user_b_id,
            'close_repaints'::text as signal_code,
            ('Частые действия на одних клетках: ' || close_repaints)::text as signal_label,
            15::integer as points
        from same_cell_counts
    ),
    synchronized_counts as (
        select
            c.user_a_id,
            c.user_b_id,
            count(*)::bigint as synchronized_actions
        from candidates c
        join public.pixel_history a
          on a.user_id = c.user_a_id
         and a.created_at >= clock_timestamp() - interval '48 hours'
        join public.pixel_history b
          on b.user_id = c.user_b_id
         and b.created_at between
             a.created_at - interval '2 seconds'
             and a.created_at + interval '2 seconds'
        group by c.user_a_id, c.user_b_id
        having count(*) >= 20
    ),
    synchronized_signals as (
        select
            user_a_id,
            user_b_id,
            'synchronized_activity'::text as signal_code,
            ('Синхронные действия: ' || synchronized_actions)::text as signal_label,
            10::integer as points
        from synchronized_counts
    ),
    all_signals as (
        select * from base_signals
        union all
        select * from subnet_signals
        union all
        select * from registration_signals
        union all
        select * from same_cell_signals
        union all
        select * from synchronized_signals
    ),
    deduplicated as (
        select distinct on (user_a_id, user_b_id, signal_code)
            user_a_id,
            user_b_id,
            signal_code,
            signal_label,
            points
        from all_signals
        order by user_a_id, user_b_id, signal_code, points desc
    ),
    scored as (
        select
            user_a_id,
            user_b_id,
            least(100, sum(points))::integer as risk_score,
            jsonb_agg(signal_label order by points desc, signal_label) as reasons
        from deduplicated
        group by user_a_id, user_b_id
    )
    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'user_a_id', scored.user_a_id,
                'user_a_username', pa.username,
                'user_a_nickname', pa.nickname,
                'user_a_class', ca.name,
                'user_b_id', scored.user_b_id,
                'user_b_username', pb.username,
                'user_b_nickname', pb.nickname,
                'user_b_class', cb.name,
                'risk_score', scored.risk_score,
                'risk_level', case
                    when scored.risk_score >= 50 then 'high'
                    when scored.risk_score >= 30 then 'medium'
                    else 'low'
                end,
                'reasons', scored.reasons
            )
            order by scored.risk_score desc, pa.username, pb.username
        ),
        '[]'::jsonb
    )
    into v_result
    from scored
    join public.profiles pa on pa.id = scored.user_a_id
    join public.profiles pb on pb.id = scored.user_b_id
    left join public.classes ca on ca.id = pa.class_id
    left join public.classes cb on cb.id = pb.class_id
    where coalesce(pa.role, 'student') <> 'admin'
      and coalesce(pb.role, 'student') <> 'admin';

    return v_result;
end;
$$;

revoke all on function public.admin_get_multiaccount_risk()
    from public, anon;
grant execute on function public.admin_get_multiaccount_risk()
    to authenticated;

notify pgrst, 'reload schema';

commit;

select jsonb_build_object(
    'admin_risk_function',
        to_regprocedure('public.admin_get_multiaccount_risk()') is not null,
    'device_fingerprinting', false,
    'automatic_bans', false
) as result;
