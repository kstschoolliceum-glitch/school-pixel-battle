-- Немного облегчает все 50 уровней «Пятнашек».
-- Нижняя оценка сложности снижена примерно на 10%, решаемость сохраняется.

begin;

create or replace function public.fifteen_initial_board(p_level integer)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
    v_level integer := greatest(1, least(50, coalesce(p_level, 1)));
    v_board integer[];
    v_best_board integer[];
    v_blank integer;
    v_previous_blank integer;
    v_target integer;
    v_direction integer;
    v_base_direction integer;
    v_offset integer;
    v_step integer;
    v_attempt integer;
    v_steps integer := 160 + v_level * 3;
    v_seed bigint;
    v_temp integer;
    v_tile integer;
    v_distance integer;
    v_target_distance integer := 25 + ((v_level - 1) * 15 / 49);
    v_best_difference integer := 2147483647;
    v_difference integer;
    v_index integer;
begin
    for v_attempt in 1..40 loop
        v_board := array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0];
        v_blank := 16;
        v_previous_blank := 0;
        v_seed := 104729 + v_level * 1009 + v_attempt * 7919;

        for v_step in 1..v_steps loop
            v_seed := (v_seed * 48271) % 2147483647;
            v_base_direction := (v_seed % 4)::integer;
            v_target := 0;

            for v_offset in 0..3 loop
                v_direction := (v_base_direction + v_offset) % 4;
                v_target := case v_direction
                    when 0 then v_blank - 4
                    when 1 then v_blank + 1
                    when 2 then v_blank + 4
                    else v_blank - 1
                end;

                if v_target between 1 and 16
                   and not (v_direction = 1 and v_blank % 4 = 0)
                   and not (v_direction = 3 and v_blank % 4 = 1)
                   and v_target <> v_previous_blank then
                    exit;
                end if;

                v_target := 0;
            end loop;

            if v_target = 0 then
                v_target := v_previous_blank;
            end if;

            v_previous_blank := v_blank;
            v_temp := v_board[v_target];
            v_board[v_blank] := v_temp;
            v_board[v_target] := 0;
            v_blank := v_target;
        end loop;

        v_distance := 0;

        for v_index in 1..16 loop
            v_tile := v_board[v_index];

            if v_tile <> 0 then
                v_distance := v_distance
                    + abs(((v_index - 1) / 4) - ((v_tile - 1) / 4))
                    + abs(((v_index - 1) % 4) - ((v_tile - 1) % 4));
            end if;
        end loop;

        v_difference := abs(v_distance - v_target_distance);

        if v_difference < v_best_difference then
            v_best_difference := v_difference;
            v_best_board := v_board;
        end if;

        if v_difference = 0 then
            exit;
        end if;
    end loop;

    return to_jsonb(v_best_board);
end;
$$;

-- Перестраиваем только текущее поле. Уровень, cooldown,
-- статистика достижений и активная Турбокисть сохраняются.
update public.fifteen_progress
set board = public.fifteen_initial_board(current_level),
    move_count = 0,
    updated_at = clock_timestamp();

revoke all on function public.fifteen_initial_board(integer)
    from public, anon, authenticated;

commit;

select jsonb_build_object(
    'fifteen_slightly_easier', true,
    'difficulty_range', '25-40',
    'updated_players', count(*)
) as fifteen_difficulty_update
from public.fifteen_progress;
