-- Allow students to enter any whole-number ticker bid above the current price.
begin;

alter table public.pi_coin_ticker
  drop constraint if exists pi_coin_ticker_price_check;
alter table public.pi_coin_ticker
  add constraint pi_coin_ticker_price_check check(price >= 10);

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
    'next_price',greatest(coalesce(row_data.price,0)+1,10),
    'is_mine',row_data.user_id=u,
    'balance',coalesce(bal,0)
  );
end;
$$;

drop function if exists public.bid_pi_ticker(text);

create function public.bid_pi_ticker(p_message text,p_price integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  u uuid:=auth.uid();
  d date:=(clock_timestamp() at time zone 'Asia/Yekaterinburg')::date;
  v_message text:=btrim(coalesce(p_message,''));
  current_row public.pi_coin_ticker%rowtype;
  profile_row public.profiles%rowtype;
  minimum_price integer;
  bal integer;
begin
  if u is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if char_length(v_message)<1 or char_length(v_message)>80 then
    return jsonb_build_object('success',false,'error','INVALID_MESSAGE');
  end if;
  if p_price is null or p_price<10 then
    return jsonb_build_object('success',false,'error','INVALID_PRICE');
  end if;
  if v_message~*'(https?://|www\\.|t\\.me/)' then
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
  minimum_price:=greatest(coalesce(current_row.price,0)+1,10);
  if p_price<minimum_price then
    return jsonb_build_object('success',false,'error','BID_TOO_LOW','next_price',minimum_price);
  end if;

  insert into public.pi_coin_wallets(user_id,balance) values(u,0)
  on conflict(user_id) do nothing;
  select balance into bal from public.pi_coin_wallets where user_id=u for update;
  if bal<p_price then
    return jsonb_build_object('success',false,'error','NOT_ENOUGH_COINS');
  end if;
  select * into profile_row from public.profiles where id=u;
  if profile_row.id is null then raise exception 'PROFILE_NOT_FOUND'; end if;

  update public.pi_coin_wallets
  set balance=balance-p_price,updated_at=clock_timestamp()
  where user_id=u;
  insert into public.pi_coin_transactions(user_id,amount,reason,reference_date)
  values(u,-p_price,'ticker_bid',d);
  insert into public.pi_coin_ticker(ticker_date,user_id,nickname,message,price)
  values(d,u,profile_row.nickname,v_message,p_price)
  on conflict(ticker_date) do update set
    user_id=excluded.user_id,
    nickname=excluded.nickname,
    message=excluded.message,
    price=excluded.price,
    updated_at=clock_timestamp();

  return jsonb_build_object('success',true,'status',public.get_pi_ticker());
end;
$$;

revoke all on function public.get_pi_ticker(),public.bid_pi_ticker(text,integer) from public,anon;
grant execute on function public.get_pi_ticker(),public.bid_pi_ticker(text,integer) to authenticated;

commit;
