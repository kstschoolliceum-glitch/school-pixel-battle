-- Interactive removable beacons and larger bomb crater.
begin;

create or replace function public.get_map_item_status(p_season_id bigint default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  u uuid:=auth.uid();
  bal integer:=0;
  inv jsonb;
  bs jsonb:='[]'::jsonb;
  cs jsonb:='[]'::jsonb;
begin
  if u is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select balance into bal from public.pi_coin_wallets where user_id=u;
  select jsonb_build_object(
    'bomb',coalesce(max(quantity) filter(where item_type='bomb'),0),
    'beacon',coalesce(max(quantity) filter(where item_type='beacon'),0),
    'detector',coalesce(max(quantity) filter(where item_type='detector'),0)
  ) into inv from public.map_item_inventory where user_id=u;

  if p_season_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',b.id,'x',b.x,'y',b.y,'label',b.label,
      'class_name',c.name,'expires_at',b.expires_at,
      'is_owner',b.user_id=u
    ) order by b.created_at),'[]'::jsonb)
    into bs
    from public.map_beacons b
    left join public.classes c on c.id=b.class_id
    where b.season_id=p_season_id and b.expires_at>clock_timestamp();

    select coalesce(jsonb_agg(jsonb_build_object('x',bc.x,'y',bc.y)),'[]'::jsonb)
    into cs
    from public.map_bomb_cells bc
    join public.map_bomb_events e on e.id=bc.bomb_id
    join public.pixels p on p.season_id=e.season_id and p.x=bc.x and p.y=bc.y
      and p.user_id=e.user_id and p.updated_at=e.created_at
    where e.season_id=p_season_id;
  end if;

  return jsonb_build_object(
    'balance',coalesce(bal,0),'inventory',inv,
    'beacons',bs,'bomb_cells',cs
  );
end;
$$;

create or replace function public.remove_map_beacon(p_beacon_id bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  u uuid:=auth.uid();
  season_id_value bigint;
begin
  if u is null then raise exception 'NOT_AUTHENTICATED'; end if;
  delete from public.map_beacons
  where id=p_beacon_id and user_id=u
  returning season_id into season_id_value;
  if season_id_value is null then
    return jsonb_build_object('success',false,'error','NOT_OWNER');
  end if;
  return jsonb_build_object(
    'success',true,
    'status',public.get_map_item_status(season_id_value)
  );
end;
$$;

create or replace function public.use_map_bomb(p_x integer,p_y integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  u uuid:=auth.uid();
  n timestamptz:=clock_timestamp();
  s public.seasons%rowtype;
  qty integer;
  used integer;
  bid bigint;
  cells jsonb;
begin
  perform 1 from public.profiles where id=u and banned=false for update;
  if not found then raise exception 'PROFILE_NOT_FOUND_OR_BANNED'; end if;
  select * into s from public.seasons
  where is_active=true and starts_at<=n and ends_at>n
  order by starts_at desc limit 1;
  if not found then raise exception 'NO_ACTIVE_SEASON'; end if;
  if p_x<8 or p_y<8 or p_x>=s.map_width-8 or p_y>=s.map_height-8 then
    return jsonb_build_object('success',false,'error','EDGE_LIMIT');
  end if;

  select quantity into qty from public.map_item_inventory
  where user_id=u and item_type='bomb' for update;
  if coalesce(qty,0)<1 then
    return jsonb_build_object('success',false,'error','NO_ITEM');
  end if;
  select count(*) into used from public.map_bomb_events
  where user_id=u and season_id=s.id;
  if used>=2 then
    return jsonb_build_object('success',false,'error','SEASON_LIMIT');
  end if;

  insert into public.map_bomb_events(season_id,user_id,center_x,center_y,created_at)
  values(s.id,u,p_x,p_y,n) returning id into bid;

  with offsets as(
    select dx,dy,abs(dx)+abs(dy) dist
    from generate_series(-8,8) dx
    cross join generate_series(-8,8) dy
    where abs(dx)+abs(dy)<=8
  ),recorded as(
    insert into public.map_bomb_cells(bomb_id,x,y,color)
    select bid,p_x+dx,p_y+dy,
      case
        when dist>=7 then '#475569'
        when dist>=5 then '#334155'
        else '#111111'
      end
    from offsets returning x,y,color
  )
  insert into public.pixels(season_id,x,y,color,user_id,class_id,updated_at)
  select s.id,x,y,color,u,null,n from recorded
  on conflict(season_id,x,y) do update set
    color=excluded.color,user_id=excluded.user_id,
    class_id=null,updated_at=excluded.updated_at;

  update public.map_item_inventory
  set quantity=quantity-1,updated_at=n
  where user_id=u and item_type='bomb';
  insert into public.map_item_ledger(
    user_id,item_type,action,quantity,season_id,x,y,created_at
  ) values(u,'bomb','use',-1,s.id,p_x,p_y,n);

  select jsonb_agg(jsonb_build_object('x',x,'y',y,'color',color))
  into cells from public.map_bomb_cells where bomb_id=bid;
  return jsonb_build_object(
    'success',true,'cells',cells,
    'status',public.get_map_item_status(s.id)
  );
end;
$$;

revoke all on function public.remove_map_beacon(bigint) from public,anon;
grant execute on function public.remove_map_beacon(bigint) to authenticated;
grant execute on function public.get_map_item_status(bigint),public.use_map_bomb(integer,integer) to authenticated;

commit;
