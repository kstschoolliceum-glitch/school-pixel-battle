-- Prevent banned students from inviting new referrals.
-- Existing referral relations are preserved; only new registrations are blocked.

begin;

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

    select rc.inviter_id
    into v_inviter_id
    from public.referral_codes rc
    join public.profiles p
      on p.id = rc.inviter_id
    where rc.code = v_code
      and coalesce(p.banned, false) = false
      and coalesce(p.role, 'student') <> 'admin';

    -- A missing code and a code owned by a banned user are both unavailable.
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

create or replace function public.enforce_active_referral_inviter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if not exists (
        select 1
        from public.profiles p
        join public.referral_codes rc
          on rc.inviter_id = p.id
        where p.id = new.inviter_id
          and rc.code = upper(trim(new.referral_code))
          and coalesce(p.banned, false) = false
          and coalesce(p.role, 'student') <> 'admin'
    ) then
        raise exception 'REFERRER_UNAVAILABLE';
    end if;

    return new;
end;
$$;

revoke all on function public.enforce_active_referral_inviter()
    from public, anon, authenticated;

drop trigger if exists student_referrals_require_active_inviter
    on public.student_referrals;

create trigger student_referrals_require_active_inviter
before insert or update of inviter_id, referral_code
on public.student_referrals
for each row
execute function public.enforce_active_referral_inviter();

notify pgrst, 'reload schema';

commit;

select jsonb_build_object(
    'registration_slot_checks_ban',
        pg_get_functiondef(
            'public.consume_referral_registration_slot(text,text)'::regprocedure
        ) like '%coalesce(p.banned, false) = false%',
    'referral_guard_trigger',
        exists (
            select 1
            from pg_trigger
            where tgname = 'student_referrals_require_active_inviter'
              and not tgisinternal
        ),
    'existing_referrals_preserved', true
) as result;
