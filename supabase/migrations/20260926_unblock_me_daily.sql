begin;

-- Ежедневная мини-игра Unblock Me.
-- Одна награда в сутки по времени Казахстана; игровой процесс не использует Realtime.

create table if not exists public.unblock_me_daily (
    user_id uuid not null
        references public.profiles(id) on delete cascade,
    game_date date not null,
    puzzle integer not null
        check (puzzle between 1 and 50),
    started_at timestamptz not null default clock_timestamp(),
    completed_at timestamptz,
    move_count integer,
    boost_until timestamptz,
    primary key (user_id, game_date),
    check (move_count is null or move_count between 3 and 200),
    check (
        (completed_at is null and boost_until is null)
        or
        (completed_at is not null and boost_until is not null)
    )
);

create index if not exists unblock_me_daily_boost_idx
    on public.unblock_me_daily(user_id, boost_until)
    where boost_until is not null;

alter table public.unblock_me_daily enable row level security;
revoke all on table public.unblock_me_daily from public, anon, authenticated;

create or replace function public.unblock_me_puzzle_for(
    p_user_id uuid,
    p_date date
)
returns integer
language sql
immutable
set search_path = public
as $unblock_level$
    select (
        (
            hashtextextended(
                p_user_id::text || ':' || p_date::text,
                0
            ) & 9223372036854775807
        ) % 50 + 1
    )::integer;
$unblock_level$;

create or replace function public.get_unblock_me_status()
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
      and game_date = v_date;

    return jsonb_build_object(
        'available', true,
        'state', case
            when not found then 'available'
            when v_game.completed_at is not null then 'completed'
            else 'started'
        end,
        'game_date', v_date,
        'puzzle', coalesce(v_game.puzzle, public.unblock_me_puzzle_for(v_user_id, v_date)),
        'started_at', v_game.started_at,
        'completed_at', v_game.completed_at,
        'move_count', v_game.move_count,
        'boost_until', v_game.boost_until,
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

    insert into public.unblock_me_daily (
        user_id, game_date, puzzle, started_at
    )
    values (
        v_user_id, v_date, public.unblock_me_puzzle_for(v_user_id, v_date), v_now
    )
    on conflict (user_id, game_date) do nothing;

    select *
    into v_game
    from public.unblock_me_daily
    where user_id = v_user_id
      and game_date = v_date;

    return jsonb_build_object(
        'success', true,
        'state', case when v_game.completed_at is null then 'started' else 'completed' end,
        'game_date', v_game.game_date,
        'puzzle', v_game.puzzle,
        'started_at', v_game.started_at,
        'completed_at', v_game.completed_at,
        'move_count', v_game.move_count,
        'boost_until', v_game.boost_until,
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
    v_date date := (v_now at time zone 'Asia/Almaty')::date;
    v_game public.unblock_me_daily%rowtype;
    v_boost_until timestamptz;
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
      and game_date = v_date
    for update;

    if not found then
        raise exception 'GAME_NOT_STARTED';
    end if;

    if v_game.completed_at is not null then
        return jsonb_build_object(
            'success', true,
            'already_completed', true,
            'boost_until', v_game.boost_until,
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

    update public.unblock_me_daily
    set
        completed_at = v_now,
        move_count = p_moves,
        boost_until = v_boost_until
    where user_id = v_user_id
      and game_date = v_date;

    return jsonb_build_object(
        'success', true,
        'already_completed', false,
        'move_count', p_moves,
        'boost_until', v_boost_until,
        'server_now', v_now
    );
end;
$$;

-- Подключаем награду мини-игры к существующей проверке ускорения,
-- не переписывая рабочую функцию установки пикселя целиком.
do $migration$
declare
    v_definition text;
    v_old text := $old$
    ) active_pixel_boosts;
$old$;
    v_new text := $new$

        union all

        select g.boost_until as active_until
        from public.unblock_me_daily g
        where g.user_id = v_user_id
          and g.boost_until > v_now
    ) active_pixel_boosts;
$new$;
    v_occurrences integer;
begin
    select pg_get_functiondef(
        'public.place_pixel(integer,integer,text)'::regprocedure
    )
    into v_definition;

    v_occurrences := (
        length(v_definition) - length(replace(v_definition, v_old, ''))
    ) / length(v_old);

    if v_occurrences <> 1 then
        raise exception
            'PLACE_PIXEL_DEFINITION_CHANGED: expected boost union marker once, found %',
            v_occurrences;
    end if;

    if position('from public.unblock_me_daily g' in v_definition) = 0 then
        execute replace(v_definition, v_old, v_new);
    end if;
end;
$migration$;

revoke all on function public.get_unblock_me_status() from public, anon;
revoke all on function public.start_unblock_me() from public, anon;
revoke all on function public.finish_unblock_me(integer) from public, anon;

grant execute on function public.get_unblock_me_status() to authenticated;
grant execute on function public.start_unblock_me() to authenticated;
grant execute on function public.finish_unblock_me(integer) to authenticated;

revoke all on function public.place_pixel(integer, integer, text)
    from public, anon;
grant execute on function public.place_pixel(integer, integer, text)
    to authenticated;

commit;

select jsonb_build_object(
    'table_ready', to_regclass('public.unblock_me_daily') is not null,
    'status_rpc', to_regprocedure('public.get_unblock_me_status()') is not null,
    'start_rpc', to_regprocedure('public.start_unblock_me()') is not null,
    'finish_rpc', to_regprocedure('public.finish_unblock_me(integer)') is not null,
    'place_pixel_reads_game_reward',
        position(
            'from public.unblock_me_daily g'
            in pg_get_functiondef(
                'public.place_pixel(integer,integer,text)'::regprocedure
            )
        ) > 0
) as unblock_me_install_check;
