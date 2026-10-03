-- Permanent profile frames and chat nickname colors purchased with piCoin.
begin;

alter table public.pi_coin_transactions drop constraint if exists pi_coin_transactions_reason_check;
alter table public.pi_coin_transactions add constraint pi_coin_transactions_reason_check
  check(reason in('daily_bonus','turbo_purchase','item_purchase','ticker_bid','pixel_task_reward','cosmetic_purchase'));

create table if not exists public.profile_cosmetic_ownership(
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id text not null check(item_id in(
    'chat_mint','chat_gold','chat_pink','chat_ice',
    'frame_neon','frame_gold','frame_fire','frame_galaxy'
  )),
  purchased_at timestamptz not null default clock_timestamp(),
  primary key(user_id,item_id)
);

create table if not exists public.profile_cosmetic_equipment(
  user_id uuid primary key references public.profiles(id) on delete cascade,
  chat_color_item text check(chat_color_item is null or chat_color_item in('chat_mint','chat_gold','chat_pink','chat_ice')),
  profile_frame_item text check(profile_frame_item is null or profile_frame_item in('frame_neon','frame_gold','frame_fire','frame_galaxy')),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.profile_cosmetic_ownership enable row level security;
alter table public.profile_cosmetic_equipment enable row level security;
revoke all on table public.profile_cosmetic_ownership,public.profile_cosmetic_equipment from public,anon,authenticated;

create or replace function public.get_cosmetic_catalog()
returns jsonb language sql immutable security definer set search_path=public as $$
  select jsonb_build_array(
    jsonb_build_object('id','chat_mint','category','chat_color','name','Мятный ник','description','Неоновый цвет ника в чате.','price',60,'color','#76f5c5'),
    jsonb_build_object('id','chat_gold','category','chat_color','name','Золотой ник','description','Золотой цвет ника в чате.','price',100,'color','#fbbf24'),
    jsonb_build_object('id','chat_pink','category','chat_color','name','Розовый ник','description','Яркий розовый цвет ника в чате.','price',80,'color','#f472b6'),
    jsonb_build_object('id','chat_ice','category','chat_color','name','Ледяной ник','description','Холодный голубой цвет ника в чате.','price',80,'color','#67e8f9'),
    jsonb_build_object('id','frame_neon','category','profile_frame','name','Неоновая рамка','description','Бирюзовое свечение визитки.','price',120,'frame','frame_neon'),
    jsonb_build_object('id','frame_gold','category','profile_frame','name','Золотая рамка','description','Золотое оформление визитки.','price',180,'frame','frame_gold'),
    jsonb_build_object('id','frame_fire','category','profile_frame','name','Огненная рамка','description','Оранжево-красное свечение.','price',220,'frame','frame_fire'),
    jsonb_build_object('id','frame_galaxy','category','profile_frame','name','Галактическая рамка','description','Фиолетово-синее свечение.','price',250,'frame','frame_galaxy')
  );
$$;

create or replace function public.get_public_profile_cosmetics(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare e public.profile_cosmetic_equipment%rowtype;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into e from public.profile_cosmetic_equipment where user_id=p_user_id;
  return jsonb_build_object(
    'chat_color',e.chat_color_item,
    'nickname_color',case e.chat_color_item
      when 'chat_mint' then '#76f5c5' when 'chat_gold' then '#fbbf24'
      when 'chat_pink' then '#f472b6' when 'chat_ice' then '#67e8f9' else null end,
    'profile_frame',e.profile_frame_item
  );
end;
$$;

create or replace function public.get_cosmetic_shop_status()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare u uuid:=auth.uid();bal integer:=0;e public.profile_cosmetic_equipment%rowtype;owned jsonb:='[]'::jsonb;
begin
  if u is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select balance into bal from public.pi_coin_wallets where user_id=u;
  select * into e from public.profile_cosmetic_equipment where user_id=u;
  select coalesce(jsonb_agg(item_id order by purchased_at),'[]'::jsonb) into owned from public.profile_cosmetic_ownership where user_id=u;
  return jsonb_build_object(
    'balance',coalesce(bal,0),'catalog',public.get_cosmetic_catalog(),'owned',owned,
    'equipped',jsonb_build_object('chat_color',e.chat_color_item,'profile_frame',e.profile_frame_item)
  );
end;
$$;

create or replace function public.buy_profile_cosmetic(p_item_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();price integer;category text;bal integer;
begin
  if u is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select x.price,x.category into price,category
  from jsonb_to_recordset(public.get_cosmetic_catalog()) as x(id text,category text,price integer)
  where x.id=p_item_id;
  if price is null then return jsonb_build_object('success',false,'error','INVALID_ITEM'); end if;
  perform pg_advisory_xact_lock(hashtext('cosmetic:'||u::text));
  if exists(select 1 from public.profile_cosmetic_ownership where user_id=u and item_id=p_item_id) then
    return jsonb_build_object('success',false,'error','ALREADY_OWNED');
  end if;
  insert into public.pi_coin_wallets(user_id,balance) values(u,0) on conflict(user_id) do nothing;
  select balance into bal from public.pi_coin_wallets where user_id=u for update;
  if bal<price then return jsonb_build_object('success',false,'error','NOT_ENOUGH_COINS'); end if;
  update public.pi_coin_wallets set balance=balance-price,updated_at=clock_timestamp() where user_id=u;
  insert into public.pi_coin_transactions(user_id,amount,reason,reference_date)
  values(u,-price,'cosmetic_purchase',(clock_timestamp() at time zone 'Asia/Yekaterinburg')::date);
  insert into public.profile_cosmetic_ownership(user_id,item_id) values(u,p_item_id);
  insert into public.profile_cosmetic_equipment(user_id,chat_color_item,profile_frame_item)
  values(u,case when category='chat_color' then p_item_id end,case when category='profile_frame' then p_item_id end)
  on conflict(user_id) do update set
    chat_color_item=case when category='chat_color' then p_item_id else profile_cosmetic_equipment.chat_color_item end,
    profile_frame_item=case when category='profile_frame' then p_item_id else profile_cosmetic_equipment.profile_frame_item end,
    updated_at=clock_timestamp();
  return jsonb_build_object('success',true,'status',public.get_cosmetic_shop_status());
end;
$$;

create or replace function public.equip_profile_cosmetic(p_item_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();category text;
begin
  if u is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select x.category into category
  from jsonb_to_recordset(public.get_cosmetic_catalog()) as x(id text,category text)
  where x.id=p_item_id;
  if category is null then return jsonb_build_object('success',false,'error','INVALID_ITEM'); end if;
  if not exists(select 1 from public.profile_cosmetic_ownership where user_id=u and item_id=p_item_id) then
    return jsonb_build_object('success',false,'error','NOT_OWNED');
  end if;
  insert into public.profile_cosmetic_equipment(user_id,chat_color_item,profile_frame_item)
  values(u,case when category='chat_color' then p_item_id end,case when category='profile_frame' then p_item_id end)
  on conflict(user_id) do update set
    chat_color_item=case when category='chat_color' then p_item_id else profile_cosmetic_equipment.chat_color_item end,
    profile_frame_item=case when category='profile_frame' then p_item_id else profile_cosmetic_equipment.profile_frame_item end,
    updated_at=clock_timestamp();
  return jsonb_build_object('success',true,'status',public.get_cosmetic_shop_status());
end;
$$;

drop function if exists public.get_chat_messages_by_type(text,integer);
create function public.get_chat_messages_by_type(p_message_type text,p_limit integer default 50)
returns table(
  id bigint,user_id uuid,nickname text,class_name text,message text,created_at timestamptz,
  message_type text,is_admin boolean,is_admin_announcement boolean,admin_announcement_kind text,
  nickname_color text,profile_frame text
)
language sql stable security definer set search_path=public as $$
  select cm.id,cm.user_id,
    case when cm.message_type='system' then 'СИСТЕМА' else coalesce(p.nickname,'Удалённый игрок') end,
    case when cm.message_type='system' then null else c.name end,
    cm.message,cm.created_at,cm.message_type,coalesce(p.role,'student')='admin',
    cm.is_admin_announcement,cm.admin_announcement_kind,
    case e.chat_color_item
      when 'chat_mint' then '#76f5c5' when 'chat_gold' then '#fbbf24'
      when 'chat_pink' then '#f472b6' when 'chat_ice' then '#67e8f9' else null end,
    e.profile_frame_item
  from public.chat_messages cm
  left join public.profiles p on p.id=cm.user_id
  left join public.classes c on c.id=p.class_id
  left join public.profile_cosmetic_equipment e on e.user_id=cm.user_id
  where auth.uid() is not null
    and cm.message_type=case when p_message_type='system' then 'system' else 'user' end
  order by cm.created_at desc,cm.id desc
  limit least(greatest(coalesce(p_limit,50),1),100);
$$;

revoke all on function public.get_cosmetic_catalog(),public.get_public_profile_cosmetics(uuid),public.get_cosmetic_shop_status(),public.buy_profile_cosmetic(text),public.equip_profile_cosmetic(text),public.get_chat_messages_by_type(text,integer) from public,anon;
grant execute on function public.get_cosmetic_shop_status(),public.buy_profile_cosmetic(text),public.equip_profile_cosmetic(text),public.get_chat_messages_by_type(text,integer),public.get_public_profile_cosmetics(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
