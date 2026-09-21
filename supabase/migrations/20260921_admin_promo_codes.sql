begin;

-- School Pixel Battle: управление промокодами из админ-панели.

create or replace function public.admin_create_promo_code(
    p_code text,
    p_title text,
    p_duration_seconds integer,
    p_cooldown_seconds integer,
    p_max_redemptions integer,
    p_valid_days integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_now timestamptz := clock_timestamp();
    v_normalized_code text;
    v_hash text;
    v_id bigint;
    v_expires_at timestamptz;
begin
    if auth.uid() is null or not exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role = 'admin'
          and banned = false
    ) then
        raise exception 'ADMIN_REQUIRED';
    end if;

    v_normalized_code := upper(trim(coalesce(p_code, '')));

    if v_normalized_code !~ '^[A-Z0-9-]{6,64}$' then
        raise exception 'INVALID_PROMO_FORMAT';
    end if;

    if length(trim(coalesce(p_title, ''))) not between 3 and 50 then
        raise exception 'INVALID_TITLE';
    end if;

    if p_duration_seconds not between 60 and 86400 then
        raise exception 'INVALID_DURATION';
    end if;

    if p_cooldown_seconds not between 1 and 4 then
        raise exception 'INVALID_COOLDOWN';
    end if;

    if p_max_redemptions not between 1 and 1000 then
        raise exception 'INVALID_MAX_REDEMPTIONS';
    end if;

    if p_valid_days not between 0 and 365 then
        raise exception 'INVALID_VALID_DAYS';
    end if;

    v_hash := encode(
        extensions.digest(v_normalized_code, 'sha256'),
        'hex'
    );

    v_expires_at := case
        when p_valid_days = 0 then null
        else v_now + make_interval(days => p_valid_days)
    end;

    insert into public.promo_codes (
        code_hash,
        code_hint,
        title,
        reward_type,
        duration_seconds,
        cooldown_seconds,
        max_redemptions,
        expires_at,
        created_at
    )
    values (
        v_hash,
        '…' || right(v_normalized_code, 4),
        trim(p_title),
        'pixel_hour',
        p_duration_seconds,
        p_cooldown_seconds,
        p_max_redemptions,
        v_expires_at,
        v_now
    )
    returning id into v_id;

    return jsonb_build_object(
        'success', true,
        'id', v_id,
        'code', v_normalized_code,
        'code_hint', '…' || right(v_normalized_code, 4),
        'title', trim(p_title),
        'reward_type', 'pixel_hour',
        'duration_seconds', p_duration_seconds,
        'cooldown_seconds', p_cooldown_seconds,
        'max_redemptions', p_max_redemptions,
        'expires_at', v_expires_at,
        'created_at', v_now
    );
exception
    when unique_violation then
        return jsonb_build_object(
            'success', false,
            'reason', 'CODE_ALREADY_EXISTS'
        );
end;
$$;

create or replace function public.admin_get_promo_codes()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_now timestamptz := clock_timestamp();
    v_codes jsonb;
begin
    if auth.uid() is null or not exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role = 'admin'
          and banned = false
    ) then
        raise exception 'ADMIN_REQUIRED';
    end if;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', c.id,
                'code_hint', c.code_hint,
                'title', c.title,
                'reward_type', c.reward_type,
                'duration_seconds', c.duration_seconds,
                'cooldown_seconds', c.cooldown_seconds,
                'max_redemptions', c.max_redemptions,
                'redemption_count', c.redemption_count,
                'active', c.active,
                'expires_at', c.expires_at,
                'created_at', c.created_at,
                'status', case
                    when not c.active then 'disabled'
                    when c.expires_at is not null
                         and c.expires_at <= v_now then 'expired'
                    when c.redemption_count >= c.max_redemptions then 'used'
                    else 'active'
                end
            )
            order by c.created_at desc
        ),
        '[]'::jsonb
    )
    into v_codes
    from (
        select *
        from public.promo_codes
        order by created_at desc
        limit 200
    ) c;

    return jsonb_build_object(
        'success', true,
        'codes', v_codes,
        'server_now', v_now
    );
end;
$$;

create or replace function public.admin_set_promo_active(
    p_promo_id bigint,
    p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_updated public.promo_codes%rowtype;
begin
    if auth.uid() is null or not exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role = 'admin'
          and banned = false
    ) then
        raise exception 'ADMIN_REQUIRED';
    end if;

    update public.promo_codes
    set active = p_active
    where id = p_promo_id
    returning * into v_updated;

    if not found then
        raise exception 'PROMO_NOT_FOUND';
    end if;

    return jsonb_build_object(
        'success', true,
        'id', v_updated.id,
        'active', v_updated.active
    );
end;
$$;

