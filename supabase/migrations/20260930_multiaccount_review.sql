-- Multi-account review signals for administrators.
-- No automatic bans: shared networks are common in schools and mobile carriers.
-- Device values are one-way SHA-256 hashes supplied by the authenticated browser.

begin;

create table if not exists public.student_device_signals (
    user_id uuid not null references public.profiles(id) on delete cascade,
    installation_hash text not null,
    fingerprint_hash text not null,
    first_seen timestamptz not null default now(),
    last_seen timestamptz not null default now(),
    seen_count bigint not null default 1,
    primary key (user_id, installation_hash),
    constraint student_device_installation_hash_check
        check (installation_hash ~ '^[0-9a-f]{64}$'),
    constraint student_device_fingerprint_hash_check
        check (fingerprint_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists student_device_signals_installation_idx
    on public.student_device_signals (installation_hash, last_seen desc);

create index if not exists student_device_signals_fingerprint_idx
    on public.student_device_signals (fingerprint_hash, last_seen desc);

create index if not exists pixel_history_multiaccount_recent_idx
    on public.pixel_history (user_id, created_at desc, season_id, x, y);

create index if not exists pixel_history_multiaccount_cell_idx
    on public.pixel_history (season_id, x, y, created_at, user_id);

alter table public.student_device_signals enable row level security;

revoke all on table public.student_device_signals
    from public, anon, authenticated;

create or replace function public.record_my_device_signal(
    p_installation_hash text,
    p_fingerprint_hash text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_installation_hash text := lower(btrim(coalesce(p_installation_hash, '')));
    v_fingerprint_hash text := lower(btrim(coalesce(p_fingerprint_hash, '')));
begin
    if v_user_id is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    if v_installation_hash !~ '^[0-9a-f]{64}$'
       or v_fingerprint_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'INVALID_DEVICE_SIGNAL';
    end if;

    if not exists (
        select 1
        from public.profiles p
        where p.id = v_user_id
          and coalesce(p.banned, false) = false
    ) then
        raise exception 'PROFILE_NOT_FOUND_OR_BANNED';
    end if;

    insert into public.student_device_signals (
        user_id,
        installation_hash,
        fingerprint_hash,
        first_seen,
        last_seen,
        seen_count
    )
    values (
        v_user_id,
        v_installation_hash,
        v_fingerprint_hash,
        clock_timestamp(),
        clock_timestamp(),
        1
    )
    on conflict (user_id, installation_hash)
    do update set
        fingerprint_hash = excluded.fingerprint_hash,
        last_seen = clock_timestamp(),
        seen_count = public.student_device_signals.seen_count + 1;
end;
$$;

revoke all on function public.record_my_device_signal(text, text)
    from public, anon;
grant execute on function public.record_my_device_signal(text, text)
    to authenticated;

create or replace function public.admin_get_multiaccount_risk()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
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
    recent_devices as (
        select *
        from public.student_device_signals
        where last_seen >= clock_timestamp() - interval '180 days'
    ),
    recent_ips as (
        select *
        from public.student_ip_addresses
        where last_seen >= clock_timestamp() - interval '90 days'
    ),
    base_signals as (
        select distinct
            a.user_id as user_a_id,
            b.user_id as user_b_id,
            'same_installation'::text as signal_code,
            'Одна установка браузера'::text as signal_label,
            70::integer as points
        from recent_devices a
        join recent_devices b
          on b.installation_hash = a.installation_hash
         and a.user_id < b.user_id

        union all

        select distinct
            a.user_id,
            b.user_id,
            'same_fingerprint',
            'Похожее устройство и браузер',
            20
        from recent_devices a
        join recent_devices b
          on b.fingerprint_hash = a.fingerprint_hash
         and a.user_id < b.user_id

        union all

        select distinct
            a.user_id,
            b.user_id,
            'same_ip',
            'Одинаковый IP-адрес',
            15
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
    behavior_counts as (
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
    behavior_signals as (
        select
            user_a_id,
            user_b_id,
            'close_repaints'::text,
            ('Частые действия на одних клетках: ' || close_repaints)::text,
            15::integer
        from behavior_counts
    ),
    all_signals as (
        select * from base_signals
        union all
        select * from subnet_signals
        union all
        select * from behavior_signals
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
                    when scored.risk_score >= 70 then 'high'
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
    'device_signals_table', to_regclass('public.student_device_signals') is not null,
    'record_function', to_regprocedure('public.record_my_device_signal(text,text)') is not null,
    'admin_risk_function', to_regprocedure('public.admin_get_multiaccount_risk()') is not null
) as result;
