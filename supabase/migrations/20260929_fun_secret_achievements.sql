-- Забавные и секретные достижения.
-- Вся критичная статистика считается сервером.

begin;

alter table public.player_achievement_stats
    add column if not exists sokoban_blocked_attempts bigint not null default 0,
    add column if not exists sokoban_restarts_current integer not null default 0,
    add column if not exists five_restarts boolean not null default false,
    add column if not exists won_after_ten_restarts boolean not null default false,
    add column if not exists returned_after_week boolean not null default false;

create table if not exists public.player_minigame_completions (
    id bigint generated always as identity primary key,
    user_id uuid not null references public.profiles(id) on delete cascade,
    game_type text not null
        check (game_type in ('unblock', 'sokoban', 'fifteen')),
    completed_at timestamptz not null default clock_timestamp(),
    moves integer check (moves is null or moves >= 0)
);

create index if not exists player_minigame_completions_user_date_idx
    on public.player_minigame_completions (user_id, completed_at desc);

alter table public.player_minigame_completions enable row level security;
revoke all on table public.player_minigame_completions
    from public, anon, authenticated;

insert into public.player_minigame_completions (
    user_id,
    game_type,
    completed_at,
    moves
)
select
    u.user_id,
    'unblock',
    u.completed_at,
    u.move_count
from public.unblock_me_daily u
where u.completed_at is not null
  and not exists (
      select 1
      from public.player_minigame_completions event
      where event.user_id = u.user_id
        and event.game_type = 'unblock'
        and event.completed_at = u.completed_at
  );

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
        values (new.user_id, 1, clock_timestamp())
        on conflict (user_id) do update
        set
            unblock_wins =
                public.player_achievement_stats.unblock_wins + 1,
            updated_at = clock_timestamp();

        insert into public.player_minigame_completions (
            user_id,
            game_type,
            completed_at,
            moves
        )
        values (
            new.user_id,
            'unblock',
            new.completed_at,
            new.move_count
        );
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
declare
    v_restarts integer := 0;
begin
    if old.current_level is distinct from new.current_level then
        select coalesce(stats.sokoban_restarts_current, 0)
        into v_restarts
        from public.player_achievement_stats stats
        where stats.user_id = new.user_id;

        insert into public.player_achievement_stats (
            user_id,
            sokoban_levels,
            sokoban_restarts_current,
            won_after_ten_restarts,
            updated_at
        )
        values (
            new.user_id,
            1,
            0,
            v_restarts >= 10,
            clock_timestamp()
        )
        on conflict (user_id) do update
        set
            sokoban_levels =
                public.player_achievement_stats.sokoban_levels + 1,
            sokoban_restarts_current = 0,
            won_after_ten_restarts =
                public.player_achievement_stats.won_after_ten_restarts
                or v_restarts >= 10,
            updated_at = clock_timestamp();

        insert into public.player_minigame_completions (
            user_id,
            game_type,
            completed_at,
            moves
        )
        values (
            new.user_id,
            'sokoban',
            clock_timestamp(),
            old.move_count + 1
        );
    elsif old.move_count > 0 and new.move_count = 0 then
        insert into public.player_achievement_stats (
            user_id,
            sokoban_restarts_current,
            five_restarts,
            updated_at
        )
        values (
            new.user_id,
            1,
            false,
            clock_timestamp()
        )
        on conflict (user_id) do update
        set
            sokoban_restarts_current =
                public.player_achievement_stats.sokoban_restarts_current + 1,
            five_restarts =
                public.player_achievement_stats.five_restarts
                or public.player_achievement_stats.sokoban_restarts_current + 1 >= 5,
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
        values (new.user_id, 1, clock_timestamp())
        on conflict (user_id) do update
        set
            fifteen_wins =
                public.player_achievement_stats.fifteen_wins + 1,
            updated_at = clock_timestamp();

        insert into public.player_minigame_completions (
            user_id,
            game_type,
            completed_at,
            moves
        )
        values (
            new.user_id,
            'fifteen',
            clock_timestamp(),
            old.move_count + 1
        );
    end if;

    return new;
