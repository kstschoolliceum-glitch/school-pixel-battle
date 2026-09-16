begin;

-- School Pixel Battle: ежедневные задания и Турбокисть.
-- День меняется в 00:00 по времени Казахстана (Asia/Almaty).

alter table public.pixel_history
    add column if not exists daily_task_eligible boolean not null default true;

alter table public.chat_messages
    add column if not exists message_type text not null default 'user';

alter table public.chat_messages
    alter column user_id drop not null;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.chat_messages'::regclass
          and conname = 'chat_messages_message_type_check'
    ) then
        alter table public.chat_messages
            add constraint chat_messages_message_type_check
            check (message_type in ('user', 'system'));
    end if;
end
$$;

create table if not exists public.daily_task_progress (
    user_id uuid not null
        references public.profiles(id) on delete cascade,
    task_date date not null,
    season_id bigint not null
        references public.seasons(id) on delete cascade,
    bundle integer not null
        check (bundle between 1 and 5),
    started_at timestamptz not null default clock_timestamp(),
    total_moves integer not null default 0
        check (total_moves >= 0),
    unique_cells integer not null default 0
        check (unique_cells >= 0),
    color_counts jsonb not null default '{}'::jsonb,
    top_count integer not null default 0,
    middle_count integer not null default 0,
    bottom_count integer not null default 0,
    q1_count integer not null default 0,
    q2_count integer not null default 0,
    q3_count integer not null default 0,
    q4_count integer not null default 0,
    phase_one_completed_at timestamptz,
    phase_two_moves integer not null default 0,
    completed_at timestamptz,
    announced_at timestamptz,
    reward_claimed_at timestamptz,
    reward_expires_at timestamptz,
    boost_activated_at timestamptz,
    boost_until timestamptz,
    primary key (user_id, task_date)
);

create table if not exists public.daily_task_cells (
    user_id uuid not null,
    task_date date not null,
    x integer not null,
    y integer not null,
    color text not null,
    created_at timestamptz not null default clock_timestamp(),
    primary key (user_id, task_date, x, y),
    foreign key (user_id, task_date)
        references public.daily_task_progress(user_id, task_date)
        on delete cascade
);

create index if not exists daily_task_progress_date_idx
    on public.daily_task_progress(task_date);

create index if not exists daily_task_progress_boost_idx
    on public.daily_task_progress(user_id, boost_until)
    where boost_activated_at is not null;

alter table public.daily_task_progress enable row level security;
alter table public.daily_task_cells enable row level security;

revoke all on table public.daily_task_progress from anon, authenticated;
revoke all on table public.daily_task_cells from anon, authenticated;

create or replace function public.daily_task_bundle(p_date date)
returns integer
language sql
immutable
set search_path = public
as $$
    select mod(p_date - date '2026-01-01', 5) + 1;
$$;

