-- Administrators may buy unlimited map items while still paying normal piCoin prices.
begin;

create or replace function public.get_map_item_status(p_season_id bigint default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  u uuid:=auth.uid();
  n timestamptz:=clock_timestamp();
  d date:=(n at time zone 'Asia/Yekaterinburg')::date;
  is_admin boolean:=false;
  bal integer:=0;
  inv jsonb;
  bs jsonb:='[]'::jsonb;
  cs jsonb:='[]'::jsonb;
  bomb_buys integer:=0;
  beacon_buys integer:=0;
  detector_buys integer:=0;
begin
  if u is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select coalesce(role,'student')='admin'
  into is_admin
  from public.profiles
  where id=u;

  select balance into bal
  from public.pi_coin_wallets
  where user_id=u;

  select jsonb_build_object(
    'bomb',coalesce(max(quantity) filter(where item_type='bomb'),0),
    'beacon',coalesce(max(quantity) filter(where item_type='beacon'),0),
    'detector',coalesce(max(quantity) filter(where item_type='detector'),0)
  ) into inv
  from public.map_item_inventory
  where user_id=u;

  if not is_admin then
    select
      count(*) filter(where item_type='bomb')::integer,
      count(*) filter(where item_type='beacon')::integer,
      count(*) filter(where item_type='detector')::integer
    into bomb_buys,beacon_buys,detector_buys
    from public.map_item_ledger
    where user_id=u
      and action='purchase'
      and (created_at at time zone 'Asia/Yekaterinburg')::date=d;
  end if;

  if p_season_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',b.id,'x',b.x,'y',b.y,'label',b.label,
      'class_name',c.name,'expires_at',b.expires_at,
      'is_owner',b.user_id=u
    ) order by b.created_at),'[]'::jsonb)
    into bs
    from public.map_beacons b
    left join public.classes c on c.id=b.class_id
    where b.season_id=p_season_id
      and b.expires_at>n;

    select coalesce(
      jsonb_agg(jsonb_build_object('x',bc.x,'y',bc.y)),
      '[]'::jsonb
    ) into cs
    from public.map_bomb_cells bc
    join public.map_bomb_events e on e.id=bc.bomb_id
    join public.pixels p
      on p.season_id=e.season_id
      and p.x=bc.x and p.y=bc.y
      and p.user_id=e.user_id
      and p.updated_at=e.created_at
    where e.season_id=p_season_id;
  end if;

  return jsonb_build_object(
    'balance',coalesce(bal,0),
    'inventory',inv,
    'unlimited_purchases',is_admin,
    'purchase_remaining',jsonb_build_object(
      'bomb',case when is_admin then null else greatest(0,1-bomb_buys) end,
      'beacon',case when is_admin then null else greatest(0,2-beacon_buys) end,
      'detector',case when is_admin then null else greatest(0,10-detector_buys) end
    ),
    'beacons',bs,
    'bomb_cells',cs
  );
end;
$$;

create or replace function public.buy_map_item(p_item_type text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  u uuid:=auth.uid();
  n timestamptz:=clock_timestamp();
  d date:=(n at time zone 'Asia/Yekaterinburg')::date;
  is_admin boolean:=false;
  is_banned boolean:=false;
  price integer;
  daily_cap integer;
  stock_cap integer;
  buys integer;
  qty integer;
  season_value bigint;
  wallet_balance integer;
begin
  if u is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_item_type='bomb' then price:=450;daily_cap:=1;stock_cap:=3;
  elsif p_item_type='beacon' then price:=90;daily_cap:=2;stock_cap:=5;
  elsif p_item_type='detector' then price:=15;daily_cap:=10;stock_cap:=20;
  else return jsonb_build_object('success',false,'error','INVALID_ITEM');
  end if;

  select coalesce(role,'student')='admin',coalesce(banned,false)
  into is_admin,is_banned
  from public.profiles
  where id=u
  for update;
  if not found or is_banned then raise exception 'PROFILE_NOT_FOUND_OR_BANNED'; end if;

  select id into season_value
  from public.seasons
  where is_active=true and starts_at<=n and ends_at>n
  order by starts_at desc
  limit 1;
  if season_value is null then raise exception 'NO_ACTIVE_SEASON'; end if;

  insert into public.pi_coin_wallets(user_id,balance) values(u,0)
  on conflict(user_id) do nothing;
  select balance into wallet_balance
  from public.pi_coin_wallets
  where user_id=u
  for update;

  if not is_admin then
    select count(*)::integer into buys
    from public.map_item_ledger
    where user_id=u
      and item_type=p_item_type
      and action='purchase'
      and (created_at at time zone 'Asia/Yekaterinburg')::date=d;
    if buys>=daily_cap then
      return jsonb_build_object('success',false,'error','DAILY_LIMIT');
    end if;
  end if;

  insert into public.map_item_inventory(user_id,item_type,quantity)
  values(u,p_item_type,0)
  on conflict(user_id,item_type) do nothing;
  select quantity into qty
  from public.map_item_inventory
  where user_id=u and item_type=p_item_type
  for update;

  if not is_admin and qty>=stock_cap then
    return jsonb_build_object('success',false,'error','INVENTORY_LIMIT');
  end if;
  if wallet_balance<price then
    return jsonb_build_object('success',false,'error','NOT_ENOUGH_COINS');
  end if;

  update public.pi_coin_wallets
  set balance=balance-price,updated_at=n
  where user_id=u;
  update public.map_item_inventory
  set quantity=quantity+1,updated_at=n
  where user_id=u and item_type=p_item_type;
  insert into public.map_item_ledger(
    user_id,item_type,action,quantity,season_id,created_at
  ) values(u,p_item_type,'purchase',1,season_value,n);
  insert into public.pi_coin_transactions(
    user_id,amount,reason,item_type
  ) values(u,-price,'item_purchase',p_item_type);

  return jsonb_build_object(
    'success',true,
    'status',public.get_map_item_status(season_value)
  );
end;
$$;

revoke all on function public.get_map_item_status(bigint),public.buy_map_item(text)
from public,anon;
grant execute on function public.get_map_item_status(bigint),public.buy_map_item(text)
to authenticated;

notify pgrst,'reload schema';
commit;
