begin;

-- Более сложные авторские карты: по 3 ящика на каждом уровне.
create or replace function public.sokoban_level_rows(p_level integer)
returns jsonb
language sql
immutable
set search_path = public
as $sokoban_levels$
select case p_level
    when 1 then '["########","#      #","#.$$#  #","#.  ## #","# # #  #","# .@$  #","#      #","########"]'::jsonb
    when 2 then '["########","#      #","# $ # @#","# ##.# #","#.  .  #","# $ $  #","#      #","########"]'::jsonb
    when 3 then '["########","#   .  #","# $#  .#","#   ## #","# #$#  #","#    $ #","#    + #","########"]'::jsonb
    when 4 then '["########","#  . + #","#  # # #","# $# # #","#      #","# $  $ #","#  .   #","########"]'::jsonb
    when 5 then '["########","#      #","# #  . #","# #$   #","#    # #","#*## # #","#@*    #","########"]'::jsonb
    when 6 then '["########","# .$+$ #","#   ##.#","# #  $ #","#   #  #","#    # #","#      #","########"]'::jsonb
    when 7 then '["########","#      #","#  $ #$#","# $##  #","#    ..#","#.#  # #","#  @   #","########"]'::jsonb
    when 8 then '["########","#      #","# $ #$ #","# #  $ #","# #.  @#","#    # #","# .  . #","########"]'::jsonb
    when 9 then '["########","#      #","#$ $   #","#  # # #","#.#. # #","#.   $ #","#    @ #","########"]'::jsonb
    when 10 then '["########","#    . #","# $   .#","#  # @ #","#. # # #","# ##$$ #","#      #","########"]'::jsonb
    when 11 then '["########","# $  . #","#  #   #","# #   +#","#   .  #","# $$ # #","#      #","########"]'::jsonb
    when 12 then '["########","#      #","# $ ## #","#  #.$ #","#.# @  #","# $  # #","#  .   #","########"]'::jsonb
    else '["########","#      #","#.$$#  #","#.  ## #","# # #  #","# .@$  #","#      #","########"]'::jsonb
end;
$sokoban_levels$;

-- Сбрасываем только текущую расстановку под новые карты.
-- Прогресс до следующей награды и уже выданная Турбокисть сохраняются.
update public.sokoban_progress
set player_row = (
        public.sokoban_initial_state(current_level) ->> 'player_row'
    )::integer,
    player_col = (
        public.sokoban_initial_state(current_level) ->> 'player_col'
    )::integer,
    boxes = public.sokoban_initial_state(current_level) -> 'boxes',
    move_count = 0,
    updated_at = clock_timestamp();

commit;
