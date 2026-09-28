-- Визитка игрока: приватное фото и серверная проверка достижений.

begin;

insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
values (
    'profile-photos',
    'profile-photos',
    false,
    2097152,
    array['image/webp']
)
on conflict (id) do update
set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile_photos_select_own" on storage.objects;
create policy "profile_photos_select_own"
on storage.objects
for select
to authenticated
using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile_photos_insert_own" on storage.objects;
create policy "profile_photos_insert_own"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile_photos_update_own" on storage.objects;
create policy "profile_photos_update_own"
on storage.objects
for update
to authenticated
using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile_photos_delete_own" on storage.objects;
create policy "profile_photos_delete_own"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.get_my_player_card()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_username text;
    v_nickname text;
    v_class_name text;
    v_active_season_id public.seasons.id%type;
    v_weekly_pixels bigint := 0;
    v_total_pixels bigint := 0;
begin
    if v_user_id is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    select
        p.username,
        p.nickname,
        coalesce(c.name, '—')
    into
        v_username,
        v_nickname,
        v_class_name
    from public.profiles p
    left join public.classes c on c.id = p.class_id
    where p.id = v_user_id
      and p.banned = false;

    if not found then
        raise exception 'PROFILE_NOT_FOUND';
    end if;

    select s.id
    into v_active_season_id
    from public.seasons s
    where s.is_active = true
      and s.status = 'active'
      and s.starts_at <= clock_timestamp()
      and s.ends_at > clock_timestamp()
    order by s.starts_at desc
    limit 1;

    select count(*)::bigint
    into v_total_pixels
    from public.pixel_history ph
    where ph.user_id = v_user_id;

    if v_active_season_id is not null then
        select count(*)::bigint
        into v_weekly_pixels
        from public.pixel_history ph
        where ph.user_id = v_user_id
          and ph.season_id = v_active_season_id;
    end if;

    return jsonb_build_object(
        'success', true,
        'username', v_username,
        'nickname', v_nickname,
        'class_name', v_class_name,
        'weekly_pixels', v_weekly_pixels,
        'total_pixels', v_total_pixels,
        'achievements', jsonb_build_array(
            jsonb_build_object(
                'id', 'first_pixel',
                'icon', '✨',
                'title', 'Первый пиксель',
                'description', 'Поставь свой первый пиксель',
                'unlocked', v_total_pixels >= 1,
                'progress', least(v_total_pixels, 1),
                'target', 1
            ),
            jsonb_build_object(
                'id', 'warm_up',
                'icon', '🎨',
                'title', 'Разминка',
                'description', 'Поставь 25 пикселей',
                'unlocked', v_total_pixels >= 25,
                'progress', least(v_total_pixels, 25),
                'target', 25
            ),
            jsonb_build_object(
                'id', 'pixel_hundred',
                'icon', '💯',
                'title', 'Сотня',
                'description', 'Поставь 100 пикселей',
                'unlocked', v_total_pixels >= 100,
                'progress', least(v_total_pixels, 100),
                'target', 100
            )
        )
    );
end;
$$;

revoke all on function public.get_my_player_card() from public, anon;
grant execute on function public.get_my_player_card() to authenticated;

notify pgrst, 'reload schema';

commit;
