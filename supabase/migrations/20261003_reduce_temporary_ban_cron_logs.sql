-- Reduce temporary-ban cron frequency to lower database log volume.

begin;

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
        '* * * * *',
        'select public.release_expired_student_bans();'
    );
end;
$schedule$;

commit;

select jsonb_build_object(
    'temporary_ban_expiry_interval', '1 minute',
    'expiry_job',
        exists (
            select 1
            from cron.job
            where jobname = 'release-expired-student-bans'
        )
) as result;
