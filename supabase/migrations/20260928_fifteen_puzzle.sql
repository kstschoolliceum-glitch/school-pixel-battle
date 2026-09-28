-- Игра «Пятнашки»: 50 возрастающих уровней, серверные ходы,
-- сохранение прогресса, cooldown 5 часов и Турбокисть на 10 минут.

begin;

create table if not exists public.fifteen_progress (
    user_id uuid primary key references public.profiles(id) on delete cascade,
    current_level integer not null default 1 check (current_level between 1 and 50),
    board jsonb not null,
    move_count integer not null default 0 check (move_count >= 0),
    boost_until timestamptz,
    next_available_at timestamptz,
    updated_at timestamptz not null default clock_timestamp()
);

alter table public.fifteen_progress enable row level security;
revoke all on table public.fifteen_progress from public, anon, authenticated;

create or replace function public.fifteen_initial_board(p_level integer)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
    v_board integer[] := array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0];
    v_blank integer := 16;
    v_previous_blank integer := 0;
    v_target integer;
    v_direction integer;
    v_attempt integer;
    v_step integer;
    v_steps integer := 28 + greatest(1, least(50, p_level)) * 5;
    v_temp integer;
begin
    for v_step in 1..v_steps loop
        for v_attempt in 0..3 loop
            v_direction := (p_level * 11 + v_step * 7 + v_attempt * 3) % 4;
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

    return to_jsonb(v_board);
end;
$$;

create or replace function public.get_fifteen_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_now timestamptz := clock_timestamp();
    v_progress public.fifteen_progress%rowtype;
begin
    if v_user_id is null then raise exception 'NOT_AUTHENTICATED'; end if;
    if not exists (
        select 1 from public.profiles
        where id = v_user_id and banned = false
    ) then
        raise exception 'PROFILE_NOT_FOUND_OR_BANNED';
    end if;

    select * into v_progress
    from public.fifteen_progress
    where user_id = v_user_id;

    if not found then
        insert into public.fifteen_progress (user_id, board)
        values (v_user_id, public.fifteen_initial_board(1))
        returning * into v_progress;
    end if;

    return jsonb_build_object(
        'success', true,
        'level', v_progress.current_level,
        'board', v_progress.board,
        'move_count', v_progress.move_count,
        'boost_until', v_progress.boost_until,
        'next_available_at', v_progress.next_available_at,
        'server_now', v_now
    );
end;
$$;

create or replace function public.reset_fifteen_level()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_now timestamptz := clock_timestamp();
    v_progress public.fifteen_progress%rowtype;
begin
    if v_user_id is null then raise exception 'NOT_AUTHENTICATED'; end if;

    select * into v_progress
    from public.fifteen_progress
    where user_id = v_user_id
    for update;

    if not found then
        perform public.get_fifteen_status();
        select * into v_progress
        from public.fifteen_progress
        where user_id = v_user_id
        for update;
    end if;

    if not coalesce(public.is_admin(), false)
       and v_progress.next_available_at > v_now then
        raise exception 'GAME_COOLDOWN';
    end if;

    update public.fifteen_progress
    set board = public.fifteen_initial_board(current_level),
        move_count = 0,
        updated_at = v_now
    where user_id = v_user_id
    returning * into v_progress;

    return jsonb_build_object(
        'success', true,
        'level', v_progress.current_level,
        'board', v_progress.board,
        'move_count', v_progress.move_count,
        'boost_until', v_progress.boost_until,
        'next_available_at', v_progress.next_available_at,
        'server_now', v_now
    );
end;
$$;

