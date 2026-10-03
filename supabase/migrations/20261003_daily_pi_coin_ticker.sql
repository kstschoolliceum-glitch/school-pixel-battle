-- Daily piCoin ticker with server-side escalating bids.
begin;

alter table public.pi_coin_transactions drop constraint if exists pi_coin_transactions_reason_check;
alter table public.pi_coin_transactions add constraint pi_coin_transactions_reason_check
  check(reason in('daily_bonus','turbo_purchase','item_purchase','ticker_bid'));

create table if not exists public.pi_coin_ticker(
  ticker_date date primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  nickname text not null,
  message text not null check(char_length(message) between 1 and 80),
  price integer not null check(price >= 10 and price % 10 = 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.pi_coin_ticker enable row level security;
revoke all on table public.pi_coin_ticker from public,anon,authenticated;

create or replace function public.get_pi_ticker()
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  u uuid:=auth.uid();
  d date:=(clock_timestamp() at time zone 'Asia/Yekaterinburg')::date;
  row_data public.pi_coin_ticker%rowtype;
  bal integer:=0;
begin
  if u is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into row_data from public.pi_coin_ticker where ticker_date=d;
  select balance into bal from public.pi_coin_wallets where user_id=u;
  return jsonb_build_object(
    'date',d,
    'nickname',row_data.nickname,
    'message',row_data.message,
    'price',coalesce(row_data.price,0),
    'next_price',coalesce(row_data.price,0)+10,
    'is_mine',row_data.user_id=u,
    'balance',coalesce(bal,0)
  );
end;
$$;

create or replace function public.bid_pi_ticker(p_message text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  u uuid:=auth.uid();
  d date:=(clock_timestamp() at time zone 'Asia/Yekaterinburg')::date;
  v_message text:=btrim(coalesce(p_message,''));
  current_row public.pi_coin_ticker%rowtype;
  profile_row public.profiles%rowtype;
  bid_price integer;
  bal integer;
begin
  if u is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if char_length(v_message)<1 or char_length(v_message)>80 then
    return jsonb_build_object('success',false,'error','INVALID_MESSAGE');
  end if;
  if v_message~*'(https?://|www\.|t\.me/)' then
    return jsonb_build_object('success',false,'error','NO_LINKS');
  end if;
  if public.contains_chat_profanity(v_message) then
    return jsonb_build_object('success',false,'error','PROFANITY');
  end if;

  perform pg_advisory_xact_lock(hashtext('pi_ticker:'||d::text));
  select * into current_row from public.pi_coin_ticker where ticker_date=d for update;
  if current_row.user_id=u then
    return jsonb_build_object('success',false,'error','OWN_MESSAGE');
  end if;
  bid_price:=coalesce(current_row.price,0)+10;

  insert into public.pi_coin_wallets(user_id,balance) values(u,0)
  on conflict(user_id) do nothing;
  select balance into bal from public.pi_coin_wallets where user_id=u for update;
  if bal<bid_price then
    return jsonb_build_object('success',false,'error','NOT_ENOUGH_COINS');
  end if;
  select * into profile_row from public.profiles where id=u;
  if profile_row.id is null then raise exception 'PROFILE_NOT_FOUND'; end if;

  update public.pi_coin_wallets
  set balance=balance-bid_price,updated_at=clock_timestamp()
  where user_id=u;
  insert into public.pi_coin_transactions(user_id,amount,reason,reference_date)
  values(u,-bid_price,'ticker_bid',d);
  insert into public.pi_coin_ticker(ticker_date,user_id,nickname,message,price)
  values(d,u,profile_row.nickname,v_message,bid_price)
  on conflict(ticker_date) do update set
    user_id=excluded.user_id,
    nickname=excluded.nickname,
    message=excluded.message,
    price=excluded.price,
    updated_at=clock_timestamp();

  return jsonb_build_object('success',true,'status',public.get_pi_ticker());
end;
$$;

revoke all on function public.get_pi_ticker(),public.bid_pi_ticker(text) from public,anon;
grant execute on function public.get_pi_ticker(),public.bid_pi_ticker(text) to authenticated;

commit;
