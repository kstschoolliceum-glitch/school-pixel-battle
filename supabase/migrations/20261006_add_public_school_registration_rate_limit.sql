begin;

create table if not exists public.school_registration_rate_limits (
    ip_hash text not null,
    minute_bucket timestamptz not null,
    attempts integer not null default 0,
    primary key (ip_hash, minute_bucket),
    constraint school_registration_attempts_nonnegative
        check (attempts >= 0)
);

alter table public.school_registration_rate_limits
    enable row level security;

revoke all on table public.school_registration_rate_limits
    from public, anon, authenticated;

create or replace function public.consume_school_registration_slot(
    p_ip_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_bucket timestamptz := date_trunc('minute', clock_timestamp());
    v_attempts integer;
begin
    if p_ip_hash is null
       or length(p_ip_hash) <> 64
       or p_ip_hash !~ '^[0-9a-f]{64}$' then
        return false;
    end if;

    insert into public.school_registration_rate_limits (
        ip_hash,
        minute_bucket,
        attempts
    )
    values (
        p_ip_hash,
        v_bucket,
        1
    )
    on conflict (ip_hash, minute_bucket)
    do update
       set attempts = public.school_registration_rate_limits.attempts + 1
    returning attempts into v_attempts;

    delete from public.school_registration_rate_limits
    where minute_bucket < clock_timestamp() - interval '2 days';

    return v_attempts <= 6;
end;
$$;

revoke all on function public.consume_school_registration_slot(text)
    from public, anon, authenticated;
grant execute on function public.consume_school_registration_slot(text)
    to service_role;

commit;
