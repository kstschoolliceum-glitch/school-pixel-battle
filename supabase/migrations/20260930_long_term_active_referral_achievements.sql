-- Очистка близких повторяющихся достижений, долгосрочные цели
-- и подсчёт только действительно активных рефералов.

begin;

create or replace function public.filter_redundant_achievements(p_items jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
    select coalesce(
        jsonb_agg(item.value order by item.ordinality),
        '[]'::jsonb
    )
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
        with ordinality as item(value, ordinality)
    where item.value ->> 'id' <> all(array[
        'map_total_150',
        'map_total_400',
        'map_total_750',
        'palette_12',
        'chat_75_medium',
        'chat_150_medium',
        'daily_5_medium',
        'daily_20_medium',
        'unblock_3_medium',
        'unblock_7_medium',
        'sokoban_5_medium',
        'sokoban_20_medium',
        'fifteen_3_medium',
        'minigame_10_medium',
        'referral_3_medium'
    ]::text[]);
$$;

create or replace function public.get_active_referral_count(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
    select count(*)::bigint
    from public.student_referrals sr
    join public.profiles invited on invited.id = sr.invited_id
    left join public.classes invited_class on invited_class.id = invited.class_id
    where sr.inviter_id = p_user_id
      and coalesce(invited.banned, false) = false
      and upper(btrim(coalesce(invited_class.name, ''))) <> 'МОДЕРАТОР'
      and exists (
          select 1
          from public.pixel_history referral_pixels
          where referral_pixels.user_id = sr.invited_id
          group by referral_pixels.user_id
          having count(*) >= 50
             and count(distinct (
                 referral_pixels.created_at at time zone 'Asia/Almaty'
             )::date) >= 3
      );
$$;

create or replace function public.apply_active_referral_progress(
    p_items jsonb,
    p_active_count bigint
)
returns jsonb
language sql
stable
set search_path = public
as $$
    select coalesce(
        jsonb_agg(
            case
                when item.value ->> 'id' in (
                    'referral_2_medium',
                    'referral_3_medium',
                    'referral_5_medium',
                    'referral_10_medium'
                ) then
                    item.value || jsonb_build_object(
                        'description',
                        format(
                            'Пригласи %s активных учеников: каждому нужно 50 пикселей в 3 разные дни',
                            item.value ->> 'target'
                        ),
                        'unlocked',
                        coalesce(p_active_count, 0)
                            >= (item.value ->> 'target')::bigint,
                        'progress',
                        least(
                            coalesce(p_active_count, 0),
                            (item.value ->> 'target')::bigint
                        )
                    )
                else item.value
            end
            order by item.ordinality
        ),
        '[]'::jsonb
    )
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
        with ordinality as item(value, ordinality);
$$;

create or replace function public.get_long_term_achievements(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_total_pixels bigint := 0;
    v_colors bigint := 0;
    v_seasons bigint := 0;
    v_active_days bigint := 0;
    v_daily bigint := 0;
    v_unblock bigint := 0;
    v_sokoban bigint := 0;
    v_fifteen bigint := 0;
    v_minigames bigint := 0;
    v_active_referrals bigint := 0;
    v_legend_steps bigint := 0;
begin
    select
        count(*)::bigint,
        count(distinct lower(ph.color))::bigint,
        count(distinct ph.season_id)::bigint,
        count(distinct (
            ph.created_at at time zone 'Asia/Almaty'
        )::date)::bigint
    into
        v_total_pixels,
        v_colors,
        v_seasons,
        v_active_days
    from public.pixel_history ph
    where ph.user_id = p_user_id;

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

    v_active_referrals :=
        public.get_active_referral_count(p_user_id);

    v_legend_steps :=
        (case when v_total_pixels >= 5000 then 1 else 0 end)
        + (case when v_daily >= 100 then 1 else 0 end)
        + (case when v_minigames >= 100 then 1 else 0 end);

    return jsonb_build_array(
        jsonb_build_object(
            'id', 'long_pixels_3000',
            'category', 'Долгосрочные',
            'icon', '🏙️',
            'title', 'Пиксельный район',
            'description', 'Поставь 3 000 пикселей',
            'unlocked', v_total_pixels >= 3000,
            'progress', least(v_total_pixels, 3000),
            'target', 3000
        ),
        jsonb_build_object(
            'id', 'long_pixels_5000',
            'category', 'Долгосрочные',
            'icon', '🌆',
            'title', 'Пиксельный город',
            'description', 'Поставь 5 000 пикселей',
            'unlocked', v_total_pixels >= 5000,
            'progress', least(v_total_pixels, 5000),
            'target', 5000
        ),
        jsonb_build_object(
            'id', 'long_pixels_10000',
            'category', 'Долгосрочные',
            'icon', '🌌',
            'title', 'Целая вселенная',
            'description', 'Поставь 10 000 пикселей',
            'unlocked', v_total_pixels >= 10000,
            'progress', least(v_total_pixels, 10000),
            'target', 10000
        ),
        jsonb_build_object(
            'id', 'long_colors_25',
            'category', 'Долгосрочные',
            'icon', '🎨',
            'title', 'Коллекционер оттенков',
            'description', 'Используй 25 разных цветов',
            'unlocked', v_colors >= 25,
            'progress', least(v_colors, 25),
            'target', 25
        ),
        jsonb_build_object(
            'id', 'long_colors_50',
            'category', 'Долгосрочные',
            'icon', '🌈',
            'title', 'Повелитель палитры',
            'description', 'Используй 50 разных цветов',
            'unlocked', v_colors >= 50,
            'progress', least(v_colors, 50),
            'target', 50
        ),
        jsonb_build_object(
            'id', 'long_seasons_12',
            'category', 'Долгосрочные',
            'icon', '🗓️',
            'title', 'Три месяца в игре',
            'description', 'Участвуй в 12 разных сезонах',
            'unlocked', v_seasons >= 12,
            'progress', least(v_seasons, 12),
            'target', 12
        ),
        jsonb_build_object(
            'id', 'long_seasons_20',
            'category', 'Долгосрочные',
            'icon', '🏛️',
            'title', 'Летописец сезонов',
            'description', 'Участвуй в 20 разных сезонах',
            'unlocked', v_seasons >= 20,
            'progress', least(v_seasons, 20),
            'target', 20
        ),
        jsonb_build_object(
            'id', 'long_days_30',
            'category', 'Долгосрочные',
            'icon', '🌅',
            'title', 'Месяц на карте',
            'description', 'Ставь пиксели в 30 разные календарные даты',
            'unlocked', v_active_days >= 30,
            'progress', least(v_active_days, 30),
            'target', 30
        ),
        jsonb_build_object(
            'id', 'long_days_60',
            'category', 'Долгосрочные',
            'icon', '📆',
            'title', 'Два месяца творчества',
            'description', 'Ставь пиксели в 60 разных календарных дат',
            'unlocked', v_active_days >= 60,
            'progress', least(v_active_days, 60),
            'target', 60
        ),
        jsonb_build_object(
            'id', 'long_days_100',
            'category', 'Долгосрочные',
            'icon', '💎',
            'title', 'Сто активных дней',
            'description', 'Ставь пиксели в 100 разных календарных дат',
            'unlocked', v_active_days >= 100,
            'progress', least(v_active_days, 100),
            'target', 100
        ),
        jsonb_build_object(
            'id', 'long_daily_75',
            'category', 'Долгосрочные',
            'icon', '📋',
            'title', 'Дисциплина',
            'description', 'Выполни ежедневные задания 75 раз',
            'unlocked', v_daily >= 75,
            'progress', least(v_daily, 75),
            'target', 75
        ),
        jsonb_build_object(
            'id', 'long_daily_120',
            'category', 'Долгосрочные',
            'icon', '🎖️',
            'title', 'Железная привычка',
            'description', 'Выполни ежедневные задания 120 раз',
            'unlocked', v_daily >= 120,
            'progress', least(v_daily, 120),
            'target', 120
        ),
        jsonb_build_object(
            'id', 'long_minigames_100',
            'category', 'Долгосрочные',
            'icon', '🎮',
            'title', 'Игровой сезон',
            'description', 'Пройди суммарно 100 игр и уровней',
            'unlocked', v_minigames >= 100,
            'progress', least(v_minigames, 100),
            'target', 100
        ),
        jsonb_build_object(
            'id', 'long_minigames_250',
            'category', 'Долгосрочные',
            'icon', '🕹️',
            'title', 'Неутомимый игрок',
            'description', 'Пройди суммарно 250 игр и уровней',
            'unlocked', v_minigames >= 250,
            'progress', least(v_minigames, 250),
            'target', 250
        ),
        jsonb_build_object(
            'id', 'long_referrals_15',
            'category', 'Долгосрочные',
            'icon', '🤝',
            'title', 'Большая команда',
            'description', 'Пригласи 15 активных учеников: каждому нужно 50 пикселей в 3 разные дни',
            'unlocked', v_active_referrals >= 15,
            'progress', least(v_active_referrals, 15),
            'target', 15
        ),
        jsonb_build_object(
            'id', 'long_school_legend',
            'category', 'Долгосрочные',
            'icon', '👑',
            'title', 'Легенда школы',
            'description', 'Выполни три цели: 5 000 пикселей, 100 заданий и 100 прохождений мини-игр',
            'unlocked', v_legend_steps >= 3,
            'progress', v_legend_steps,
            'target', 3
        )
    );
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
    v_achievements jsonb;
begin
    if auth.uid() is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    v_card := public.get_player_card_base(p_user_id);

    v_achievements :=
        public.filter_redundant_achievements(
            coalesce(v_card -> 'achievements', '[]'::jsonb)
        )
        || public.filter_redundant_achievements(
            coalesce(public.get_fun_achievements(p_user_id), '[]'::jsonb)
        )
        || public.filter_redundant_achievements(
            public.apply_active_referral_progress(
                coalesce(
                    public.get_medium_achievements(p_user_id),
                    '[]'::jsonb
                ),
                public.get_active_referral_count(p_user_id)
            )
        )
        || coalesce(public.get_long_term_achievements(p_user_id), '[]'::jsonb);

    return jsonb_set(
        v_card,
        '{achievements}',
        v_achievements,
        true
    );
end;
$$;

revoke all on function public.filter_redundant_achievements(jsonb)
    from public, anon, authenticated;
revoke all on function public.get_active_referral_count(uuid)
    from public, anon, authenticated;
revoke all on function public.apply_active_referral_progress(jsonb, bigint)
    from public, anon, authenticated;
revoke all on function public.get_long_term_achievements(uuid)
    from public, anon, authenticated;
revoke all on function public.get_player_card(uuid)
    from public, anon;
grant execute on function public.get_player_card(uuid)
    to authenticated;

notify pgrst, 'reload schema';

commit;
