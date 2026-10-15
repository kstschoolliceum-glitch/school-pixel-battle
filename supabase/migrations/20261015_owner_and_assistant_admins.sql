-- Run after all existing migrations. This migration does not run automatically.
begin;

-- This is the owner UUID explicitly confirmed by the operator, never inferred
-- from email/nickname, registration order, or the number of existing admins.
do $preflight$
begin
  if not exists (select 1 from public.profiles
    where id = '3f5f63b8-04b2-4e17-9aa1-16da562c5f72'::uuid
      and role = 'admin' and not coalesce(banned, false)) then
    raise exception 'CONFIRMED_OWNER_MUST_ALREADY_BE_AN_ACTIVE_ADMIN';
  end if;
  if has_schema_privilege('authenticated', 'public', 'CREATE')
     or has_schema_privilege('anon', 'public', 'CREATE') then
    raise exception 'PUBLIC_SCHEMA_MUST_NOT_BE_CLIENT_WRITABLE';
  end if;
end;
$preflight$;

-- Keep profiles.role='admin' for compatibility with legacy RPC/Edge checks.
-- Membership, provenance and revocation are held separately, with no client DML.
create table if not exists public.admin_staff (
  user_id uuid primary key references public.profiles(id) on delete restrict,
  active boolean not null default true,
  appointed_at timestamptz not null default clock_timestamp(),
  appointed_by uuid not null,
  revoked_at timestamptz,
  revoked_by uuid
);
create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  operation text not null,
  target_id text,
  result text not null check (result in ('committed', 'authorized', 'failed')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log(created_at desc);
alter table public.admin_staff enable row level security;
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_staff, public.admin_audit_log from public, anon, authenticated;
revoke all on sequence public.admin_audit_log_id_seq from public, anon, authenticated;

-- Preserve any other existing administrators as assistants, never as owners.
insert into public.admin_staff(user_id, appointed_by)
select id, '3f5f63b8-04b2-4e17-9aa1-16da562c5f72'::uuid
from public.profiles where role = 'admin'
  and id <> '3f5f63b8-04b2-4e17-9aa1-16da562c5f72'::uuid
on conflict (user_id) do nothing;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() = '3f5f63b8-04b2-4e17-9aa1-16da562c5f72'::uuid
    and exists(select 1 from public.profiles where id = auth.uid()
      and role = 'admin' and not coalesce(banned, false));
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid()
    and p.role = 'admin' and not coalesce(p.banned, false)
    and (p.id = '3f5f63b8-04b2-4e17-9aa1-16da562c5f72'::uuid
      or exists(select 1 from public.admin_staff s where s.user_id = p.id and s.active)));
$$;

