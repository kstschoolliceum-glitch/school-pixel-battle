begin;

create or replace function public.admin_get_online_users(p_user_ids uuid[])
returns table (
    user_id uuid,
    nickname text,
    class_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if auth.uid() is null or not exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role = 'admin'
          and banned = false
    ) then
        raise exception 'ADMIN_REQUIRED';
    end if;

    return query
    select
        p.id,
        p.nickname,
        c.name
    from public.profiles p
    left join public.classes c on c.id = p.class_id
    where p.id in (
        select online_id
        from unnest(coalesce(p_user_ids, array[]::uuid[])) as ids(online_id)
        limit 500
    )
    order by c.name nulls last, p.nickname;
end;
$$;

revoke all on function public.admin_get_online_users(uuid[]) from public, anon;
grant execute on function public.admin_get_online_users(uuid[]) to authenticated;

commit;

select jsonb_build_object(
    'function_name', p.proname,
    'arguments', pg_get_function_identity_arguments(p.oid),
    'admin_guard', pg_get_functiondef(p.oid) like '%ADMIN_REQUIRED%'
) as admin_online_users_check
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'admin_get_online_users';
