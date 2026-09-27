-- Одноразово переносит итоговую карту текущей недели в следующую.
-- История установок намеренно не копируется: рейтинги и недельные
-- счётчики новой недели должны начинаться с нуля.

begin;

create table if not exists public.season_map_carryovers (
    source_season_id bigint primary key
        references public.seasons(id) on delete cascade,
    target_season_id bigint unique
        references public.seasons(id) on delete set null,
    requested_at timestamptz not null default clock_timestamp(),
    completed_at timestamptz,
    copied_pixels integer,
    constraint season_map_carryovers_different_seasons
        check (
            target_season_id is null
            or target_season_id <> source_season_id
        )
);

alter table public.season_map_carryovers enable row level security;

create or replace function public.carry_pending_season_map()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_source_season_id bigint;
    v_copied_pixels integer := 0;
begin
    if new.is_active is not true then
        return new;
    end if;

    select c.source_season_id
    into v_source_season_id
    from public.season_map_carryovers c
    join public.seasons source_season
      on source_season.id = c.source_season_id
    where c.completed_at is null
      and c.target_season_id is null
      and c.source_season_id <> new.id
      and source_season.starts_at < new.starts_at
    order by c.requested_at
    limit 1
    for update of c;

    if v_source_season_id is null then
        return new;
    end if;

    -- Существующие клетки цели имеют приоритет. Обычно новая карта пуста,
    -- но ON CONFLICT делает повторный/запоздалый запуск безопасным.
    insert into public.pixels (
        season_id,
        x,
        y,
        color,
        user_id,
        class_id,
        updated_at
    )
    select
        new.id,
        p.x,
        p.y,
        p.color,
        p.user_id,
        p.class_id,
        clock_timestamp()
    from public.pixels p
    where p.season_id = v_source_season_id
    on conflict do nothing;

    get diagnostics v_copied_pixels = row_count;

    update public.season_map_carryovers
    set
        target_season_id = new.id,
        completed_at = clock_timestamp(),
        copied_pixels = v_copied_pixels
    where source_season_id = v_source_season_id
      and completed_at is null;

    return new;
end;
$$;

revoke all on function public.carry_pending_season_map()
from public, anon, authenticated;

drop trigger if exists carry_pending_season_map_trigger
on public.seasons;

create trigger carry_pending_season_map_trigger
after insert or update of is_active
on public.seasons
for each row
execute function public.carry_pending_season_map();

-- Фиксируем активную сейчас 4-ю неделю как источник переноса.
-- Запись будет использована только один раз при активации следующего сезона.
insert into public.season_map_carryovers (source_season_id)
select s.id
from public.seasons s
where s.is_active = true
  and s.starts_at <= clock_timestamp()
  and s.ends_at > clock_timestamp()
order by s.starts_at desc
limit 1
on conflict (source_season_id) do nothing;

do $$
begin
    if not exists (
        select 1
        from public.season_map_carryovers
        where completed_at is null
    ) then
        raise exception 'ACTIVE_SOURCE_SEASON_NOT_FOUND';
    end if;
end
$$;

commit;
