-- Apply after all existing migrations. Run the preflight in docs first.
-- No pixels, profiles, history or season rows are deleted.
begin;
create schema if not exists pixel_game_private;
revoke all on schema pixel_game_private from public, anon, authenticated;
create table if not exists pixel_game_private.config (
  singleton boolean primary key default true check (singleton),
  seasons_enabled boolean not null default false,
  boosts_enabled boolean not null default false,
  permanent_canvas boolean not null default true,
  pixel_cooldown_ms integer not null default 1000 check (pixel_cooldown_ms=1000),
  canvas_id bigint not null references public.seasons(id),
  original_season jsonb not null
);
create table if not exists pixel_game_private.function_backup (
  signature text primary key, definition text not null
);
create table if not exists pixel_game_private.cron_backup (
  jobid bigint primary key, was_active boolean not null
);
revoke all on all tables in schema pixel_game_private from public, anon, authenticated;

-- Serialize the cutover with all placements and rotations, including cron.
lock table public.seasons, public.profiles, public.pixels, public.pixel_history in share row exclusive mode;
do $canvas$
declare s public.seasons%rowtype; n integer;
begin
  if not exists(select 1 from pixel_game_private.config) then
    select count(*) into n from public.seasons where is_active and status='active';
    if n<>1 then raise exception 'REVIEW_ACTIVE_CANVAS_COUNT:% (choose existing canvas explicitly)',n; end if;
    select * into strict s from public.seasons where is_active and status='active';
    if s.map_width<>300 or s.map_height<>424 then raise exception 'REVIEW_CANVAS_DIMENSIONS'; end if;
    if s.starts_at>clock_timestamp() then raise exception 'CANVAS_NOT_STARTED'; end if;
    insert into pixel_game_private.config(canvas_id,original_season) values(s.id,to_jsonb(s));
    update public.seasons set ends_at='infinity'::timestamptz where id=s.id;
  end if;
end;
$canvas$;

create or replace function public.get_permanent_canvas()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return (select jsonb_build_object('id',s.id,'map_width',s.map_width,
    'map_height',s.map_height,'permanent',true)
    from public.seasons s join pixel_game_private.config c on c.canvas_id=s.id where c.permanent_canvas);
end;
$$;
revoke all on function public.get_permanent_canvas() from public,anon;
grant execute on function public.get_permanent_canvas() to authenticated;

create or replace function public.get_game_rules()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('seasons_enabled',seasons_enabled,'boosts_enabled',boosts_enabled,
    'permanent_canvas',permanent_canvas,'pixel_cooldown_ms',pixel_cooldown_ms)
  from pixel_game_private.config where singleton;
$$;
revoke all on function public.get_game_rules() from public;
grant execute on function public.get_game_rules() to anon,authenticated,service_role;

-- Freeze the existing compatibility season. Scheduled rollover transactions abort
-- before changing its status, inserting another season or invoking carryovers.
create or replace function pixel_game_private.guard_seasons()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from pixel_game_private.config where not seasons_enabled) then
    raise exception 'SEASONS_DISABLED';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists permanent_canvas_seasons on public.seasons;
create trigger permanent_canvas_seasons before insert or update or delete on public.seasons
  for each row execute function pixel_game_private.guard_seasons();
drop trigger if exists permanent_canvas_seasons_truncate on public.seasons;
create trigger permanent_canvas_seasons_truncate before truncate on public.seasons
  execute function pixel_game_private.guard_seasons();

-- Block legacy reset paths and direct client writes, retaining legitimate RPC
-- upserts (including existing bomb mechanics). A failing job rolls back atomically.
create or replace function pixel_game_private.guard_map()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from pixel_game_private.config where permanent_canvas) then
    if tg_op in ('DELETE','TRUNCATE') then raise exception 'PERMANENT_CANVAS_RESET_DISABLED'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create or replace function public.guard_pixel_client_write()
returns trigger language plpgsql set search_path='' as $$
begin
  if current_user in ('anon','authenticated') then raise exception 'USE_STANDARD_GAME_RPC'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
do $guards$
declare t text;
begin
  foreach t in array array['pixels','pixel_history'] loop
    execute format('drop trigger if exists permanent_canvas_reset on public.%I',t);
    execute format('create trigger permanent_canvas_reset before delete or truncate on public.%I for each statement execute function pixel_game_private.guard_map()',t);
    execute format('drop trigger if exists permanent_canvas_client_write on public.%I',t);
    execute format('create trigger permanent_canvas_client_write before insert or update or delete on public.%I for each row execute function public.guard_pixel_client_write()',t);
  end loop;
