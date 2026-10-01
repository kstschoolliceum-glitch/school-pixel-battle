-- Let active administrators see who placed the currently occupied pixel.

begin;

create or replace function public.admin_get_pixel_owner(
    p_season_id bigint,
    p_x integer,
    p_y integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
    v_owner record;
begin
    if auth.uid() is null or not exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'admin'
          and coalesce(p.banned, false) = false
    ) then
        raise exception 'ADMIN_REQUIRED';
    end if;

    if p_season_id is null
       or p_x < 0 or p_x >= 300
       or p_y < 0 or p_y >= 424
    then
        raise exception 'INVALID_PIXEL';
    end if;

    select
        px.user_id,
        p.username,
        p.nickname,
        c.name as class_name
    into v_owner
    from public.pixels px
    join public.profiles p
      on p.id = px.user_id
    left join public.classes c
      on c.id = px.class_id
    where px.season_id = p_season_id
      and px.x = p_x
      and px.y = p_y
    limit 1;

    if not found then
        return jsonb_build_object(
            'success', false,
            'reason', 'PIXEL_NOT_OCCUPIED'
        );
    end if;

    return jsonb_build_object(
        'success', true,
        'user_id', v_owner.user_id,
        'username', v_owner.username,
        'nickname', v_owner.nickname,
        'class_name', v_owner.class_name
    );
end;
$$;

revoke all on function public.admin_get_pixel_owner(bigint, integer, integer)
    from public, anon;
grant execute on function public.admin_get_pixel_owner(bigint, integer, integer)
    to authenticated;

notify pgrst, 'reload schema';

commit;

select jsonb_build_object(
    'admin_pixel_owner_rpc',
        to_regprocedure(
            'public.admin_get_pixel_owner(bigint,integer,integer)'
        ) is not null,
    'admin_only', true
) as result;
