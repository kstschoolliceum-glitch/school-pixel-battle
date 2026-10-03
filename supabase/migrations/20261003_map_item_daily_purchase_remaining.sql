-- Show authenticated users how many map items remain available to buy today.
begin;

create or replace function public.get_map_item_status(p_season_id bigint default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  u uuid:=auth.uid();
  n timestamptz:=clock_timestamp();
  d date:=(n at time zone 'Asia/Yekaterinburg')::date;
  bal integer:=0;
  inv jsonb;
  bs jsonb:='[]'::jsonb;
  cs jsonb:='[]'::jsonb;
  bomb_buys integer:=0;
  beacon_buys integer:=0;
  detector_buys integer:=0;
begin
  if u is null then raise exception 'NOT_AUTHENTICATED'; end if;

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

  select
    count(*) filter(where item_type='bomb')::integer,
    count(*) filter(where item_type='beacon')::integer,
    count(*) filter(where item_type='detector')::integer
  into bomb_buys,beacon_buys,detector_buys
  from public.map_item_ledger
  where user_id=u
    and action='purchase'
    and (created_at at time zone 'Asia/Yekaterinburg')::date=d;

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
    'purchase_remaining',jsonb_build_object(
      'bomb',greatest(0,1-bomb_buys),
      'beacon',greatest(0,2-beacon_buys),
      'detector',greatest(0,10-detector_buys)
    ),
    'beacons',bs,
    'bomb_cells',cs
  );
end;
$$;

revoke all on function public.get_map_item_status(bigint) from public,anon;
grant execute on function public.get_map_item_status(bigint) to authenticated;

commit;
