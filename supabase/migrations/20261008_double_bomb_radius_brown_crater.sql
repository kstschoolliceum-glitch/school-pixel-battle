-- Expand bomb Manhattan radius from 12 to 24 (313 -> 1201 cells).
-- Patch deployed RPC body in place to preserve admin exemptions and security checks.
begin;
do $patch$
declare
  body text;
begin
  select pg_get_functiondef('public.use_map_bomb(integer,integer)'::regprocedure) into body;
  if body is null then raise exception 'Bomb RPC missing'; end if;
  if position('crater_radius constant integer:=12;' in body)=0
     or position('when dist>=crater_radius-1 then ''#64748b''' in body)=0
     or position('when dist>=crater_radius-3 then ''#475569''' in body)=0
     or position('when dist>=crater_radius-6 then ''#334155''' in body)=0
     or position('when dist>=crater_radius-9 then ''#1e293b''' in body)=0
     or position('when dist>0 then ''#0f172a''' in body)=0
  then raise exception 'Bomb RPC differs from expected version; no changes applied'; end if;
  body := replace(body,'crater_radius constant integer:=12;','crater_radius constant integer:=24;');
  body := replace(body,'when dist>=crater_radius-1 then ''#64748b''','when dist>=crater_radius-2 then ''#fdba74''');
  body := replace(body,'when dist>=crater_radius-3 then ''#475569''','when dist>=crater_radius-6 then ''#c2410c''');
  body := replace(body,'when dist>=crater_radius-6 then ''#334155''','when dist>=crater_radius-11 then ''#92400e''');
  body := replace(body,'when dist>=crater_radius-9 then ''#1e293b''','when dist>=crater_radius-16 then ''#7c2d12''');
  body := replace(body,'when dist>0 then ''#0f172a''','when dist>0 then ''#111111''');
  execute body;
end;
$patch$;
notify pgrst,'reload schema';
commit;