create or replace function public.daily_task_status_for(
    p_user_id uuid,
    p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_date date := (p_now at time zone 'Asia/Almaty')::date;
    v_progress public.daily_task_progress%rowtype;
    v_tasks jsonb;
    v_all_completed boolean := false;
    v_color_total integer := 0;
    v_colors_4 integer := 0;
    v_colors_5 integer := 0;
    v_colors_6 integer := 0;
    v_palette text[];
    v_palette_done integer := 0;
    v_color text;
    v_reward_state text;
    v_boost_seconds integer := 0;
begin
    select *
    into v_progress
    from public.daily_task_progress
    where user_id = p_user_id
      and task_date = v_date;

    if not found then
        return null;
    end if;

    select
        count(*) filter (where value::integer > 0),
        count(*) filter (where value::integer >= 4),
        count(*) filter (where value::integer >= 5),
        count(*) filter (where value::integer >= 6)
    into
        v_color_total,
        v_colors_4,
        v_colors_5,
        v_colors_6
    from jsonb_each_text(v_progress.color_counts);

    v_palette := case mod(v_date - date '2026-01-01', 4)
        when 0 then array['#ef4444', '#f97316', '#facc15', '#92400e']
        when 1 then array['#22c55e', '#06b6d4', '#3b82f6', '#84cc16']
        when 2 then array['#8b5cf6', '#ec4899', '#a78bfa', '#f472b6']
        else array['#111111', '#475569', '#38bdf8', '#fb923c']
    end;

    foreach v_color in array v_palette loop
        if coalesce((v_progress.color_counts ->> v_color)::integer, 0) >= 10 then
            v_palette_done := v_palette_done + 1;
        end if;
    end loop;

    case v_progress.bundle
        when 1 then
            v_tasks := jsonb_build_array(
                jsonb_build_object(
                    'id', 'unique_70',
                    'title', 'Точный удар',
                    'description', 'Поставь пиксели на 70 разных клетках.',
                    'current', least(v_progress.unique_cells, 70),
                    'target', 70,
                    'completed', v_progress.unique_cells >= 70
                ),
                jsonb_build_object(
                    'id', 'colors_6x6',
                    'title', 'Мастер палитры',
                    'description', 'Используй 6 цветов: каждым закрась минимум 6 разных клеток.',
                    'current', least(v_colors_6, 6),
                    'target', 6,
                    'completed', v_colors_6 >= 6
                ),
                jsonb_build_object(
                    'id', 'three_zones_15',
                    'title', 'Исследователь карты',
                    'description', format(
                        'Поставь по 15 пикселей в верхней, средней и нижней частях. Сейчас: %s / %s / %s.',
                        v_progress.top_count,
                        v_progress.middle_count,
                        v_progress.bottom_count
                    ),
                    'current', least(v_progress.top_count, v_progress.middle_count, v_progress.bottom_count, 15),
                    'target', 15,
                    'completed', v_progress.top_count >= 15
                        and v_progress.middle_count >= 15
                        and v_progress.bottom_count >= 15
                )
            );

        when 2 then
            v_tasks := jsonb_build_array(
                jsonb_build_object(
                    'id', 'sprint_90',
                    'title', 'Пиксельный забег',
                    'description', format(
                        'Сделай 90 ходов, минимум на 75 разных клетках. Разных клеток: %s / 75.',
                        v_progress.unique_cells
                    ),
                    'current', least(v_progress.total_moves, 90),
                    'target', 90,
                    'completed', v_progress.total_moves >= 90
                        and v_progress.unique_cells >= 75
                ),
                jsonb_build_object(
                    'id', 'colors_10',
                    'title', 'Полная палитра',
                    'description', 'Используй 10 разных цветов.',
                    'current', least(v_color_total, 10),
                    'target', 10,
                    'completed', v_color_total >= 10
                ),
                jsonb_build_object(
                    'id', 'quarters_10',
                    'title', 'Четыре стороны',
                    'description', format(
                        'Поставь по 10 пикселей в каждой четверти карты. Сейчас: %s / %s / %s / %s.',
                        v_progress.q1_count,
                        v_progress.q2_count,
                        v_progress.q3_count,
                        v_progress.q4_count
                    ),
                    'current', least(v_progress.q1_count, v_progress.q2_count, v_progress.q3_count, v_progress.q4_count, 10),
                    'target', 10,
                    'completed', v_progress.q1_count >= 10
                        and v_progress.q2_count >= 10
                        and v_progress.q3_count >= 10
                        and v_progress.q4_count >= 10
                )
            );

        when 3 then
            v_tasks := jsonb_build_array(
                jsonb_build_object(
                    'id', 'unique_70',
                    'title', 'Точный удар',
                    'description', 'Поставь пиксели на 70 разных клетках.',
                    'current', least(v_progress.unique_cells, 70),
                    'target', 70,
                    'completed', v_progress.unique_cells >= 70
                ),
                jsonb_build_object(
                    'id', 'two_waves',
                    'title', 'Две волны',
                    'description', case
                        when v_progress.phase_one_completed_at is null then
                            'Сделай 35 ходов. Затем вернись минимум через 20 минут и сделай ещё 35.'
                        when p_now < v_progress.phase_one_completed_at + interval '20 minutes' then
                            'Первая волна готова. Вторая начнётся через '
                            || greatest(
                                0,
                                ceil(extract(epoch from (
                                    v_progress.phase_one_completed_at
                                    + interval '20 minutes'
                                    - p_now
                                )) / 60)
                            )::integer
                            || ' мин.'
                        else
                            'Вторая волна: '
                            || least(v_progress.phase_two_moves, 35)
                            || ' / 35.'
                    end,
                    'current', least(v_progress.total_moves, 35)
                        + least(v_progress.phase_two_moves, 35),
                    'target', 70,
                    'completed', v_progress.phase_one_completed_at is not null
                        and v_progress.phase_two_moves >= 35
                ),
                jsonb_build_object(
                    'id', 'colors_6x5',
                    'title', 'Цветовое комбо',
                    'description', 'Используй 6 цветов: каждым закрась минимум 5 разных клеток.',
                    'current', least(v_colors_5, 6),
                    'target', 6,
                    'completed', v_colors_5 >= 6
                )
            );

        when 4 then
            v_tasks := jsonb_build_array(
                jsonb_build_object(
                    'id', 'unique_100',
                    'title', 'Сотня',
                    'description', 'Поставь пиксели на 100 разных клетках.',
                    'current', least(v_progress.unique_cells, 100),
                    'target', 100,
                    'completed', v_progress.unique_cells >= 100
                ),
                jsonb_build_object(
                    'id', 'daily_palette',
                    'title', 'Цветовой код',
                    'description', 'Используй четыре показанных цвета: каждым закрась минимум 10 разных клеток.',
                    'current', v_palette_done,
                    'target', 4,
                    'required_colors', to_jsonb(v_palette),
                    'completed', v_palette_done >= 4
                ),
                jsonb_build_object(
                    'id', 'three_zones_20',
                    'title', 'Большая экспедиция',
                    'description', format(
                        'Поставь по 20 пикселей в трёх частях карты. Сейчас: %s / %s / %s.',
                        v_progress.top_count,
                        v_progress.middle_count,
                        v_progress.bottom_count
                    ),
                    'current', least(v_progress.top_count, v_progress.middle_count, v_progress.bottom_count, 20),
                    'target', 20,
                    'completed', v_progress.top_count >= 20
                        and v_progress.middle_count >= 20
                        and v_progress.bottom_count >= 20
                )
            );

        else
            v_tasks := jsonb_build_array(
                jsonb_build_object(
                    'id', 'unique_80',
                    'title', 'Меткий художник',
                    'description', 'Поставь пиксели на 80 разных клетках.',
                    'current', least(v_progress.unique_cells, 80),
                    'target', 80,
                    'completed', v_progress.unique_cells >= 80
                ),
                jsonb_build_object(
                    'id', 'colors_8x4',
                    'title', 'Радужный режим',
                    'description', 'Используй 8 цветов: каждым закрась минимум 4 разные клетки.',
                    'current', least(v_colors_4, 8),
                    'target', 8,
                    'completed', v_colors_4 >= 8
                ),
                jsonb_build_object(
                    'id', 'quarters_12',
                    'title', 'Вся карта',
                    'description', format(
                        'Поставь по 12 пикселей в каждой четверти. Сейчас: %s / %s / %s / %s.',
                        v_progress.q1_count,
                        v_progress.q2_count,
                        v_progress.q3_count,
                        v_progress.q4_count
                    ),
                    'current', least(v_progress.q1_count, v_progress.q2_count, v_progress.q3_count, v_progress.q4_count, 12),
                    'target', 12,
                    'completed', v_progress.q1_count >= 12
                        and v_progress.q2_count >= 12
                        and v_progress.q3_count >= 12
                        and v_progress.q4_count >= 12
                )
            );
    end case;

    select bool_and((item ->> 'completed')::boolean)
    into v_all_completed
    from jsonb_array_elements(v_tasks) item;

    v_reward_state := case
        when v_progress.completed_at is null then 'locked'
        when v_progress.reward_claimed_at is null then 'ready'
        when v_progress.boost_activated_at is null
             and v_progress.reward_expires_at > p_now then 'claimed'
        when v_progress.boost_activated_at is null then 'expired'
        when v_progress.boost_until > p_now then 'active'
        else 'used'
    end;

    if v_progress.boost_until > p_now then
        v_boost_seconds := greatest(
            0,
            floor(extract(epoch from (v_progress.boost_until - p_now)))::integer
        );
    end if;

    return jsonb_build_object(
        'task_date', v_date,
        'bundle', v_progress.bundle,
        'tasks', v_tasks,
        'all_completed', v_all_completed,
        'completed_at', v_progress.completed_at,
        'reward_state', v_reward_state,
        'reward_expires_at', v_progress.reward_expires_at,
        'boost_until', v_progress.boost_until,
        'boost_remaining_seconds', v_boost_seconds,
        'server_now', p_now
    );
end;
$$;

create or replace function public.get_daily_tasks()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_now timestamptz := clock_timestamp();
    v_date date := (v_now at time zone 'Asia/Almaty')::date;
    v_season_id bigint;
begin
    if v_user_id is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    if not exists (
        select 1
        from public.profiles
        where id = v_user_id
          and banned = false
    ) then
        raise exception 'PROFILE_NOT_FOUND_OR_BANNED';
    end if;

    select id
    into v_season_id
    from public.seasons
    where is_active = true
      and starts_at <= v_now
      and ends_at > v_now
    order by starts_at desc
    limit 1;

    if v_season_id is null then
        return jsonb_build_object(
            'available', false,
            'reason', 'NO_ACTIVE_SEASON',
            'task_date', v_date
        );
    end if;

    insert into public.daily_task_progress (
        user_id,
        task_date,
        season_id,
        bundle,
        started_at
    )
    values (
        v_user_id,
        v_date,
        v_season_id,
        public.daily_task_bundle(v_date),
        v_now
    )
    on conflict (user_id, task_date) do nothing;

    return jsonb_build_object(
        'available', true,
        'status', public.daily_task_status_for(v_user_id, v_now)
    );
end;
$$;

create or replace function public.claim_daily_task_reward()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_now timestamptz := clock_timestamp();
    v_date date := (v_now at time zone 'Asia/Almaty')::date;
    v_progress public.daily_task_progress%rowtype;
begin
    if v_user_id is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    perform 1
    from public.profiles
    where id = v_user_id
      and banned = false
    for update;

    if not found then
        raise exception 'PROFILE_NOT_FOUND_OR_BANNED';
    end if;

    select *
    into v_progress
    from public.daily_task_progress
    where user_id = v_user_id
      and task_date = v_date
    for update;

    if not found or v_progress.completed_at is null then
        raise exception 'DAILY_TASKS_NOT_COMPLETED';
    end if;

    if v_progress.reward_claimed_at is not null then
        raise exception 'REWARD_ALREADY_CLAIMED';
    end if;

    if exists (
        select 1
        from public.daily_task_progress p
        where p.user_id = v_user_id
          and p.reward_claimed_at is not null
          and (
              (p.boost_activated_at is null and p.reward_expires_at > v_now)
              or p.boost_until > v_now
          )
    ) then
        raise exception 'BOOST_ALREADY_STORED';
    end if;

    update public.daily_task_progress
    set
        reward_claimed_at = v_now,
        reward_expires_at = v_now + interval '24 hours'
    where user_id = v_user_id
      and task_date = v_date;

    return jsonb_build_object(
        'success', true,
        'status', public.daily_task_status_for(v_user_id, v_now)
    );
end;
$$;

create or replace function public.activate_daily_task_boost()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_now timestamptz := clock_timestamp();
    v_task_date date;
    v_boost_until timestamptz;
begin
    if v_user_id is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    perform 1
    from public.profiles
    where id = v_user_id
      and banned = false
    for update;

    if not found then
        raise exception 'PROFILE_NOT_FOUND_OR_BANNED';
    end if;

    if exists (
        select 1
        from public.daily_task_progress
        where user_id = v_user_id
          and boost_until > v_now
    ) then
        raise exception 'BOOST_ALREADY_ACTIVE';
    end if;

    select task_date
    into v_task_date
    from public.daily_task_progress
    where user_id = v_user_id
      and reward_claimed_at is not null
      and reward_expires_at > v_now
      and boost_activated_at is null
    order by reward_claimed_at desc
    limit 1
    for update;

    if not found then
        raise exception 'NO_CLAIMED_BOOST';
    end if;

    v_boost_until := v_now + interval '10 minutes';

    update public.daily_task_progress
    set
        boost_activated_at = v_now,
        boost_until = v_boost_until
    where user_id = v_user_id
      and task_date = v_task_date;

    return jsonb_build_object(
        'success', true,
        'boost_until', v_boost_until,
        'cooldown', 2
    );
end;
$$;

create or replace function public.place_pixel(
    p_x integer,
    p_y integer,
    p_color text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_profile public.profiles%rowtype;
    v_season public.seasons%rowtype;
    v_now timestamptz := clock_timestamp();
    v_date date := (v_now at time zone 'Asia/Almaty')::date;
    v_cooldown_seconds integer := 5;
    v_remaining integer;
    v_boost_active boolean := false;
    v_boost_until timestamptz;
    v_new_cell integer := 0;
    v_total_moves integer;
    v_phase_one_completed_at timestamptz;
    v_color_count integer;
    v_daily_status jsonb;
    v_completed_now boolean := false;
    v_nickname text;
    v_class_name text;
begin
    if v_user_id is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    select *
    into v_profile
    from public.profiles
    where id = v_user_id
    for update;

    if not found then
        raise exception 'PROFILE_NOT_FOUND';
    end if;

    if v_profile.banned then
        raise exception 'USER_BANNED';
    end if;

    if v_profile.class_id is null then
        raise exception 'CLASS_NOT_ASSIGNED';
    end if;

    select *
    into v_season
    from public.seasons
    where is_active = true
      and starts_at <= v_now
      and ends_at > v_now
    order by starts_at desc
    limit 1;

    if not found then
        raise exception 'NO_ACTIVE_SEASON';
    end if;

    if p_x < 0
       or p_y < 0
       or p_x >= v_season.map_width
       or p_y >= v_season.map_height then
        raise exception 'INVALID_COORDINATES';
    end if;

    if p_color not in (
        '#ffffff', '#ef4444', '#f97316', '#facc15',
        '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6',
        '#ec4899', '#111111', '#92400e', '#fb923c',
        '#f472b6', '#a78bfa', '#38bdf8', '#84cc16',
        '#cbd5e1', '#475569'
    ) then
        raise exception 'INVALID_COLOR';
    end if;

    select boost_until
    into v_boost_until
    from public.daily_task_progress
    where user_id = v_user_id
      and boost_activated_at is not null
      and boost_until > v_now
    order by boost_until desc
    limit 1;

    if v_boost_until is not null then
        v_boost_active := true;
        v_cooldown_seconds := 2;
    end if;

    if v_profile.last_pixel_at is not null then
        v_remaining := ceil(
            v_cooldown_seconds
            - extract(epoch from (v_now - v_profile.last_pixel_at))
        );

        if v_remaining > 0 then
            return jsonb_build_object(
                'success', false,
                'reason', 'COOLDOWN',
                'remaining', v_remaining,
                'cooldown', v_cooldown_seconds,
                'boost_active', v_boost_active,
                'boost_until', v_boost_until
            );
        end if;
    end if;

    insert into public.daily_task_progress (
        user_id,
        task_date,
        season_id,
        bundle,
        started_at
    )
    values (
        v_user_id,
        v_date,
        v_season.id,
        public.daily_task_bundle(v_date),
        v_now
    )
    on conflict (user_id, task_date) do nothing;

    update public.profiles
    set last_pixel_at = v_now
    where id = v_user_id;

    insert into public.pixels (
        season_id, x, y, color,
        user_id, class_id, updated_at
    )
    values (
        v_season.id, p_x, p_y, p_color,
        v_user_id, v_profile.class_id, v_now
    )
    on conflict (season_id, x, y)
    do update set
        color = excluded.color,
        user_id = excluded.user_id,
        class_id = excluded.class_id,
        updated_at = excluded.updated_at;

    insert into public.pixel_history (
        season_id, x, y, color,
        user_id, class_id, created_at,
        daily_task_eligible
    )
    values (
        v_season.id, p_x, p_y, p_color,
        v_user_id, v_profile.class_id, v_now,
        not v_boost_active
    );

    if not v_boost_active then
        update public.daily_task_progress
        set total_moves = total_moves + 1
        where user_id = v_user_id
          and task_date = v_date
        returning total_moves, phase_one_completed_at
        into v_total_moves, v_phase_one_completed_at;

        if v_phase_one_completed_at is null
           and v_total_moves >= 35 then
            update public.daily_task_progress
            set phase_one_completed_at = v_now
            where user_id = v_user_id
              and task_date = v_date;
        elsif v_phase_one_completed_at is not null
              and v_now >= v_phase_one_completed_at + interval '20 minutes' then
            update public.daily_task_progress
            set phase_two_moves = phase_two_moves + 1
            where user_id = v_user_id
              and task_date = v_date;
        end if;

        insert into public.daily_task_cells (
            user_id, task_date, x, y, color, created_at
        )
        values (
            v_user_id, v_date, p_x, p_y, p_color, v_now
        )
        on conflict (user_id, task_date, x, y) do nothing;

        get diagnostics v_new_cell = row_count;

        if v_new_cell = 1 then
            select coalesce((color_counts ->> p_color)::integer, 0) + 1
            into v_color_count
            from public.daily_task_progress
            where user_id = v_user_id
              and task_date = v_date;

            update public.daily_task_progress
            set
                unique_cells = unique_cells + 1,
                color_counts = jsonb_set(
                    color_counts,
                    array[p_color],
                    to_jsonb(v_color_count),
                    true
                ),
                top_count = top_count + case
                    when p_y < v_season.map_height / 3.0 then 1 else 0 end,
                middle_count = middle_count + case
                    when p_y >= v_season.map_height / 3.0
                     and p_y < v_season.map_height * 2.0 / 3.0 then 1 else 0 end,
                bottom_count = bottom_count + case
                    when p_y >= v_season.map_height * 2.0 / 3.0 then 1 else 0 end,
                q1_count = q1_count + case
                    when p_x < v_season.map_width / 2.0
                     and p_y < v_season.map_height / 2.0 then 1 else 0 end,
                q2_count = q2_count + case
                    when p_x >= v_season.map_width / 2.0
                     and p_y < v_season.map_height / 2.0 then 1 else 0 end,
                q3_count = q3_count + case
                    when p_x < v_season.map_width / 2.0
                     and p_y >= v_season.map_height / 2.0 then 1 else 0 end,
                q4_count = q4_count + case
                    when p_x >= v_season.map_width / 2.0
                     and p_y >= v_season.map_height / 2.0 then 1 else 0 end
            where user_id = v_user_id
              and task_date = v_date;
        end if;

        v_daily_status := public.daily_task_status_for(v_user_id, v_now);

        if coalesce((v_daily_status ->> 'all_completed')::boolean, false) then
            update public.daily_task_progress
            set completed_at = v_now
            where user_id = v_user_id
              and task_date = v_date
              and completed_at is null;

            get diagnostics v_new_cell = row_count;
            v_completed_now := v_new_cell = 1;

            if v_completed_now then
                select p.nickname, c.name
                into v_nickname, v_class_name
                from public.profiles p
                left join public.classes c on c.id = p.class_id
                where p.id = v_user_id;

                insert into public.chat_messages (
                    user_id,
                    message,
                    message_type,
                    created_at
                )
                values (
                    null,
                    format(
                        '⚡ %s [%s] выполнил(а) все ежедневные задания и открыл(а) бонус!',
                        coalesce(v_nickname, 'Игрок'),
                        coalesce(v_class_name, '—')
                    ),
                    'system',
                    v_now
                );

                update public.daily_task_progress
                set announced_at = v_now
                where user_id = v_user_id
                  and task_date = v_date;

                v_daily_status := public.daily_task_status_for(v_user_id, v_now);
            end if;
        end if;
    else
        v_daily_status := public.daily_task_status_for(v_user_id, v_now);
    end if;

    return jsonb_build_object(
        'success', true,
        'x', p_x,
        'y', p_y,
        'color', p_color,
        'cooldown', v_cooldown_seconds,
        'boost_active', v_boost_active,
        'boost_until', v_boost_until,
        'daily_tasks', v_daily_status
    );
end;
$$;

revoke all on function public.daily_task_bundle(date) from public, anon, authenticated;
revoke all on function public.daily_task_status_for(uuid, timestamptz) from public, anon, authenticated;

revoke all on function public.get_daily_tasks() from public, anon;
revoke all on function public.claim_daily_task_reward() from public, anon;
revoke all on function public.activate_daily_task_boost() from public, anon;

grant execute on function public.get_daily_tasks() to authenticated;
grant execute on function public.claim_daily_task_reward() to authenticated;
grant execute on function public.activate_daily_task_boost() to authenticated;

commit;

select jsonb_build_object(
    'daily_task_progress_table',
        to_regclass('public.daily_task_progress') is not null,
    'daily_task_cells_table',
        to_regclass('public.daily_task_cells') is not null,
    'history_eligibility_column',
        exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'pixel_history'
              and column_name = 'daily_task_eligible'
        ),
    'chat_system_columns',
        (
            select count(*) = 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'chat_messages'
              and column_name = 'message_type'
        ),
    'rpc_functions',
        (
            select jsonb_agg(p.proname order by p.proname)
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in (
                  'get_daily_tasks',
                  'claim_daily_task_reward',
                  'activate_daily_task_boost',
                  'place_pixel'
              )
        ),
    'place_pixel_has_two_second_boost',
        position(
            'v_cooldown_seconds := 2'
            in pg_get_functiondef(
                'public.place_pixel(integer,integer,text)'::regprocedure
            )
        ) > 0
) as daily_tasks_install_check;
