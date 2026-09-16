begin;

create or replace function public.get_chat_messages_v2(p_limit integer default 50)
returns table (
    id bigint,
    user_id uuid,
    nickname text,
    class_name text,
    message text,
    created_at timestamptz,
    message_type text
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
        cm.message_type
    from public.chat_messages cm
    left join public.profiles p on p.id = cm.user_id
    left join public.classes c on c.id = p.class_id
    where auth.uid() is not null
    order by cm.created_at desc, cm.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.get_chat_messages_v2(integer) from public, anon;
grant execute on function public.get_chat_messages_v2(integer) to authenticated;

commit;

select
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_chat_messages_v2';
