-- Индексы для горячих запросов карты, рейтингов, чата и модерации.
-- Миграция не меняет данные, награды, cooldown или правила игр.

begin;

-- Загрузка карты идёт по одному сезону в порядке Y/X.
create index if not exists pixels_season_y_x_idx
    on public.pixels (season_id, y, x)
    include (color, class_id);

-- Рейтинги и ежедневные задания считают историю по времени,
-- пользователю и классу.
create index if not exists pixel_history_created_class_idx
    on public.pixel_history (created_at desc, class_id);

create index if not exists pixel_history_user_created_idx
    on public.pixel_history (user_id, created_at desc);

-- Последние сообщения общего чата.
create index if not exists chat_messages_created_idx
    on public.chat_messages (created_at desc);

-- Ограничение числа жалоб за последние 24 часа.
create index if not exists moderation_reports_reporter_created_idx
    on public.moderation_reports (reporter_id, created_at desc);

commit;
