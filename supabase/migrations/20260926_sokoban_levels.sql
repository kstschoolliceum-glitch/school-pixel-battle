begin;

create table if not exists public.sokoban_progress (
    user_id uuid primary key references public.profiles(id) on delete cascade,
    current_level integer not null default 1 check (current_level between 1 and 12),
    completed_in_reward integer not null default 0 check (completed_in_reward between 0 and 2),
    player_row integer not null default 0,
    player_col integer not null default 0,
    boxes jsonb not null default '[]'::jsonb,
    move_count integer not null default 0 check (move_count >= 0),
    boost_until timestamptz,
    updated_at timestamptz not null default clock_timestamp()
);

alter table public.sokoban_progress enable row level security;
revoke all on table public.sokoban_progress from public, anon, authenticated;

create or replace function public.sokoban_level_rows(p_level integer)
returns jsonb
language sql
immutable
set search_path = public
as $$
select case p_level
    when 1 then '["#######","#     #","#  .  #","#  $  #","#  @  #","#     #","#######"]'::jsonb
    when 2 then '["#######","# .   #","# $   #","#  @  #","#     #","#     #","#######"]'::jsonb
    when 3 then '["#######","# . . #","# $ $ #","#  @  #","#     #","#     #","#######"]'::jsonb
    when 4 then '["#######","#     #","#@$ . #","# $ . #","#     #","#     #","#######"]'::jsonb
    when 5 then '["#######","#  .  #","#  $  #","# # # #","#  @  #","#     #","#######"]'::jsonb
    when 6 then '["#######","# . . #","# $ $ #","# # # #","#  @  #","#     #","#######"]'::jsonb
    when 7 then '["#######","#   . #","#   $ #","#  #  #","# @$  #","#  .  #","#######"]'::jsonb
    when 8 then '["#######","# .   #","# $ # #","#   $ #","# # . #","#  @  #","#######"]'::jsonb
    when 9 then '["#######","# . . #","#     #","# $$@ #","#     #","#     #","#######"]'::jsonb
    when 10 then '["#######","#  .. #","#  $$ #","# #   #","#  @  #","#     #","#######"]'::jsonb
    when 11 then '["#######","# . . #","# $#$ #","#  @  #","#     #","#     #","#######"]'::jsonb
    when 12 then '["#######","# . . #","#     #","# $#$ #","#  @  #","#     #","#######"]'::jsonb
    else public.sokoban_level_rows(1)
end;
$$;

create or replace function public.sokoban_initial_state(p_level integer)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
    v_rows jsonb := public.sokoban_level_rows(p_level);
    v_boxes jsonb := '[]'::jsonb;
    v_player_row integer := 0;
    v_player_col integer := 0;
    v_row text;
    v_char text;
    r integer;
    c integer;
begin
    for r in 0..jsonb_array_length(v_rows) - 1 loop
        v_row := v_rows ->> r;
        for c in 0..length(v_row) - 1 loop
            v_char := substr(v_row, c + 1, 1);
            if v_char in ('@', '+') then
                v_player_row := r;
                v_player_col := c;
            end if;
            if v_char in ('$', '*') then
                v_boxes := v_boxes || jsonb_build_array(jsonb_build_object('r', r, 'c', c));
            end if;
        end loop;
    end loop;
    return jsonb_build_object(
        'player_row', v_player_row,
        'player_col', v_player_col,
        'boxes', v_boxes
    );
end;
$$;

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
        'server_now', clock_timestamp()
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
        else
            v_boost_until := v_progress.boost_until;
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
        'server_now', v_now
    );
end;
$$;

do $migration$
declare
    v_definition text;
    v_old text := $old$
    ) active_pixel_boosts;
$old$;
    v_new text := $new$

        union all

        select s.boost_until as active_until
        from public.sokoban_progress s
        where s.user_id = v_user_id
          and s.boost_until > v_now
    ) active_pixel_boosts;
$new$;
    v_occurrences integer;
begin
    select pg_get_functiondef(
        'public.place_pixel(integer,integer,text)'::regprocedure
    ) into v_definition;

    if position('from public.sokoban_progress s' in v_definition) = 0 then
        v_occurrences := (
            length(v_definition) - length(replace(v_definition, v_old, ''))
        ) / length(v_old);
        if v_occurrences <> 1 then
            raise exception 'PLACE_PIXEL_DEFINITION_CHANGED: boost marker found % times', v_occurrences;
        end if;
        execute replace(v_definition, v_old, v_new);
    end if;
end;
$migration$;

revoke all on function public.sokoban_level_rows(integer) from public, anon, authenticated;
revoke all on function public.sokoban_initial_state(integer) from public, anon, authenticated;
revoke all on function public.get_sokoban_status() from public, anon;
revoke all on function public.reset_sokoban_level() from public, anon;
revoke all on function public.move_sokoban(text) from public, anon;

grant execute on function public.get_sokoban_status() to authenticated;
grant execute on function public.reset_sokoban_level() to authenticated;
grant execute on function public.move_sokoban(text) to authenticated;

commit;
