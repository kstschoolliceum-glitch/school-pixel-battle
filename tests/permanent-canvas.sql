\set ON_ERROR_STOP on
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $$
declare r jsonb; score bigint;
begin
 if (select count(*) from pixels where x=0 and y=0 and color='#ef4444')<>1 then raise exception 'OLD_PIXEL_LOST'; end if;
 if (select ends_at from seasons where id=7)<>'infinity'::timestamptz then raise exception 'FINITE_CANVAS'; end if;
 if (public.get_permanent_canvas()->>'id')::bigint<>7 then raise exception 'CANVAS_CHANGED'; end if;
 r:=public.place_pixel(1,1,'#ef4444');
 if r->>'success'<>'true' or r->>'cooldown'<>'1' or r->>'boost_active'<>'false' then raise exception 'FIRST_PIXEL:%',r; end if;
 r:=public.place_pixel(2,1,'#ef4444');
 if r->>'reason'<>'COOLDOWN' then raise exception 'BYPASS:%',r; end if;
 perform pg_sleep(1.05);
 r:=public.place_pixel(2,1,'#ef4444');
 if r->>'success'<>'true' then raise exception 'ONE_SECOND:%',r; end if;
 select pixels_count into score from public.get_student_all_time_ranking(100) where user_id=auth.uid();
 if score<>12 then raise exception 'RANKING_DOUBLE_COUNT:%',score; end if;
 begin perform public.activate_daily_task_boost(); raise exception 'BOOST_ALLOWED';
 exception when others then if sqlerrm<>'BOOSTS_DISABLED' then raise; end if; end;
 begin delete from pixels; raise exception 'RESET_ALLOWED';
 exception when others then if sqlerrm<>'PERMANENT_CANVAS_RESET_DISABLED' then raise; end if; end;
 begin truncate pixels; raise exception 'TRUNCATE_ALLOWED';
 exception when others then if sqlerrm<>'PERMANENT_CANVAS_RESET_DISABLED' then raise; end if; end;
 begin update seasons set is_active=false; raise exception 'ROTATION_ALLOWED';
 exception when others then if sqlerrm<>'SEASONS_DISABLED' then raise; end if; end;
 insert into pi_coin_boosts values(auth.uid(),now()+interval '1 hour');
 if (select active_until is not null from pi_coin_boosts where user_id=auth.uid()) then raise exception 'NEW_BOOST_TIMER'; end if;
 update profiles set last_pixel_at=null where id=auth.uid();
 if (select last_pixel_at is null from profiles where id=auth.uid()) then raise exception 'CLOCK_RESET'; end if;
end;
$$;
-- Anonymous access and direct REST writes cannot bypass the RPC.
set role authenticated;
do $$begin
 begin update public.pixels set color='#ffffff'; raise exception 'DIRECT_WRITE_ALLOWED';
 exception when insufficient_privilege then null; end;
end;$$;
reset role;
