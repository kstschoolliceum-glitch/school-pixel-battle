-- Disposable model tests: game and admin permissions are deliberately separate.
\set ON_ERROR_STOP on
begin;
create function pg_temp.check_true(value boolean,label text) returns void language plpgsql as $$
begin if not coalesce(value,false) then raise exception 'Failed: %',label; end if; end;
$$;
create function pg_temp.deny(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then if position(expected in sqlerrm)>0 then return; end if; raise; end;
  raise exception 'Unexpected permission: %',statement;
end;
$$;
do $$begin execute format('grant usage on schema %I to authenticated',
  (select nspname from pg_namespace where oid=pg_my_temp_schema())); end;$$;

set local role authenticated;
select set_config('request.jwt.claim.sub','3f5f63b8-04b2-4e17-9aa1-16da562c5f72',true);
select public.owner_set_assistant_admin('00000000-0000-4000-8000-000000000002',true);
select pg_temp.check_true((public.get_my_admin_access()->>'is_gameplay_admin')::boolean,'owner exemption retained');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select pg_temp.check_true(public.is_admin() and public.is_assistant_admin(),'assistant has admin access');
select pg_temp.check_true(not (public.get_my_admin_access()->>'is_gameplay_admin')::boolean,'no game exemption');
select pg_temp.check_true((select role='student' and class_id=1 from profiles where id=auth.uid()),'student role and class preserved');
select pg_temp.check_true((select count(*) from public.admin_get_students())=4,'admin read RPC works');
select public.admin_get_promo_codes();
select public.admin_get_pixel_owner(6,1,1);
select public.place_pixel(1,1,'red');
select pg_temp.deny($q$select public.place_pixel(2,1,'blue')$q$,'COOLDOWN');
select pg_temp.deny($q$insert into public.pixels(id,color) values(9999,'blue')$q$,'USE_STANDARD_GAME_RPC');
select pg_temp.deny($q$update public.pi_coin_wallets set balance=9999$q$,'permission denied');
select pg_temp.deny($q$update public.map_item_inventory set quantity=99$q$,'permission denied');
select pg_temp.deny($q$update public.profiles set total_pixels=9999 where id=auth.uid()$q$,'DIRECT_GAME_STATS_CHANGE_FORBIDDEN');
select pg_temp.deny($q$select public.legacy_change_role(auth.uid(),'admin')$q$,'ADMIN_ROLE_RESERVED_FOR_OWNER');
select pg_temp.deny('select public.legacy_change_class(null)','OWNER_APPROVAL_REQUIRED');
select public.buy_map_item('detector');
select public.buy_map_item('detector');
select pg_temp.deny($q$select public.buy_map_item('detector')$q$,'NOT_ENOUGH_COINS');
select public.start_unblock_me();
select public.finish_unblock_me(10);
select pg_temp.deny('select public.start_unblock_me()','MINI_COOLDOWN');
select pg_temp.deny('select public.finish_unblock_me(10)','MINI_COOLDOWN');
select pg_temp.deny('select public.admin_restart_unblock_me()','SUPER_ADMIN_REQUIRED');
select pg_temp.deny($q$select public.owner_set_assistant_admin('00000000-0000-4000-8000-000000000004',true)$q$,'SUPER_ADMIN_REQUIRED');
select pg_temp.deny($q$select public.admin_set_student_banned('00000000-0000-4000-8000-000000000004',true)$q$,'OWNER_APPROVAL_OR_MODERATION_EVIDENCE_REQUIRED');
select public.admin_create_promo_code('HELPERTEST','helper',600,1,10);
select pg_temp.deny($q$select public.redeem_promo_code('HELPERTEST')$q$,'CODE_INACTIVE');
reset role;
select pg_temp.check_true((select class_id=1 and total_pixels=1 and weekly_pixels=1 from profiles where id='00000000-0000-4000-8000-000000000002'),'normal pixel counted');
select pg_temp.check_true((select count(*) from pixels where class_id=1 and user_id='00000000-0000-4000-8000-000000000002')=1,'class map contribution');
select pg_temp.check_true((select balance from pi_coin_wallets where user_id='00000000-0000-4000-8000-000000000002')=10,'paid purchases and one mini reward');
select pg_temp.check_true((select quantity from map_item_inventory where user_id='00000000-0000-4000-8000-000000000002' and item_type='detector')=3,'inventory retained plus paid purchases');
select pg_temp.check_true((select not active and needs_owner_approval from promo_codes where code='HELPERTEST'),'helper promo requires owner');
insert into public.game_rule_violations values('00000000-0000-4000-8000-000000000004',clock_timestamp(),'recorded violation');
select id as helper_promo_id from public.promo_codes where code='HELPERTEST' \gset
set local role authenticated;
select pg_temp.deny(format('select public.admin_set_promo_active(%s,true)',:helper_promo_id),'OWNER_APPROVAL_REQUIRED');
select public.admin_set_student_banned('00000000-0000-4000-8000-000000000004',true);

select set_config('request.jwt.claim.sub','3f5f63b8-04b2-4e17-9aa1-16da562c5f72',true);
select public.admin_set_promo_active(:helper_promo_id,true);
select public.admin_restart_unblock_me();
select public.admin_create_promo_code('OWNERTEST','owner',600,1,10);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select public.redeem_promo_code('HELPERTEST');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select pg_temp.deny($q$select public.redeem_promo_code('HELPERTEST')$q$,'PROMO_CONFLICT_OF_INTEREST');
select public.redeem_promo_code('OWNERTEST');

select set_config('request.jwt.claim.sub','3f5f63b8-04b2-4e17-9aa1-16da562c5f72',true);
select public.owner_set_assistant_admin('00000000-0000-4000-8000-000000000002',false);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select pg_temp.check_true(not public.is_admin(),'revoked access');
select pg_temp.deny($q$select public.redeem_promo_code('HELPERTEST')$q$,'PROMO_CONFLICT_OF_INTEREST');
select pg_temp.check_true((select role='student' and class_id=1 and total_pixels=1 from profiles where id=auth.uid()),'revocation preserves gameplay');
reset role;
select pg_temp.check_true((select count(*) from admin_audit_log where actor_id='00000000-0000-4000-8000-000000000002' and operation='profiles.update')>=1,'moderation audited');
rollback;
