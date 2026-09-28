-- Уменьшает серверный лимит готового фото визитки до 256 КБ.
-- Можно выполнять и после основной миграции визитки.

begin;

update storage.buckets
set file_size_limit = 262144
where id = 'profile-photos';

commit;
