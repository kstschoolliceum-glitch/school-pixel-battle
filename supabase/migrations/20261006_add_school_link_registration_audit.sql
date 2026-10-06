begin;

create table if not exists public.school_link_registrations (
    user_id uuid primary key references auth.users(id) on delete cascade,
    registration_ip inet not null,
    registered_at timestamptz not null default clock_timestamp()
);

create index if not exists school_link_registrations_registered_at_idx
    on public.school_link_registrations (registered_at desc);

alter table public.school_link_registrations enable row level security;

revoke all on table public.school_link_registrations
    from public, anon, authenticated;

create or replace function public.admin_get_school_link_registrations()
returns table (
    user_id uuid,
    username text,
    nickname text,
    class_id bigint,
    class_name text,
    registered_at timestamptz,
    registration_ip text,
    banned boolean
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
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
        registrations.user_id,
        profiles.username,
        profiles.nickname,
        profiles.class_id,
        classes.name,
        registrations.registered_at,
        host(registrations.registration_ip),
        coalesce(profiles.banned, false)
    from public.school_link_registrations registrations
    join public.profiles profiles
      on profiles.id = registrations.user_id
    left join public.classes classes
      on classes.id = profiles.class_id
    order by registrations.registered_at desc;
end;
$$;

revoke all on function public.admin_get_school_link_registrations()
    from public, anon;
grant execute on function public.admin_get_school_link_registrations()
    to authenticated;

commit;
