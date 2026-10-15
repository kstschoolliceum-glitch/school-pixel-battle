-- Run after the fixture and migration in a fresh disposable database.
\set ON_ERROR_STOP on
begin;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if position(expected in sqlerrm)>0 then return; end if;
    raise exception 'Unexpected error for %: %', statement, sqlerrm;
  end;
  raise exception 'Expected denial for: %', statement;
end;
$$;
create function pg_temp.assert_ok(value boolean, label text) returns void language plpgsql as $$
begin if not coalesce(value,false) then raise exception 'Assertion failed: %',label; end if; end;
$$;
do $$
begin
  execute format('grant usage on schema %I to authenticated',
    (select nspname from pg_catalog.pg_namespace where oid=pg_my_temp_schema()));
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_ok(not public.is_admin(),'student is not admin');
select pg_temp.expect_error('select * from public.admin_get_students()', 'ADMIN_REQUIRED');
select pg_temp.expect_error($q$select public.owner_set_assistant_admin('00000000-0000-4000-8000-000000000003',true)$q$, 'SUPER_ADMIN_REQUIRED');
select pg_temp.expect_error($q$update public.profiles set role='admin' where id=auth.uid()$q$, 'SUPER_ADMIN_REQUIRED');
select pg_temp.expect_error($q$select public.legacy_change_role(auth.uid(),'admin')$q$, 'SUPER_ADMIN_REQUIRED');
select pg_temp.expect_error('select * from public.admin_staff', 'permission denied');
select pg_temp.expect_error('select public.owner_get_admin_staff()', 'SUPER_ADMIN_REQUIRED');

select set_config('request.jwt.claim.sub','3f5f63b8-04b2-4e17-9aa1-16da562c5f72',true);
select pg_temp.assert_ok(public.is_super_admin(),'owner retained');
select public.owner_set_assistant_admin('00000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_ok(jsonb_array_length(public.owner_get_admin_staff())=1,'staff appointment');
select pg_temp.expect_error($q$select public.owner_set_assistant_admin(auth.uid(),false)$q$, 'OWNER_PROTECTED');
select pg_temp.expect_error($q$select public.admin_set_student_banned(auth.uid(),true)$q$, 'OWNER_PROTECTED');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_ok(public.is_admin() and not public.is_super_admin(),'assistant access');
select pg_temp.assert_ok((select count(*) from public.admin_get_students())=4,'set returning RPC');
select pg_temp.assert_ok(public.admin_get_rule_violations()->>'type'='all','default arguments retained');
select public.admin_set_student_banned('00000000-0000-4000-8000-000000000003',true);
select public.admin_set_student_banned('00000000-0000-4000-8000-000000000003',false);
select pg_temp.assert_ok((public.admin_create_promo_code('TEST','test',600,1,1)->>'success')::boolean,'promo RPC retained');
select pg_temp.expect_error('select public.owner_get_admin_staff()', 'SUPER_ADMIN_REQUIRED');
select pg_temp.expect_error('select public.owner_get_admin_audit()', 'SUPER_ADMIN_REQUIRED');
select pg_temp.expect_error($q$select public.owner_set_assistant_admin('00000000-0000-4000-8000-000000000004',true)$q$, 'SUPER_ADMIN_REQUIRED');
select pg_temp.expect_error($q$select public.legacy_change_role(auth.uid(),'student')$q$, 'SUPER_ADMIN_REQUIRED');
select pg_temp.expect_error($q$select public.admin_set_student_banned('3f5f63b8-04b2-4e17-9aa1-16da562c5f72',true)$q$, 'OWNER_PROTECTED');
select pg_temp.expect_error('select public.finish_season(6)', 'SUPER_ADMIN_REQUIRED');
select pg_temp.expect_error('select public.legacy_change_season()', 'SUPER_ADMIN_REQUIRED');
select pg_temp.expect_error('select public.legacy_clear_map()', 'SUPER_ADMIN_REQUIRED');
select pg_temp.expect_error('select public.admin_unknown_operation()', 'SUPER_ADMIN_REQUIRED');
select pg_temp.expect_error('select public.prune_admin_audit_log()', 'SUPER_ADMIN_REQUIRED');
select pg_temp.expect_error($q$select public.authorize_admin_password_reset('3f5f63b8-04b2-4e17-9aa1-16da562c5f72')$q$, 'SUPER_ADMIN_REQUIRED');
select pg_temp.expect_error('delete from public.admin_audit_log', 'permission denied');
select pg_temp.expect_error($q$insert into public.admin_staff(user_id,appointed_by) values(auth.uid(),auth.uid())$q$, 'permission denied');
select pg_temp.expect_error('select public.add_season_to_active_quarter(6)', 'permission denied');

select set_config('request.jwt.claim.sub','3f5f63b8-04b2-4e17-9aa1-16da562c5f72',true);
select public.finish_season(6);
select pg_temp.assert_ok(jsonb_array_length(public.owner_get_admin_audit())>=5,'committed actions logged');
select pg_temp.assert_ok(public.authorize_admin_password_reset('00000000-0000-4000-8000-000000000003'),'owner resets ordinary student');
select pg_temp.expect_error($q$select public.authorize_admin_password_reset('00000000-0000-4000-8000-000000000002')$q$, 'ADMIN_ACCOUNT_PROTECTED');
select public.owner_set_assistant_admin('00000000-0000-4000-8000-000000000002',false);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_ok(not public.is_admin(),'revocation immediate for existing JWT');
select pg_temp.expect_error('select * from public.admin_get_students()', 'ADMIN_REQUIRED');

reset role;
select set_config('request.jwt.claim.sub','',true);
update public.profiles set banned=true where id='3f5f63b8-04b2-4e17-9aa1-16da562c5f72';
set local role authenticated;
select set_config('request.jwt.claim.sub','3f5f63b8-04b2-4e17-9aa1-16da562c5f72',true);
select pg_temp.expect_error($q$select public.owner_set_assistant_admin('00000000-0000-4000-8000-000000000004',true)$q$, 'SUPER_ADMIN_REQUIRED');
reset role;
select pg_temp.assert_ok((select count(*) from public.pixels)=1,'failed deletes rolled back');
select pg_temp.assert_ok((select count(*) from public.test_calls where operation='quarter')=1,'owner internal helper works');
select pg_temp.assert_ok(not has_function_privilege('anon','public.is_admin()','EXECUTE'),'anon grants');
select pg_temp.assert_ok(not has_table_privilege('authenticated','public.admin_staff','INSERT'),'no direct membership writes');
rollback;
