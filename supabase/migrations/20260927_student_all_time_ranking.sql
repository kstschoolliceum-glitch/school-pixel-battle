begin;

create index if not exists pixel_history_user_id_idx
    on public.pixel_history (user_id);

create or replace function public.get_student_all_time_ranking(
    p_limit integer default 100
)
returns table (
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
        p.nickname,
        coalesce(c.name, '—') as class_name,
        coalesce(stats.pixels_count, 0)::bigint as pixels_count
    from public.profiles p
    left join public.classes c on c.id = p.class_id
    left join (
        select
            history.user_id,
            count(*)::bigint as pixels_count
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

revoke all on function public.get_student_all_time_ranking(integer)
    from public, anon;

grant execute on function public.get_student_all_time_ranking(integer)
    to authenticated;

commit;
