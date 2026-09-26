begin;

-- Unblock Me: новая попытка и новая награда каждые 6 часов после победы.
-- Таблица остаётся совместимой с ранее установленной ежедневной версией.

create or replace function public.get_unblock_me_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_now timestamptz := clock_timestamp();
    v_game public.unblock_me_daily%rowtype;
    v_next_available_at timestamptz;
begin
    if v_user_id is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    if not exists (
        select 1 from public.profiles
        where id = v_user_id and banned = false
    ) then
        raise exception 'PROFILE_NOT_FOUND_OR_BANNED';
    end if;

    select *
    into v_game
    from public.unblock_me_daily
    where user_id = v_user_id
    order by started_at desc
    limit 1;

    if found and v_game.completed_at is not null then
        v_next_available_at := v_game.completed_at + interval '6 hours';
    end if;

    return jsonb_build_object(
        'available', true,
        'state', case
            when not found then 'available'
            when v_game.completed_at is null then 'started'
            when v_next_available_at <= v_now then 'available'
            else 'completed'
        end,
        'game_date', v_game.game_date,
        'puzzle', coalesce(
            v_game.puzzle,
            public.unblock_me_puzzle_for(
                v_user_id,
                (v_now at time zone 'Asia/Almaty')::date
            )
        ),
        'started_at', v_game.started_at,
        'completed_at', v_game.completed_at,
        'move_count', v_game.move_count,
        'boost_until', v_game.boost_until,
        'next_available_at', v_next_available_at,
        'server_now', v_now
    );
end;
$$;

create or replace function public.start_unblock_me()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_now timestamptz := clock_timestamp();
    v_date date := (v_now at time zone 'Asia/Almaty')::date;
    v_game public.unblock_me_daily%rowtype;
    v_next_available_at timestamptz;
    v_puzzle integer;
begin
    if v_user_id is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    perform 1
    from public.profiles
    where id = v_user_id
      and banned = false
    for update;

    if not found then
        raise exception 'PROFILE_NOT_FOUND_OR_BANNED';
    end if;

    select *
    into v_game
    from public.unblock_me_daily
    where user_id = v_user_id
    order by started_at desc
    limit 1
    for update;

    if found and v_game.completed_at is null then
        return jsonb_build_object(
            'success', true,
            'state', 'started',
            'game_date', v_game.game_date,
            'puzzle', v_game.puzzle,
            'started_at', v_game.started_at,
            'completed_at', null,
            'move_count', null,
            'boost_until', null,
            'next_available_at', null,
            'server_now', v_now
        );
    end if;

    if found and v_game.completed_at + interval '6 hours' > v_now then
        v_next_available_at := v_game.completed_at + interval '6 hours';
        return jsonb_build_object(
            'success', true,
            'state', 'completed',
            'game_date', v_game.game_date,
            'puzzle', v_game.puzzle,
            'started_at', v_game.started_at,
            'completed_at', v_game.completed_at,
            'move_count', v_game.move_count,
            'boost_until', v_game.boost_until,
            'next_available_at', v_next_available_at,
            'server_now', v_now
        );
    end if;

    v_puzzle := case
        when found then (v_game.puzzle % 50) + 1
        else public.unblock_me_puzzle_for(v_user_id, v_date)
    end;

    insert into public.unblock_me_daily (
        user_id, game_date, puzzle, started_at,
        completed_at, move_count, boost_until
    )
    values (
        v_user_id, v_date, v_puzzle, v_now,
        null, null, null
    )
    on conflict (user_id, game_date) do update
    set puzzle = excluded.puzzle,
        started_at = excluded.started_at,
        completed_at = null,
        move_count = null,
        boost_until = null
    returning * into v_game;

    return jsonb_build_object(
        'success', true,
        'state', 'started',
        'game_date', v_game.game_date,
        'puzzle', v_game.puzzle,
        'started_at', v_game.started_at,
        'completed_at', null,
        'move_count', null,
        'boost_until', null,
        'next_available_at', null,
        'server_now', v_now
    );
end;
$$;

create or replace function public.finish_unblock_me(p_moves integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_now timestamptz := clock_timestamp();
    v_game public.unblock_me_daily%rowtype;
    v_boost_until timestamptz;
    v_next_available_at timestamptz;
    v_nickname text;
    v_class_name text;
begin
    if v_user_id is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    perform 1
    from public.profiles
    where id = v_user_id
      and banned = false
    for update;

    if not found then
        raise exception 'PROFILE_NOT_FOUND_OR_BANNED';
    end if;

    select *
    into v_game
    from public.unblock_me_daily
    where user_id = v_user_id
    order by started_at desc
    limit 1
    for update;

    if not found then
        raise exception 'GAME_NOT_STARTED';
    end if;

    if v_game.completed_at is not null then
        return jsonb_build_object(
            'success', true,
            'already_completed', true,
            'boost_until', v_game.boost_until,
            'next_available_at', v_game.completed_at + interval '6 hours',
            'server_now', v_now
        );
    end if;

    if p_moves is null or p_moves < 3 or p_moves > 200 then
        raise exception 'INVALID_MOVE_COUNT';
    end if;

    if v_now < v_game.started_at + interval '2 seconds' then
        raise exception 'GAME_COMPLETED_TOO_FAST';
    end if;

    v_boost_until := v_now + interval '10 minutes';
    v_next_available_at := v_now + interval '6 hours';

    update public.unblock_me_daily
    set completed_at = v_now,
        move_count = p_moves,
        boost_until = v_boost_until
    where user_id = v_user_id
      and game_date = v_game.game_date;

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
                '🎮 %s [%s] прошёл(ла) Unblock Me за %s ходов и получил(а) Турбокисть на 10 минут!',
                coalesce(v_nickname, 'Игрок'),
                coalesce(v_class_name, '—'),
                p_moves
            ),
            'system',
            v_now
        );
    end if;

    return jsonb_build_object(
        'success', true,
        'already_completed', false,
        'move_count', p_moves,
        'boost_until', v_boost_until,
        'next_available_at', v_next_available_at,
        'server_now', v_now
    );
end;
$$;

revoke all on function public.get_unblock_me_status() from public, anon;
revoke all on function public.start_unblock_me() from public, anon;
revoke all on function public.finish_unblock_me(integer) from public, anon;

grant execute on function public.get_unblock_me_status() to authenticated;
grant execute on function public.start_unblock_me() to authenticated;
grant execute on function public.finish_unblock_me(integer) to authenticated;

commit;
