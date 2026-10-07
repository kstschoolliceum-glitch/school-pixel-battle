begin;

create table if not exists public.game_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.game_settings enable row level security;

revoke all on table public.game_settings from anon, authenticated;
grant select on table public.game_settings to authenticated;

drop policy if exists "authenticated can read game settings" on public.game_settings;
create policy "authenticated can read game settings"
on public.game_settings for select to authenticated
using (true);

insert into public.game_settings(key, value)
values ('music_track', null)
on conflict (key) do nothing;

create or replace function public.set_music_track(p_file text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and banned = false
  ) then
    raise exception 'Admin access required';
  end if;

  if p_file is not null and p_file !~ '^assets/music/[A-Za-z0-9%().!~*''_-]+\.(mp3|ogg|m4a)$' then
    raise exception 'Invalid music track';
  end if;

  insert into public.game_settings(key, value, updated_at, updated_by)
  values ('music_track', p_file, now(), auth.uid())
  on conflict (key) do update
    set value = excluded.value,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.set_music_track(text) from public, anon;
grant execute on function public.set_music_track(text) to authenticated;

commit;
