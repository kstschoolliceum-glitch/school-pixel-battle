-- Расширенная серверная палитра School Pixel Battle.
-- Сохраняет существующую place_pixel и точечно заменяет только
-- проверку разрешённых цветов. Cooldown, Турбокисть, задания,
-- история и награды остаются в прежней функции без изменений.

begin;

create table if not exists public.pixel_palette (
    code smallint primary key
        check (code between 0 and 254),
    color text not null unique
        check (color ~ '^#[0-9a-f]{6}$'),
    name text not null,
    group_name text not null,
    is_active boolean not null default true,
    updated_at timestamptz not null default statement_timestamp()
);

alter table public.pixel_palette
    enable row level security;

revoke all on table public.pixel_palette
from public, anon, authenticated;

insert into public.pixel_palette (
    code,
    color,
    name,
    group_name,
    is_active
)
values
    (0, '#ffffff', 'Белый', 'Основные', true),
    (1, '#ef4444', 'Красный', 'Основные', true),
    (2, '#f97316', 'Оранжевый', 'Основные', true),
    (3, '#facc15', 'Жёлтый', 'Основные', true),
    (4, '#22c55e', 'Зелёный', 'Основные', true),
    (5, '#06b6d4', 'Бирюзовый', 'Основные', true),
    (6, '#3b82f6', 'Синий', 'Основные', true),
    (7, '#8b5cf6', 'Фиолетовый', 'Основные', true),
    (8, '#ec4899', 'Розовый', 'Основные', true),
    (9, '#111111', 'Чёрный', 'Основные', true),
    (10, '#92400e', 'Коричневый', 'Основные', true),
    (11, '#fb923c', 'Светло-оранжевый', 'Основные', true),
    (12, '#f472b6', 'Светло-розовый', 'Основные', true),
    (13, '#a78bfa', 'Сиреневый', 'Основные', true),
    (14, '#38bdf8', 'Голубой', 'Основные', true),
    (15, '#84cc16', 'Лаймовый', 'Основные', true),
    (16, '#cbd5e1', 'Светло-серый', 'Основные', true),
    (17, '#475569', 'Тёмно-серый', 'Основные', true),
    (18, '#fff1f2', 'Красный 50', 'Красные', true),
    (19, '#ffe4e6', 'Красный 100', 'Красные', true),
    (20, '#fecdd3', 'Красный 200', 'Красные', true),
    (21, '#fda4af', 'Красный 300', 'Красные', true),
    (22, '#fb7185', 'Красный 400', 'Красные', true),
    (23, '#e11d48', 'Малиновый 600', 'Красные', true),
    (24, '#be123c', 'Малиновый 700', 'Красные', true),
    (25, '#881337', 'Бордовый', 'Красные', true),
    (26, '#fee2e2', 'Алый 100', 'Красные', true),
    (27, '#fecaca', 'Алый 200', 'Красные', true),
    (28, '#fca5a5', 'Алый 300', 'Красные', true),
    (29, '#f87171', 'Алый 400', 'Красные', true),
    (30, '#dc2626', 'Алый 600', 'Красные', true),
    (31, '#b91c1c', 'Алый 700', 'Красные', true),
    (32, '#7f1d1d', 'Тёмно-красный', 'Красные', true),
    (33, '#fff7ed', 'Оранжевый 50', 'Тёплые', true),
    (34, '#ffedd5', 'Оранжевый 100', 'Тёплые', true),
    (35, '#fed7aa', 'Оранжевый 200', 'Тёплые', true),
    (36, '#fdba74', 'Оранжевый 300', 'Тёплые', true),
    (37, '#ea580c', 'Оранжевый 600', 'Тёплые', true),
    (38, '#c2410c', 'Оранжевый 700', 'Тёплые', true),
    (39, '#7c2d12', 'Тёмно-оранжевый', 'Тёплые', true),
    (40, '#fefce8', 'Жёлтый 50', 'Тёплые', true),
    (41, '#fef9c3', 'Жёлтый 100', 'Тёплые', true),
    (42, '#fef08a', 'Жёлтый 200', 'Тёплые', true),
    (43, '#fde047', 'Жёлтый 300', 'Тёплые', true),
    (44, '#eab308', 'Жёлтый 500', 'Тёплые', true),
    (45, '#ca8a04', 'Жёлтый 600', 'Тёплые', true),
    (46, '#854d0e', 'Тёмно-жёлтый', 'Тёплые', true),
    (47, '#f0fdf4', 'Зелёный 50', 'Зелёные', true),
    (48, '#dcfce7', 'Зелёный 100', 'Зелёные', true),
    (49, '#bbf7d0', 'Зелёный 200', 'Зелёные', true),
    (50, '#86efac', 'Зелёный 300', 'Зелёные', true),
    (51, '#4ade80', 'Зелёный 400', 'Зелёные', true),
    (52, '#16a34a', 'Зелёный 600', 'Зелёные', true),
    (53, '#15803d', 'Зелёный 700', 'Зелёные', true),
    (54, '#14532d', 'Тёмно-зелёный', 'Зелёные', true),
    (55, '#ecfccb', 'Лайм 100', 'Зелёные', true),
    (56, '#d9f99d', 'Лайм 200', 'Зелёные', true),
    (57, '#bef264', 'Лайм 300', 'Зелёные', true),
    (58, '#65a30d', 'Лайм 600', 'Зелёные', true),
    (59, '#3f6212', 'Тёмный лайм', 'Зелёные', true),
    (60, '#ecfeff', 'Бирюзовый 50', 'Холодные', true),
    (61, '#cffafe', 'Бирюзовый 100', 'Холодные', true),
    (62, '#a5f3fc', 'Бирюзовый 200', 'Холодные', true),
    (63, '#67e8f9', 'Бирюзовый 300', 'Холодные', true),
    (64, '#22d3ee', 'Бирюзовый 400', 'Холодные', true),
    (65, '#0891b2', 'Бирюзовый 600', 'Холодные', true),
    (66, '#155e75', 'Тёмно-бирюзовый', 'Холодные', true),
    (67, '#f0f9ff', 'Небесный 50', 'Холодные', true),
    (68, '#e0f2fe', 'Небесный 100', 'Холодные', true),
    (69, '#bae6fd', 'Небесный 200', 'Холодные', true),
    (70, '#7dd3fc', 'Небесный 300', 'Холодные', true),
    (71, '#0ea5e9', 'Небесный 500', 'Холодные', true),
    (72, '#0284c7', 'Небесный 600', 'Холодные', true),
    (73, '#075985', 'Тёмно-голубой', 'Холодные', true),
    (74, '#eff6ff', 'Синий 50', 'Холодные', true),
    (75, '#dbeafe', 'Синий 100', 'Холодные', true),
    (76, '#bfdbfe', 'Синий 200', 'Холодные', true),
    (77, '#93c5fd', 'Синий 300', 'Холодные', true),
    (78, '#60a5fa', 'Синий 400', 'Холодные', true),
    (79, '#2563eb', 'Синий 600', 'Холодные', true),
    (80, '#1d4ed8', 'Синий 700', 'Холодные', true),
    (81, '#1e3a8a', 'Тёмно-синий', 'Холодные', true),
    (82, '#f5f3ff', 'Фиолетовый 50', 'Фиолетовые', true),
    (83, '#ede9fe', 'Фиолетовый 100', 'Фиолетовые', true),
    (84, '#ddd6fe', 'Фиолетовый 200', 'Фиолетовые', true),
    (85, '#c4b5fd', 'Фиолетовый 300', 'Фиолетовые', true),
    (86, '#7c3aed', 'Фиолетовый 600', 'Фиолетовые', true),
    (87, '#6d28d9', 'Фиолетовый 700', 'Фиолетовые', true),
    (88, '#4c1d95', 'Тёмно-фиолетовый', 'Фиолетовые', true),
    (89, '#fdf2f8', 'Розовый 50', 'Фиолетовые', true),
    (90, '#fce7f3', 'Розовый 100', 'Фиолетовые', true),
    (91, '#fbcfe8', 'Розовый 200', 'Фиолетовые', true),
    (92, '#f9a8d4', 'Розовый 300', 'Фиолетовые', true),
    (93, '#db2777', 'Розовый 600', 'Фиолетовые', true),
    (94, '#be185d', 'Розовый 700', 'Фиолетовые', true),
    (95, '#831843', 'Тёмно-розовый', 'Фиолетовые', true),
    (96, '#fffbeb', 'Золотой 50', 'Земляные', true),
    (97, '#fef3c7', 'Золотой 100', 'Земляные', true),
    (98, '#fde68a', 'Золотой 200', 'Земляные', true),
    (99, '#fbbf24', 'Золотой 400', 'Земляные', true),
    (100, '#f59e0b', 'Янтарный 500', 'Земляные', true),
    (101, '#d97706', 'Янтарный 600', 'Земляные', true),
    (102, '#b45309', 'Коричневый 600', 'Земляные', true),
    (103, '#78350f', 'Коричневый 800', 'Земляные', true),
    (104, '#451a03', 'Тёмно-коричневый', 'Земляные', true),
    (105, '#f8fafc', 'Холодный белый', 'Нейтральные', true),
    (106, '#f1f5f9', 'Серый 100', 'Нейтральные', true),
    (107, '#e2e8f0', 'Серый 200', 'Нейтральные', true),
    (108, '#94a3b8', 'Серый 400', 'Нейтральные', true),
    (109, '#64748b', 'Серый 500', 'Нейтральные', true),
    (110, '#334155', 'Серый 700', 'Нейтральные', true),
    (111, '#1e293b', 'Серый 800', 'Нейтральные', true),
    (112, '#0f172a', 'Серый 900', 'Нейтральные', true)
