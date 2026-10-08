-- Restore 313-cell bomb crater (Manhattan radius 12) with brown and gray shades.
-- Patch only the existing RPC; preserve security, admin exemptions and inventory logic.
begin;
do $patch$
declare
  definition text;
begin
  select pg_get_functiondef('public.use_map_bomb(integer,integer)'::regprocedure)
  into definition;
  if definition is null then raise exception 'Bomb function missing'; end if;
  if position('crater_radius constant integer:=24;' in definition)=0
     or position('when dist>=crater_radius-2 then ''#fdba74''' in definition)=0
     or position('when dist>=crater_radius-6 then ''#c2410c''' in definition)=0
     or position('when dist>=crater_radius-11 then ''#92400e''' in definition)=0
     or position('when dist>=crater_radius-16 then ''#7c2d12''' in definition)=0
     or position('when dist>0 then ''#111111''' in definition)=0
  then raise exception 'Unexpected bomb function; no changes applied'; end if;
  definition := replace(definition,'crater_radius constant integer:=24;','crater_radius constant integer:=12;');
  definition := replace(definition,'when dist>=crater_radius-2 then ''#fdba74''','when dist>=crater_radius-2 then ''#64748b''');
  definition := replace(definition,'when dist>=crater_radius-6 then ''#c2410c''','when dist>=crater_radius-5 then ''#92400e''');
  definition := replace(definition,'when dist>=crater_radius-11 then ''#92400e''','when dist>=crater_radius-8 then ''#475569''');
  definition := replace(definition,'when dist>=crater_radius-16 then ''#7c2d12''','when dist>=crater_radius-10 then ''#334155''');
  definition := replace(definition,'when dist>0 then ''#111111''','when dist>0 then ''#475569''');
  execute definition;
end;
$patch$;
notify pgrst,'reload schema';
commit;
