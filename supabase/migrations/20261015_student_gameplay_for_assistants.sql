-- Apply AFTER 20261015_owner_and_assistant_admins.sql. No game data reset.
begin;

do $classes$
declare t text; privilege_name text;
begin
  if exists(select 1 from public.admin_staff s join public.profiles p on p.id=s.user_id
    where s.active and p.class_id is null) then raise exception 'EXISTING_ASSISTANT_CLASS_REQUIRED'; end if;
  -- These tables are RPC-only in the versioned schema. A production-only
  -- privilege drift needs review, not a broad automatic rewrite of its RLS.
  foreach t in array array['pi_coin_wallets','pi_coin_transactions','pi_coin_boosts',
    'map_item_inventory','map_item_ledger','unblock_me_daily','sokoban_progress','fifteen_progress'] loop
    if to_regclass('public.'||t) is null then continue; end if;
    foreach privilege_name in array array['INSERT','UPDATE','DELETE','TRUNCATE'] loop
      if has_table_privilege('authenticated',to_regclass('public.'||t),privilege_name) then
        raise exception 'REVIEW_CLIENT_TABLE_PRIVILEGE:%.%',t,privilege_name;
      end if;
    end loop;
  end loop;
end;
$classes$;

create or replace function public.is_assistant_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p join public.admin_staff s on s.user_id=p.id
    where p.id=auth.uid() and p.role='student' and not coalesce(p.banned,false) and s.active);
$$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_super_admin(),false) or public.is_assistant_admin();
$$;
create or replace function public.is_gameplay_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_super_admin(),false);
$$;
create or replace function public.get_my_admin_access()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('is_admin',public.is_admin(),
    'is_super_admin',coalesce(public.is_super_admin(),false),
    'is_gameplay_admin',public.is_gameplay_admin(),
    'is_assistant_admin',public.is_assistant_admin());
$$;
revoke all on function public.is_assistant_admin(), public.is_gameplay_admin()
  from public,anon,authenticated;
grant execute on function public.is_assistant_admin() to authenticated;

