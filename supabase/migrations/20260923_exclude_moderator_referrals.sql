begin;

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

revoke all on function public.get_referral_registration_classes()
    from public;
grant execute on function public.get_referral_registration_classes()
    to anon, authenticated;

commit;
