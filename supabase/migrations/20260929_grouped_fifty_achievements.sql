-- 50 обычных достижений средней сложности и серверная группировка.
-- Не меняет награды, cooldown или правила мини-игр.

begin;

create or replace function public.get_medium_achievements(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_active_season_id public.seasons.id%type;
    v_total_pixels bigint := 0;
    v_weekly_pixels bigint := 0;
    v_colors bigint := 0;
    v_seasons bigint := 0;
    v_messages bigint := 0;
    v_daily bigint := 0;
    v_unblock bigint := 0;
    v_sokoban bigint := 0;
    v_fifteen bigint := 0;
    v_minigames bigint := 0;
    v_referrals bigint := 0;
    v_result jsonb;
begin
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
        count(*) filter (where ph.season_id = v_active_season_id)::bigint,
        count(distinct lower(ph.color))::bigint,
        count(distinct ph.season_id)::bigint
    into v_total_pixels, v_weekly_pixels, v_colors, v_seasons
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
        coalesce(stats.unblock_wins, 0),
        coalesce(stats.sokoban_levels, 0),
        coalesce(stats.fifteen_wins, 0)
    into v_unblock, v_sokoban, v_fifteen
    from public.player_achievement_stats stats
    where stats.user_id = p_user_id;

    if not found then
        v_unblock := 0;
        v_sokoban := 0;
        v_fifteen := 0;
    end if;

    v_minigames := v_unblock + v_sokoban + v_fifteen;

    select count(*)::bigint
    into v_referrals
    from public.student_referrals sr
    where sr.inviter_id = p_user_id;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', definitions.achievement_id,
                'category', definitions.category_name,
                'icon', definitions.icon,
                'title', definitions.title,
                'description', definitions.description,
                'unlocked', definitions.current_value >= definitions.target_value,
                'progress', least(definitions.current_value, definitions.target_value),
                'target', definitions.target_value
            )
            order by definitions.sort_order
        ),
        '[]'::jsonb
    )
    into v_result
    from (
        values
            (1, 'map_total_50', 'Карта', '🖌️', 'Уверенный штрих', 'Поставь 50 пикселей', v_total_pixels, 50::bigint),
            (2, 'map_total_150', 'Карта', '🎨', 'Цвет набирает силу', 'Поставь 150 пикселей', v_total_pixels, 150::bigint),
            (3, 'map_total_250', 'Карта', '🧱', 'Четверть тысячи', 'Поставь 250 пикселей', v_total_pixels, 250::bigint),
            (4, 'map_total_400', 'Карта', '🖼️', 'Большой фрагмент', 'Поставь 400 пикселей', v_total_pixels, 400::bigint),
            (5, 'map_total_750', 'Карта', '🏗️', 'Строитель карты', 'Поставь 750 пикселей', v_total_pixels, 750::bigint),
            (6, 'map_total_1500', 'Карта', '🏰', 'Пиксельная крепость', 'Поставь 1 500 пикселей', v_total_pixels, 1500::bigint),
            (7, 'map_week_25', 'Карта', '📍', 'Заметный след', 'Поставь 25 пикселей за текущий сезон', v_weekly_pixels, 25::bigint),
            (8, 'map_week_75', 'Карта', '✏️', 'Эскиз сезона', 'Поставь 75 пикселей за текущий сезон', v_weekly_pixels, 75::bigint),
            (9, 'map_week_150', 'Карта', '🖍️', 'Художник сезона', 'Поставь 150 пикселей за текущий сезон', v_weekly_pixels, 150::bigint),
            (10, 'map_week_300', 'Карта', '🖼️', 'Полотно сезона', 'Поставь 300 пикселей за текущий сезон', v_weekly_pixels, 300::bigint),
            (11, 'palette_3', 'Карта', '🔴', 'Три краски', 'Используй 3 разных цвета', v_colors, 3::bigint),
            (12, 'palette_5', 'Карта', '🟠', 'Палитра новичка', 'Используй 5 разных цветов', v_colors, 5::bigint),
            (13, 'palette_8', 'Карта', '🟢', 'Радужный набор', 'Используй 8 разных цветов', v_colors, 8::bigint),
            (14, 'palette_12', 'Карта', '🔵', 'Мастер оттенков', 'Используй 12 разных цветов', v_colors, 12::bigint),
            (15, 'season_2_medium', 'Сезоны', '🌤️', 'Второй сезон', 'Участвуй в 2 разных сезонах', v_seasons, 2::bigint),
            (16, 'season_4_medium', 'Сезоны', '🍂', 'Четыре сезона', 'Участвуй в 4 разных сезонах', v_seasons, 4::bigint),
            (17, 'season_6_medium', 'Сезоны', '🗓️', 'Постоянный участник', 'Участвуй в 6 разных сезонах', v_seasons, 6::bigint),
            (18, 'season_8_medium', 'Сезоны', '⏳', 'Сезонный ветеран', 'Участвуй в 8 разных сезонах', v_seasons, 8::bigint),
            (19, 'chat_10_medium', 'Чат', '💭', 'Начало разговора', 'Напиши 10 сообщений в общем чате', v_messages, 10::bigint),
            (20, 'chat_50_medium', 'Чат', '💬', 'На связи', 'Напиши 50 сообщений в общем чате', v_messages, 50::bigint),
            (21, 'chat_75_medium', 'Чат', '📨', 'Активный собеседник', 'Напиши 75 сообщений в общем чате', v_messages, 75::bigint),
            (22, 'chat_150_medium', 'Чат', '📢', 'Голос сообщества', 'Напиши 150 сообщений в общем чате', v_messages, 150::bigint),
            (23, 'chat_200_medium', 'Чат', '🎙️', 'Радио Pixel Battle', 'Напиши 200 сообщений в общем чате', v_messages, 200::bigint),
            (24, 'daily_5_medium', 'Ежедневные задания', '✅', 'Пять галочек', 'Выполни ежедневные задания 5 раз', v_daily, 5::bigint),
            (25, 'daily_7_medium', 'Ежедневные задания', '📆', 'Полезная неделя', 'Выполни ежедневные задания 7 раз', v_daily, 7::bigint),
            (26, 'daily_15_medium', 'Ежедневные задания', '⚡', 'Ритм заданий', 'Выполни ежедневные задания 15 раз', v_daily, 15::bigint),
            (27, 'daily_20_medium', 'Ежедневные задания', '🎯', 'Двадцать выполнено', 'Выполни ежедневные задания 20 раз', v_daily, 20::bigint),
            (28, 'daily_25_medium', 'Ежедневные задания', '🏅', 'Надёжный исполнитель', 'Выполни ежедневные задания 25 раз', v_daily, 25::bigint),
            (29, 'unblock_2_medium', 'Мини-игры', '🚙', 'Вторая развязка', 'Пройди Unblock Me 2 раза', v_unblock, 2::bigint),
            (30, 'unblock_3_medium', 'Мини-игры', '🚕', 'Дорога открыта', 'Пройди Unblock Me 3 раза', v_unblock, 3::bigint),
            (31, 'unblock_7_medium', 'Мини-игры', '🚗', 'Неделя без пробок', 'Пройди Unblock Me 7 раз', v_unblock, 7::bigint),
            (32, 'unblock_10_medium', 'Мини-игры', '🛣️', 'Диспетчер движения', 'Пройди Unblock Me 10 раз', v_unblock, 10::bigint),
            (33, 'unblock_20_medium', 'Мини-игры', '🚦', 'Повелитель пробок', 'Пройди Unblock Me 20 раз', v_unblock, 20::bigint),
            (34, 'sokoban_5_medium', 'Мини-игры', '📦', 'Пять доставок', 'Пройди 5 уровней игры «Ящики»', v_sokoban, 5::bigint),
            (35, 'sokoban_10_medium', 'Мини-игры', '🛒', 'Помощник склада', 'Пройди 10 уровней игры «Ящики»', v_sokoban, 10::bigint),
            (36, 'sokoban_20_medium', 'Мини-игры', '🏷️', 'Опытный кладовщик', 'Пройди 20 уровней игры «Ящики»', v_sokoban, 20::bigint),
            (37, 'sokoban_30_medium', 'Мини-игры', '🚚', 'Большая доставка', 'Пройди 30 уровней игры «Ящики»', v_sokoban, 30::bigint),
            (38, 'sokoban_40_medium', 'Мини-игры', '🏭', 'Начальник склада', 'Пройди 40 уровней игры «Ящики»', v_sokoban, 40::bigint),
            (39, 'fifteen_2_medium', 'Мини-игры', '2️⃣', 'Второй порядок', 'Собери «Пятнашки» 2 раза', v_fifteen, 2::bigint),
            (40, 'fifteen_3_medium', 'Мини-игры', '3️⃣', 'Тройная сборка', 'Собери «Пятнашки» 3 раза', v_fifteen, 3::bigint),
            (41, 'fifteen_7_medium', 'Мини-игры', '🔢', 'Семь сборок', 'Собери «Пятнашки» 7 раз', v_fifteen, 7::bigint),
            (42, 'fifteen_10_medium', 'Мини-игры', '🧩', 'Знаток пятнашек', 'Собери «Пятнашки» 10 раз', v_fifteen, 10::bigint),
            (43, 'minigame_5_medium', 'Мини-игры', '🎮', 'Игровая пятёрка', 'Пройди суммарно 5 игр и уровней', v_minigames, 5::bigint),
            (44, 'minigame_10_medium', 'Мини-игры', '🕹️', 'Десять побед', 'Пройди суммарно 10 игр и уровней', v_minigames, 10::bigint),
            (45, 'minigame_40_medium', 'Мини-игры', '🏆', 'Игровой марафон', 'Пройди суммарно 40 игр и уровней', v_minigames, 40::bigint),
            (46, 'minigame_60_medium', 'Мини-игры', '👾', 'Мастер мини-игр', 'Пройди суммарно 60 игр и уровней', v_minigames, 60::bigint),
            (47, 'referral_2_medium', 'Команда', '🤝', 'Позови двоих', 'Пригласи 2 учеников по реферальной ссылке', v_referrals, 2::bigint),
            (48, 'referral_3_medium', 'Команда', '👥', 'Маленькая команда', 'Пригласи 3 учеников по реферальной ссылке', v_referrals, 3::bigint),
            (49, 'referral_5_medium', 'Команда', '🫶', 'Пятёрка друзей', 'Пригласи 5 учеников по реферальной ссылке', v_referrals, 5::bigint),
            (50, 'referral_10_medium', 'Команда', '🌟', 'Собери команду', 'Пригласи 10 учеников по реферальной ссылке', v_referrals, 10::bigint)
    ) as definitions(
        sort_order,
        achievement_id,
        category_name,
        icon,
        title,
        description,
        current_value,
        target_value
    );

    return v_result;
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
    v_card jsonb;
    v_extra jsonb;
begin
    if auth.uid() is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    v_card := public.get_player_card_base(p_user_id);
    v_extra :=
        coalesce(public.get_fun_achievements(p_user_id), '[]'::jsonb)
        || coalesce(public.get_medium_achievements(p_user_id), '[]'::jsonb);

    return jsonb_set(
        v_card,
        '{achievements}',
        coalesce(v_card -> 'achievements', '[]'::jsonb) || v_extra,
        true
    );
end;
$$;

revoke all on function public.get_medium_achievements(uuid)
    from public, anon, authenticated;
revoke all on function public.get_player_card(uuid)
    from public, anon;
grant execute on function public.get_player_card(uuid)
    to authenticated;

notify pgrst, 'reload schema';

commit;
