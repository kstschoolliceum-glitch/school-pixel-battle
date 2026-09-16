begin;

-- Previously claimed but unused rewards now expire with their task day.
update public.daily_task_progress
set reward_expires_at = least(
    reward_expires_at,
    ((task_date + 1)::timestamp at time zone 'Asia/Almaty')
)
where reward_claimed_at is not null
  and boost_activated_at is null
  and reward_expires_at is not null;

create or replace function public.claim_daily_task_reward()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_now timestamptz := clock_timestamp();
    v_date date := (v_now at time zone 'Asia/Almaty')::date;
    v_next_midnight timestamptz := (
        (v_date + 1)::timestamp at time zone 'Asia/Almaty'
    );
    v_progress public.daily_task_progress%rowtype;
begin
    if v_user_id is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    perform 1
    from public.profiles
    where id = v_user_id
      and banned = false
    for update;

    if not found then
        raise exception 'PROFILE_NOT_FOUND_OR_BANNED';
    end if;

    select *
    into v_progress
    from public.daily_task_progress
    where user_id = v_user_id
      and task_date = v_date
    for update;

    if not found or v_progress.completed_at is null then
        raise exception 'DAILY_TASKS_NOT_COMPLETED';
    end if;

    if v_progress.reward_claimed_at is not null then
        raise exception 'REWARD_ALREADY_CLAIMED';
    end if;

    if exists (
        select 1
        from public.daily_task_progress p
        where p.user_id = v_user_id
          and p.reward_claimed_at is not null
          and (
              (p.boost_activated_at is null and p.reward_expires_at > v_now)
              or p.boost_until > v_now
          )
    ) then
        raise exception 'BOOST_ALREADY_STORED';
    end if;

    update public.daily_task_progress
    set
        reward_claimed_at = v_now,
        reward_expires_at = v_next_midnight
    where user_id = v_user_id
      and task_date = v_date;

    return jsonb_build_object(
        'success', true,
        'status', public.daily_task_status_for(v_user_id, v_now)
    );
end;
$$;

revoke all on function public.claim_daily_task_reward() from public, anon;
grant execute on function public.claim_daily_task_reward() to authenticated;

commit;

select jsonb_build_object(
    'function_name', p.proname,
    'resets_at_kazakhstan_midnight',
        pg_get_functiondef(p.oid) like '%v_next_midnight%'
) as daily_reward_reset_check
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'claim_daily_task_reward';