create or replace function public.move_fifteen(p_tile_index integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_now timestamptz := clock_timestamp();
    v_progress public.fifteen_progress%rowtype;
    v_board integer[];
    v_blank integer;
    v_tile integer;
    v_complete boolean;
    v_next_level integer;
    v_next_board jsonb;
    v_boost_until timestamptz;
    v_next_available_at timestamptz;
    v_nickname text;
    v_class_name text;
begin
    if v_user_id is null then raise exception 'NOT_AUTHENTICATED'; end if;
    if p_tile_index not between 0 and 15 then
        return jsonb_build_object('success', false, 'error', 'INVALID_TILE');
    end if;

    perform 1 from public.profiles
    where id = v_user_id and banned = false
    for update;
    if not found then raise exception 'PROFILE_NOT_FOUND_OR_BANNED'; end if;

    select * into v_progress
    from public.fifteen_progress
    where user_id = v_user_id
    for update;

    if not found then
        perform public.get_fifteen_status();
        select * into v_progress
        from public.fifteen_progress
        where user_id = v_user_id
        for update;
    end if;

    if not coalesce(public.is_admin(), false)
       and v_progress.next_available_at > v_now then
        return jsonb_build_object(
            'success', false,
            'error', 'GAME_COOLDOWN',
            'next_available_at', v_progress.next_available_at,
            'server_now', v_now
        );
    end if;

    select array_agg(value::integer order by ordinality)
    into v_board
    from jsonb_array_elements_text(v_progress.board)
         with ordinality as item(value, ordinality);

    select i into v_blank
    from generate_subscripts(v_board, 1) i
    where v_board[i] = 0;

    v_tile := p_tile_index + 1;

    if not (
        (abs(v_tile - v_blank) = 4)
        or (
            abs(v_tile - v_blank) = 1
            and ((v_tile - 1) / 4) = ((v_blank - 1) / 4)
        )
    ) then
        return jsonb_build_object('success', false, 'error', 'BLOCKED');
    end if;

    v_board[v_blank] := v_board[v_tile];
    v_board[v_tile] := 0;

    select bool_and(
        case when i < 16 then v_board[i] = i else v_board[i] = 0 end
    )
    into v_complete
    from generate_series(1, 16) i;

    if v_complete then
        v_next_level := (v_progress.current_level % 50) + 1;
        v_next_board := public.fifteen_initial_board(v_next_level);
        v_boost_until := greatest(
            coalesce(v_progress.boost_until, v_now),
            v_now
        ) + interval '10 minutes';

        if coalesce(public.is_admin(), false) then
            v_next_available_at := null;
        else
            v_next_available_at := v_now + interval '5 hours';
        end if;

        update public.fifteen_progress
        set current_level = v_next_level,
            board = v_next_board,
            move_count = 0,
            boost_until = v_boost_until,
            next_available_at = v_next_available_at,
            updated_at = v_now
        where user_id = v_user_id;

        if not coalesce(public.is_admin(), false) then
            select p.nickname, c.name
            into v_nickname, v_class_name
            from public.profiles p
            left join public.classes c on c.id = p.class_id
            where p.id = v_user_id;

            insert into public.chat_messages (
                user_id, message, message_type, created_at
            )
            values (
                null,
                format(
                    '🧩 %s [%s] собрал(а) «Пятнашки» и получил(а) Турбокисть на 10 минут!',
                    coalesce(v_nickname, 'Игрок'),
                    coalesce(v_class_name, '—')
                ),
                'system',
                v_now
            );
        end if;

        return jsonb_build_object(
            'success', true,
            'level_completed', true,
            'reward_granted', true,
            'level', v_next_level,
            'board', v_next_board,
            'move_count', 0,
            'boost_until', v_boost_until,
            'next_available_at', v_next_available_at,
            'server_now', v_now
        );
    end if;

    update public.fifteen_progress
    set board = to_jsonb(v_board),
        move_count = move_count + 1,
        updated_at = v_now
    where user_id = v_user_id
    returning * into v_progress;

    return jsonb_build_object(
        'success', true,
        'level_completed', false,
        'reward_granted', false,
        'level', v_progress.current_level,
        'board', v_progress.board,
        'move_count', v_progress.move_count,
        'boost_until', v_progress.boost_until,
        'next_available_at', v_progress.next_available_at,
        'server_now', v_now
    );
end;
$$;

-- Подключаем награду пятнашек к place_pixel. Обе колонки UNION
-- обязательны: active_until и active_cooldown. Это предотвращает ошибку 42601.
do $migration$
declare
    v_definition text;
    v_old text := $old$
        from public.sokoban_progress s
        where s.user_id = v_user_id
          and s.boost_until > v_now
    ) active_pixel_boosts;
$old$;
    v_new text := $new$
        from public.sokoban_progress s
        where s.user_id = v_user_id
          and s.boost_until > v_now

        union all

        select f.boost_until as active_until,
               1 as active_cooldown
        from public.fifteen_progress f
        where f.user_id = v_user_id
          and f.boost_until > v_now
    ) active_pixel_boosts;
$new$;
    v_occurrences integer;
begin
    select pg_get_functiondef(
        'public.place_pixel(integer,integer,text)'::regprocedure
    ) into v_definition;

    if position('from public.fifteen_progress f' in v_definition) = 0 then
        v_occurrences := (
            length(v_definition) - length(replace(v_definition, v_old, ''))
        ) / length(v_old);

        if v_occurrences <> 1 then
            raise exception
                'PLACE_PIXEL_BOOST_BLOCK_CHANGED: expected 1, found %',
                v_occurrences;
        end if;

        execute replace(v_definition, v_old, v_new);
    end if;

    select pg_get_functiondef(
        'public.place_pixel(integer,integer,text)'::regprocedure
    ) into v_definition;

    if position(
        'select f.boost_until as active_until,' in v_definition
    ) = 0 or position(
        '1 as active_cooldown' in
        substring(
            v_definition from position(
                'select f.boost_until as active_until,' in v_definition
            ) for 180
        )
    ) = 0 then
        raise exception 'FIFTEEN_BOOST_UNION_VALIDATION_FAILED';
    end if;
end;
$migration$;

revoke all on function public.fifteen_initial_board(integer)
    from public, anon, authenticated;
revoke all on function public.get_fifteen_status()
    from public, anon;
revoke all on function public.reset_fifteen_level()
    from public, anon;
revoke all on function public.move_fifteen(integer)
    from public, anon;

grant execute on function public.get_fifteen_status() to authenticated;
grant execute on function public.reset_fifteen_level() to authenticated;
grant execute on function public.move_fifteen(integer) to authenticated;

revoke all on function public.place_pixel(integer, integer, text)
    from public, anon;
grant execute on function public.place_pixel(integer, integer, text)
    to authenticated;

notify pgrst, 'reload schema';

commit;

select jsonb_build_object(
    'fifteen_ready', to_regclass('public.fifteen_progress') is not null,
    'place_pixel_boost_connected',
        position(
            'select f.boost_until as active_until,'
            in pg_get_functiondef(
                'public.place_pixel(integer,integer,text)'::regprocedure
            )
        ) > 0
) as fifteen_installation;
