-- Disposable database ONLY. The original production schema is not versioned.
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
create table public.classes(id bigint primary key,name text,is_active boolean default true);
create table public.profiles(id uuid primary key,nickname text,class_id bigint,role text default 'student',
 banned boolean default false,last_pixel_at timestamptz,total_pixels bigint default 0);
create table public.seasons(id bigint primary key,number integer,title text,is_active boolean,status text,
 starts_at timestamptz,ends_at timestamptz,map_width integer,map_height integer);
create table public.pixels(season_id bigint,x integer,y integer,color text,user_id uuid,class_id bigint,
 updated_at timestamptz,primary key(season_id,x,y));
create table public.pixel_history(id bigserial primary key,season_id bigint,x integer,y integer,color text,
 user_id uuid,class_id bigint,created_at timestamptz);
create table public.pi_coin_boosts(user_id uuid primary key,active_until timestamptz);
insert into classes values(1,'7 А',true);
insert into profiles(id,nickname,class_id,total_pixels) values
 ('00000000-0000-4000-8000-000000000001','Первый',1,10),
 ('00000000-0000-4000-8000-000000000002','Второй',1,0);
insert into seasons values(7,7,'Existing canvas',true,'active',now()-interval '7 days',now()+interval '1 day',300,424);
insert into pixels values(7,0,0,'#ef4444','00000000-0000-4000-8000-000000000001',1,now());
-- Ten historical placements overlap the optional profile counter of ten.
insert into pixel_history(season_id,x,y,color,user_id,class_id,created_at)
select 7,n,0,'#ef4444','00000000-0000-4000-8000-000000000001',1,now()-interval '1 day'
from generate_series(1,10) n;
create function public.activate_daily_task_boost() returns jsonb language sql as $$select '{}'::jsonb$$;
create function public.claim_daily_task_reward() returns jsonb language sql as $$select '{}'::jsonb$$;
create function public.buy_pi_coin_turbo() returns jsonb language sql as $$select '{}'::jsonb$$;
create function public.get_student_all_time_ranking(p_limit integer default 100)
returns table(user_id uuid,nickname text,class_name text,pixels_count bigint)
language sql as $$select id,nickname,'7 А'::text,total_pixels from public.profiles limit p_limit$$;
-- Reviewed legacy lock/cooldown contract, isolated from unversioned daily tasks.
create function public.place_pixel(p_x integer,p_y integer,p_color text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user_id uuid:=auth.uid(); v_profile public.profiles%rowtype; v_season public.seasons%rowtype;
 v_now timestamptz:=clock_timestamp(); v_date date:=current_date; v_cooldown_seconds integer:=5;
 v_boost_active boolean:=true; v_boost_until timestamptz:=now()+interval '1 hour'; v_remaining integer;
begin
 if v_user_id is null then raise exception 'NOT_AUTHENTICATED'; end if;
 select * into v_profile from public.profiles where id = v_user_id for update;
 if not found or v_profile.banned then raise exception 'USER_BANNED_OR_MISSING'; end if;
 select * into v_season from public.seasons where is_active and starts_at<=v_now and ends_at>v_now limit 1;
 if not found then raise exception 'NO_ACTIVE_SEASON'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_season.id::text||':'||p_x||':'||p_y,0));
 if exists(select 1 from pixels where season_id=v_season.id and x=p_x and y=p_y and color=p_color) then
   return jsonb_build_object('success',false,'reason','PIXEL_UNCHANGED'); end if;
 if v_profile.last_pixel_at is not null then
   v_remaining:=ceil(v_cooldown_seconds-extract(epoch from (v_now-v_profile.last_pixel_at)));
   if v_remaining>0 then return jsonb_build_object('success',false,'reason','COOLDOWN','remaining',v_remaining); end if;
 end if;
 update public.profiles set last_pixel_at = v_now where id=v_user_id;
 insert into pixels values(v_season.id,p_x,p_y,p_color,v_user_id,1,v_now)
 on conflict(season_id,x,y) do update set color=excluded.color,user_id=excluded.user_id,updated_at=excluded.updated_at;
 insert into pixel_history(season_id,x,y,color,user_id,class_id,created_at) values(v_season.id,p_x,p_y,p_color,v_user_id,1,v_now);
 return jsonb_build_object('success',true,'cooldown',v_cooldown_seconds,'boost_active',v_boost_active,'x',p_x,'y',p_y,'color',p_color);
end;
$$;
grant usage on schema public,auth to authenticated;
grant execute on function public.place_pixel(integer,integer,text) to authenticated;
