-- Ещё 20 серверных достижений для визитки игрока.
-- Добавляет накопительную статистику мини-игр без изменения их наград и cooldown.

begin;

create table if not exists public.player_achievement_stats (
    user_id uuid primary key
        references public.profiles(id) on delete cascade,
    unblock_wins bigint not null default 0
        check (unblock_wins >= 0),
    sokoban_levels bigint not null default 0
        check (sokoban_levels >= 0),
    fifteen_wins bigint not null default 0
        check (fifteen_wins >= 0),
    updated_at timestamptz not null default clock_timestamp()
);

alter table public.player_achievement_stats enable row level security;
revoke all on table public.player_achievement_stats
    from public, anon, authenticated;

insert into public.player_achievement_stats (
    user_id,
    unblock_wins,
    sokoban_levels,
    fifteen_wins
)
select
    p.id,
    coalesce((
        select count(*)::bigint
        from public.unblock_me_daily u
        where u.user_id = p.id
          and u.completed_at is not null
    ), 0),
    coalesce((
        select greatest(s.current_level - 1, s.completed_in_reward)::bigint
        from public.sokoban_progress s
        where s.user_id = p.id
    ), 0),
    coalesce((
        select greatest(f.current_level - 1, 0)::bigint
        from public.fifteen_progress f
        where f.user_id = p.id
    ), 0)
from public.profiles p
on conflict (user_id) do update
set
    unblock_wins = greatest(
        public.player_achievement_stats.unblock_wins,
        excluded.unblock_wins
    ),
    sokoban_levels = greatest(
        public.player_achievement_stats.sokoban_levels,
        excluded.sokoban_levels
    ),
    fifteen_wins = greatest(
        public.player_achievement_stats.fifteen_wins,
        excluded.fifteen_wins
    ),
    updated_at = clock_timestamp();

create or replace function public.track_unblock_achievement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if old.completed_at is null and new.completed_at is not null then
        insert into public.player_achievement_stats (
            user_id,
            unblock_wins,
            updated_at
        )
        values (
            new.user_id,
            1,
            clock_timestamp()
        )
        on conflict (user_id) do update
        set
            unblock_wins =
                public.player_achievement_stats.unblock_wins + 1,
            updated_at = clock_timestamp();
    end if;

    return new;
end;
$$;

create or replace function public.track_sokoban_achievement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if old.current_level is distinct from new.current_level then
        insert into public.player_achievement_stats (
            user_id,
            sokoban_levels,
            updated_at
        )
        values (
            new.user_id,
            1,
            clock_timestamp()
        )
        on conflict (user_id) do update
        set
            sokoban_levels =
                public.player_achievement_stats.sokoban_levels + 1,
            updated_at = clock_timestamp();
    end if;

    return new;
end;
$$;

create or replace function public.track_fifteen_achievement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if old.current_level is distinct from new.current_level then
        insert into public.player_achievement_stats (
            user_id,
            fifteen_wins,
            updated_at
        )
        values (
            new.user_id,
            1,
            clock_timestamp()
        )
        on conflict (user_id) do update
        set
            fifteen_wins =
                public.player_achievement_stats.fifteen_wins + 1,
            updated_at = clock_timestamp();
    end if;

    return new;
end;
$$;

drop trigger if exists track_unblock_achievement_trigger
    on public.unblock_me_daily;
create trigger track_unblock_achievement_trigger
after update of completed_at
on public.unblock_me_daily
for each row
execute function public.track_unblock_achievement();

drop trigger if exists track_sokoban_achievement_trigger
    on public.sokoban_progress;
create trigger track_sokoban_achievement_trigger
after update of current_level
on public.sokoban_progress
for each row
execute function public.track_sokoban_achievement();

drop trigger if exists track_fifteen_achievement_trigger
    on public.fifteen_progress;
