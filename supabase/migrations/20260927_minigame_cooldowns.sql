begin;

-- Unblock Me: новая попытка строго через 3 часа после победы.
do $unblock_cooldown$
declare
    v_signature regprocedure;
    v_definition text;
    v_updated text;
begin
    foreach v_signature in array array[
        'public.get_unblock_me_status()'::regprocedure,
        'public.start_unblock_me()'::regprocedure,
        'public.finish_unblock_me(integer)'::regprocedure
    ]
    loop
        select pg_get_functiondef(v_signature) into v_definition;
        v_updated := replace(
            v_definition,
            'interval ''6 hours''',
            'interval ''3 hours'''
        );

        if v_updated = v_definition then
            raise exception 'UNBLOCK_COOLDOWN_MARKER_NOT_FOUND: %', v_signature;
        end if;

        execute v_updated;
    end loop;
end;
$unblock_cooldown$;

-- Ящики: после каждой третьей победы игра закрывается строго на 4 часа.
alter table public.sokoban_progress
    add column if not exists next_available_at timestamptz;

create or replace function public.get_sokoban_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_now timestamptz := clock_timestamp();
    v_progress public.sokoban_progress%rowtype;
    v_initial jsonb;
begin
    if v_user_id is null then raise exception 'NOT_AUTHENTICATED'; end if;
    if not exists (select 1 from public.profiles where id = v_user_id and banned = false) then
        raise exception 'PROFILE_NOT_FOUND_OR_BANNED';
    end if;

    select * into v_progress from public.sokoban_progress where user_id = v_user_id;
    if not found then
        v_initial := public.sokoban_initial_state(1);
        insert into public.sokoban_progress (
            user_id, current_level, player_row, player_col, boxes
        ) values (
            v_user_id, 1,
            (v_initial ->> 'player_row')::integer,
            (v_initial ->> 'player_col')::integer,
            v_initial -> 'boxes'
        ) returning * into v_progress;
    end if;

    return jsonb_build_object(
        'success', true,
        'level', v_progress.current_level,
        'completed_in_reward', v_progress.completed_in_reward,
        'player_row', v_progress.player_row,
        'player_col', v_progress.player_col,
        'boxes', v_progress.boxes,
        'move_count', v_progress.move_count,
        'layout', public.sokoban_level_rows(v_progress.current_level),
        'boost_until', v_progress.boost_until,
        'next_available_at', v_progress.next_available_at,
        'server_now', v_now
    );
end;
$$;

create or replace function public.reset_sokoban_level()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_now timestamptz := clock_timestamp();
    v_progress public.sokoban_progress%rowtype;
    v_initial jsonb;
begin
    if v_user_id is null then raise exception 'NOT_AUTHENTICATED'; end if;
    select * into v_progress
    from public.sokoban_progress
    where user_id = v_user_id
    for update;
    if not found then
        perform public.get_sokoban_status();
        select * into v_progress from public.sokoban_progress where user_id = v_user_id for update;
    end if;

    if v_progress.next_available_at is not null
       and v_progress.next_available_at > v_now then
        raise exception 'GAME_COOLDOWN';
    end if;

    v_initial := public.sokoban_initial_state(v_progress.current_level);
    update public.sokoban_progress
    set player_row = (v_initial ->> 'player_row')::integer,
        player_col = (v_initial ->> 'player_col')::integer,
        boxes = v_initial -> 'boxes',
        move_count = 0,
        updated_at = clock_timestamp()
    where user_id = v_user_id
    returning * into v_progress;

    return jsonb_build_object(
        'success', true,
        'level', v_progress.current_level,
        'completed_in_reward', v_progress.completed_in_reward,
        'player_row', v_progress.player_row,
        'player_col', v_progress.player_col,
        'boxes', v_progress.boxes,
        'move_count', v_progress.move_count,
        'layout', public.sokoban_level_rows(v_progress.current_level),
        'boost_until', v_progress.boost_until,
        'next_available_at', v_progress.next_available_at,
        'server_now', v_now
    );
end;
$$;

