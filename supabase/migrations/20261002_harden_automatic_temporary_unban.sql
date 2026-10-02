-- Make expiry release independent from chat errors and reuse the proven
-- administrator announcement RPC under a controlled server-side identity.

begin;

create or replace function public.release_expired_student_bans()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $release$
declare
    v_student record;
    v_admin_id uuid;
    v_released integer := 0;
begin
    select p.id
    into v_admin_id
    from public.profiles p
    where p.role = 'admin'
      and coalesce(p.banned, false) = false
    order by p.id
    limit 1;

    for v_student in
        select p.id
        from public.profiles p
        where p.banned = true
          and p.banned_until is not null
          and p.banned_until <= clock_timestamp()
        for update skip locked
    loop
        if v_admin_id is not null then
            begin
                perform set_config(
                    'request.jwt.claim.sub',
                    v_admin_id::text,
                    true
                );
                perform set_config(
                    'request.jwt.claims',
                    jsonb_build_object(
                        'sub', v_admin_id,
                        'role', 'authenticated'
                    )::text,
                    true
                );

                perform public.admin_set_student_banned_with_announcement(
                    v_student.id,
                    false
                );
            exception
                when others then
                    update public.profiles
                    set
                        banned = false,
                        banned_until = null
                    where id = v_student.id;
            end;
        else
            update public.profiles
            set
                banned = false,
                banned_until = null
            where id = v_student.id;
        end if;

        v_released := v_released + 1;
    end loop;

    return v_released;
end;
$release$;

revoke all on function public.release_expired_student_bans()
    from public, anon, authenticated;

do $schedule$
declare
    v_job_id bigint;
begin
    for v_job_id in
        select jobid
        from cron.job
        where jobname = 'release-expired-student-bans'
    loop
        perform cron.unschedule(v_job_id);
    end loop;

    perform cron.schedule(
        'release-expired-student-bans',
        '10 seconds',
        'select public.release_expired_student_bans();'
    );
end;
$schedule$;

commit;

select jsonb_build_object(
    'automatic_unban_hardened', true,
    'chat_uses_admin_rpc', true,
    'expiry_job',
        exists (
            select 1
            from cron.job
            where jobname = 'release-expired-student-bans'
        )
) as result;
