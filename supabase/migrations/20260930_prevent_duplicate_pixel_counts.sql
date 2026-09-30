-- Запрещает учитывать повторную установку того же цвета в ту же клетку.
-- Не меняет cooldown, Турбокисть, задания или правила настоящего перекрашивания.

begin;

do $patch_duplicate_pixel$
declare
    v_definition text;
    v_marker text := 'if v_profile.last_pixel_at is not null then';
    v_guard text :=
        E'perform pg_advisory_xact_lock(\n'
        || E'        hashtextextended(\n'
        || E'            v_season.id::text || '':'' || p_x::text || '':'' || p_y::text,\n'
        || E'            0\n'
        || E'        )\n'
        || E'    );\n\n'
        || E'    if exists (\n'
        || E'        select 1\n'
        || E'        from public.pixels current_pixel\n'
        || E'        where current_pixel.season_id = v_season.id\n'
        || E'          and current_pixel.x = p_x\n'
        || E'          and current_pixel.y = p_y\n'
        || E'          and lower(btrim(current_pixel.color)) = lower(btrim(p_color))\n'
        || E'    ) then\n'
        || E'        v_daily_status := public.daily_task_status_for(v_user_id, v_now);\n\n'
        || E'        return jsonb_build_object(\n'
        || E'            ''success'', false,\n'
        || E'            ''reason'', ''PIXEL_UNCHANGED'',\n'
        || E'            ''x'', p_x,\n'
        || E'            ''y'', p_y,\n'
        || E'            ''color'', lower(btrim(p_color)),\n'
        || E'            ''cooldown'', v_cooldown_seconds,\n'
        || E'            ''boost_active'', v_boost_active,\n'
        || E'            ''boost_until'', v_boost_until,\n'
        || E'            ''daily_tasks'', v_daily_status\n'
        || E'        );\n'
        || E'    end if;\n\n'
        || E'    ';
    v_occurrences integer;
begin
    select pg_get_functiondef(
        'public.place_pixel(integer,integer,text)'::regprocedure
    )
    into v_definition;

    if position('PIXEL_UNCHANGED' in v_definition) = 0 then
        v_occurrences := (
            length(v_definition)
            - length(replace(v_definition, v_marker, ''))
        ) / length(v_marker);

        if v_occurrences <> 1 then
            raise exception
                'PLACE_PIXEL_COOLDOWN_MARKER_CHANGED:%',
                v_occurrences;
        end if;

        execute replace(
            v_definition,
            v_marker,
            v_guard || v_marker
        );
    end if;
end;
$patch_duplicate_pixel$;

do $verify_duplicate_pixel$
declare
    v_definition text;
begin
    select pg_get_functiondef(
        'public.place_pixel(integer,integer,text)'::regprocedure
    )
    into v_definition;

    if position('PIXEL_UNCHANGED' in v_definition) = 0
       or position('pg_advisory_xact_lock' in v_definition) = 0 then
        raise exception 'PLACE_PIXEL_DUPLICATE_GUARD_NOT_INSTALLED';
    end if;
end;
$verify_duplicate_pixel$;

notify pgrst, 'reload schema';

commit;
