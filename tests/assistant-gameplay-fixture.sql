-- Extend the disposable fixture with small, explicit models of the deployed
-- role/cooldown/ledger contracts. These are not production function definitions.
alter table public.profiles add column last_pixel_at timestamptz;
alter table public.profiles add column total_pixels integer not null default 0;
alter table public.profiles add column weekly_pixels integer not null default 0;
alter table public.classes add column is_active boolean not null default true;
alter table public.pixels add column user_id uuid;
alter table public.pixels add column class_id bigint;
alter table public.pixel_history add column user_id uuid;
alter table public.pixel_history add column class_id bigint;
alter table public.promo_codes add column active boolean not null default true;
alter table public.promo_codes add column redemption_count integer not null default 0;
alter table public.promo_codes add column item_type text default 'detector';
alter table public.promo_codes add column item_quantity integer not null default 1;
create table public.promo_redemptions(id bigint generated always as identity,
  promo_code_id bigint references public.promo_codes(id), user_id uuid,
  unique(promo_code_id,user_id));
create table public.pi_coin_wallets(user_id uuid primary key, balance integer not null default 0);
create table public.map_item_inventory(user_id uuid,item_type text,quantity integer not null,
  primary key(user_id,item_type));
create table public.game_rule_violations(user_id uuid,occurred_at timestamptz,evidence text);
create table public.test_mini_attempts(user_id uuid primary key,next_available_at timestamptz);
-- Model a broad legacy table privilege: the new guards must defeat it.
grant insert,update on public.pixels to authenticated;
-- Wallet/inventory have no client write grants, matching their migrations.
insert into public.pi_coin_wallets values('00000000-0000-4000-8000-000000000002',30);
insert into public.map_item_inventory values('00000000-0000-4000-8000-000000000002','detector',1);
create or replace function public.is_gameplay_admin() returns boolean
language sql stable security definer as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and not banned);
$$;
create function public.place_pixel(p_x integer,p_y integer,p_color text) returns jsonb
language plpgsql security definer as $$
declare pr public.profiles%rowtype;
begin
  select * into pr from public.profiles where id=auth.uid() and not banned for update;
  if not found then raise exception 'ACTIVE_USER_REQUIRED'; end if;
  if not public.is_gameplay_admin() and pr.last_pixel_at>clock_timestamp()-interval '60 seconds' then raise exception 'COOLDOWN'; end if;
  insert into public.pixels(id,color,user_id,class_id) values(1000+p_x,p_color,pr.id,pr.class_id)
    on conflict(id) do update set color=excluded.color,user_id=excluded.user_id,class_id=excluded.class_id;
  insert into public.pixel_history(id,user_id,class_id) values(1000+p_x,pr.id,pr.class_id);
  update public.profiles set last_pixel_at=clock_timestamp(),total_pixels=total_pixels+1,weekly_pixels=weekly_pixels+1 where id=pr.id;
  return '{"success":true}'::jsonb;
end;
$$;
create function public.buy_map_item(p_item_type text) returns jsonb
language plpgsql security definer as $$
declare free boolean;
begin
  select role='admin' into free from public.profiles where id=auth.uid() for update;
  if not free then
    update public.pi_coin_wallets set balance=balance-15 where user_id=auth.uid() and balance>=15;
    if not found then raise exception 'NOT_ENOUGH_COINS'; end if;
  end if;
  insert into public.map_item_inventory values(auth.uid(),p_item_type,1)
    on conflict(user_id,item_type) do update set quantity=map_item_inventory.quantity+1;
  return '{"success":true}'::jsonb;
end;
$$;
create function public.start_unblock_me() returns jsonb language plpgsql security definer as $$
begin
  if not public.is_admin() and exists(select 1 from public.test_mini_attempts where user_id=auth.uid() and next_available_at>clock_timestamp()) then raise exception 'MINI_COOLDOWN'; end if;
  return '{"success":true}'::jsonb;
end;
$$;
create function public.finish_unblock_me(p_moves integer) returns jsonb language plpgsql security definer as $$
begin
  perform public.start_unblock_me();
  if not public.is_admin() then update public.pi_coin_wallets set balance=balance+10 where user_id=auth.uid(); end if;
  insert into public.test_mini_attempts values(auth.uid(),clock_timestamp()+interval '3 hours')
    on conflict(user_id) do update set next_available_at=excluded.next_available_at;
  return '{"success":true}'::jsonb;
end;
$$;
create function public.admin_restart_unblock_me(p_puzzle integer default null) returns jsonb language plpgsql security definer as $$
begin delete from public.test_mini_attempts where user_id=auth.uid(); return '{"success":true}'::jsonb; end;
$$;
create function public.admin_get_promo_codes() returns jsonb language plpgsql stable security definer as $$
declare codes jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and coalesce(p.banned,false)=false) then raise exception 'ADMIN_REQUIRED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'active',c.active)),'[]'::jsonb) into codes from public.promo_codes c;
  return jsonb_build_object('codes',codes);
end;
$$;
create function public.admin_set_promo_active(p_promo_id bigint,p_active boolean) returns void language plpgsql security definer as $$
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='admin' and banned=false) then raise exception 'ADMIN_REQUIRED'; end if;
  update public.promo_codes set active=p_active where id=p_promo_id;
end;
$$;
create function public.redeem_promo_code(p_code text) returns jsonb language plpgsql security definer as $$
declare code_row public.promo_codes%rowtype;
begin
  select * into code_row from public.promo_codes where code=p_code for update;
  if not found or not code_row.active then raise exception 'CODE_INACTIVE'; end if;
  insert into public.promo_redemptions(promo_code_id,user_id) values(code_row.id,auth.uid());
  update public.promo_codes set redemption_count=redemption_count+1 where id=code_row.id;
  insert into public.map_item_inventory values(auth.uid(),'detector',1)
    on conflict(user_id,item_type) do update set quantity=map_item_inventory.quantity+1;
  return '{"success":true}'::jsonb;
end;
$$;
create function public.legacy_change_class(p_class_id bigint) returns void language sql security definer as $$
  update public.profiles set class_id=p_class_id where id=auth.uid();
$$;
-- Existing identity guard with a DECLARE variable, not a direct auth.uid call.
create function public.admin_get_pixel_owner(p_season_id bigint,p_x integer,p_y integer)
returns jsonb language plpgsql security definer as $$
declare v_admin_id uuid := auth.uid();
begin
  if v_admin_id is null or not exists(select 1 from public.profiles p where p.id=v_admin_id and p.role='admin' and coalesce(p.banned,false)=false) then raise exception 'ADMIN_REQUIRED'; end if;
  return '{"success":true}'::jsonb;
end;
$$;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.is_gameplay_admin() from public,anon,authenticated;
revoke execute on function public.finish_season(bigint) from authenticated;
revoke execute on function public.add_season_to_active_quarter(bigint) from public,anon,authenticated;
