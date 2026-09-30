-- Исправление учёта цветовых ежедневных заданий.
-- Каждый цвет учитывает уникальные клетки отдельно; Турбокисть не учитывается.

begin;

create table if not exists public.daily_task_color_cells (
    user_id uuid not null,
    task_date date not null,
    color text not null,
    x integer not null,
    y integer not null,
    created_at timestamptz not null default clock_timestamp(),
    primary key (user_id, task_date, color, x, y),
    foreign key (user_id, task_date)
        references public.daily_task_progress(user_id, task_date)
        on delete cascade
);

alter table public.daily_task_color_cells enable row level security;
revoke all on table public.daily_task_color_cells
    from public, anon, authenticated;

create or replace function public.track_daily_task_color_cell()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_task_date date :=
        (new.created_at at time zone 'Asia/Almaty')::date;
begin
    if new.user_id is null
       or not coalesce(new.daily_task_eligible, true) then
        return new;
    end if;

    insert into public.daily_task_color_cells (
        user_id,
        task_date,
        color,
        x,
        y,
        created_at
    )
    select
        new.user_id,
        v_task_date,
        lower(btrim(new.color)),
        new.x,
        new.y,
        new.created_at
    where exists (
        select 1
        from public.daily_task_progress progress
        where progress.user_id = new.user_id
          and progress.task_date = v_task_date
    )
    on conflict (user_id, task_date, color, x, y) do nothing;

    return new;
end;
$$;

drop trigger if exists track_daily_task_color_cell_trigger
    on public.pixel_history;
create trigger track_daily_task_color_cell_trigger
after insert
on public.pixel_history
for each row
execute function public.track_daily_task_color_cell();

-- Восстанавливаем прогресс текущего дня из уже сохранённой истории.
insert into public.daily_task_color_cells (
    user_id,
    task_date,
    color,
    x,
    y,
    created_at
)
select
    history.user_id,
    (history.created_at at time zone 'Asia/Almaty')::date,
    lower(btrim(history.color)),
    history.x,
    history.y,
    min(history.created_at)
from public.pixel_history history
join public.daily_task_progress progress
  on progress.user_id = history.user_id
 and progress.task_date =
        (history.created_at at time zone 'Asia/Almaty')::date
where history.user_id is not null
  and coalesce(history.daily_task_eligible, true)
  and (history.created_at at time zone 'Asia/Almaty')::date
        = (clock_timestamp() at time zone 'Asia/Almaty')::date
group by
    history.user_id,
    (history.created_at at time zone 'Asia/Almaty')::date,
    lower(btrim(history.color)),
    history.x,
    history.y
on conflict (user_id, task_date, color, x, y) do nothing;

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
    v_color_counts jsonb := '{}'::jsonb;
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

    select coalesce(
        jsonb_object_agg(grouped.color, grouped.cell_count),
        '{}'::jsonb
    )
    into v_color_counts
    from (
        select
            color_cells.color,
            count(*)::integer as cell_count
        from public.daily_task_color_cells color_cells
        where color_cells.user_id = p_user_id
          and color_cells.task_date = v_date
        group by color_cells.color
    ) grouped;

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
    from jsonb_each_text(v_color_counts);

    v_palette := case mod(v_date - date '2026-01-01', 4)
        when 0 then array['#ef4444', '#f97316', '#facc15', '#92400e']
        when 1 then array['#22c55e', '#06b6d4', '#3b82f6', '#84cc16']
        when 2 then array['#8b5cf6', '#ec4899', '#a78bfa', '#f472b6']
        else array['#111111', '#475569', '#38bdf8', '#fb923c']
    end;

    foreach v_color in array v_palette loop
        if coalesce((v_color_counts ->> v_color)::integer, 0) >= 10 then
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

revoke all on function public.track_daily_task_color_cell()
    from public, anon, authenticated;
revoke all on function public.daily_task_status_for(uuid, timestamptz)
    from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
