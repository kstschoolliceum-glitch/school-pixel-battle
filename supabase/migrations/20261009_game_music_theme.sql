begin;

-- Only the selected playlist ID is stored in Supabase. Audio remains static.
create table public.game_music_settings (
  id boolean primary key default true check (id),
  theme_id text not null default 'default'
    check (theme_id in ('default','alternative','new_year','halloween',
      'february_23','summer','music','space','wedding','carnival')),
  updated_at timestamptz not null default clock_timestamp()
);
insert into public.game_music_settings (id, theme_id) values (true, 'default');
alter table public.game_music_settings enable row level security;
revoke all on public.game_music_settings from public, anon, authenticated;
grant select on public.game_music_settings to authenticated;
create policy "signed in users read music theme" on public.game_music_settings
  for select to authenticated using (auth.uid() is not null);

create or replace function public.admin_set_music_theme(p_theme_id text)
returns text
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and banned = false
  ) then raise exception 'ADMIN_REQUIRED'; end if;
  if p_theme_id is null or p_theme_id not in
    ('default','alternative','new_year','halloween','february_23',
      'summer','music','space','wedding','carnival')
  then raise exception 'INVALID_MUSIC_THEME'; end if;
  update public.game_music_settings
  set theme_id = p_theme_id, updated_at = clock_timestamp()
  where id = true;
  return p_theme_id;
end;
$$;
revoke execute on function public.admin_set_music_theme(text)
  from public, anon, authenticated;
grant execute on function public.admin_set_music_theme(text) to authenticated;

-- Publish just the one-row settings table, once. Realtime still respects RLS.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'game_music_settings'
  ) then
    alter publication supabase_realtime add table public.game_music_settings;
  end if;
end;
$$;
commit;
