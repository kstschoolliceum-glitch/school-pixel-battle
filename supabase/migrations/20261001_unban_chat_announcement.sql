-- Publish a green, unsigned chat announcement when an administrator unbans a student.

begin;

alter table public.chat_messages
    add column if not exists admin_announcement_kind text;

alter table public.chat_messages
    drop constraint if exists chat_messages_admin_announcement_kind_check;

alter table public.chat_messages
    add constraint chat_messages_admin_announcement_kind_check
    check (
        admin_announcement_kind is null
        or admin_announcement_kind in ('ban', 'unban')
    );

update public.chat_messages
set admin_announcement_kind = 'ban'
where is_admin_announcement = true
  and admin_announcement_kind is null;

create or replace function public.admin_set_student_banned_with_announcement(
    p_user_id uuid,
    p_banned boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    set banned = p_banned
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
$$;

revoke all on function public.admin_set_student_banned_with_announcement(uuid, boolean)
    from public, anon;
grant execute on function public.admin_set_student_banned_with_announcement(uuid, boolean)
    to authenticated;

drop function if exists public.get_chat_messages_by_type(text, integer);

create function public.get_chat_messages_by_type(
    p_message_type text,
    p_limit integer default 50
)
returns table (
    id bigint,
    user_id uuid,
    nickname text,
    class_name text,
    message text,
    created_at timestamptz,
    message_type text,
    is_admin boolean,
    is_admin_announcement boolean,
    admin_announcement_kind text
)
language sql
stable
security definer
set search_path = public
as $$
    select
        cm.id,
        cm.user_id,
        case
            when cm.message_type = 'system' then 'СИСТЕМА'
            else coalesce(p.nickname, 'Удалённый игрок')
        end as nickname,
        case
            when cm.message_type = 'system' then null
            else c.name
        end as class_name,
        cm.message,
        cm.created_at,
        cm.message_type,
        coalesce(p.role, 'student') = 'admin' as is_admin,
        cm.is_admin_announcement,
        cm.admin_announcement_kind
    from public.chat_messages cm
    left join public.profiles p on p.id = cm.user_id
    left join public.classes c on c.id = p.class_id
    where auth.uid() is not null
      and cm.message_type = case
          when p_message_type = 'system' then 'system'
          else 'user'
      end
    order by cm.created_at desc, cm.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.get_chat_messages_by_type(text, integer)
    from public, anon;
grant execute on function public.get_chat_messages_by_type(text, integer)
    to authenticated;

notify pgrst, 'reload schema';

commit;

select jsonb_build_object(
    'announcement_kind_column',
        exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'chat_messages'
              and column_name = 'admin_announcement_kind'
        ),
    'ban_and_unban_rpc',
        to_regprocedure(
            'public.admin_set_student_banned_with_announcement(uuid,boolean)'
        ) is not null,
    'chat_rpc',
        to_regprocedure(
            'public.get_chat_messages_by_type(text,integer)'
        ) is not null
) as result;