end;
$guards$;

-- Retain the complete deployed placement function, including auth, bans, palette,
-- row lock, history, daily tasks, notifications and map synchronization.
do $placement$
declare d text; marker text; hits integer;
begin
  d:=pg_get_functiondef('public.place_pixel(integer,integer,text)'::regprocedure);
  insert into pixel_game_private.function_backup values('public.place_pixel(integer,integer,text)',d) on conflict do nothing;
  if position('-- permanent-canvas-v1' in d)>0 then return; end if;
  if d !~* 'where[[:space:]]+id[[:space:]]*=[[:space:]]*v_user_id[[:space:]]+for[[:space:]]+update'
    or position('PIXEL_UNCHANGED' in d)=0
    or position('pg_advisory_xact_lock' in d)=0
    or position('set last_pixel_at = v_now' in d)=0 then
    raise exception 'REVIEW_PLACE_PIXEL_LOCKS_AND_HISTORY';
  end if;
  -- The owner follows the same placement limit as every other player.
  d:=replace(d,'if public.is_gameplay_admin() then v_cooldown_seconds := 0; end if;','');
  d:=replace(d,'if not public.is_gameplay_admin() and v_profile.last_pixel_at is not null then',
    'if v_profile.last_pixel_at is not null then');
  marker:='if v_profile.last_pixel_at is not null then';
  hits:=(length(d)-length(replace(d,marker,'')))/length(marker);
  if hits<>1 then raise exception 'REVIEW_PLACE_PIXEL_COOLDOWN_MARKER:%',hits; end if;
  d:=replace(d,marker,$patch$
    -- permanent-canvas-v1: refresh time AFTER user and cell locks.
    v_now := clock_timestamp();
    v_date := (v_now at time zone 'Asia/Almaty')::date;
    select pixel_cooldown_ms / 1000 into v_cooldown_seconds from pixel_game_private.config where singleton;
    v_boost_active := false;
    v_boost_until := null;
    if v_profile.last_pixel_at is not null then$patch$);
  execute d;
end;
$placement$;

-- Stop purchases/activation; retain historical boost rows. Mini-games continue
-- working, but triggers prevent newly awarded timers from taking effect.
do $boost_rpcs$
declare sig text; d text;
begin
  foreach sig in array array['public.activate_daily_task_boost()','public.buy_pi_coin_turbo()','public.claim_daily_task_reward()'] loop
    d:=pg_get_functiondef(sig::regprocedure);
    insert into pixel_game_private.function_backup values(sig,d) on conflict do nothing;
  end loop;
end;
$boost_rpcs$;
create or replace function public.activate_daily_task_boost()
returns jsonb language plpgsql security definer set search_path='' as $$
begin raise exception 'BOOSTS_DISABLED'; end;
$$;
create or replace function public.claim_daily_task_reward()
returns jsonb language plpgsql security definer set search_path='' as $$
begin raise exception 'BOOSTS_DISABLED'; end;
$$;
create or replace function public.buy_pi_coin_turbo()
returns jsonb language plpgsql security definer set search_path='' as $$
begin raise exception 'BOOSTS_DISABLED'; end;
$$;
create or replace function pixel_game_private.guard_boost_timer()
returns trigger language plpgsql security definer set search_path='' as $$
declare field text:=tg_argv[0];
begin
  if exists(select 1 from pixel_game_private.config where not boosts_enabled) then
    new:=jsonb_populate_record(new,jsonb_build_object(field,
      case when tg_op='UPDATE' then to_jsonb(old)->field else 'null'::jsonb end));
  end if;
  if tg_table_name='promo_redemptions' and tg_op='INSERT' then
    if exists(select 1 from public.promo_codes where id=new.promo_code_id and reward_type='pixel_hour') then
      raise exception 'BOOSTS_DISABLED';
    end if;
  end if;
  return new;