on conflict (code) do update
set
    color = excluded.color,
    name = excluded.name,
    group_name = excluded.group_name,
    is_active = excluded.is_active,
    updated_at = statement_timestamp();

do $patch_place_pixel$
declare
    v_definition text;
    v_start integer;
    v_relative_end integer;
    v_end integer;
    v_replacement text := $validation$
if p_color is not null then
        p_color := lower(trim(p_color));
    end if;

    if not exists (
        select 1
        from public.pixel_palette palette
        where palette.color = p_color
          and palette.is_active = true
    ) then
        raise exception 'INVALID_COLOR';
    end if;$validation$;
begin
    select pg_get_functiondef(
        'public.place_pixel(integer,integer,text)'::regprocedure::oid
    )
    into v_definition;

    if strpos(
        v_definition,
        'from public.pixel_palette palette'
    ) = 0 then
        v_start := strpos(
            v_definition,
            'if p_color not in ('
        );

        if v_start = 0 then
            raise exception
                'PLACE_PIXEL_COLOR_CHECK_NOT_FOUND';
        end if;

        v_relative_end := strpos(
            substring(
                v_definition
                from v_start
            ),
            'end if;'
        );

        if v_relative_end = 0 then
            raise exception
                'PLACE_PIXEL_COLOR_CHECK_END_NOT_FOUND';
        end if;

        v_end :=
            v_start
            + v_relative_end
            + length('end if;')
            - 2;

        v_definition :=
            substring(
                v_definition
                from 1
                for v_start - 1
            )
            || v_replacement
            || substring(
                v_definition
                from v_end + 1
            );

        execute v_definition;
    end if;

    select pg_get_functiondef(
        'public.place_pixel(integer,integer,text)'::regprocedure::oid
    )
    into v_definition;

    if strpos(
        v_definition,
        'from public.pixel_palette palette'
    ) = 0 then
        raise exception
            'PLACE_PIXEL_PALETTE_PATCH_FAILED';
    end if;
