begin;

do $$
declare
    v_definition text;
    v_old text := 'v_cooldown_seconds := 2;';
    v_occurrences integer;
begin
    select pg_get_functiondef('public.place_pixel(integer,integer,text)'::regprocedure)
    into v_definition;

    v_occurrences := (
        length(v_definition) - length(replace(v_definition, v_old, ''))
    ) / length(v_old);

    if v_occurrences <> 1 then
        raise exception 'PLACE_PIXEL_DEFINITION_CHANGED: expected 1 turbo cooldown marker, found %', v_occurrences;
    end if;

    execute replace(
        v_definition,
        v_old,
        'v_cooldown_seconds := 1;'
    );
end;
$$;

do $$
declare
    v_definition text;
    v_old text := '''cooldown'', 2';
    v_occurrences integer;
begin
    select pg_get_functiondef('public.activate_daily_task_boost()'::regprocedure)
    into v_definition;

    v_occurrences := (
        length(v_definition) - length(replace(v_definition, v_old, ''))
    ) / length(v_old);

    if v_occurrences <> 1 then
        raise exception 'ACTIVATE_BOOST_DEFINITION_CHANGED: expected 1 cooldown marker, found %', v_occurrences;
    end if;

    execute replace(
        v_definition,
        v_old,
        '''cooldown'', 1'
    );
end;
$$;

revoke all on function public.place_pixel(integer, integer, text) from public, anon;
grant execute on function public.place_pixel(integer, integer, text) to authenticated;

revoke all on function public.activate_daily_task_boost() from public, anon;
grant execute on function public.activate_daily_task_boost() to authenticated;

commit;

select jsonb_build_object(
    'place_pixel_uses_one_second',
        pg_get_functiondef('public.place_pixel(integer,integer,text)'::regprocedure)
            like '%v_cooldown_seconds := 1;%',
    'activation_returns_one_second',
        pg_get_functiondef('public.activate_daily_task_boost()'::regprocedure)
            like '%''cooldown'', 1%'
) as turbo_brush_check;