create or replace function public.move_sokoban(p_direction text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_now timestamptz := clock_timestamp();
    v_progress public.sokoban_progress%rowtype;
    v_rows jsonb;
    v_dr integer := 0;
    v_dc integer := 0;
    v_next_r integer;
    v_next_c integer;
    v_box_r integer;
    v_box_c integer;
    v_cell text;
    v_boxes jsonb;
    v_completed boolean;
    v_reward boolean := false;
    v_completed_count integer;
    v_next_level integer;
    v_initial jsonb;
    v_boost_until timestamptz;
    v_next_available_at timestamptz;
    v_nickname text;
    v_class_name text;
begin
    if v_user_id is null then raise exception 'NOT_AUTHENTICATED'; end if;
    if p_direction = 'up' then v_dr := -1;
    elsif p_direction = 'down' then v_dr := 1;
    elsif p_direction = 'left' then v_dc := -1;
    elsif p_direction = 'right' then v_dc := 1;
    else raise exception 'INVALID_DIRECTION';
    end if;

    perform 1 from public.profiles where id = v_user_id and banned = false for update;
    if not found then raise exception 'PROFILE_NOT_FOUND_OR_BANNED'; end if;

    select * into v_progress
    from public.sokoban_progress
    where user_id = v_user_id
    for update;

    if not found then
        perform public.get_sokoban_status();
        select * into v_progress from public.sokoban_progress where user_id = v_user_id for update;
    end if;

    if v_progress.next_available_at is not null
       and v_progress.next_available_at > v_now then
        return jsonb_build_object(
            'success', false,
            'error', 'GAME_COOLDOWN',
            'next_available_at', v_progress.next_available_at,
            'server_now', v_now
        );
    end if;

    v_rows := public.sokoban_level_rows(v_progress.current_level);
    v_next_r := v_progress.player_row + v_dr;
    v_next_c := v_progress.player_col + v_dc;

    if v_next_r < 0 or v_next_r >= jsonb_array_length(v_rows)
       or v_next_c < 0 or v_next_c >= length(v_rows ->> v_next_r) then
        return jsonb_build_object('success', false, 'error', 'BLOCKED');
    end if;

    v_cell := substr(v_rows ->> v_next_r, v_next_c + 1, 1);
    if v_cell = '#' then
        return jsonb_build_object('success', false, 'error', 'BLOCKED');
    end if;

    if exists (
        select 1 from jsonb_array_elements(v_progress.boxes) b
        where (b ->> 'r')::integer = v_next_r
          and (b ->> 'c')::integer = v_next_c
    ) then
        v_box_r := v_next_r + v_dr;
        v_box_c := v_next_c + v_dc;
        if v_box_r < 0 or v_box_r >= jsonb_array_length(v_rows)
           or v_box_c < 0 or v_box_c >= length(v_rows ->> v_box_r)
           or substr(v_rows ->> v_box_r, v_box_c + 1, 1) = '#'
           or exists (
               select 1 from jsonb_array_elements(v_progress.boxes) b
               where (b ->> 'r')::integer = v_box_r
                 and (b ->> 'c')::integer = v_box_c
           ) then
            return jsonb_build_object('success', false, 'error', 'BLOCKED');
        end if;

        select coalesce(jsonb_agg(
            case
                when (b ->> 'r')::integer = v_next_r
                 and (b ->> 'c')::integer = v_next_c
                then jsonb_build_object('r', v_box_r, 'c', v_box_c)
                else b
            end
        ), '[]'::jsonb)
        into v_boxes
        from jsonb_array_elements(v_progress.boxes) b;
    else
        v_boxes := v_progress.boxes;
    end if;

    v_completed := not exists (
        select 1
        from jsonb_array_elements(v_boxes) b
        where substr(
            v_rows ->> (b ->> 'r')::integer,
            (b ->> 'c')::integer + 1,
            1
        ) not in ('.', '+', '*')
    );

    if v_completed then
        v_completed_count := v_progress.completed_in_reward + 1;
        v_reward := v_completed_count >= 3;
        if v_reward then
            v_completed_count := 0;
            v_boost_until := greatest(coalesce(v_progress.boost_until, v_now), v_now) + interval '10 minutes';
            v_next_available_at := v_now + interval '4 hours';
        else
            v_boost_until := v_progress.boost_until;
            v_next_available_at := v_progress.next_available_at;
        end if;

        v_next_level := (v_progress.current_level % 12) + 1;
        v_initial := public.sokoban_initial_state(v_next_level);

        update public.sokoban_progress
        set current_level = v_next_level,
            completed_in_reward = v_completed_count,
            player_row = (v_initial ->> 'player_row')::integer,
            player_col = (v_initial ->> 'player_col')::integer,
            boxes = v_initial -> 'boxes',
            move_count = 0,
            boost_until = v_boost_until,
            next_available_at = v_next_available_at,
            updated_at = v_now
        where user_id = v_user_id;

        if v_reward and not coalesce(public.is_admin(), false) then
            select p.nickname, c.name into v_nickname, v_class_name
            from public.profiles p
            left join public.classes c on c.id = p.class_id
            where p.id = v_user_id;

            insert into public.chat_messages (user_id, message, message_type, created_at)
            values (
                null,
                format(
                    '📦 %s [%s] прошёл(ла) 3 уровня игры «Ящики» и получил(а) Турбокисть на 10 минут!',
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
            'reward_granted', v_reward,
            'level', v_next_level,
            'completed_in_reward', v_completed_count,
            'player_row', (v_initial ->> 'player_row')::integer,
            'player_col', (v_initial ->> 'player_col')::integer,
            'boxes', v_initial -> 'boxes',
            'move_count', 0,
            'layout', public.sokoban_level_rows(v_next_level),
            'boost_until', v_boost_until,
            'next_available_at', v_next_available_at,
            'server_now', v_now
        );
    end if;

    update public.sokoban_progress
    set player_row = v_next_r,
        player_col = v_next_c,
        boxes = v_boxes,
        move_count = move_count + 1,
        updated_at = v_now
    where user_id = v_user_id
    returning * into v_progress;

    return jsonb_build_object(
        'success', true,
        'level_completed', false,
        'reward_granted', false,
        'level', v_progress.current_level,
        'completed_in_reward', v_progress.completed_in_reward,
        'player_row', v_progress.player_row,
        'player_col', v_progress.player_col,
        'boxes', v_progress.boxes,
        'move_count', v_progress.move_count,
        'layout', v_rows,
        'boost_until', v_progress.boost_until,
        'next_available_at', v_progress.next_available_at,
        'server_now', v_now
    );
end;
$$;

revoke all on function public.get_sokoban_status() from public, anon;
revoke all on function public.reset_sokoban_level() from public, anon;
revoke all on function public.move_sokoban(text) from public, anon;

grant execute on function public.get_sokoban_status() to authenticated;
grant execute on function public.reset_sokoban_level() to authenticated;
grant execute on function public.move_sokoban(text) to authenticated;

commit;
