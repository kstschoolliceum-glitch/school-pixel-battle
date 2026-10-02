-- Ensure expired temporary bans are released even if a chat announcement cannot be inserted.

begin;

create or replace function public.release_expired_student_bans()
returns integer
language plpgsql
security definer
set search_path = public
as $release$
declare
    v_student record;
    v_released integer := 0;
    v_announcement_user_id uuid;
begin
    select p.id
    into v_announcement_user_id
    from public.profiles p
    where p.role = 'admin'
    order by p.created_at nulls last, p.id
    limit 1;

    for v_student in
        select
            p.id,
            coalesce(p.nickname, p.username, 'Игрок') as nickname,
            coalesce(c.name, '—') as class_name
        from public.profiles p
        left join public.classes c on c.id = p.class_id
        where p.banned = true
          and p.banned_until is not null
          and p.banned_until <= clock_timestamp()
        for update of p skip locked
    loop
        update public.profiles
        set
            banned = false,
            banned_until = null
        where id = v_student.id;

        v_released := v_released + 1;

        if v_announcement_user_id is not null then
            begin
                insert into public.chat_messages (
                    user_id,
                    message,
                    message_type,
                    is_admin_announcement,
                    admin_announcement_kind,
                    created_at
                )
                values (
                    v_announcement_user_id,
                    format(
                        '✅ %s [%s] разблокирован и снова может участвовать в игре.',
                        v_student.nickname,
                        v_student.class_name
                    ),
                    'user',
                    true,
                    'unban',
                    clock_timestamp()
                );
            exception
                when others then
                    null;
            end;
        end if;
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
        '* * * * *',
        'select public.release_expired_student_bans();'
    );
end;
$schedule$;

commit;

select jsonb_build_object(
    'automatic_unban_fixed', true,
    'expiry_job',
        exists (
            select 1
            from cron.job
            where jobname = 'release-expired-student-bans'
        )
) as result;
