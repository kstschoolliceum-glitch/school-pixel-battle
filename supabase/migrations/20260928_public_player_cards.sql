-- Публичные внутри игры визитки учеников.
-- Фото остаются недоступны без авторизации.

begin;

drop policy if exists "profile_photos_select_own" on storage.objects;
drop policy if exists "profile_photos_select_authenticated" on storage.objects;

create policy "profile_photos_select_authenticated"
on storage.objects
for select
to authenticated
using (bucket_id = 'profile-photos');

drop function if exists public.get_student_all_time_ranking(integer);

create function public.get_student_all_time_ranking(
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

create or replace function public.get_player_card(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_requester_id uuid := auth.uid();
    v_username text;
    v_nickname text;
    v_class_name text;
    v_active_season_id public.seasons.id%type;
    v_weekly_pixels bigint := 0;
    v_total_pixels bigint := 0;
begin
    if v_requester_id is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    if p_user_id is null then
        raise exception 'PLAYER_REQUIRED';
    end if;

    select
        p.username,
        p.nickname,
        coalesce(c.name, '—')
    into
        v_username,
        v_nickname,
        v_class_name
    from public.profiles p
    left join public.classes c on c.id = p.class_id
    where p.id = p_user_id
      and p.banned = false;

    if not found then
        raise exception 'PLAYER_NOT_FOUND';
    end if;

    select s.id
    into v_active_season_id
    from public.seasons s
    where s.is_active = true
      and s.status = 'active'
      and s.starts_at <= clock_timestamp()
      and s.ends_at > clock_timestamp()
    order by s.starts_at desc
    limit 1;

    select count(*)::bigint
    into v_total_pixels
    from public.pixel_history ph
    where ph.user_id = p_user_id;

    if v_active_season_id is not null then
        select count(*)::bigint
        into v_weekly_pixels
        from public.pixel_history ph
        where ph.user_id = p_user_id
          and ph.season_id = v_active_season_id;
    end if;

    return jsonb_build_object(
        'success', true,
        'username', case
            when p_user_id = v_requester_id then v_username
            else null
        end,
        'nickname', v_nickname,
        'class_name', v_class_name,
        'weekly_pixels', v_weekly_pixels,
        'total_pixels', v_total_pixels,
        'achievements', jsonb_build_array(
            jsonb_build_object(
                'id', 'first_pixel',
                'icon', '✨',
                'title', 'Первый пиксель',
                'description', 'Поставь свой первый пиксель',
                'unlocked', v_total_pixels >= 1,
                'progress', least(v_total_pixels, 1),
                'target', 1
            ),
            jsonb_build_object(
                'id', 'warm_up',
                'icon', '🎨',
                'title', 'Разминка',
                'description', 'Поставь 25 пикселей',
                'unlocked', v_total_pixels >= 25,
                'progress', least(v_total_pixels, 25),
                'target', 25
            ),
            jsonb_build_object(
                'id', 'pixel_hundred',
                'icon', '💯',
                'title', 'Сотня',
                'description', 'Поставь 100 пикселей',
                'unlocked', v_total_pixels >= 100,
                'progress', least(v_total_pixels, 100),
                'target', 100
            )
        )
    );
end;
$$;

revoke all on function public.get_student_all_time_ranking(integer)
    from public, anon;
grant execute on function public.get_student_all_time_ranking(integer)
    to authenticated;

revoke all on function public.get_player_card(uuid)
    from public, anon;
grant execute on function public.get_player_card(uuid)
    to authenticated;

notify pgrst, 'reload schema';

commit;
