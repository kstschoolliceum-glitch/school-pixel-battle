-- Prevent ranking inflation and make the weekly class ranking reflect current ownership.
-- Only cells painted during the active season participate, so a carried map does not
-- bring the previous week's score into the new week.
--
-- When another class repaints a participating cell, the previous class loses one
-- point and the new owner gains one point. Repainting it back reverses the point.
-- Student all-time ranking still counts a coordinate only once per student per season.

begin;

create index if not exists pixel_history_user_season_cell_idx
    on public.pixel_history (user_id, season_id, x, y);

create index if not exists pixel_history_season_cell_idx
    on public.pixel_history (season_id, x, y);

create index if not exists pixels_season_class_cell_idx
    on public.pixels (season_id, class_id, x, y);

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
    ),
    painted_this_season as (
        select distinct ph.season_id, ph.x, ph.y
        from public.pixel_history ph
        join active_season active on active.id = ph.season_id
    ),
    current_owned_cells as (
        select px.class_id, count(*)::bigint as pixels_count
        from public.pixels px
        join active_season active on active.id = px.season_id
        join painted_this_season painted
          on painted.season_id = px.season_id
         and painted.x = px.x
         and painted.y = px.y
        group by px.class_id
    )
    select
        c.name::text as class_name,
        coalesce(owned.pixels_count, 0)::bigint as pixels_count
    from public.classes c
    left join current_owned_cells owned on owned.class_id = c.id
    where c.is_active = true
      and upper(btrim(c.name)) <> 'МОДЕРАТОР'
    order by
        coalesce(owned.pixels_count, 0) desc,
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
    'class_ranking_current_ownership', true,
    'carried_cells_excluded_until_repainted', true,
    'student_ranking_unique_cells', true
) as result;