-- Retain the existing allowlist but remove the two competitive/test exceptions.
-- The owner check still runs first, so the owner's existing access is unchanged.
do $permissions$
declare d text;
begin
  d := pg_catalog.pg_get_functiondef('public.assert_admin_operation(text)'::regprocedure);
  d := replace(d, '''public.admin_set_class_active(bigint, boolean)'',', '');
  d := replace(d, ', ''public.admin_restart_unblock_me(integer)''', '');
  -- The final entry may have no leading comma on its line in older formatting.
  d := replace(d, ',
    ''public.admin_restart_unblock_me(integer)''', '');
  if d like '%''public.admin_restart_unblock_me(integer)''%'
     or d like '%''public.admin_set_class_active(bigint, boolean)''%' then
    raise exception 'UNREVIEWED_ADMIN_ALLOWLIST_FORMAT';
  end if;
  execute d;
end;
$permissions$;

create or replace function public.guard_admin_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare old_admin boolean;
begin
  if tg_op <> 'DELETE' and new.role='admin'
     and new.id <> '3f5f63b8-04b2-4e17-9aa1-16da562c5f72'::uuid then
    raise exception 'ADMIN_ROLE_RESERVED_FOR_OWNER';
  end if;
  if auth.uid() is null then
    if session_user not in ('postgres','supabase_admin') and coalesce(auth.role(),'')<>'service_role' then
      if tg_op<>'INSERT' or new.role<>'student' then raise exception 'AUTH_REQUIRED'; end if;
    end if;
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if tg_op<>'INSERT' then
    old_admin := old.role='admin' or exists(select 1 from public.admin_staff where user_id=old.id and active);
    if old.id='3f5f63b8-04b2-4e17-9aa1-16da562c5f72'::uuid then
      if tg_op='DELETE' then raise exception 'OWNER_PROTECTED'; end if;
      if new.id is distinct from old.id or new.role is distinct from old.role
        or new.banned is distinct from old.banned or new.banned_until is distinct from old.banned_until then
        raise exception 'OWNER_PROTECTED';
      end if;
    end if;
  end if;
  if tg_op='DELETE' then
    if not coalesce(public.is_super_admin(),false) then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
    return old;
  end if;
  if tg_op='UPDATE' then
    if new.id is distinct from old.id then raise exception 'PROFILE_ID_IMMUTABLE'; end if;
    if new.role is distinct from old.role or (old_admin and
      (new.banned is distinct from old.banned or new.banned_until is distinct from old.banned_until)) then
      if not coalesce(public.is_super_admin(),false) then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
    end if;
    if public.is_assistant_admin() then
      if new.class_id is distinct from old.class_id then raise exception 'OWNER_APPROVAL_REQUIRED'; end if;
      if new.banned is distinct from old.banned or new.banned_until is distinct from old.banned_until then
        perform public.assert_assistant_moderation(old.id);
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Upgrade appointments from the previous migration without touching class,
-- cooldown, statistics, balance, history or inventory.
update public.profiles p set role='student'
where p.id<>'3f5f63b8-04b2-4e17-9aa1-16da562c5f72'::uuid and p.role='admin'
  and exists(select 1 from public.admin_staff s where s.user_id=p.id);

create or replace function public.owner_set_assistant_admin(p_user_id uuid,p_active boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.profiles%rowtype;
begin
  if not coalesce(public.is_super_admin(),false) then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
  if p_user_id is null or p_active is null then raise exception 'INVALID_REQUEST'; end if;
  if p_user_id='3f5f63b8-04b2-4e17-9aa1-16da562c5f72'::uuid then raise exception 'OWNER_PROTECTED'; end if;
  select * into target from public.profiles where id=p_user_id for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if p_active and coalesce(target.banned,false) then raise exception 'USER_BANNED'; end if;
  if target.role<>'student' then raise exception 'STUDENT_ACCOUNT_REQUIRED'; end if;
  if p_active and target.class_id is null then raise exception 'CLASS_REQUIRED'; end if;
  if p_active then
    insert into public.admin_staff(user_id,active,appointed_by) values(p_user_id,true,auth.uid())
    on conflict(user_id) do update set active=true,appointed_at=clock_timestamp(),
      appointed_by=auth.uid(),revoked_at=null,revoked_by=null;
  else
    update public.admin_staff set active=false,revoked_at=clock_timestamp(),revoked_by=auth.uid()
      where user_id=p_user_id and active;
    if not found then raise exception 'ACTIVE_ASSISTANT_NOT_FOUND'; end if;
  end if;
  return jsonb_build_object('success',true);
end;
$$;

-- A helper cannot use a broad legacy profile policy to edit game counters.
-- Invoker context distinguishes direct REST writes from existing definer RPCs.
create or replace function public.guard_assistant_direct_profile_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated','anon') and public.is_assistant_admin() then
    if tg_op='INSERT' then raise exception 'DIRECT_PROFILE_CREATION_FORBIDDEN'; end if;
    if (to_jsonb(new)-array['nickname','updated_at']) is distinct from
        (to_jsonb(old)-array['nickname','updated_at']) then
      raise exception 'DIRECT_GAME_STATS_CHANGE_FORBIDDEN';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_assistant_direct_write on public.profiles;
create trigger guard_assistant_direct_write before insert or update on public.profiles for each row
  execute function public.guard_assistant_direct_profile_write();

-- The original map schema is not fully versioned here. A legacy admin RLS
-- policy must not grant a helper direct REST pixel writes. Existing definer
-- placement/bomb RPCs retain their own validation and perform the actual writes.
-- Wallet, inventory and mini-game client writes remain revoked by their existing
-- migrations; do not add triggers or change permissions on those tables.
create or replace function public.guard_assistant_direct_game_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated','anon') then
    if public.is_assistant_admin() then raise exception 'USE_STANDARD_GAME_RPC'; end if;
  end if;
  return new;
end;
$$;
do $map_write_guards$
declare t text;
begin
  foreach t in array array['pixels','pixel_history'] loop
    execute format('drop trigger if exists guard_assistant_direct_game_write on public.%I',t);
    execute format('create trigger guard_assistant_direct_game_write before insert or update on public.%I for each row execute function public.guard_assistant_direct_game_write()',t);
  end loop;
end;
$map_write_guards$;

-- Class activation changes eligibility in the competition, not moderation.
drop trigger if exists guard_owner_class_status on public.classes;
create trigger guard_owner_class_status before update of is_active on public.classes
  for each row execute function public.guard_owner_data();
drop trigger if exists guard_owner_class_delete on public.classes;
create trigger guard_owner_class_delete before delete on public.classes
  for each row execute function public.guard_owner_data();

create or replace function public.assert_assistant_moderation(p_target_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
declare evidence_found boolean := false;
begin
  if not public.is_assistant_admin() then return; end if;
  if p_target_id=auth.uid() then raise exception 'OWN_ACCOUNT_MODERATION_FORBIDDEN'; end if;
  if to_regclass('public.game_rule_violations') is not null then
    execute 'select exists(select 1 from public.game_rule_violations where user_id=$1 and occurred_at>clock_timestamp()-interval ''7 days'' and length(trim(evidence))>0)'
      into evidence_found using p_target_id;
  end if;
  if not evidence_found and to_regclass('public.moderation_reports') is not null then
    execute 'select exists(select 1 from public.moderation_reports where target_user_id=$1 and reporter_id<>$2 and status in (''open'',''resolved'') and created_at>clock_timestamp()-interval ''7 days'')'
      into evidence_found using p_target_id,auth.uid();
  end if;
  if not evidence_found then raise exception 'OWNER_APPROVAL_OR_MODERATION_EVIDENCE_REQUIRED'; end if;
end;
$$;

-- Replace ONLY reviewed actor-scoped profile predicates. Never change target
-- filters (students/rankings) or unrelated gameplay SQL. Abort on unknown guards.
do $administrative_checks$
declare r record; d text; body text; pattern text; actor text; delimiter text; pos integer;
begin
  for r in select p.* from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like 'admin\_%' escape '\' or p.proname='get_admin_overview')
  loop
    if position('-- school-admin-access-v1' in r.prosrc)=0 then raise exception 'MISSING_ADMIN_RPC_GATE:%',r.oid::regprocedure; end if;
    actor := 'auth[.]uid[[:space:]]*\([[:space:]]*\)';
    if r.prosrc ~* 'v_admin_id[[:space:]]+uuid[[:space:]]*:=[[:space:]]*auth[.]uid\(' then actor:=actor||'|v_admin_id'; end if;
    if r.prosrc ~* 'v_user_id[[:space:]]+uuid[[:space:]]*:=[[:space:]]*auth[.]uid\(' then actor:=actor||'|v_user_id'; end if;
    pattern := 'exists[[:space:]]*\([[:space:]]*select[[:space:]]+1[[:space:]]+from[[:space:]]+public[.]profiles([[:space:]]+p)?[[:space:]]+where[[:space:]]+(p[.])?id[[:space:]]*=[[:space:]]*('||actor||')[[:space:]]+and[[:space:]]+(p[.])?role[[:space:]]*=[[:space:]]*''admin''[[:space:]]+and[[:space:]]+((p[.])?banned[[:space:]]*=[[:space:]]*false|coalesce[[:space:]]*\([[:space:]]*(p[.])?banned[[:space:]]*,[[:space:]]*false[[:space:]]*\)[[:space:]]*=[[:space:]]*false)[[:space:]]*\)';
    body := regexp_replace(r.prosrc,pattern,'public.is_admin()','gi');
    if body<>r.prosrc then
      d:=pg_catalog.pg_get_functiondef(r.oid);
      delimiter:=substring(d from 'AS (\$[a-zA-Z_][a-zA-Z_0-9]*\$)');
      if delimiter is null then raise exception 'UNEXPECTED_ADMIN_BODY:%',r.oid::regprocedure; end if;
      pos:=strpos(d,'AS '||delimiter);
      execute left(d,pos-1)||'AS '||quote_literal(body)||';';
    end if;
  end loop;
end;
$administrative_checks$;

-- Existing mini-game statuses, actions and rewards must use ONLY the owner's
-- gameplay exemption, not administrative-panel access. No new game rules.
do $gameplay_checks$
declare r record; d text; body text; delimiter text; pos integer;
begin
  for r in select p.* from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f'
      and p.proname !~ '^admin_' and (p.proname ~ '(unblock|sokoban|fifteen|hanoi)'
        or p.proname = any(array['place_pixel','buy_map_item','get_map_item_status',
          'buy_pi_coin_turbo','use_map_bomb','place_map_beacon','reveal_pixel_owner',
          'remove_map_beacon','activate_daily_task_boost','claim_daily_pi_coin_stage',
          'claim_daily_task_reward','get_daily_pi_coin_tasks','get_daily_tasks',
          'claim_pi_coin_daily','get_pi_coin_status','daily_task_status_for']))
  loop
    body:=regexp_replace(r.prosrc,'public[.]is_admin[[:space:]]*\([[:space:]]*\)','public.is_gameplay_admin()','gi');
    if body<>r.prosrc then
      d:=pg_catalog.pg_get_functiondef(r.oid); delimiter:=substring(d from 'AS (\$[a-zA-Z_][a-zA-Z_0-9]*\$)');
      if delimiter is null then raise exception 'UNEXPECTED_GAME_BODY:%',r.oid::regprocedure; end if;
      pos:=strpos(d,'AS '||delimiter); execute left(d,pos-1)||'AS '||quote_literal(body)||';';
    end if;
  end loop;
end;
$gameplay_checks$;

-- Reuse disabled/active promo state as the owner's approval mechanism.
alter table public.promo_codes add column if not exists created_by uuid;
alter table public.promo_codes add column if not exists assistant_creator_id uuid;
alter table public.promo_codes add column if not exists owner_approved_by uuid;
alter table public.promo_codes add column if not exists needs_owner_approval boolean not null default false;
update public.promo_codes c set created_by=l.actor_id,
  assistant_creator_id=case when l.actor_id<>'3f5f63b8-04b2-4e17-9aa1-16da562c5f72'::uuid
    and exists(select 1 from public.admin_staff s where s.user_id=l.actor_id) then l.actor_id else null end
from (select distinct on (target_id) target_id,actor_id from public.admin_audit_log
  where operation='promo_codes.insert' order by target_id,id) l
where c.id::text=l.target_id and c.created_by is null;
update public.promo_codes set active=false,needs_owner_approval=true
where assistant_creator_id is not null and owner_approved_by is null;

create or replace function public.guard_assistant_promo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    if session_user not in ('postgres','supabase_admin') and coalesce(auth.role(),'')<>'service_role' then raise exception 'AUTH_REQUIRED'; end if;
    return new;
  end if;
  if tg_op='UPDATE' then
    -- Existing redemption accounting is a normal student operation.
    if (to_jsonb(new)-'redemption_count')=(to_jsonb(old)-'redemption_count')
      and new.redemption_count=old.redemption_count+1 then return new; end if;
    if new.created_by is distinct from old.created_by or new.assistant_creator_id is distinct from old.assistant_creator_id then
      raise exception 'PROMO_PROVENANCE_IMMUTABLE';
    end if;
  end if;
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if tg_op='INSERT' then
    new.created_by:=auth.uid();
    new.assistant_creator_id:=case when public.is_assistant_admin() then auth.uid() else null end;
    new.owner_approved_by:=case when public.is_super_admin() then auth.uid() else null end;
    if public.is_assistant_admin() then new.active:=false; new.needs_owner_approval:=true; end if;
  elsif public.is_assistant_admin() then
    if new.active is distinct from old.active or new.active then raise exception 'OWNER_APPROVAL_REQUIRED'; end if;
    if (to_jsonb(new)-array['active','needs_owner_approval']) is distinct from
       (to_jsonb(old)-array['active','needs_owner_approval']) then raise exception 'OWNER_APPROVAL_REQUIRED'; end if;
    new.needs_owner_approval:=true;
  elsif new.active then new.needs_owner_approval:=false; new.owner_approved_by:=auth.uid();
  end if;
  return new;
end;
$$;
drop trigger if exists guard_assistant_promo on public.promo_codes;
create trigger guard_assistant_promo before insert or update on public.promo_codes
  for each row execute function public.guard_assistant_promo();

create or replace function public.guard_assistant_promo_redemption()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.promo_codes c where c.id=new.promo_code_id
    and (c.needs_owner_approval or c.assistant_creator_id=new.user_id
      or (c.created_by is null and exists(select 1 from public.admin_staff s where s.user_id=new.user_id)))) then
    raise exception 'PROMO_CONFLICT_OF_INTEREST';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_assistant_promo_redemption on public.promo_redemptions;
create trigger guard_assistant_promo_redemption before insert on public.promo_redemptions
  for each row execute function public.guard_assistant_promo_redemption();

do $promo_display$
declare d text;
begin
  d:=pg_catalog.pg_get_functiondef('public.admin_get_promo_codes()'::regprocedure);
  if position('''needs_owner_approval''' in d)=0 then
    if position('''id'', c.id,' in d)=0 then raise exception 'UNREVIEWED_PROMO_STATUS_BODY'; end if;
    d:=replace(d,'''id'', c.id,','''id'', c.id, ''needs_owner_approval'', c.needs_owner_approval,');
    execute d;
  end if;
end;
$promo_display$;

revoke all on function public.guard_assistant_direct_profile_write(), public.guard_assistant_direct_game_write(), public.assert_assistant_moderation(uuid),
  public.guard_assistant_promo(), public.guard_assistant_promo_redemption() from public,anon,authenticated;

notify pgrst, 'reload schema';
commit;
