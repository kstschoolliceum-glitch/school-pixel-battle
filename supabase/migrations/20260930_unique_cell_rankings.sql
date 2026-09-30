-- Prevent ranking inflation by repainting the same cell with different colors.
-- Map updates and pixel_history stay unchanged so Realtime and daily color tasks keep working.
-- A student can score a coordinate only once per season.
-- A class can score a coordinate only once per season, regardless of which class member painted it.

begin;

create index if not exists pixel_history_user_season_cell_idx
    on public.pixel_history (user_id, season_id, x, y);

create index if not exists pixel_history_class_season_cell_idx
    on public.pixel_history (class_id, season_id, x, y);

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
        count(distinct (ph.x, ph.y))::bigint as pixels_count
    from public.classes c
    cross join active_season active
    left join public.pixel_history ph
      on ph.class_id = c.id
     and ph.season_id = active.id
    where c.is_active = true
      and upper(btrim(c.name)) <> 'МОДЕРАТОР'
    group by c.id, c.name
    order by
        count(distinct (ph.x, ph.y)) desc,
        c.name asc;
$$;

create or replace function public.get_student_all_time_ranking(
    p_limit integer default 100
)
returns table (
    user_id uuid,
    nickname text,
    class_name text,
    pixels_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    return query
    select
        p.id as user_id,
        p.nickname,
        coalesce(c.name, '—') as class_name,
        coalesce(stats.pixels_count, 0)::bigint as pixels_count
    from public.profiles p
    left join public.classes c on c.id = p.class_id
    left join (
        select
            history.user_id,
            count(distinct (
                history.season_id,
                history.x,
                history.y
            ))::bigint as pixels_count
        from public.pixel_history history
        group by history.user_id
    ) stats on stats.user_id = p.id
    where p.banned = false
      and coalesce(p.role, 'student') <> 'admin'
    order by
        coalesce(stats.pixels_count, 0) desc,
        p.nickname asc
    limit least(greatest(coalesce(p_limit, 100), 1), 100);
end;
$$;

revoke all on function public.get_class_ranking() from public;
grant execute on function public.get_class_ranking() to authenticated;

revoke all on function public.get_student_all_time_ranking(integer)
    from public, anon;
grant execute on function public.get_student_all_time_ranking(integer)
    to authenticated;

notify pgrst, 'reload schema';

commit;

select jsonb_build_object(
    'class_ranking_unique_cells', true,
    'student_ranking_unique_cells', true
) as result;
