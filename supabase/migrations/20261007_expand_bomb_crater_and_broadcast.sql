-- Larger deterministic bomb crater; one authenticated-only visual event per use.
begin;

create or replace function public.use_map_bomb(p_x integer,p_y integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  u uuid:=auth.uid();
  n timestamptz:=clock_timestamp();
  s public.seasons%rowtype;
  crater_radius constant integer:=12;
  qty integer;
  used integer;
  bid bigint;
  cells jsonb;
begin
  if u is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform 1 from public.profiles where id=u and banned=false for update;
  if not found then raise exception 'PROFILE_NOT_FOUND_OR_BANNED'; end if;
  select * into s from public.seasons
  where is_active=true and starts_at<=n and ends_at>n
  order by starts_at desc limit 1;
  if not found then raise exception 'NO_ACTIVE_SEASON'; end if;
  if p_x is null or p_y is null or p_x<crater_radius or p_y<crater_radius
    or p_x>=s.map_width-crater_radius or p_y>=s.map_height-crater_radius then
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

  with offsets as (
    select dx,dy,abs(dx)+abs(dy) as dist
    from generate_series(-crater_radius,crater_radius) as dx
    cross join generate_series(-crater_radius,crater_radius) as dy
    where abs(dx)+abs(dy)<=crater_radius
  ), recorded as (
    insert into public.map_bomb_cells(bomb_id,x,y,color)
    select bid,p_x+dx,p_y+dy,
      case
        when dist>=crater_radius-1 then '#64748b'
        when dist>=crater_radius-3 then '#475569'
        when dist>=crater_radius-6 then '#334155'
        when dist>=crater_radius-9 then '#1e293b'
        when dist>0 then '#0f172a'
        else '#111111'
      end
    from offsets returning x,y,color
  )
  insert into public.pixels(season_id,x,y,color,user_id,class_id,updated_at)
  select s.id,x,y,color,u,null,n from recorded
  on conflict(season_id,x,y) do update set
    color=excluded.color,user_id=excluded.user_id,
    class_id=null,updated_at=excluded.updated_at;

  update public.map_item_inventory set quantity=quantity-1,updated_at=n
  where user_id=u and item_type='bomb';
  insert into public.map_item_ledger(user_id,item_type,action,quantity,season_id,x,y,created_at)
  values(u,'bomb','use',-1,s.id,p_x,p_y,n);

  select jsonb_agg(jsonb_build_object('x',x,'y',y,'color',color))
  into cells from public.map_bomb_cells where bomb_id=bid;

  -- Animation only. A missing Realtime partition must not undo a successful purchase/use.
  begin
    perform realtime.send(
      jsonb_build_object('event_id',bid,'season_id',s.id,'center_x',p_x,'center_y',p_y),
      'bomb_exploded','bomb-effects',true
    );
  exception when others then
    null;
  end;

  return jsonb_build_object('success',true,'event_id',bid,'season_id',s.id,
    'cells',cells,'status',public.get_map_item_status(s.id));
end;
$$;

-- A received Broadcast is untrusted until its ID is checked against a committed event.
create or replace function public.get_bomb_effect_event(p_event_id bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.map_bomb_events%rowtype;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into e from public.map_bomb_events
  where id=p_event_id and created_at>clock_timestamp()-interval '15 seconds';
  if not found then return null; end if;
  return jsonb_build_object('event_id',e.id,'season_id',e.season_id,
    'center_x',e.center_x,'center_y',e.center_y);
end;
$$;

-- Only authenticated users can receive this private channel; no send policy is added.
create policy "bomb effects receive" on realtime.messages
for select to authenticated
using (realtime.topic()='bomb-effects' and extension='broadcast' and auth.uid() is not null);

revoke all on function public.use_map_bomb(integer,integer),
  public.get_bomb_effect_event(bigint) from public,anon,authenticated;
grant execute on function public.use_map_bomb(integer,integer),
  public.get_bomb_effect_event(bigint) to authenticated;
notify pgrst,'reload schema';
commit;
