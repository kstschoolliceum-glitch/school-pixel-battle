-- Последняя активность игрока для визитки.
-- Запись ограничена сервером: не чаще одного раза в две минуты.

begin;

alter table public.profiles
    add column if not exists last_seen_at timestamptz;

update public.profiles p
set last_seen_at = activity.last_seen
from (
    select
        addresses.user_id,
        max(addresses.last_seen) as last_seen
    from public.student_ip_addresses addresses
    group by addresses.user_id
) activity
where p.id = activity.user_id
  and p.last_seen_at is null;

create or replace function public.touch_player_activity()
returns timestamptz
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_last_seen_at timestamptz;
begin
    if v_user_id is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    update public.profiles
    set last_seen_at = clock_timestamp()
    where id = v_user_id
      and banned = false
      and (
          last_seen_at is null
          or last_seen_at < clock_timestamp() - interval '2 minutes'
      )
    returning last_seen_at into v_last_seen_at;

    if v_last_seen_at is null then
        select p.last_seen_at
        into v_last_seen_at
        from public.profiles p
        where p.id = v_user_id;
    end if;

    return v_last_seen_at;
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
    v_last_seen_at timestamptz;
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
        coalesce(c.name, '—'),
        p.last_seen_at
    into
        v_username,
        v_nickname,
        v_class_name,
        v_last_seen_at
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

    select
        count(*)::bigint,
        count(*) filter (
            where ph.season_id = v_active_season_id
        )::bigint
    into
        v_total_pixels,
        v_weekly_pixels
    from public.pixel_history ph
    where ph.user_id = p_user_id;

    return jsonb_build_object(
        'success', true,
        'username', case
            when p_user_id = v_requester_id then v_username
            else null
        end,
        'nickname', v_nickname,
        'class_name', v_class_name,
        'last_seen_at', v_last_seen_at,
        'weekly_pixels', coalesce(v_weekly_pixels, 0),
        'total_pixels', coalesce(v_total_pixels, 0),
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

revoke all on function public.touch_player_activity()
    from public, anon;
grant execute on function public.touch_player_activity()
    to authenticated;

revoke all on function public.get_player_card(uuid)
    from public, anon;
grant execute on function public.get_player_card(uuid)
    to authenticated;

notify pgrst, 'reload schema';

commit;
