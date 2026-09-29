-- Серверная защита общего чата от спама.
-- Ограничения действуют только на пользовательские сообщения.
-- Системные сообщения мини-игр не затрагиваются.

begin;

alter table public.chat_messages
    add column if not exists achievement_eligible boolean not null default true;

create index if not exists chat_messages_user_recent_idx
    on public.chat_messages (user_id, created_at desc)
    where message_type = 'user';

create or replace function public.enforce_chat_antispam()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_role text;
    v_normalized text;
    v_last_at timestamptz;
    v_window_count integer := 0;
    v_window_first timestamptz;
    v_wait_seconds integer := 0;
begin
    if coalesce(new.message_type, 'user') <> 'user' then
        return new;
    end if;

    if v_user_id is null or new.user_id is distinct from v_user_id then
        raise exception 'CHAT_NOT_AUTHENTICATED';
    end if;

    select p.role
    into v_role
    from public.profiles p
    where p.id = v_user_id
      and coalesce(p.banned, false) = false;

    if not found then
        raise exception 'CHAT_PROFILE_NOT_FOUND_OR_BANNED';
    end if;

    new.message := btrim(regexp_replace(coalesce(new.message, ''), '\s+', ' ', 'g'));
    v_normalized := lower(new.message);

    if char_length(v_normalized) < 2 then
        raise exception 'CHAT_TOO_SHORT';
    end if;

    if char_length(new.message) > 200 then
        raise exception 'CHAT_TOO_LONG';
    end if;

    -- Администратору серия сообщений может понадобиться для модерации.
    if v_role <> 'admin' then
        perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

        select max(cm.created_at)
        into v_last_at
        from public.chat_messages cm
        where cm.user_id = v_user_id
          and cm.message_type = 'user';

        if v_last_at is not null
           and v_last_at > clock_timestamp() - interval '4 seconds' then
            v_wait_seconds := greatest(
                1,
                ceil(extract(epoch from (
                    v_last_at + interval '4 seconds' - clock_timestamp()
                )))::integer
            );
            raise exception 'CHAT_WAIT:%', v_wait_seconds;
        end if;

        select count(*)::integer, min(cm.created_at)
        into v_window_count, v_window_first
        from public.chat_messages cm
        where cm.user_id = v_user_id
          and cm.message_type = 'user'
          and cm.created_at > clock_timestamp() - interval '2 minutes';

        if v_window_count >= 6 then
            v_wait_seconds := greatest(
                1,
                ceil(extract(epoch from (
                    v_window_first + interval '2 minutes' - clock_timestamp()
                )))::integer
            );
            raise exception 'CHAT_RATE_LIMIT:%', v_wait_seconds;
        end if;

        if exists (
            select 1
            from public.chat_messages cm
            where cm.user_id = v_user_id
              and cm.message_type = 'user'
              and cm.created_at > clock_timestamp() - interval '10 minutes'
              and lower(btrim(regexp_replace(cm.message, '\s+', ' ', 'g')))
                    = v_normalized
        ) then
            raise exception 'CHAT_DUPLICATE';
        end if;
    end if;

    -- В достижения идут содержательные сообщения и не чаще одного за 30 секунд.
    new.achievement_eligible :=
        char_length(v_normalized) >= 5
        and (
            v_role = 'admin'
            or not exists (
                select 1
                from public.chat_messages cm
                where cm.user_id = v_user_id
                  and cm.message_type = 'user'
                  and cm.achievement_eligible = true
                  and cm.created_at > clock_timestamp() - interval '30 seconds'
            )
        );

    return new;
end;
$$;

drop trigger if exists enforce_chat_antispam_trigger
    on public.chat_messages;
create trigger enforce_chat_antispam_trigger
before insert
on public.chat_messages
for each row
execute function public.enforce_chat_antispam();

revoke all on function public.enforce_chat_antispam()
    from public, anon, authenticated;

do $patch_chat_achievements$
declare
    v_signature text;
    v_definition text;
    v_old text := 'and cm.message_type = ''user''';
    v_new text :=
        'and cm.message_type = ''user'''
        || E'\n      '
        || 'and cm.achievement_eligible = true';
    v_occurrences integer;
begin
    foreach v_signature in array array[
        'public.get_player_card_base(uuid)',
        'public.get_fun_achievements(uuid)',
        'public.get_medium_achievements(uuid)'
    ]
    loop
        if to_regprocedure(v_signature) is null then
            raise exception 'CHAT_ACHIEVEMENT_FUNCTION_MISSING:%', v_signature;
        end if;

        select pg_get_functiondef(to_regprocedure(v_signature))
        into v_definition;

        if position('cm.achievement_eligible = true' in v_definition) = 0 then
            v_occurrences := (
                length(v_definition)
                - length(replace(v_definition, v_old, ''))
            ) / length(v_old);

            if v_occurrences < 1 then
                raise exception
                    'CHAT_ACHIEVEMENT_MARKER_MISSING:%',
                    v_signature;
            end if;

            execute replace(v_definition, v_old, v_new);
        end if;
    end loop;
end;
$patch_chat_achievements$;

notify pgrst, 'reload schema';

commit;