create trigger track_fifteen_achievement_trigger
after update of current_level
on public.fifteen_progress
for each row
execute function public.track_fifteen_achievement();

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
    v_seasons_played bigint := 0;
    v_chat_messages bigint := 0;
    v_daily_tasks bigint := 0;
    v_unblock_wins bigint := 0;
    v_sokoban_levels bigint := 0;
    v_fifteen_wins bigint := 0;
    v_game_types_completed bigint := 0;
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
        )::bigint,
        count(distinct ph.season_id)::bigint
    into
        v_total_pixels,
        v_weekly_pixels,
        v_seasons_played
    from public.pixel_history ph
    where ph.user_id = p_user_id;

    select count(*)::bigint
    into v_chat_messages
    from public.chat_messages cm
    where cm.user_id = p_user_id
      and cm.message_type = 'user';

    select count(*)::bigint
    into v_daily_tasks
    from public.daily_task_progress dp
    where dp.user_id = p_user_id
      and dp.completed_at is not null;

    select
        coalesce(stats.unblock_wins, 0),
        coalesce(stats.sokoban_levels, 0),
        coalesce(stats.fifteen_wins, 0)
    into
        v_unblock_wins,
        v_sokoban_levels,
        v_fifteen_wins
    from public.player_achievement_stats stats
    where stats.user_id = p_user_id;

    if not found then
        v_unblock_wins := 0;
        v_sokoban_levels := 0;
        v_fifteen_wins := 0;
    end if;

    v_game_types_completed :=
        (case when v_unblock_wins > 0 then 1 else 0 end)
        + (case when v_sokoban_levels > 0 then 1 else 0 end)
        + (case when v_fifteen_wins > 0 then 1 else 0 end);

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
            ),
            jsonb_build_object(
                'id', 'season_rookie',
                'icon', '🌱',
                'title', 'Новичок сезона',
                'description', 'Поставь пиксели хотя бы в одном сезоне',
                'unlocked', v_seasons_played >= 1,
                'progress', least(v_seasons_played, 1),
                'target', 1
            ),
            jsonb_build_object(
                'id', 'season_veteran',
                'icon', '🗓️',
                'title', 'Ветеран сезонов',
                'description', 'Участвуй в трёх разных сезонах',
                'unlocked', v_seasons_played >= 3,
                'progress', least(v_seasons_played, 3),
                'target', 3
            ),
            jsonb_build_object(
                'id', 'season_keeper',
                'icon', '👑',
                'title', 'Хранитель сезонов',
                'description', 'Участвуй в пяти разных сезонах',
                'unlocked', v_seasons_played >= 5,
                'progress', least(v_seasons_played, 5),
                'target', 5
            ),
            jsonb_build_object(
                'id', 'first_message',
                'icon', '💬',
                'title', 'Первое слово',
                'description', 'Напиши первое сообщение в общем чате',
                'unlocked', v_chat_messages >= 1,
                'progress', least(v_chat_messages, 1),
                'target', 1
            ),
            jsonb_build_object(
                'id', 'chat_friend',
                'icon', '🗣️',
                'title', 'Собеседник',
                'description', 'Напиши 25 сообщений в общем чате',
                'unlocked', v_chat_messages >= 25,
                'progress', least(v_chat_messages, 25),
                'target', 25
            ),
            jsonb_build_object(
                'id', 'chat_voice',
                'icon', '📣',
                'title', 'Голос чата',
                'description', 'Напиши 100 сообщений в общем чате',
                'unlocked', v_chat_messages >= 100,
                'progress', least(v_chat_messages, 100),
                'target', 100
            ),
            jsonb_build_object(
                'id', 'daily_first',
                'icon', '⚡',
                'title', 'Первый день',
                'description', 'Полностью выполни ежедневные задания один раз',
                'unlocked', v_daily_tasks >= 1,
                'progress', least(v_daily_tasks, 1),
                'target', 1
            ),
            jsonb_build_object(
                'id', 'daily_three',
                'icon', '📅',
                'title', 'Три продуктивных дня',
                'description', 'Выполни ежедневные задания три раза',
                'unlocked', v_daily_tasks >= 3,
                'progress', least(v_daily_tasks, 3),
                'target', 3
            ),
            jsonb_build_object(
                'id', 'daily_ten',
                'icon', '🔥',
                'title', 'Стабильность',
                'description', 'Выполни ежедневные задания 10 раз',
                'unlocked', v_daily_tasks >= 10,
                'progress', least(v_daily_tasks, 10),
                'target', 10
            ),
            jsonb_build_object(
                'id', 'daily_master',
                'icon', '🏅',
                'title', 'Мастер заданий',
                'description', 'Выполни ежедневные задания 30 раз',
                'unlocked', v_daily_tasks >= 30,
                'progress', least(v_daily_tasks, 30),
                'target', 30
            ),
            jsonb_build_object(
                'id', 'unblock_first',
                'icon', '🚗',
                'title', 'Путь свободен',
                'description', 'Пройди Unblock Me один раз',
                'unlocked', v_unblock_wins >= 1,
                'progress', least(v_unblock_wins, 1),
                'target', 1
            ),
            jsonb_build_object(
                'id', 'unblock_five',
                'icon', '🧠',
                'title', 'Разблокировщик',
                'description', 'Пройди Unblock Me пять раз',
                'unlocked', v_unblock_wins >= 5,
                'progress', least(v_unblock_wins, 5),
                'target', 5
            ),
            jsonb_build_object(
                'id', 'unblock_fifteen',
                'icon', '🚀',
                'title', 'Мастер пробок',
                'description', 'Пройди Unblock Me 15 раз',
                'unlocked', v_unblock_wins >= 15,
                'progress', least(v_unblock_wins, 15),
                'target', 15
            ),
            jsonb_build_object(
                'id', 'sokoban_three',
                'icon', '📦',
                'title', 'Груз доставлен',
                'description', 'Пройди три уровня игры «Ящики»',
                'unlocked', v_sokoban_levels >= 3,
                'progress', least(v_sokoban_levels, 3),
                'target', 3
            ),
            jsonb_build_object(
                'id', 'sokoban_fifteen',
                'icon', '🧱',
                'title', 'Кладовщик',
                'description', 'Пройди 15 уровней игры «Ящики»',
                'unlocked', v_sokoban_levels >= 15,
                'progress', least(v_sokoban_levels, 15),
                'target', 15
            ),
            jsonb_build_object(
                'id', 'sokoban_fifty',
                'icon', '🏭',
                'title', 'Мастер Сокобана',
                'description', 'Пройди 50 уровней игры «Ящики»',
                'unlocked', v_sokoban_levels >= 50,
                'progress', least(v_sokoban_levels, 50),
                'target', 50
            ),
            jsonb_build_object(
                'id', 'fifteen_first',
                'icon', '🧩',
                'title', 'Порядок восстановлен',
                'description', 'Собери «Пятнашки» один раз',
                'unlocked', v_fifteen_wins >= 1,
                'progress', least(v_fifteen_wins, 1),
                'target', 1
            ),
            jsonb_build_object(
                'id', 'fifteen_five',
                'icon', '🔢',
                'title', 'Пятёрка',
                'description', 'Собери «Пятнашки» пять раз',
                'unlocked', v_fifteen_wins >= 5,
                'progress', least(v_fifteen_wins, 5),
                'target', 5
            ),
            jsonb_build_object(
                'id', 'fifteen_fifteen',
                'icon', '🏁',
                'title', 'Мастер пятнашек',
                'description', 'Собери «Пятнашки» 15 раз',
                'unlocked', v_fifteen_wins >= 15,
                'progress', least(v_fifteen_wins, 15),
                'target', 15
            ),
            jsonb_build_object(
                'id', 'all_games',
                'icon', '🎮',
                'title', 'Универсальный игрок',
                'description', 'Получи победу во всех трёх мини-играх',
                'unlocked', v_game_types_completed >= 3,
                'progress', least(v_game_types_completed, 3),
                'target', 3
            )
        )
    );
end;
$$;

revoke all on function public.track_unblock_achievement()
    from public, anon, authenticated;
revoke all on function public.track_sokoban_achievement()
    from public, anon, authenticated;
revoke all on function public.track_fifteen_achievement()
    from public, anon, authenticated;

revoke all on function public.get_player_card(uuid)
    from public, anon;
grant execute on function public.get_player_card(uuid)
    to authenticated;

notify pgrst, 'reload schema';

commit;
