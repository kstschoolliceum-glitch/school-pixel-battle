begin;

-- Existing pixel-hour codes keep their original RPC and behavior.
alter table public.promo_codes
  drop constraint if exists promo_codes_reward_type_check;
alter table public.promo_codes
  add constraint promo_codes_reward_type_check
  check (reward_type in ('pixel_hour', 'map_item'));
alter table public.promo_codes
  add column item_type text,
  add column item_quantity integer;
alter table public.promo_codes
  add constraint promo_codes_item_reward_check check (
    (reward_type = 'pixel_hour' and item_type is null and item_quantity is null)
    or (reward_type = 'map_item' and item_type in ('bomb', 'beacon', 'detector')
        and item_quantity between 1 and 100)
  );

-- The existing inventory constraint caps each item type at 100 per student.
alter table public.map_item_ledger
  add column promo_code_id bigint references public.promo_codes(id) on delete restrict;
alter table public.map_item_ledger
  drop constraint if exists map_item_ledger_action_check;
alter table public.map_item_ledger
  add constraint map_item_ledger_action_check
  check (action in ('purchase', 'use', 'promo'));
alter table public.map_item_ledger
  drop constraint if exists map_item_ledger_quantity_check;
alter table public.map_item_ledger
  add constraint map_item_ledger_quantity_check
  check ((action = 'purchase' and quantity = 1)
      or (action = 'use' and quantity = -1)
      or (action = 'promo' and quantity between 1 and 100));

create or replace function public.admin_create_item_promo_code(
    p_code text,
    p_title text,
    p_item_type text,
    p_item_quantity integer,
    p_max_redemptions integer,
    p_valid_days integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_now timestamptz := clock_timestamp();
    v_normalized_code text;
    v_id bigint;
    v_expires_at timestamptz;
begin
    if auth.uid() is null or not exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'admin' and banned = false
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
    if p_item_type is null or p_item_type not in ('bomb', 'beacon', 'detector') then
        raise exception 'INVALID_ITEM';
    end if;
    if p_item_quantity is null or p_item_quantity not between 1 and 100 then
        raise exception 'INVALID_QUANTITY';
    end if;
    if p_max_redemptions is null or p_max_redemptions not between 1 and 1000 then
        raise exception 'INVALID_MAX_REDEMPTIONS';
    end if;
    if p_valid_days is null or p_valid_days not between 0 and 365 then
        raise exception 'INVALID_VALID_DAYS';
    end if;

    v_expires_at := case when p_valid_days = 0 then null
        else v_now + pg_catalog.make_interval(days => p_valid_days) end;

    insert into public.promo_codes (
        code_hash, code_hint, title, reward_type, item_type, item_quantity,
        max_redemptions, expires_at, created_at
    ) values (
        pg_catalog.encode(extensions.digest(v_normalized_code, 'sha256'), 'hex'),
        '…' || right(v_normalized_code, 4), trim(p_title), 'map_item',
        p_item_type, p_item_quantity, p_max_redemptions, v_expires_at, v_now
    ) returning id into v_id;

    return pg_catalog.jsonb_build_object(
        'success', true, 'id', v_id, 'code', v_normalized_code,
        'reward_type', 'map_item', 'item_type', p_item_type,
        'item_quantity', p_item_quantity
    );
exception when unique_violation then
    return pg_catalog.jsonb_build_object('success', false, 'reason', 'CODE_ALREADY_EXISTS');
end;
$$;

create or replace function public.admin_get_promo_codes()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
    v_now timestamptz := clock_timestamp();
    v_codes jsonb;
begin
    if auth.uid() is null or not exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'admin' and banned = false
    ) then
        raise exception 'ADMIN_REQUIRED';
    end if;

    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', c.id, 'code_hint', c.code_hint, 'title', c.title,
        'reward_type', c.reward_type, 'item_type', c.item_type,
        'item_quantity', c.item_quantity,
        'duration_seconds', c.duration_seconds,
        'cooldown_seconds', c.cooldown_seconds,
        'max_redemptions', c.max_redemptions,
        'redemption_count', c.redemption_count,
        'active', c.active, 'expires_at', c.expires_at,
        'created_at', c.created_at,
        'status', case
            when not c.active then 'disabled'
            when c.expires_at is not null and c.expires_at <= v_now then 'expired'
            when c.redemption_count >= c.max_redemptions then 'used'
            else 'active' end
    ) order by c.created_at desc), '[]'::jsonb)
    into v_codes
    from (select * from public.promo_codes order by created_at desc limit 200) c;

    return pg_catalog.jsonb_build_object('success', true, 'codes', v_codes, 'server_now', v_now);
end;
$$;

