-- Mark administrator-authored chat messages for a visual distinction in the client.

begin;

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
    is_admin boolean
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
        coalesce(p.role, 'student') = 'admin' as is_admin
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

select true as admin_chat_message_marker_enabled;
