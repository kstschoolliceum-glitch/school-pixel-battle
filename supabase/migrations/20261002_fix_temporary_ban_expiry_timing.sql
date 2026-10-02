-- Run temporary-ban expiry close to the exact deadline and keep expired
-- temporary bans from being displayed as permanent before the next job tick.

begin;

create or replace function public.admin_get_temporary_bans()
returns table (
    user_id uuid,
    banned_until timestamptz
)
language plpgsql
volatile
security definer
set search_path = public, auth
as $temporary_bans$
begin
    if auth.uid() is null or not exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'admin'
          and coalesce(p.banned, false) = false
    ) then
        raise exception 'ADMIN_REQUIRED';
    end if;

    perform public.release_expired_student_bans();

    return query
    select
        p.id,
        p.banned_until
    from public.profiles p
    where p.banned = true
      and p.banned_until is not null;
end;
$temporary_bans$;

revoke all on function public.admin_get_temporary_bans()
    from public, anon;
grant execute on function public.admin_get_temporary_bans()
    to authenticated;

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

notify pgrst, 'reload schema';

commit;

select jsonb_build_object(
    'temporary_ban_expiry_interval', '10 seconds',
    'admin_refresh_releases_expired', true,
    'expiry_job',
        exists (
            select 1
            from cron.job
            where jobname = 'release-expired-student-bans'
        )
) as result;
