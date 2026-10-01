-- Temporary student bans with administrator-defined duration.
-- Expired bans are released automatically and announced in chat.

begin;

alter table public.profiles
    add column if not exists banned_until timestamptz;

create index if not exists profiles_temporary_bans_idx
    on public.profiles (banned_until)
    where banned = true and banned_until is not null;

create or replace function public.clear_ban_deadline_when_unbanned()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if coalesce(new.banned, false) = false then
        new.banned_until := null;
    end if;

    return new;
end;
$$;

drop trigger if exists profiles_clear_ban_deadline
    on public.profiles;

create trigger profiles_clear_ban_deadline
before insert or update of banned
on public.profiles
for each row
execute function public.clear_ban_deadline_when_unbanned();

create or replace function public.admin_set_student_banned_with_announcement(
    p_user_id uuid,
    p_banned boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $
declare
    v_admin_id uuid := auth.uid();
    v_was_banned boolean;
    v_nickname text;
    v_class_name text;
    v_announcement_created boolean := false;
    v_announcement_kind text;
begin
    if v_admin_id is null or not exists (
        select 1
        from public.profiles p
        where p.id = v_admin_id
          and p.role = 'admin'
          and coalesce(p.banned, false) = false
    ) then
        raise exception 'ADMIN_REQUIRED';
    end if;

    if p_user_id is null or p_banned is null then
        raise exception 'INVALID_BAN_REQUEST';
    end if;

    if p_user_id = v_admin_id then
        raise exception 'CANNOT_CHANGE_OWN_BAN_STATUS';
    end if;

    select
        coalesce(p.banned, false),
        coalesce(p.nickname, p.username, 'Игрок'),
        coalesce(c.name, '—')
    into
        v_was_banned,
        v_nickname,
        v_class_name
    from public.profiles p
    left join public.classes c on c.id = p.class_id
    where p.id = p_user_id;

    if not found then
        raise exception 'STUDENT_NOT_FOUND';
    end if;

    update public.profiles
    set
        banned = p_banned,
        banned_until = null
    where id = p_user_id;

    if v_was_banned is distinct from p_banned then
        v_announcement_kind :=
            case when p_banned then 'ban' else 'unban' end;

        insert into public.chat_messages (
            user_id,
            message,
            message_type,
            is_admin_announcement,
            admin_announcement_kind,
            created_at
        )
        values (
            v_admin_id,
            case
                when p_banned then format(
                    '🚫 %s [%s] забанен за нарушение правил игры.',
                    v_nickname,
                    v_class_name
                )
                else format(
                    '✅ %s [%s] разблокирован и снова может участвовать в игре.',
                    v_nickname,
                    v_class_name
                )
            end,
            'user',
            true,
            v_announcement_kind,
            clock_timestamp()
        );

        v_announcement_created := true;
    end if;

    return jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'banned', p_banned,
        'announcement_created', v_announcement_created,
        'announcement_kind', v_announcement_kind
    );
end;
$;

create or replace function public.admin_set_student_temporary_ban(
    p_user_id uuid,
    p_duration_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_admin_id uuid := auth.uid();
    v_nickname text;
    v_class_name text;
    v_role text;
    v_banned_until timestamptz;
    v_duration_label text;
begin
    if v_admin_id is null or not exists (
        select 1
        from public.profiles p
        where p.id = v_admin_id
          and p.role = 'admin'
          and coalesce(p.banned, false) = false
    ) then
        raise exception 'ADMIN_REQUIRED';
    end if;

    if p_user_id is null
       or p_duration_minutes is null
       or p_duration_minutes < 1
       or p_duration_minutes > 43200
    then
        raise exception 'INVALID_BAN_DURATION';
    end if;

    if p_user_id = v_admin_id then
        raise exception 'CANNOT_BAN_SELF';
    end if;

    select
        coalesce(p.nickname, p.username, 'Игрок'),
        coalesce(c.name, '—'),
        coalesce(p.role, 'student')
    into
        v_nickname,
        v_class_name,
        v_role
    from public.profiles p
    left join public.classes c on c.id = p.class_id
    where p.id = p_user_id
    for update of p;

    if not found then
        raise exception 'STUDENT_NOT_FOUND';
    end if;

    if v_role = 'admin' then
        raise exception 'CANNOT_TEMPORARILY_BAN_ADMIN';
    end if;

    v_banned_until :=
        clock_timestamp()
        + make_interval(mins => p_duration_minutes);

    update public.profiles
    set
        banned = true,
        banned_until = v_banned_until
    where id = p_user_id;

    v_duration_label :=
        case
            when p_duration_minutes < 60 then
                p_duration_minutes || ' мин.'
            when p_duration_minutes % 60 = 0 then
                (p_duration_minutes / 60) || ' ч.'
            else
                (p_duration_minutes / 60) || ' ч. '
                || (p_duration_minutes % 60) || ' мин.'
        end;

    insert into public.chat_messages (
        user_id,
        message,
        message_type,
        is_admin_announcement,
        admin_announcement_kind,
        created_at
    )
    values (
        v_admin_id,
        format(
            '🚫 %s [%s] временно заблокирован на %s',
            v_nickname,
            v_class_name,
            v_duration_label
        ),
        'user',
        true,
        'ban',
        clock_timestamp()
    );

    return jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'banned', true,
        'banned_until', v_banned_until,
        'duration_minutes', p_duration_minutes
    );
end;
$$;

create or replace function public.release_expired_student_bans()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_student record;
    v_released integer := 0;
begin
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

        insert into public.chat_messages (
            user_id,
            message,
            message_type,
            is_admin_announcement,
            admin_announcement_kind,
            created_at
        )
        values (
            null,
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

        v_released := v_released + 1;
    end loop;

    return v_released;
end;
$$;

create or replace function public.admin_get_temporary_bans()
returns table (
    user_id uuid,
    banned_until timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
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

    return query
    select
        p.id,
        p.banned_until
    from public.profiles p
    where p.banned = true
      and p.banned_until is not null
      and p.banned_until > clock_timestamp();
end;
$$;

revoke all on function public.admin_set_student_banned_with_announcement(uuid, boolean)
    from public, anon;
grant execute on function public.admin_set_student_banned_with_announcement(uuid, boolean)
    to authenticated;

revoke all on function public.admin_set_student_temporary_ban(uuid, integer)
    from public, anon;
grant execute on function public.admin_set_student_temporary_ban(uuid, integer)
    to authenticated;

revoke all on function public.release_expired_student_bans()
    from public, anon, authenticated;

revoke all on function public.admin_get_temporary_bans()
    from public, anon;
grant execute on function public.admin_get_temporary_bans()
    to authenticated;

create extension if not exists pg_cron;

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

notify pgrst, 'reload schema';

commit;

select jsonb_build_object(
    'banned_until_column',
        exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'profiles'
              and column_name = 'banned_until'
        ),
    'temporary_ban_rpc',
        to_regprocedure(
            'public.admin_set_student_temporary_ban(uuid,integer)'
        ) is not null,
    'expiry_job',
        exists (
            select 1
            from cron.job
            where jobname = 'release-expired-student-bans'
        )
) as result;
