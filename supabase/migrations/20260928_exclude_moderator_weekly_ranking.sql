-- Служебный класс «Модератор» не участвует в недельном рейтинге.
-- Пиксели и история модератора сохраняются; меняется только выдача рейтинга.

begin;

create or replace function public.get_class_ranking()
returns table (
    class_name text,
    pixels_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
    with active_season as (
        select s.id
        from public.seasons s
        where s.is_active = true
          and s.status = 'active'
          and s.starts_at <= clock_timestamp()
          and s.ends_at > clock_timestamp()
        order by s.starts_at desc
        limit 1
    )
    select
        c.name::text as class_name,
        count(ph.*)::bigint as pixels_count
    from public.classes c
    cross join active_season active
    left join public.pixel_history ph
      on ph.class_id = c.id
     and ph.season_id = active.id
    where c.is_active = true
      and upper(btrim(c.name)) <> 'МОДЕРАТОР'
    group by c.id, c.name
    order by
        count(ph.*) desc,
        c.name asc;
$$;

revoke all on function public.get_class_ranking() from public;
grant execute on function public.get_class_ranking() to authenticated;

notify pgrst, 'reload schema';

commit;

select not exists (
    select 1
    from public.get_class_ranking()
    where upper(btrim(class_name)) = 'МОДЕРАТОР'
) as moderator_excluded;
