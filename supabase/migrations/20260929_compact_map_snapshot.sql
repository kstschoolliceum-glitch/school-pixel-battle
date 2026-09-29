-- Компактный снимок карты для одного запроса вместо постраничной
-- загрузки до 128 ответов. Установка пикселей, cooldown, награды
-- и Realtime этой миграцией не изменяются.

begin;

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
                                case lower(p.color)
                                    when '#ffffff' then 0
                                    when '#ef4444' then 1
                                    when '#f97316' then 2
                                    when '#facc15' then 3
                                    when '#22c55e' then 4
                                    when '#06b6d4' then 5
                                    when '#3b82f6' then 6
                                    when '#8b5cf6' then 7
                                    when '#ec4899' then 8
                                    when '#111111' then 9
                                    when '#92400e' then 10
                                    when '#fb923c' then 11
                                    when '#f472b6' then 12
                                    when '#a78bfa' then 13
                                    when '#38bdf8' then 14
                                    when '#84cc16' then 15
                                    when '#cbd5e1' then 16
                                    when '#475569' then 17
                                    else 0
                                end
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
        left join class_codes cc
          on cc.id = p.class_id
    )
    select jsonb_build_object(
        'success', true,
        'version', 1,
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
'Возвращает цвета и владельцев карты двумя компактными byte-массивами в base64.';

commit;
