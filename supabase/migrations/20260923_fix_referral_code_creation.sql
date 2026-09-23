begin;

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
        v_code := upper(
            encode(extensions.gen_random_bytes(8), 'hex')
        );

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

revoke all on function public.create_my_referral_code()
    from public, anon;
grant execute on function public.create_my_referral_code()
    to authenticated;

commit;
