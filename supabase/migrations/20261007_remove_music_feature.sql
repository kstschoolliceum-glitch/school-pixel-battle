begin;

drop function if exists public.set_music_track(text);
delete from public.game_settings where key = 'music_track';

commit;
