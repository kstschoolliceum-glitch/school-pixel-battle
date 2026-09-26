begin;

-- Убирает рекурсивный запасной вызов, вызывавший stack depth limit exceeded.
create or replace function public.sokoban_level_rows(p_level integer)
returns jsonb
language sql
immutable
set search_path = public
as $sokoban_levels$
select case p_level
    when 1 then '["#######","#     #","#  .  #","#  $  #","#  @  #","#     #","#######"]'::jsonb
    when 2 then '["#######","# .   #","# $   #","#  @  #","#     #","#     #","#######"]'::jsonb
    when 3 then '["#######","# . . #","# $ $ #","#  @  #","#     #","#     #","#######"]'::jsonb
    when 4 then '["#######","#     #","#@$ . #","# $ . #","#     #","#     #","#######"]'::jsonb
    when 5 then '["#######","#  .  #","#  $  #","# # # #","#  @  #","#     #","#######"]'::jsonb
    when 6 then '["#######","# . . #","#     #","# $ $ #","#  @  #","#     #","#######"]'::jsonb
    when 7 then '["#######","#   . #","#   $ #","#  #  #","# @$  #","#  .  #","#######"]'::jsonb
    when 8 then '["#######","# . . #","# $ $ #","#     #","# #@# #","#     #","#######"]'::jsonb
    when 9 then '["#######","# . . #","#     #","# $$@ #","#     #","#     #","#######"]'::jsonb
    when 10 then '["#######","#  .. #","#  $$ #","# #   #","#  @  #","#     #","#######"]'::jsonb
    when 11 then '["#######","# . . #","# $#$ #","#  @  #","#     #","#     #","#######"]'::jsonb
    when 12 then '["#######","# . . #","#     #","# $#$ #","#  @  #","#     #","#######"]'::jsonb
    else '["#######","#     #","#  .  #","#  $  #","#  @  #","#     #","#######"]'::jsonb
end;
$sokoban_levels$;

revoke all on function public.sokoban_level_rows(integer)
    from public, anon, authenticated;

commit;