end;
$$;

drop trigger if exists track_sokoban_achievement_trigger
    on public.sokoban_progress;
create trigger track_sokoban_achievement_trigger
after update of current_level, move_count
on public.sokoban_progress
for each row
execute function public.track_sokoban_achievement();

create or replace function public.record_sokoban_blocked_attempt(
    p_user_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
    if auth.uid() is null or p_user_id is distinct from auth.uid() then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    insert into public.player_achievement_stats (
        user_id,
        sokoban_blocked_attempts,
        updated_at
    )
    values (
        p_user_id,
        1,
        clock_timestamp()
    )
    on conflict (user_id) do update
    set
        sokoban_blocked_attempts =
            public.player_achievement_stats.sokoban_blocked_attempts + 1,
        updated_at = clock_timestamp();
end;
$$;

do $patch_sokoban_blocked$
declare
    v_definition text;
    v_old text :=
        'return jsonb_build_object(''success'', false, ''error'', ''BLOCKED'');';
    v_new text :=
        'perform public.record_sokoban_blocked_attempt(v_user_id);'
        || E'\n        '
        || 'return jsonb_build_object(''success'', false, ''error'', ''BLOCKED'');';
    v_occurrences integer;
begin
    select pg_get_functiondef(
        'public.move_sokoban(text)'::regprocedure
    )
    into v_definition;

    if position(
        'perform public.record_sokoban_blocked_attempt(v_user_id);'
        in v_definition
    ) = 0 then
        v_occurrences := (
            length(v_definition) - length(replace(v_definition, v_old, ''))
        ) / length(v_old);

        if v_occurrences <> 3 then
            raise exception
                'SOKOBAN_BLOCKED_MARKERS_CHANGED: expected 3, found %',
                v_occurrences;
        end if;

        execute replace(v_definition, v_old, v_new);
    end if;
end;
$patch_sokoban_blocked$;

create or replace function public.touch_player_activity()
returns timestamptz
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_previous_seen timestamptz;
    v_last_seen_at timestamptz;
begin
    if v_user_id is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    select p.last_seen_at
    into v_previous_seen
    from public.profiles p
    where p.id = v_user_id
      and p.banned = false;

    if not found then
        raise exception 'PROFILE_NOT_FOUND_OR_BANNED';
    end if;

    if v_previous_seen is not null
       and v_previous_seen < clock_timestamp() - interval '7 days' then
        insert into public.player_achievement_stats (
            user_id,
            returned_after_week,
            updated_at
        )
        values (
            v_user_id,
            true,
            clock_timestamp()
        )
        on conflict (user_id) do update
        set
            returned_after_week = true,
            updated_at = clock_timestamp();
    end if;

    update public.profiles
    set last_seen_at = clock_timestamp()
    where id = v_user_id
      and (
          last_seen_at is null
          or last_seen_at < clock_timestamp() - interval '2 minutes'
      )
    returning last_seen_at into v_last_seen_at;

    if v_last_seen_at is null then
        v_last_seen_at := v_previous_seen;
    end if;

    return v_last_seen_at;
end;
$$;

drop function if exists public.get_fun_achievements(uuid);

create function public.get_fun_achievements(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_total_pixels bigint := 0;
    v_colors bigint := 0;
    v_messages bigint := 0;
    v_seasons bigint := 0;
    v_daily bigint := 0;
    v_sokoban_levels bigint := 0;
    v_fifteen_wins bigint := 0;
    v_unblock_wins bigint := 0;
    v_blocked bigint := 0;
    v_five_restarts boolean := false;
    v_ten_restart_win boolean := false;
    v_returned boolean := false;
    v_minigame_total bigint := 0;
    v_night boolean := false;
    v_before_bell boolean := false;
    v_edge boolean := false;
    v_center boolean := false;
    v_lucky_seven boolean := false;
    v_unlucky_thirteen boolean := false;
    v_corners bigint := 0;
    v_repaints bigint := 0;
    v_one_pixel_day boolean := false;
    v_productive_day boolean := false;
    v_fast_unblock boolean := false;
    v_long_fifteen boolean := false;
    v_long_sokoban boolean := false;
    v_all_games_day boolean := false;
begin
    select
        count(*)::bigint,
        count(distinct ph.color)::bigint,
        count(distinct ph.season_id)::bigint,
        bool_or(
            extract(hour from ph.created_at at time zone 'Asia/Almaty')
            between 0 and 4
        ),
        bool_or(
            extract(hour from ph.created_at at time zone 'Asia/Almaty')
            = 7
        ),
        bool_or(ph.x in (0, 299) or ph.y in (0, 423)),
        bool_or(ph.x in (149, 150) and ph.y in (211, 212)),
        bool_or(ph.x = 7 and ph.y = 7),
        bool_or(ph.x = 13 and ph.y = 13)
    into
        v_total_pixels,
        v_colors,
        v_seasons,
        v_night,
        v_before_bell,
        v_edge,
        v_center,
        v_lucky_seven,
        v_unlucky_thirteen
    from public.pixel_history ph
    where ph.user_id = p_user_id;

    select count(*)::bigint
    into v_messages
    from public.chat_messages cm
    where cm.user_id = p_user_id
      and cm.message_type = 'user';

    select count(*)::bigint
    into v_daily
    from public.daily_task_progress dp
    where dp.user_id = p_user_id
      and dp.completed_at is not null;

    select
        coalesce(stats.sokoban_levels, 0),
        coalesce(stats.fifteen_wins, 0),
        coalesce(stats.unblock_wins, 0),
        coalesce(stats.sokoban_blocked_attempts, 0),
        coalesce(stats.five_restarts, false),
        coalesce(stats.won_after_ten_restarts, false),
        coalesce(stats.returned_after_week, false)
    into
        v_sokoban_levels,
        v_fifteen_wins,
        v_unblock_wins,
        v_blocked,
        v_five_restarts,
        v_ten_restart_win,
        v_returned
    from public.player_achievement_stats stats
    where stats.user_id = p_user_id;

    if not found then
        v_sokoban_levels := 0;
        v_fifteen_wins := 0;
        v_unblock_wins := 0;
        v_blocked := 0;
        v_five_restarts := false;
        v_ten_restart_win := false;
        v_returned := false;
    end if;

    v_minigame_total :=
        v_sokoban_levels + v_fifteen_wins + v_unblock_wins;

    select count(*)::bigint
    into v_corners
    from (
        select distinct ph.x, ph.y
        from public.pixel_history ph
        where ph.user_id = p_user_id
          and (
              (ph.x = 0 and ph.y = 0)
              or (ph.x = 299 and ph.y = 0)
              or (ph.x = 0 and ph.y = 423)
              or (ph.x = 299 and ph.y = 423)
          )
    ) corners;

    select coalesce(max(cell_count), 0)::bigint
    into v_repaints
    from (
        select count(*)::bigint as cell_count
        from public.pixel_history ph
        where ph.user_id = p_user_id
        group by ph.x, ph.y
    ) repeated_cells;

    select exists (
        select 1
        from (
            select
                (ph.created_at at time zone 'Asia/Almaty')::date as play_date,
                count(*) as pixel_count,
                max(ph.created_at) as last_pixel
            from public.pixel_history ph
            where ph.user_id = p_user_id
            group by
                (ph.created_at at time zone 'Asia/Almaty')::date
        ) days
        where days.pixel_count = 1
          and days.last_pixel < clock_timestamp() - interval '24 hours'
    )
    into v_one_pixel_day;

    select
        exists (
            select 1
            from public.player_minigame_completions event
            where event.user_id = p_user_id
              and event.game_type = 'unblock'
              and event.moves < 20
        ),
        exists (
            select 1
            from public.player_minigame_completions event
            where event.user_id = p_user_id
              and event.game_type = 'fifteen'
              and event.moves > 150
        ),
        exists (
            select 1
            from public.player_minigame_completions event
            where event.user_id = p_user_id
              and event.game_type = 'sokoban'
              and event.moves > 300
        )
    into
        v_fast_unblock,
        v_long_fifteen,
        v_long_sokoban;

    select exists (
        select 1
        from public.player_minigame_completions event
        where event.user_id = p_user_id
        group by
            (event.completed_at at time zone 'Asia/Almaty')::date
        having count(distinct event.game_type) = 3
    )
    into v_all_games_day;

    select exists (
        select 1
        from public.daily_task_progress dp
        where dp.user_id = p_user_id
          and dp.completed_at is not null
          and exists (
              select 1
              from public.chat_messages cm
              where cm.user_id = p_user_id
                and cm.message_type = 'user'
                and (cm.created_at at time zone 'Asia/Almaty')::date
                    = dp.task_date
          )
          and exists (
              select 1
              from public.player_minigame_completions event
              where event.user_id = p_user_id
                and (event.completed_at at time zone 'Asia/Almaty')::date
                    = dp.task_date
          )
    )
    into v_productive_day;

    v_night := coalesce(v_night, false);
    v_before_bell := coalesce(v_before_bell, false);
    v_edge := coalesce(v_edge, false);
    v_center := coalesce(v_center, false);
    v_lucky_seven := coalesce(v_lucky_seven, false);
    v_unlucky_thirteen := coalesce(v_unlucky_thirteen, false);

    return jsonb_build_array(
        jsonb_build_object(
            'id', 'all_colors',
            'icon', '🌈',
            'title', 'Я художник, я так вижу',
            'description', 'Используй 10 разных цветов на карте',
            'unlocked', v_colors >= 10,
            'progress', least(v_colors, 10),
            'target', 10
        ),
        jsonb_build_object(
            'id', 'pixel_500',
            'icon', '🧱',
            'title', 'Не трогай, это искусство',
            'description', 'Поставь 500 пикселей',
            'unlocked', v_total_pixels >= 500,
            'progress', least(v_total_pixels, 500),
            'target', 500
        ),
        jsonb_build_object(
            'id', 'pixel_1000',
            'icon', '🏗️',
            'title', 'Ремонт затянулся',
            'description', 'Поставь 1 000 пикселей',
            'unlocked', v_total_pixels >= 1000,
            'progress', least(v_total_pixels, 1000),
            'target', 1000
        ),
        jsonb_build_object(
            'id', 'silent_artist',
            'icon', '🤫',
            'title', 'Молчаливый художник',
            'description', 'Поставь 300 пикселей, не написав ни одного сообщения',
            'unlocked', v_total_pixels >= 300 and v_messages = 0,
            'progress', case
                when v_total_pixels >= 300 and v_messages = 0 then 1
                else 0
            end,
            'target', 1
        ),
        jsonb_build_object(
            'id', 'chat_250',
            'icon', '🗣️',
            'title', 'Есть минутка поговорить?',
            'description', 'Напиши 250 сообщений в общем чате',
            'unlocked', v_messages >= 250,
            'progress', least(v_messages, 250),
            'target', 250
        ),
        jsonb_build_object(
            'id', 'seasons_10',
            'icon', '📅',
            'title', 'Я здесь живу',
            'description', 'Участвуй в 10 разных сезонах',
            'unlocked', v_seasons >= 10,
            'progress', least(v_seasons, 10),
            'target', 10
        ),
        jsonb_build_object(
            'id', 'daily_50',
            'icon', '⚡',
            'title', 'Работа выполнена',
            'description', 'Выполни ежедневные задания 50 раз',
            'unlocked', v_daily >= 50,
            'progress', least(v_daily, 50),
            'target', 50
        ),
        jsonb_build_object(
            'id', 'minigame_25',
            'icon', '🧠',
            'title', 'Мозг вышел на смену',
            'description', 'Пройди суммарно 25 уровней и партий мини-игр',
            'unlocked', v_minigame_total >= 25,
            'progress', least(v_minigame_total, 25),
            'target', 25
        ),
        jsonb_build_object(
            'id', 'sokoban_100',
            'icon', '📦',
            'title', 'Коробки сами себя не передвинут',
            'description', 'Пройди 100 уровней игры «Ящики»',
            'unlocked', v_sokoban_levels >= 100,
            'progress', least(v_sokoban_levels, 100),
            'target', 100
        ),
        jsonb_build_object(
            'id', 'fifteen_50',
            'icon', '🧩',
            'title', 'Куда делась цифра 16?',
            'description', 'Собери «Пятнашки» 50 раз',
            'unlocked', v_fifteen_wins >= 50,
            'progress', least(v_fifteen_wins, 50),
            'target', 50
        ),
        jsonb_build_object(
            'id', 'night_artist',
            'icon', '🌙',
            'title', 'А тебе завтра не в школу?',
            'description', 'Поставь пиксель с 00:00 до 05:00',
            'secret', true,
            'unlocked', v_night,
            'progress', case when v_night then 1 else 0 end,
            'target', 1
        ),
        jsonb_build_object(
            'id', 'before_bell',
            'icon', '⏰',
            'title', 'До звонка успею',
            'description', 'Поставь пиксель с 07:00 до 08:00',
            'secret', true,
            'unlocked', v_before_bell,
            'progress', case when v_before_bell then 1 else 0 end,
            'target', 1
        ),
        jsonb_build_object(
            'id', 'map_edge',
            'icon', '🗺️',
            'title', 'Край света существует',
            'description', 'Поставь пиксель на границе карты',
            'secret', true,
            'unlocked', v_edge,
            'progress', case when v_edge then 1 else 0 end,
            'target', 1
        ),
        jsonb_build_object(
            'id', 'map_center',
            'icon', '🎯',
            'title', 'Точно в центр',
            'description', 'Закрась одну из центральных клеток карты',
            'secret', true,
            'unlocked', v_center,
            'progress', case when v_center then 1 else 0 end,
            'target', 1
        ),
        jsonb_build_object(
            'id', 'lucky_seven',
            'icon', '🍀',
            'title', 'Пиксель на удачу',
            'description', 'Закрась клетку X:7, Y:7',
            'secret', true,
            'unlocked', v_lucky_seven,
            'progress', case when v_lucky_seven then 1 else 0 end,
            'target', 1
        ),
        jsonb_build_object(
            'id', 'unlucky_thirteen',
            'icon', '😈',
            'title', 'Несчастливое число',
            'description', 'Закрась клетку X:13, Y:13',
            'secret', true,
            'unlocked', v_unlucky_thirteen,
            'progress', case when v_unlucky_thirteen then 1 else 0 end,
            'target', 1
        ),
        jsonb_build_object(
            'id', 'four_corners',
            'icon', '🧭',
            'title', 'Четыре стороны света',
            'description', 'Поставь пиксели во всех четырёх углах карты',
            'secret', true,
            'unlocked', v_corners >= 4,
            'progress', least(v_corners, 4),
            'target', 4
        ),
        jsonb_build_object(
            'id', 'repaint_five',
            'icon', '🔄',
            'title', 'Я передумал',
            'description', 'Перекрась одну и ту же клетку пять раз',
            'secret', true,
            'unlocked', v_repaints >= 5,
            'progress', least(v_repaints, 5),
            'target', 5
        ),
        jsonb_build_object(
            'id', 'one_pixel_day',
            'icon', '👀',
            'title', 'Никто не заметит',
            'description', 'Поставь за день только один пиксель и исчезни на сутки',
            'secret', true,
            'unlocked', v_one_pixel_day,
            'progress', case when v_one_pixel_day then 1 else 0 end,
            'target', 1
        ),
        jsonb_build_object(
            'id', 'productive_day',
            'icon', '🕵️',
            'title', 'Подозрительно активный',
            'description', 'За один день выполни задания, напиши в чат и победи в мини-игре',
            'secret', true,
            'unlocked', v_productive_day,
            'progress', case when v_productive_day then 1 else 0 end,
            'target', 1
        ),
        jsonb_build_object(
            'id', 'wall_friend',
            'icon', '🚧',
            'title', 'Стена — мой лучший друг',
            'description', '20 раз попробуй пойти в стену в Сокобане',
            'secret', true,
            'unlocked', v_blocked >= 20,
            'progress', least(v_blocked, 20),
            'target', 20
        ),
        jsonb_build_object(
            'id', 'restart_five',
            'icon', '🔁',
            'title', 'Это не ошибка, это стратегия',
            'description', 'Пять раз перезапусти один уровень Сокобана',
            'secret', true,
            'unlocked', v_five_restarts,
            'progress', case when v_five_restarts then 1 else 0 end,
            'target', 1
        ),
        jsonb_build_object(
            'id', 'fast_unblock',
            'icon', '🚗',
            'title', 'Пробка рассосалась',
            'description', 'Пройди Unblock Me менее чем за 20 ходов',
            'secret', true,
            'unlocked', v_fast_unblock,
            'progress', case when v_fast_unblock then 1 else 0 end,
            'target', 1
        ),
        jsonb_build_object(
            'id', 'long_fifteen',
            'icon', '🧩',
            'title', 'Метод научного тыка',
            'description', 'Сделай больше 150 ходов в «Пятнашках» и всё-таки победи',
            'secret', true,
            'unlocked', v_long_fifteen,
            'progress', case when v_long_fifteen then 1 else 0 end,
            'target', 1
        ),
        jsonb_build_object(
            'id', 'long_sokoban',
            'icon', '📦',
            'title', 'Переезд века',
            'description', 'Сделай больше 300 ходов в Сокобане и победи',
            'secret', true,
            'unlocked', v_long_sokoban,
            'progress', case when v_long_sokoban then 1 else 0 end,
            'target', 1
        ),
        jsonb_build_object(
            'id', 'ten_restarts_win',
            'icon', '🧘',
            'title', 'Главное — не сдаваться',
            'description', 'Победи в Сокобане после 10 перезапусков уровня',
            'secret', true,
            'unlocked', v_ten_restart_win,
            'progress', case when v_ten_restart_win then 1 else 0 end,
            'target', 1
        ),
        jsonb_build_object(
            'id', 'all_games_day',
            'icon', '🎮',
            'title', 'Сегодня продуктивный день',
            'description', 'Победи во всех трёх мини-играх за одни сутки',
            'secret', true,
            'unlocked', v_all_games_day,
            'progress', case when v_all_games_day then 1 else 0 end,
            'target', 1
        ),
        jsonb_build_object(
            'id', 'return_week',
            'icon', '💤',
            'title', 'С возвращением!',
            'description', 'Вернись в игру после семи дней отсутствия',
            'secret', true,
            'unlocked', v_returned,
            'progress', case when v_returned then 1 else 0 end,
            'target', 1
        )
    );
end;
$$;

drop function if exists public.get_player_card_base(uuid);
alter function public.get_player_card(uuid)
    rename to get_player_card_base;

create function public.get_player_card(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_card jsonb;
    v_extra jsonb;
begin
    if auth.uid() is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    v_card := public.get_player_card_base(p_user_id);
    v_extra := public.get_fun_achievements(p_user_id);

    return jsonb_set(
        v_card,
        '{achievements}',
        coalesce(v_card -> 'achievements', '[]'::jsonb)
            || coalesce(v_extra, '[]'::jsonb),
        true
    );
end;
$$;

revoke all on function public.record_sokoban_blocked_attempt(uuid)
    from public, anon, authenticated;
revoke all on function public.get_fun_achievements(uuid)
    from public, anon, authenticated;
revoke all on function public.get_player_card_base(uuid)
    from public, anon, authenticated;
revoke all on function public.get_player_card(uuid)
    from public, anon;
grant execute on function public.get_player_card(uuid)
    to authenticated;
revoke all on function public.touch_player_activity()
    from public, anon;
grant execute on function public.touch_player_activity()
    to authenticated;

notify pgrst, 'reload schema';

commit;
