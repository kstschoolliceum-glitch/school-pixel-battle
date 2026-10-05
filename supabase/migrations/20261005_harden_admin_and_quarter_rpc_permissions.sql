-- Restrict legacy client EXECUTE grants on administrative RPCs and
-- keep add_season_to_active_quarter(bigint) as an internal helper.
begin;

-- Internal helper: finish_season(bigint) calls this while running as the
-- SECURITY DEFINER owner. Revoking client-role EXECUTE does not affect that
-- owner-context PostgreSQL call.
revoke execute
on function public.add_season_to_active_quarter(bigint)
from public, anon, authenticated;

-- Administrative RPCs remain callable only by authenticated users.
-- Their existing server-side is_admin() checks remain the authorization gate.
revoke execute
on function
    public.get_admin_overview(),
    public.admin_generate_invites(bigint, integer, integer),
    public.admin_get_invite_stats(),
    public.admin_get_students(),
    public.admin_set_student_banned(uuid, boolean),
    public.admin_get_classes(),
    public.admin_create_class(text, integer),
    public.admin_set_class_active(bigint, boolean),
    public.start_quarter_competition(text),
    public.finish_quarter_competition()
from public, anon, authenticated;

grant execute
on function
    public.get_admin_overview(),
    public.admin_generate_invites(bigint, integer, integer),
    public.admin_get_invite_stats(),
    public.admin_get_students(),
    public.admin_set_student_banned(uuid, boolean),
    public.admin_get_classes(),
    public.admin_create_class(text, integer),
    public.admin_set_class_active(bigint, boolean),
    public.start_quarter_competition(text),
    public.finish_quarter_competition()
to authenticated;

-- The frontend uses is_admin() after authentication to decide whether to show
-- the admin interface. Anonymous callers do not need it.
revoke execute
on function public.is_admin()
from public, anon, authenticated;

grant execute
on function public.is_admin()
to authenticated;

-- Fail the migration if the resulting effective permission matrix is not the
-- intended one. has_function_privilege includes privileges inherited from
-- PUBLIC, so these checks also detect an accidental implicit PUBLIC grant.
do $permissions$
declare
    v_signature text;
    v_admin_signatures constant text[] := array[
        'public.get_admin_overview()',
        'public.admin_generate_invites(bigint,integer,integer)',
        'public.admin_get_invite_stats()',
        'public.admin_get_students()',
        'public.admin_set_student_banned(uuid,boolean)',
        'public.admin_get_classes()',
        'public.admin_create_class(text,integer)',
        'public.admin_set_class_active(bigint,boolean)',
        'public.start_quarter_competition(text)',
        'public.finish_quarter_competition()'
    ];
begin
    if has_function_privilege(
        'anon',
        'public.add_season_to_active_quarter(bigint)',
        'execute'
    ) or has_function_privilege(
        'authenticated',
        'public.add_season_to_active_quarter(bigint)',
        'execute'
    ) then
        raise exception
            'INVALID_PERMISSION_MATRIX:add_season_to_active_quarter';
    end if;

    foreach v_signature in array v_admin_signatures loop
        if has_function_privilege('anon', v_signature, 'execute')
           or not has_function_privilege(
               'authenticated',
               v_signature,
               'execute'
           ) then
            raise exception 'INVALID_ADMIN_RPC_PERMISSION:%', v_signature;
        end if;
    end loop;

    if has_function_privilege('anon', 'public.is_admin()', 'execute')
       or not has_function_privilege(
           'authenticated',
           'public.is_admin()',
           'execute'
       ) then
        raise exception 'INVALID_PERMISSION_MATRIX:is_admin';
    end if;
end;
$permissions$;

commit;

select *
from (
    values
        (
            'add_season_to_active_quarter(bigint)',
            has_function_privilege(
                'anon',
                'public.add_season_to_active_quarter(bigint)',
                'execute'
            ),
            has_function_privilege(
                'authenticated',
                'public.add_season_to_active_quarter(bigint)',
                'execute'
            )
        ),
        (
            'get_admin_overview()',
            has_function_privilege(
                'anon',
                'public.get_admin_overview()',
                'execute'
            ),
            has_function_privilege(
                'authenticated',
                'public.get_admin_overview()',
                'execute'
            )
        ),
        (
            'admin_generate_invites(bigint,integer,integer)',
            has_function_privilege(
                'anon',
                'public.admin_generate_invites(bigint,integer,integer)',
                'execute'
            ),
            has_function_privilege(
                'authenticated',
                'public.admin_generate_invites(bigint,integer,integer)',
                'execute'
            )
        ),
        (
            'admin_get_invite_stats()',
            has_function_privilege(
                'anon',
                'public.admin_get_invite_stats()',
                'execute'
            ),
            has_function_privilege(
                'authenticated',
                'public.admin_get_invite_stats()',
                'execute'
            )
        ),
        (
            'admin_get_students()',
            has_function_privilege(
                'anon',
                'public.admin_get_students()',
                'execute'
            ),
            has_function_privilege(
                'authenticated',
                'public.admin_get_students()',
                'execute'
            )
        ),
        (
            'admin_set_student_banned(uuid,boolean)',
            has_function_privilege(
                'anon',
                'public.admin_set_student_banned(uuid,boolean)',
                'execute'
            ),
            has_function_privilege(
                'authenticated',
                'public.admin_set_student_banned(uuid,boolean)',
                'execute'
            )
        ),
        (
            'admin_get_classes()',
            has_function_privilege(
                'anon',
                'public.admin_get_classes()',
                'execute'
            ),
            has_function_privilege(
                'authenticated',
                'public.admin_get_classes()',
                'execute'
            )
        ),
        (
            'admin_create_class(text,integer)',
            has_function_privilege(
                'anon',
                'public.admin_create_class(text,integer)',
                'execute'
            ),
            has_function_privilege(
                'authenticated',
                'public.admin_create_class(text,integer)',
                'execute'
            )
        ),
        (
            'admin_set_class_active(bigint,boolean)',
            has_function_privilege(
                'anon',
                'public.admin_set_class_active(bigint,boolean)',
                'execute'
            ),
            has_function_privilege(
                'authenticated',
                'public.admin_set_class_active(bigint,boolean)',
                'execute'
            )
        ),
        (
            'start_quarter_competition(text)',
            has_function_privilege(
                'anon',
                'public.start_quarter_competition(text)',
                'execute'
            ),
            has_function_privilege(
                'authenticated',
                'public.start_quarter_competition(text)',
                'execute'
            )
        ),
        (
            'finish_quarter_competition()',
            has_function_privilege(
                'anon',
                'public.finish_quarter_competition()',
                'execute'
            ),
            has_function_privilege(
                'authenticated',
                'public.finish_quarter_competition()',
                'execute'
            )
        ),
        (
            'is_admin()',
            has_function_privilege(
                'anon',
                'public.is_admin()',
                'execute'
            ),
            has_function_privilege(
                'authenticated',
                'public.is_admin()',
                'execute'
            )
        )
) as permission_matrix(
    function_signature,
    anon_execute,
    authenticated_execute
);