end;
$$;
do $boost_timers$
declare r record;
begin
  for r in select * from (values
    ('daily_task_progress','boost_until'),('pi_coin_boosts','active_until'),
    ('unblock_me_daily','boost_until'),('sokoban_progress','boost_until'),
    ('fifteen_progress','boost_until'),('promo_redemptions','benefit_until')) v(t,f)
  loop
    if exists(select 1 from information_schema.columns where table_schema='public' and table_name=r.t and column_name=r.f) then
      execute format('drop trigger if exists permanent_canvas_boost on public.%I',r.t);
      execute format('create trigger permanent_canvas_boost before insert or update on public.%I for each row execute function pixel_game_private.guard_boost_timer(%L)',r.t,r.f);
    end if;
  end loop;
end;
$boost_timers$;

-- No reward/reset operation may move the authoritative placement clock backwards.
create or replace function public.guard_permanent_pixel_clock()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.last_pixel_at is distinct from old.last_pixel_at then
    if current_user in ('authenticated','anon') then raise exception 'SERVER_PIXEL_CLOCK_ONLY'; end if;
    if old.last_pixel_at is not null and (new.last_pixel_at is null or new.last_pixel_at<old.last_pixel_at) then
      new.last_pixel_at:=old.last_pixel_at;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists permanent_pixel_clock on public.profiles;
create trigger permanent_pixel_clock before update on public.profiles for each row
  execute function public.guard_permanent_pixel_clock();

-- Snapshot a conservative all-time baseline once. Never SUM overlapping profile
-- and history totals. Existing unique-cell scores cannot exceed history count.
create table if not exists pixel_game_private.all_time_totals (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  pixels_count bigint not null check(pixels_count>=0)
);
insert into pixel_game_private.all_time_totals(user_id,pixels_count)
select p.id,greatest(coalesce(p.total_pixels,0),coalesce(h.n,0))
from public.profiles p left join (select user_id,count(*) n from public.pixel_history group by user_id) h on h.user_id=p.id
on conflict(user_id) do nothing;
create or replace function pixel_game_private.count_placement()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into pixel_game_private.all_time_totals(user_id,pixels_count) values(new.user_id,1)
    on conflict(user_id) do update set pixels_count=pixel_game_private.all_time_totals.pixels_count+1;
  return new;
end;
$$;
drop trigger if exists permanent_count_placement on public.pixel_history;
create trigger permanent_count_placement after insert on public.pixel_history for each row
  execute function pixel_game_private.count_placement();

do $ranking_backup$
begin
  insert into pixel_game_private.function_backup values('public.get_student_all_time_ranking(integer)',
    pg_get_functiondef('public.get_student_all_time_ranking(integer)'::regprocedure)) on conflict do nothing;
end;
$ranking_backup$;
create or replace function public.get_student_all_time_ranking(p_limit integer default 100)
returns table(user_id uuid,nickname text,class_name text,pixels_count bigint)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return query select p.id,p.nickname,coalesce(c.name,'—'),coalesce(t.pixels_count,0)
    from public.profiles p left join public.classes c on c.id=p.class_id
    left join pixel_game_private.all_time_totals t on t.user_id=p.id
    where not p.banned and coalesce(p.role,'student')<>'admin'
    order by coalesce(t.pixels_count,0) desc,p.nickname,p.id
    limit least(greatest(coalesce(p_limit,100),1),100);
end;
$$;
create index if not exists permanent_totals_score_idx on pixel_game_private.all_time_totals(pixels_count desc);

-- Deactivate seasonal cron jobs without deleting definitions or touching other jobs.
do $jobs$
declare r record;
begin
  if to_regclass('cron.job') is not null then
    for r in execute $q$select jobid,active from cron.job
      where command ~* '(season|quarter|reset[^;]*(pixel|map)|(pixel|map)[^;]*reset)'$q$
    loop
      insert into pixel_game_private.cron_backup values(r.jobid,r.active) on conflict do nothing;
      perform cron.alter_job(r.jobid,active:=false);
    end loop;
  end if;
end;
$jobs$;
revoke all on all tables in schema pixel_game_private from public,anon,authenticated;
revoke all on all functions in schema pixel_game_private from public,anon,authenticated;
revoke all on function public.guard_pixel_client_write(), public.guard_permanent_pixel_clock() from public,anon,authenticated;
revoke all on function public.activate_daily_task_boost(),public.buy_pi_coin_turbo(),public.get_student_all_time_ranking(integer) from public,anon;
grant execute on function public.activate_daily_task_boost(),public.buy_pi_coin_turbo(),public.get_student_all_time_ranking(integer) to authenticated;
notify pgrst,'reload schema';
commit;
