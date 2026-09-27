-- Исправляет несовпадение числа столбцов UNION в place_pixel().
-- Промокоды возвращают active_until + active_cooldown, поэтому награды
-- Unblock Me и Sokoban должны возвращать те же два столбца.

begin;

do $migration$
declare
    v_definition text;
    v_old_unblock text := $old$
        select g.boost_until as active_until
        from public.unblock_me_daily g
$old$;
    v_new_unblock text := $new$
        select g.boost_until as active_until,
               1 as active_cooldown
        from public.unblock_me_daily g
$new$;
    v_old_sokoban text := $old$
        select s.boost_until as active_until
        from public.sokoban_progress s
$old$;
    v_new_sokoban text := $new$
        select s.boost_until as active_until,
               1 as active_cooldown
        from public.sokoban_progress s
$new$;
    v_occurrences integer;
begin
    select pg_get_functiondef(
        'public.place_pixel(integer,integer,text)'::regprocedure
    )
    into v_definition;

    if position(
        'g.boost_until as active_until,' in v_definition
    ) = 0 then
        v_occurrences := (
            length(v_definition) -
            length(replace(v_definition, v_old_unblock, ''))
        ) / length(v_old_unblock);

        if v_occurrences <> 1 then
            raise exception
                'PLACE_PIXEL_UNBLOCK_COLUMNS_CHANGED: expected 1 block, found %',
                v_occurrences;
        end if;

        v_definition := replace(
            v_definition,
            v_old_unblock,
            v_new_unblock
        );
    end if;

    if position(
        's.boost_until as active_until,' in v_definition
    ) = 0 then
        v_occurrences := (
            length(v_definition) -
            length(replace(v_definition, v_old_sokoban, ''))
        ) / length(v_old_sokoban);

        if v_occurrences <> 1 then
            raise exception
                'PLACE_PIXEL_SOKOBAN_COLUMNS_CHANGED: expected 1 block, found %',
                v_occurrences;
        end if;

        v_definition := replace(
            v_definition,
            v_old_sokoban,
            v_new_sokoban
        );
    end if;

    execute v_definition;
end;
$migration$;

revoke all on function public.place_pixel(integer, integer, text)
    from public, anon;
grant execute on function public.place_pixel(integer, integer, text)
    to authenticated;

commit;

select jsonb_build_object(
    'unblock_columns_fixed',
        position(
            'g.boost_until as active_until,'
            in pg_get_functiondef(
                'public.place_pixel(integer,integer,text)'::regprocedure
            )
        ) > 0,
    'sokoban_columns_fixed',
        position(
            's.boost_until as active_until,'
            in pg_get_functiondef(
                'public.place_pixel(integer,integer,text)'::regprocedure
            )
        ) > 0
) as minigame_boost_union_fix;