create or replace function public.redeem_promo_code(p_code text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
    v_user_id uuid := auth.uid();
    v_now timestamptz := clock_timestamp();
    v_normalized_code text;
    v_code_hash text;
    v_code public.promo_codes%rowtype;
    v_benefit_until timestamptz;
    v_quantity integer;
begin
    if v_user_id is null then raise exception 'NOT_AUTHENTICATED'; end if;
    perform 1 from public.profiles
    where id = v_user_id and banned = false for update;
    if not found then raise exception 'PROFILE_NOT_FOUND_OR_BANNED'; end if;

    v_normalized_code := upper(trim(coalesce(p_code, '')));
    if length(v_normalized_code) < 6 or length(v_normalized_code) > 64 then
        return pg_catalog.jsonb_build_object('success', false, 'reason', 'INVALID_CODE');
    end if;
    v_code_hash := pg_catalog.encode(extensions.digest(v_normalized_code, 'sha256'), 'hex');
    select * into v_code from public.promo_codes
    where code_hash = v_code_hash for update;
    if not found then
        return pg_catalog.jsonb_build_object('success', false, 'reason', 'INVALID_CODE');
    end if;
    if not v_code.active then
        return pg_catalog.jsonb_build_object('success', false, 'reason', 'CODE_INACTIVE');
    end if;
    if v_code.expires_at is not null and v_code.expires_at <= v_now then
        return pg_catalog.jsonb_build_object('success', false, 'reason', 'CODE_EXPIRED');
    end if;
    if v_code.redemption_count >= v_code.max_redemptions then
        return pg_catalog.jsonb_build_object('success', false, 'reason', 'CODE_ALREADY_USED');
    end if;

    -- Only a new pixel-hour code is blocked by another active pixel-hour code.
    if v_code.reward_type = 'pixel_hour' and exists (
        select 1 from public.promo_redemptions
        where user_id = v_user_id and benefit_until > v_now
    ) then
        return pg_catalog.jsonb_build_object('success', false, 'reason', 'PROMO_ALREADY_ACTIVE');
    end if;
    if exists (select 1 from public.promo_redemptions
        where promo_code_id = v_code.id and user_id = v_user_id) then
        return pg_catalog.jsonb_build_object('success', false, 'reason', 'ALREADY_REDEEMED');
    end if;

    if v_code.reward_type = 'map_item' then
        -- Lock the existing stock before checking the database inventory cap.
        insert into public.map_item_inventory (user_id, item_type, quantity)
        values (v_user_id, v_code.item_type, 0)
        on conflict (user_id, item_type) do nothing;
        select quantity into v_quantity from public.map_item_inventory
        where user_id = v_user_id and item_type = v_code.item_type for update;
        if v_quantity is null or v_quantity > 100 - v_code.item_quantity then
            return pg_catalog.jsonb_build_object('success', false, 'reason', 'INVENTORY_LIMIT');
        end if;
        -- Not a timed benefit. Existing promo status and pixel cooldown ignore it.
        v_benefit_until := v_now;
    elsif v_code.reward_type = 'pixel_hour' then
        v_benefit_until := v_now + pg_catalog.make_interval(secs => v_code.duration_seconds);
    else
        raise exception 'INVALID_REWARD_TYPE';
    end if;

    insert into public.promo_redemptions (
        promo_code_id, user_id, redeemed_at, benefit_until
    ) values (v_code.id, v_user_id, v_now, v_benefit_until);
    update public.promo_codes
    set redemption_count = redemption_count + 1 where id = v_code.id;

    if v_code.reward_type = 'map_item' then
        update public.map_item_inventory
        set quantity = quantity + v_code.item_quantity, updated_at = v_now
        where user_id = v_user_id and item_type = v_code.item_type;
        insert into public.map_item_ledger (
            user_id, item_type, action, quantity, promo_code_id, created_at
        ) values (v_user_id, v_code.item_type, 'promo', v_code.item_quantity, v_code.id, v_now);
        return pg_catalog.jsonb_build_object(
            'success', true, 'title', v_code.title,
            'reward_type', 'map_item', 'item_type', v_code.item_type,
            'item_quantity', v_code.item_quantity, 'server_now', v_now
        );
    end if;

    return pg_catalog.jsonb_build_object(
        'success', true, 'title', v_code.title,
        'benefit_until', v_benefit_until,
        'remaining_seconds', v_code.duration_seconds,
        'cooldown', v_code.cooldown_seconds, 'server_now', v_now
    );
end;
$$;

revoke execute on function public.admin_create_item_promo_code(text,text,text,integer,integer,integer)
  from public, anon, authenticated;
grant execute on function public.admin_create_item_promo_code(text,text,text,integer,integer,integer)
  to authenticated;
revoke execute on function public.admin_get_promo_codes() from public, anon;
revoke execute on function public.redeem_promo_code(text) from public, anon;

commit;