-- Возвращаем ученику фактический cooldown созданного администратором бонуса.
create or replace function public.get_my_promo_status()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_user_id uuid := auth.uid();
    v_now timestamptz := clock_timestamp();
    v_until timestamptz;
    v_title text;
    v_cooldown integer;
begin
    if v_user_id is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    select r.benefit_until, c.title, c.cooldown_seconds
    into v_until, v_title, v_cooldown
    from public.promo_redemptions r
    join public.promo_codes c on c.id = r.promo_code_id
    where r.user_id = v_user_id
      and c.reward_type = 'pixel_hour'
      and r.benefit_until > v_now
    order by r.benefit_until desc
    limit 1;

    return jsonb_build_object(
        'active', v_until is not null,
        'title', v_title,
        'benefit_until', v_until,
        'remaining_seconds', case
            when v_until is null then 0
            else greatest(
                0,
                floor(extract(epoch from (v_until - v_now)))::integer
            )
        end,
        'cooldown', v_cooldown,
        'server_now', v_now
    );
end;
$$;

-- place_pixel() уже читает промокоды. Расширяем запрос так,
-- чтобы cooldown брался из настройки конкретного кода.
do $migration$
declare
    v_definition text;
    v_old text := $old$
    select max(active_until)
    into v_boost_until
    from (
        select boost_until as active_until
        from public.daily_task_progress
        where user_id = v_user_id
          and boost_activated_at is not null
          and boost_until > v_now

        union all

        select r.benefit_until as active_until
        from public.promo_redemptions r
        join public.promo_codes c on c.id = r.promo_code_id
        where r.user_id = v_user_id
          and c.reward_type = 'pixel_hour'
          and r.benefit_until > v_now
    ) active_pixel_boosts;

    if v_boost_until is not null then
        v_boost_active := true;
        v_cooldown_seconds := 1;
    end if;
$old$;
    v_new text := $new$
    select
        max(active_until),
        coalesce(min(active_cooldown), 5)
    into
        v_boost_until,
        v_cooldown_seconds
    from (
        select
            boost_until as active_until,
            1 as active_cooldown
        from public.daily_task_progress
        where user_id = v_user_id
          and boost_activated_at is not null
          and boost_until > v_now

        union all

        select
            r.benefit_until as active_until,
            c.cooldown_seconds as active_cooldown
        from public.promo_redemptions r
        join public.promo_codes c on c.id = r.promo_code_id
        where r.user_id = v_user_id
          and c.reward_type = 'pixel_hour'
          and r.benefit_until > v_now
    ) active_pixel_boosts;

    if v_boost_until is not null then
        v_boost_active := true;
    end if;
$new$;
    v_occurrences integer;
begin
    select pg_get_functiondef(
        'public.place_pixel(integer,integer,text)'::regprocedure
    )
    into v_definition;

    v_occurrences := (
        length(v_definition) - length(replace(v_definition, v_old, ''))
    ) / length(v_old);

    if v_occurrences <> 1 then
        raise exception
            'PLACE_PIXEL_PROMO_DEFINITION_CHANGED: expected 1 promo block, found %',
            v_occurrences;
    end if;

    execute replace(v_definition, v_old, v_new);
end;
$migration$;

revoke all on function public.admin_create_promo_code(
    text, text, integer, integer, integer, integer
) from public, anon;
revoke all on function public.admin_get_promo_codes()
    from public, anon;
revoke all on function public.admin_set_promo_active(bigint, boolean)
    from public, anon;

grant execute on function public.admin_create_promo_code(
    text, text, integer, integer, integer, integer
) to authenticated;
grant execute on function public.admin_get_promo_codes()
    to authenticated;
grant execute on function public.admin_set_promo_active(bigint, boolean)
    to authenticated;

revoke all on function public.get_my_promo_status()
    from public, anon;
grant execute on function public.get_my_promo_status()
    to authenticated;

revoke all on function public.place_pixel(integer, integer, text)
    from public, anon;
grant execute on function public.place_pixel(integer, integer, text)
    to authenticated;

commit;

select jsonb_build_object(
    'create_rpc',
        to_regprocedure(
            'public.admin_create_promo_code(text,text,integer,integer,integer,integer)'
        ) is not null,
    'list_rpc',
        to_regprocedure('public.admin_get_promo_codes()') is not null,
    'toggle_rpc',
        to_regprocedure(
            'public.admin_set_promo_active(bigint,boolean)'
        ) is not null,
    'place_pixel_uses_configured_cooldown',
        position(
            'c.cooldown_seconds as active_cooldown'
            in pg_get_functiondef(
                'public.place_pixel(integer,integer,text)'::regprocedure
            )
        ) > 0
) as admin_promo_install_check;