end;
$patch_place_pixel$;

create or replace function public.get_map_snapshot_v1(
    p_season_id bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    v_width integer;
    v_height integer;
    v_class_count integer;
    v_result jsonb;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED'
            using errcode = '42501';
    end if;

    select
        coalesce(s.map_width, 300),
        coalesce(s.map_height, 424)
    into
        v_width,
        v_height
    from public.seasons s
    where s.id = p_season_id
      and s.is_active = true
      and s.status = 'active'
      and s.starts_at <= statement_timestamp()
      and s.ends_at > statement_timestamp()
    limit 1;

    if v_width is null or v_height is null then
        return jsonb_build_object(
            'success', false,
            'reason', 'SEASON_NOT_FOUND'
        );
    end if;

    if v_width <= 0
       or v_height <= 0
       or (v_width::bigint * v_height::bigint) > 500000 then
        raise exception 'INVALID_MAP_SIZE'
            using errcode = '22023';
    end if;

    select count(*)::integer
    into v_class_count
    from public.classes c
    where c.is_active = true
       or exists (
            select 1
            from public.pixels p
            where p.season_id = p_season_id
              and p.class_id = c.id
        );

    if v_class_count > 255 then
        raise exception 'TOO_MANY_MAP_CLASSES'
            using errcode = '54000';
    end if;

    with class_codes as (
        select
            c.id,
            c.name,
            row_number() over (
                order by c.id
            )::integer as code
        from public.classes c
        where c.is_active = true
           or exists (
                select 1
                from public.pixels p
                where p.season_id = p_season_id
                  and p.class_id = c.id
            )
    ),
    grid as (
        select
            position,
            (position % v_width)::integer as x,
            (position / v_width)::integer as y
        from generate_series(
            0,
            v_width * v_height - 1
        ) as position
    ),
    snapshot as (
        select
            encode(
                decode(
                    string_agg(
                        lpad(
                            to_hex(
                                coalesce(pc.code, 0)
                            ),
                            2,
                            '0'
                        ),
                        ''
                        order by g.position
                    ),
                    'hex'
                ),
                'base64'
            ) as colors,
            encode(
                decode(
                    string_agg(
                        lpad(
                            to_hex(
                                coalesce(
                                    cc.code,
                                    0
                                )
                            ),
                            2,
                            '0'
                        ),
                        ''
                        order by g.position
                    ),
                    'hex'
                ),
                'base64'
            ) as owners,
            count(p.x)::integer as pixel_count,
            max(p.updated_at) as updated_at
        from grid g
        left join public.pixels p
          on p.season_id = p_season_id
         and p.x = g.x
         and p.y = g.y
        left join public.pixel_palette pc
          on pc.color = lower(p.color)
         and pc.is_active = true
        left join class_codes cc
          on cc.id = p.class_id
    )
    select jsonb_build_object(
        'success', true,
        'version', 2,
        'season_id', p_season_id,
        'width', v_width,
        'height', v_height,
        'pixel_count', s.pixel_count,
        'updated_at', s.updated_at,
        'colors', s.colors,
        'owners', s.owners,
        'classes',
            coalesce(
                (
                    select jsonb_agg(
                        jsonb_build_object(
                            'code', cc.code,
                            'id', cc.id,
                            'name', cc.name
                        )
                        order by cc.code
                    )
                    from class_codes cc
                ),
                '[]'::jsonb
            )
    )
    into v_result
    from snapshot s;

    return v_result;
end;
$$;

revoke all
on function public.get_map_snapshot_v1(bigint)
from public, anon;

grant execute
on function public.get_map_snapshot_v1(bigint)
to authenticated;

comment on function public.get_map_snapshot_v1(bigint) is
'Возвращает расширенную палитру, цвета и владельцев карты компактными byte-массивами в base64.';

commit;