-- Explicit signatures: a new/unknown admin RPC is owner-only by default.
create or replace function public.assert_admin_operation(p_signature text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  -- Retain existing SQL Editor/cron calls; an API caller cannot set session_user.
  if auth.uid() is null and session_user in ('postgres', 'supabase_admin') then return; end if;
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if public.is_super_admin() then return; end if;
  if not p_signature = any(array[
    'public.get_admin_overview()',
    'public.admin_get_students()', 'public.admin_get_student_ips()',
    'public.admin_get_multiaccount_risk()', 'public.admin_get_temporary_bans()',
    'public.admin_get_online_users(uuid[])', 'public.admin_get_referrals()',
    'public.admin_get_school_link_registrations()',
    'public.admin_set_student_banned(uuid, boolean)',
    'public.admin_set_student_banned_with_announcement(uuid, boolean)',
    'public.admin_set_student_temporary_ban(uuid, integer)',
    'public.admin_get_rule_violations(text)', 'public.admin_refresh_rule_violations()',
    'public.admin_get_moderation_reports(text)',
    'public.admin_review_moderation_report(bigint, text, text)',
    'public.admin_get_pixel_owner(bigint, integer, integer)',
    'public.admin_get_classes()', 'public.admin_create_class(text, integer)',
    'public.admin_set_class_active(bigint, boolean)',
    'public.admin_generate_invites(bigint, integer, integer)',
    'public.admin_get_invite_stats()', 'public.admin_get_promo_codes()',
    'public.admin_create_promo_code(text, text, integer, integer, integer, integer)',
    'public.admin_create_item_promo_code(text, text, text, integer, integer, integer)',
    'public.admin_set_promo_active(bigint, boolean)',
    'public.admin_set_music_theme(text)', 'public.admin_set_music_selection(text, integer)',
    'public.admin_restart_unblock_me(integer)'
  ]::text[]) then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
end;
$$;

create or replace function public.get_my_admin_access()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('is_admin', public.is_admin(),
    'is_super_admin', coalesce(public.is_super_admin(), false));
$$;

-- New helper functions are not standalone client endpoints.
revoke all on function public.assert_admin_operation(text) from public, anon, authenticated;
revoke all on function public.is_admin(), public.is_super_admin(), public.get_my_admin_access()
  from public, anon, authenticated;
grant execute on function public.is_admin(), public.is_super_admin(), public.get_my_admin_access()
  to authenticated;

create or replace function public.guard_admin_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare old_admin boolean := false;
begin
  -- Trusted server provisioning/SQL remains possible; SECURITY DEFINER calls
  -- made from a user request still retain auth.uid() and hit all checks below.
  if auth.uid() is null then
    if session_user not in ('postgres', 'supabase_admin')
       and coalesce(auth.role(), '') <> 'service_role' then
      if tg_op <> 'INSERT' or new.role = 'admin' then raise exception 'AUTH_REQUIRED'; end if;
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op <> 'INSERT' then
    old_admin := old.role = 'admin' or exists(
      select 1 from public.admin_staff where user_id = old.id and active);
    if old.id = '3f5f63b8-04b2-4e17-9aa1-16da562c5f72'::uuid then
      if tg_op = 'DELETE' then raise exception 'OWNER_PROTECTED'; end if;
      if new.id is distinct from old.id or new.role is distinct from old.role
         or new.banned is distinct from old.banned
         or new.banned_until is distinct from old.banned_until then
        raise exception 'OWNER_PROTECTED';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then
    if not public.is_super_admin() then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and new.id is distinct from old.id then
    raise exception 'PROFILE_ID_IMMUTABLE';
  end if;
  if (tg_op = 'INSERT' and new.role = 'admin')
     or (tg_op = 'UPDATE' and new.role is distinct from old.role)
     or (tg_op = 'UPDATE' and old_admin and
       (new.banned is distinct from old.banned or new.banned_until is distinct from old.banned_until)) then
    if not public.is_super_admin() then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
  end if;
  if new.role = 'admin' and new.id <> '3f5f63b8-04b2-4e17-9aa1-16da562c5f72'::uuid
     and not exists(select 1 from public.admin_staff where user_id = new.id and active) then
    raise exception 'APPOINT_ASSISTANT_THROUGH_OWNER_RPC';
  end if;
  return new;
end;
$$;
drop trigger if exists zz_guard_admin_profile on public.profiles;
create trigger zz_guard_admin_profile before insert or update or delete on public.profiles
  for each row execute function public.guard_admin_profile();

create or replace function public.guard_owner_data()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not coalesce(public.is_super_admin(), false) then
    raise exception 'SUPER_ADMIN_REQUIRED';
  end if;
  if auth.uid() is null and session_user not in ('postgres', 'supabase_admin')
     and coalesce(auth.role(), '') <> 'service_role' then raise exception 'AUTH_REQUIRED'; end if;
  if tg_level = 'STATEMENT' then return null; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Guard appointments even if an older RPC accidentally writes this table.
drop trigger if exists guard_owner_data on public.admin_staff;
create trigger guard_owner_data before insert or update or delete on public.admin_staff
  for each row execute function public.guard_owner_data();

-- Defense against legacy functions/direct table policies and mass deletion.
-- Do not add permissions to any of these existing tables.
do $guards$
declare t record;
begin
  for t in select c.relname from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and (c.relname in ('seasons', 'season_results', 'season_snapshots')
        or c.relname like 'quarter\_%' escape '\')
  loop
    execute format('drop trigger if exists guard_owner_data on public.%I', t.relname);
    execute format('create trigger guard_owner_data before insert or update or delete on public.%I for each row execute function public.guard_owner_data()', t.relname);
    execute format('drop trigger if exists guard_owner_truncate on public.%I', t.relname);
    execute format('create trigger guard_owner_truncate before truncate on public.%I execute function public.guard_owner_data()', t.relname);
  end loop;
  for t in select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and c.relname in ('pixels', 'pixel_history', 'profiles', 'admin_staff', 'admin_audit_log')
  loop
    execute format('drop trigger if exists guard_owner_truncate on public.%I', t.relname);
    execute format('create trigger guard_owner_truncate before truncate on public.%I execute function public.guard_owner_data()', t.relname);
    if t.relname in ('pixels', 'pixel_history', 'admin_audit_log') then
      execute format('drop trigger if exists guard_owner_delete on public.%I', t.relname);
      execute format('create trigger guard_owner_delete before delete on public.%I for each row execute function public.guard_owner_data()', t.relname);
    end if;
    if t.relname = 'admin_audit_log' then
      execute 'drop trigger if exists guard_owner_update on public.admin_audit_log';
      execute 'create trigger guard_owner_update before update on public.admin_audit_log for each row execute function public.guard_owner_data()';
    end if;
  end loop;
end;
$guards$;

-- Preserve the original function OIDs, signatures, defaults, grants and bodies.
-- A nested PL/pgSQL block puts authorization BEFORE even DECLARE initializers.
-- Unknown admin signatures fail closed for assistants. Unsupported bodies abort
-- the entire migration instead of leaving a partially protected installation.
do $rpc_guards$
declare r record; definition text; delimiter text; body text; header_pos integer;
begin
  for r in select p.*, l.lanname,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as client_execute
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    join pg_catalog.pg_language l on l.oid=p.prolang
    where n.nspname='public' and p.prokind='f'
      and (p.proname like 'admin\_%' escape '\' or p.proname in (
        'get_admin_overview', 'start_season', 'finish_season', 'rotate_season',
        'start_quarter_competition', 'finish_quarter_competition',
        'add_season_to_active_quarter', 'clear_map', 'reset_map', 'delete_season'))
  loop
    if position('-- school-admin-access-v1' in r.prosrc) > 0 then continue; end if;
    if r.lanname <> 'plpgsql' then
      raise exception 'REVIEW_UNSUPPORTED_ADMIN_FUNCTION:%', r.oid::regprocedure;
    end if;
    definition := pg_catalog.pg_get_functiondef(r.oid);
    delimiter := substring(definition from 'AS (\$[a-zA-Z_][a-zA-Z_0-9]*\$)');
    if delimiter is null then raise exception 'UNEXPECTED_FUNCTION_DEFINITION:%', r.oid::regprocedure; end if;
    header_pos := strpos(definition, 'AS ' || delimiter);
    body := '-- school-admin-access-v1' || E'\nBEGIN\nPERFORM public.assert_admin_operation(' ||
      quote_literal(format('public.%I(%s)', r.proname, pg_catalog.oidvectortypes(r.proargtypes))) || E');\n' ||
      regexp_replace(r.prosrc, '[[:space:];]+$', '') || E';\nEND;';
    execute left(definition, header_pos - 1) || 'AS ' || quote_literal(body) || ';';
    execute format('alter function %s set search_path = public, pg_temp', r.oid::regprocedure);
    execute format('revoke execute on function %s from public, anon', r.oid::regprocedure);
    if r.proname = 'add_season_to_active_quarter' then
      execute format('revoke execute on function %s from authenticated', r.oid::regprocedure);
    elsif r.client_execute then
      -- Normalize an inherited PUBLIC privilege to an explicit client grant.
      execute format('grant execute on function %s to authenticated', r.oid::regprocedure);
    end if;
  end loop;
end;
$rpc_guards$;

create or replace function public.audit_admin_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare before_row jsonb; after_row jsonb; details jsonb;
begin
  if auth.uid() is null or not public.is_admin() then return null; end if;
  if tg_op <> 'INSERT' then before_row := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then after_row := to_jsonb(new); end if;
  if tg_table_name = 'profiles' then
    if tg_op = 'UPDATE' and before_row->'role' = after_row->'role'
      and before_row->'banned' = after_row->'banned'
      and before_row->'banned_until' is not distinct from after_row->'banned_until' then return null; end if;
    details := jsonb_build_object('role', after_row->'role', 'banned', after_row->'banned',
      'banned_until', after_row->'banned_until');
  else
    -- No passwords, IPs, message contents or working promo codes in the log.
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into details
      from jsonb_each(coalesce(after_row, before_row)) where key = any(array[
        'active','appointed_by','revoked_by','amount','reason','item_type',
        'quantity','reward_type','item_quantity','is_active','status','theme_id',
        'track_index','season_id','user_id','balance']);
  end if;
  insert into public.admin_audit_log(actor_id, operation, target_id, result, details)
  values(auth.uid(), tg_table_name || '.' || lower(tg_op),
    coalesce(after_row->>'id', after_row->>'user_id', before_row->>'id', before_row->>'user_id'),
    'committed', details);
  return null;
end;
$$;
do $audit_triggers$
declare t record;
begin
  for t in select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and (
      c.relname = any(array['profiles','admin_staff','promo_codes','pi_coin_transactions',
        'pi_coin_wallets','map_item_inventory','map_item_ledger','seasons','season_results',
        'classes','invite_codes','moderation_reports','game_music_settings','chat_messages'])
      or c.relname like 'quarter\_%' escape '\')
  loop
    execute format('drop trigger if exists audit_admin_change on public.%I', t.relname);
    execute format('create trigger audit_admin_change after insert or update or delete on public.%I for each row execute function public.audit_admin_change()', t.relname);
  end loop;
end;
$audit_triggers$;

create or replace function public.owner_search_admin_candidates(p_query text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not coalesce(public.is_super_admin(), false) then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
  if char_length(trim(coalesce(p_query,''))) < 2 or char_length(p_query) > 80 then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into result from (
    select p.id as user_id, p.nickname, c.name as class_name, p.banned,
      case when p.id='3f5f63b8-04b2-4e17-9aa1-16da562c5f72'::uuid then 'super_admin'
        when s.active then 'assistant_admin' else 'student' end as admin_role
    from public.profiles p left join public.classes c on c.id=p.class_id
    left join public.admin_staff s on s.user_id=p.id
    where strpos(lower(coalesce(p.nickname,'')), lower(trim(p_query)))>0
    order by p.nickname, p.id limit 20
  ) q;
  return result;
end;
$$;

create or replace function public.owner_get_admin_staff()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not coalesce(public.is_super_admin(), false) then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
  select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into result from (
    select s.*, p.nickname, p.banned, c.name as class_name, a.nickname as appointed_by_nickname
    from public.admin_staff s join public.profiles p on p.id=s.user_id
    left join public.classes c on c.id=p.class_id
    left join public.profiles a on a.id=s.appointed_by
    order by s.active desc, s.appointed_at desc limit 100
  ) q;
  return result;
end;
$$;

create or replace function public.owner_set_assistant_admin(p_user_id uuid, p_active boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.profiles%rowtype;
begin
  if not coalesce(public.is_super_admin(), false) then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
  if p_user_id is null or p_active is null then raise exception 'INVALID_REQUEST'; end if;
  if p_user_id='3f5f63b8-04b2-4e17-9aa1-16da562c5f72'::uuid then raise exception 'OWNER_PROTECTED'; end if;
  select * into target from public.profiles where id=p_user_id for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if p_active and coalesce(target.banned, false) then raise exception 'USER_BANNED'; end if;
  if p_active then
    insert into public.admin_staff(user_id, active, appointed_by)
    values(p_user_id, true, auth.uid()) on conflict(user_id) do update set
      active=true, appointed_at=clock_timestamp(), appointed_by=auth.uid(), revoked_at=null, revoked_by=null;
    update public.profiles set role='admin' where id=p_user_id;
  else
    update public.admin_staff set active=false, revoked_at=clock_timestamp(), revoked_by=auth.uid()
      where user_id=p_user_id and active;
    if not found then raise exception 'ACTIVE_ASSISTANT_NOT_FOUND'; end if;
    update public.profiles set role='student' where id=p_user_id;
  end if;
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.owner_get_admin_audit(p_before_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not coalesce(public.is_super_admin(), false) then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
  select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into result from (
    select l.*, p.nickname as actor_nickname from public.admin_audit_log l
      left join public.profiles p on p.id=l.actor_id
    where p_before_id is null or l.id < p_before_id order by l.id desc limit 100
  ) q;
  return result;
end;
$$;

-- Validate both actor and target with the caller's JWT BEFORE using Auth Admin.
create or replace function public.authorize_admin_password_reset(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  -- Password reset is an account takeover capability: owner only.
  if not coalesce(public.is_super_admin(), false) then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
  perform 1 from public.profiles p where p.id=p_user_id and p.role <> 'admin'
    and p.id <> '3f5f63b8-04b2-4e17-9aa1-16da562c5f72'::uuid
    and not exists(select 1 from public.admin_staff s where s.user_id=p.id and s.active);
  if not found then raise exception 'ADMIN_ACCOUNT_PROTECTED'; end if;
  insert into public.admin_audit_log(actor_id, operation, target_id, result)
    values(auth.uid(), 'password_reset', p_user_id::text, 'authorized');
  return true;
end;
$$;

create or replace function public.record_admin_password_reset_result(
  p_actor_id uuid, p_user_id uuid, p_success boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'SERVICE_REQUIRED'; end if;
  insert into public.admin_audit_log(actor_id, operation, target_id, result)
    values(p_actor_id, 'password_reset', p_user_id::text,
      case when p_success then 'committed' else 'failed' end);
end;
$$;
revoke all on function public.record_admin_password_reset_result(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.record_admin_password_reset_result(uuid, uuid, boolean) to service_role;

-- Keep at least one year for investigation; bounded batches, no per-tick work.
create or replace function public.prune_admin_audit_log()
returns integer language plpgsql security definer set search_path = '' as $$
declare removed integer;
begin
  if not coalesce(public.is_super_admin(), false) and not
    (auth.uid() is null and session_user in ('postgres','supabase_admin')) then
    raise exception 'SUPER_ADMIN_REQUIRED';
  end if;
  delete from public.admin_audit_log where id in (select id from public.admin_audit_log
    where created_at < clock_timestamp() - interval '365 days' order by id limit 10000);
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.guard_admin_profile(), public.guard_owner_data(), public.audit_admin_change(),
  public.owner_search_admin_candidates(text), public.owner_get_admin_staff(),
  public.owner_set_assistant_admin(uuid, boolean), public.owner_get_admin_audit(bigint),
  public.authorize_admin_password_reset(uuid), public.prune_admin_audit_log()
  from public, anon, authenticated;
grant execute on function public.owner_search_admin_candidates(text), public.owner_get_admin_staff(),
  public.owner_set_assistant_admin(uuid, boolean), public.owner_get_admin_audit(bigint),
  public.authorize_admin_password_reset(uuid), public.prune_admin_audit_log() to authenticated;

-- Schedule only when pg_cron already exists; otherwise the owner can invoke
-- prune_admin_audit_log() periodically. Never install an extension here.
do $retention$
begin
  if exists(select 1 from pg_catalog.pg_extension where extname='pg_cron') then
    if not exists(select 1 from cron.job where jobname='prune-admin-audit-log') then
      perform cron.schedule('prune-admin-audit-log', '20 3 * * *', 'select public.prune_admin_audit_log();');
    end if;
  end if;
end;
$retention$;

commit;
