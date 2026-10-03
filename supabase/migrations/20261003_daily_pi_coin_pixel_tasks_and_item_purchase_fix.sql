-- Daily pixel milestones for piCoin and repaired map-item purchases.
begin;

alter table public.pi_coin_transactions
  drop constraint if exists pi_coin_transactions_reason_check;
alter table public.pi_coin_transactions
  add constraint pi_coin_transactions_reason_check
  check(reason in(
    'daily_bonus','turbo_purchase','item_purchase',
    'ticker_bid','pixel_task_reward'
  ));

create table if not exists public.pi_coin_pixel_task_claims(
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_date date not null,
  stage integer not null check(stage between 1 and 3),
  pixel_count integer not null check(pixel_count>=0),
  reward integer not null check(reward>0),
  claimed_at timestamptz not null default clock_timestamp(),
  primary key(user_id,task_date,stage)
);

alter table public.pi_coin_pixel_task_claims enable row level security;
revoke all on table public.pi_coin_pixel_task_claims from public,anon,authenticated;

create or replace function public.daily_pi_coin_pixel_status(
  p_user_id uuid,
  p_now timestamptz
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  d date:=(p_now at time zone 'Asia/Yekaterinburg')::date;
  pixel_total integer:=0;
begin
  select count(*)::integer into pixel_total
  from public.pixel_history
  where user_id=p_user_id
    and (created_at at time zone 'Asia/Yekaterinburg')::date=d;

  return jsonb_build_object(
    'task_date',d,
    'pixel_count',pixel_total,
    'stages',jsonb_build_array(
      jsonb_build_object(
        'stage',1,'target',250,'reward',15,
        'claimed',exists(
          select 1 from public.pi_coin_pixel_task_claims
          where user_id=p_user_id and task_date=d and stage=1
        )
      ),
      jsonb_build_object(
        'stage',2,'target',700,'reward',25,
        'claimed',exists(
          select 1 from public.pi_coin_pixel_task_claims
          where user_id=p_user_id and task_date=d and stage=2
        )
      ),
      jsonb_build_object(
        'stage',3,'target',1300,'reward',45,
        'claimed',exists(
          select 1 from public.pi_coin_pixel_task_claims
          where user_id=p_user_id and task_date=d and stage=3
        )
      )
    )
  );
end;
$$;

create or replace function public.get_daily_pi_coin_tasks()
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  u uuid:=auth.uid();
  n timestamptz:=clock_timestamp();
begin
  if u is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists(
    select 1 from public.profiles where id=u and banned=false
  ) then raise exception 'PROFILE_NOT_FOUND_OR_BANNED'; end if;
  return jsonb_build_object(
    'success',true,
    'status',public.daily_pi_coin_pixel_status(u,n)
  );
end;
$$;

create or replace function public.claim_daily_pi_coin_stage(p_stage integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  u uuid:=auth.uid();
  n timestamptz:=clock_timestamp();
  d date:=(n at time zone 'Asia/Yekaterinburg')::date;
  target_value integer;
  reward_value integer;
  pixel_total integer;
  inserted_count integer;
  new_balance integer;
begin
  if u is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_stage=1 then target_value:=250;reward_value:=15;
  elsif p_stage=2 then target_value:=700;reward_value:=25;
  elsif p_stage=3 then target_value:=1300;reward_value:=45;
  else return jsonb_build_object('success',false,'error','INVALID_STAGE');
  end if;

  perform 1 from public.profiles where id=u and banned=false for update;
  if not found then raise exception 'PROFILE_NOT_FOUND_OR_BANNED'; end if;

  select count(*)::integer into pixel_total
  from public.pixel_history
  where user_id=u
    and (created_at at time zone 'Asia/Yekaterinburg')::date=d;

  if pixel_total<target_value then
    return jsonb_build_object('success',false,'error','TARGET_NOT_REACHED');
  end if;

  insert into public.pi_coin_pixel_task_claims(
    user_id,task_date,stage,pixel_count,reward,claimed_at
  ) values(u,d,p_stage,pixel_total,reward_value,n)
  on conflict(user_id,task_date,stage) do nothing;
  get diagnostics inserted_count=row_count;

  if inserted_count=0 then
    return jsonb_build_object(
      'success',false,'error','ALREADY_CLAIMED',
      'status',public.daily_pi_coin_pixel_status(u,n)
    );
  end if;

  insert into public.pi_coin_wallets(user_id,balance)
  values(u,reward_value)
  on conflict(user_id) do update set
    balance=public.pi_coin_wallets.balance+excluded.balance,
    updated_at=n
  returning balance into new_balance;

  insert into public.pi_coin_transactions(
    user_id,amount,reason,reference_date
  ) values(u,reward_value,'pixel_task_reward',d);

  return jsonb_build_object(
    'success',true,'reward',reward_value,'balance',new_balance,
    'status',public.daily_pi_coin_pixel_status(u,n)
  );
end;
$$;

create or replace function public.buy_map_item(p_item_type text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  u uuid:=auth.uid();
  n timestamptz:=clock_timestamp();
  d date:=(n at time zone 'Asia/Yekaterinburg')::date;
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

  perform 1 from public.profiles where id=u and banned=false for update;
  if not found then raise exception 'PROFILE_NOT_FOUND_OR_BANNED'; end if;

  select id into season_value from public.seasons
  where is_active=true and starts_at<=n and ends_at>n
  order by starts_at desc limit 1;
  if season_value is null then raise exception 'NO_ACTIVE_SEASON'; end if;

  insert into public.pi_coin_wallets(user_id,balance) values(u,0)
  on conflict(user_id) do nothing;
  select balance into wallet_balance
  from public.pi_coin_wallets where user_id=u for update;

  select count(*)::integer into buys
  from public.map_item_ledger
  where user_id=u and item_type=p_item_type and action='purchase'
    and (created_at at time zone 'Asia/Yekaterinburg')::date=d;
  if buys>=daily_cap then
    return jsonb_build_object('success',false,'error','DAILY_LIMIT');
  end if;

  insert into public.map_item_inventory(user_id,item_type,quantity)
  values(u,p_item_type,0)
  on conflict(user_id,item_type) do nothing;
  select quantity into qty from public.map_item_inventory
  where user_id=u and item_type=p_item_type for update;

  if qty>=stock_cap then
    return jsonb_build_object('success',false,'error','INVENTORY_LIMIT');
  end if;
  if wallet_balance<price then
    return jsonb_build_object('success',false,'error','NOT_ENOUGH_COINS');
  end if;

  update public.pi_coin_wallets
  set balance=balance-price,updated_at=n where user_id=u;
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

revoke all on function public.daily_pi_coin_pixel_status(uuid,timestamptz),
  public.get_daily_pi_coin_tasks(),
  public.claim_daily_pi_coin_stage(integer),
  public.buy_map_item(text)
from public,anon;
grant execute on function public.get_daily_pi_coin_tasks(),
  public.claim_daily_pi_coin_stage(integer),
  public.buy_map_item(text)
to authenticated;

commit;
