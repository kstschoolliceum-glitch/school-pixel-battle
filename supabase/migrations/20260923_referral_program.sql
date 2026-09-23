begin;

create extension if not exists pgcrypto;

create table if not exists public.referral_codes (
    inviter_id uuid primary key references public.profiles(id) on delete cascade,
    code text not null unique,
    created_at timestamptz not null default now()
);

create table if not exists public.student_referrals (
    invited_id uuid primary key references public.profiles(id) on delete cascade,
    inviter_id uuid not null references public.profiles(id) on delete cascade,
    referral_code text not null,
    created_at timestamptz not null default now(),
    constraint student_referrals_not_self
        check (invited_id <> inviter_id)
);

create index if not exists student_referrals_inviter_idx
    on public.student_referrals (inviter_id, created_at desc);

alter table public.referral_codes enable row level security;
alter table public.student_referrals enable row level security;

revoke all on table public.referral_codes
    from public, anon, authenticated;
revoke all on table public.student_referrals
    from public, anon, authenticated;

create table if not exists public.referral_registration_limits (
    limit_day date not null default current_date,
    referral_code text not null,
    ip_hash text not null,
    attempts integer not null default 0,
    updated_at timestamptz not null default now(),
    primary key (limit_day, referral_code, ip_hash)
);

alter table public.referral_registration_limits enable row level security;

revoke all on table public.referral_registration_limits
    from public, anon, authenticated;

create or replace function public.consume_referral_registration_slot(
    p_referral_code text,
    p_ip_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_code text := upper(trim(p_referral_code));
    v_inviter_id uuid;
    v_code_attempts integer;
    v_ip_attempts integer;
    v_total_referrals integer;
begin
    if
        length(v_code) <> 16
        or v_code ~ '[^A-F0-9]'
        or length(p_ip_hash) <> 64
        or p_ip_hash ~ '[^a-f0-9]'
    then
        return false;
    end if;

    perform pg_advisory_xact_lock(
        hashtext(v_code || ':' || p_ip_hash)
    );

    select inviter_id
    into v_inviter_id
    from public.referral_codes
    where code = v_code;

    if v_inviter_id is null then
        return false;
    end if;

    select count(*)
    into v_total_referrals
    from public.student_referrals
    where inviter_id = v_inviter_id;

    if v_total_referrals >= 25 then
        return false;
    end if;

    select coalesce(sum(attempts), 0)
    into v_code_attempts
    from public.referral_registration_limits
    where limit_day = current_date
      and referral_code = v_code;

    select coalesce(sum(attempts), 0)
    into v_ip_attempts
    from public.referral_registration_limits
    where limit_day = current_date
      and ip_hash = p_ip_hash;

    if v_code_attempts >= 10 or v_ip_attempts >= 3 then
        return false;
    end if;

    insert into public.referral_registration_limits (
        limit_day,
        referral_code,
        ip_hash,
        attempts,
        updated_at
    )
    values (
        current_date,
        v_code,
        p_ip_hash,
        1,
        now()
    )
    on conflict (limit_day, referral_code, ip_hash)
    do update set
        attempts =
            public.referral_registration_limits.attempts + 1,
        updated_at = now();

    delete from public.referral_registration_limits
    where limit_day < current_date - 14;

    return true;
end;
$$;

revoke all on function public.consume_referral_registration_slot(text, text)
    from public, anon, authenticated;
grant execute on function public.consume_referral_registration_slot(text, text)
    to service_role;

create or replace function public.create_my_referral_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_code text;
begin
    if auth.uid() is null or not exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and coalesce(banned, false) = false
    ) then
        raise exception 'ACTIVE_USER_REQUIRED';
    end if;

    select code
    into v_code
    from public.referral_codes
    where inviter_id = auth.uid();

    if v_code is not null then
        return v_code;
    end if;

    loop
        v_code := upper(encode(extensions.gen_random_bytes(8), 'hex'));

        begin
            insert into public.referral_codes (
                inviter_id,
                code
            )
            values (
                auth.uid(),
                v_code
            );

            return v_code;
        exception
            when unique_violation then
                null;
        end;
    end loop;
end;
$$;

create or replace function public.get_my_referral_dashboard()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    select
        case
            when auth.uid() is null then
                jsonb_build_object(
                    'referral_code', null,
                    'invited_count', 0,
                    'invited', '[]'::jsonb
                )
            else
                jsonb_build_object(
                    'referral_code',
                    (
                        select rc.code
                        from public.referral_codes rc
                        where rc.inviter_id = auth.uid()
                    ),
                    'invited_count',
                    (
                        select count(*)
                        from public.student_referrals sr
                        where sr.inviter_id = auth.uid()
                    ),
                    'invited',
                    coalesce(
                        (
                            select jsonb_agg(
                                jsonb_build_object(
                                    'user_id', p.id,
                                    'username', p.username,
                                    'nickname', p.nickname,
                                    'class_name', c.name,
                                    'created_at', sr.created_at
                                )
                                order by sr.created_at desc
                            )
                            from public.student_referrals sr
                            join public.profiles p
                              on p.id = sr.invited_id
                            left join public.classes c
                              on c.id = p.class_id
                            where sr.inviter_id = auth.uid()
                        ),
                        '[]'::jsonb
                    )
                )
        end;
$$;

create or replace function public.get_referral_registration_classes()
returns table (
    class_id bigint,
    class_name text
)
language sql
stable
security definer
set search_path = public
as $$
    select c.id, c.name
    from public.classes c
    where c.is_active = true
      and upper(btrim(c.name)) <> 'МОДЕРАТОР'
    order by c.grade, c.name;
$$;

create or replace function public.admin_get_referrals()
returns table (
    inviter_id uuid,
    inviter_username text,
    inviter_nickname text,
    inviter_class_name text,
    invited_id uuid,
    invited_username text,
    invited_nickname text,
    invited_class_name text,
    created_at timestamptz
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
        inviter.id,
        inviter.username,
        inviter.nickname,
        inviter_class.name,
        invited.id,
        invited.username,
        invited.nickname,
        invited_class.name,
        sr.created_at
    from public.student_referrals sr
    join public.profiles inviter
      on inviter.id = sr.inviter_id
    join public.profiles invited
      on invited.id = sr.invited_id
    left join public.classes inviter_class
      on inviter_class.id = inviter.class_id
    left join public.classes invited_class
      on invited_class.id = invited.class_id
    order by sr.created_at desc;
end;
$$;

revoke all on function public.create_my_referral_code()
    from public, anon;
grant execute on function public.create_my_referral_code()
    to authenticated;

revoke all on function public.get_my_referral_dashboard()
    from public, anon;
grant execute on function public.get_my_referral_dashboard()
    to authenticated;

revoke all on function public.get_referral_registration_classes()
    from public;
grant execute on function public.get_referral_registration_classes()
    to anon, authenticated;

revoke all on function public.admin_get_referrals()
    from public, anon;
grant execute on function public.admin_get_referrals()
    to authenticated;

commit;
