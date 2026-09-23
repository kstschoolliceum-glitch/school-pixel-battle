begin;

create table if not exists public.student_ip_addresses (
    user_id uuid not null references auth.users(id) on delete cascade,
    ip_address inet not null,
    first_seen timestamptz not null default now(),
    last_seen timestamptz not null default now(),
    seen_count bigint not null default 1,
    primary key (user_id, ip_address)
);

create index if not exists student_ip_addresses_ip_idx
    on public.student_ip_addresses (ip_address);

create index if not exists student_ip_addresses_last_seen_idx
    on public.student_ip_addresses (last_seen desc);

alter table public.student_ip_addresses enable row level security;

revoke all on table public.student_ip_addresses
    from public, anon, authenticated;

create or replace function public.record_student_ip(
    p_user_id uuid,
    p_ip text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_ip inet;
begin
    if p_user_id is null or p_ip is null or length(trim(p_ip)) > 64 then
        raise exception 'INVALID_IP_RECORD';
    end if;

    v_ip := trim(p_ip)::inet;

    delete from public.student_ip_addresses
    where last_seen < now() - interval '90 days';

    insert into public.student_ip_addresses (
        user_id,
        ip_address,
        first_seen,
        last_seen,
        seen_count
    )
    values (
        p_user_id,
        v_ip,
        now(),
        now(),
        1
    )
    on conflict (user_id, ip_address)
    do update set
        last_seen = now(),
        seen_count =
            public.student_ip_addresses.seen_count + 1;
end;
$$;

revoke all on function public.record_student_ip(uuid, text)
    from public, anon, authenticated;
grant execute on function public.record_student_ip(uuid, text)
    to service_role;

create or replace function public.admin_get_student_ips()
returns table (
    user_id uuid,
    ip_address text,
    network_group text,
    first_seen timestamptz,
    last_seen timestamptz,
    seen_count bigint
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
        addresses.user_id,
        host(addresses.ip_address),
        case
            when family(addresses.ip_address) = 4
                then host(set_masklen(addresses.ip_address, 24)) || '/24'
            else host(set_masklen(addresses.ip_address, 64)) || '/64'
        end,
        addresses.first_seen,
        addresses.last_seen,
        addresses.seen_count
    from public.student_ip_addresses addresses
    where addresses.last_seen >= now() - interval '90 days'
    order by addresses.last_seen desc;
end;
$$;

revoke all on function public.admin_get_student_ips()
    from public, anon;
grant execute on function public.admin_get_student_ips()
    to authenticated;

commit;
