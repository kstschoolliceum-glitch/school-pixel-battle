begin;

-- Extend the existing one-row global setting; tracks 0..3 exist in every
-- playlist shipped with the application.
alter table public.game_music_settings
  add column track_index integer not null default 0
  check (track_index between 0 and 3);

create or replace function public.admin_set_music_selection(
  p_theme_id text,
  p_track_index integer
)
returns jsonb
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
     or p_track_index is null or p_track_index not between 0 and 3
  then raise exception 'INVALID_MUSIC_SELECTION'; end if;

  update public.game_music_settings
  set theme_id = p_theme_id, track_index = p_track_index,
      updated_at = clock_timestamp()
  where id = true;
  return pg_catalog.jsonb_build_object(
    'theme_id', p_theme_id, 'track_index', p_track_index
  );
end;
$$;

revoke execute on function public.admin_set_music_selection(text,integer)
  from public, anon, authenticated;
grant execute on function public.admin_set_music_selection(text,integer)
  to authenticated;
-- Retire the old theme-only endpoint so every new selection is atomic.
revoke execute on function public.admin_set_music_theme(text)
  from public, anon, authenticated;

commit;
