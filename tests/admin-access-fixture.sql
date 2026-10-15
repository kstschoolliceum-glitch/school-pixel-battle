-- Isolated CI database ONLY. Never run this fixture in a real Supabase project.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create function auth.role() returns text language sql stable as $$
  select current_setting('request.jwt.claim.role', true);
$$;
create table public.classes(id bigint primary key, name text);
create table public.profiles(id uuid primary key, role text not null default 'student'
  check(role in ('student','admin')), banned boolean not null default false,
  banned_until timestamptz, nickname text, class_id bigint references public.classes);
insert into classes values (1, '7А');
insert into profiles(id,role,nickname,class_id) values
  ('3f5f63b8-04b2-4e17-9aa1-16da562c5f72','admin','Owner',1),
  ('00000000-0000-4000-8000-000000000002','student','Assistant',1),
  ('00000000-0000-4000-8000-000000000003','student','Student',1),
  ('00000000-0000-4000-8000-000000000004','student','Second student',1);
create table seasons(id bigint primary key, finished boolean default false);
insert into seasons(id) values(6);
create table pixels(id integer primary key, color text);
create table pixel_history(id integer primary key);
insert into pixels values(1,'red');
create table promo_codes(id bigint generated always as identity, code text);
create table test_calls(id bigint generated always as identity, operation text);
create function public.is_admin() returns boolean language sql stable security definer as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and not banned);
$$;
create function public.admin_get_students()
returns table(user_id uuid, nickname text) language plpgsql stable security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  return query select p.id, p.nickname from public.profiles p;
end;
$$;
create function public.admin_set_student_banned(p_user_id uuid,p_banned boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  update public.profiles set banned=p_banned where id=p_user_id;
end;
$$;
create function public.admin_get_rule_violations(p_type text default 'all')
returns jsonb language plpgsql stable security definer as $$
begin return jsonb_build_object('type',p_type); end;
$$;
create function public.admin_create_promo_code(p_code text,p_title text,p_duration_seconds integer,
  p_cooldown_seconds integer,p_max_redemptions integer,p_valid_days integer default 0)
returns jsonb language plpgsql security definer as $$
begin
  insert into public.promo_codes(code) values(p_code);
  return jsonb_build_object('success',true);
end;
$$;
create function public.add_season_to_active_quarter(p_season_id bigint)
returns void language plpgsql security definer as $$
begin insert into public.test_calls(operation) values('quarter'); end;
$$;
create function public.finish_season(p_season_id bigint)
returns void language plpgsql security definer as $$
begin
  perform public.add_season_to_active_quarter(p_season_id);
  update public.seasons set finished=true where id=p_season_id;
end;
$$;
-- Simulate old direct-write RPCs, so trigger protections are tested independently.
create function public.legacy_change_role(p_user_id uuid,p_role text)
returns void language sql security definer as $$
  update public.profiles set role=p_role where id=p_user_id;
$$;
create function public.legacy_clear_map()
returns void language sql security definer as $$delete from public.pixels;$$;
create function public.legacy_change_season()
returns void language sql security definer as $$update public.seasons set finished=true;$$;
create function public.admin_unknown_operation()
returns integer language plpgsql security definer as $$begin return 42; end;$$;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.add_season_to_active_quarter(bigint) from public,anon,authenticated;
grant select,update on public.profiles to authenticated;
alter table profiles enable row level security;
create policy own_profile on profiles to authenticated using(id=auth.uid()) with check(id=auth.uid());
