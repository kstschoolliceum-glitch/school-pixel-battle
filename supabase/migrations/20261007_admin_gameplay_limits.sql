-- Narrow, fail-closed adjustments to the deployed function bodies. If a function
-- differs from the reviewed migrations, abort instead of silently removing checks.
begin;
create or replace function public.is_gameplay_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and banned = false
  );
$$;
revoke all on function public.is_gameplay_admin() from public, anon, authenticated;

-- Keep each body and its locks, validation and ledger statements intact.
do $patch$
declare
  r record;
  definition text;
  old_text text;
  replacement text;
begin
  for r in
    select * from (values
      ('public.place_pixel(integer,integer,text)',
       'if v_profile.last_pixel_at is not null then',
       'if public.is_gameplay_admin() then v_cooldown_seconds := 0; end if;\n    if not public.is_gameplay_admin() and v_profile.last_pixel_at is not null then'),
      ('public.buy_map_item(text)',
       'if wallet_balance<price then',
       'if not public.is_gameplay_admin() and wallet_balance<price then'),
      ('public.buy_map_item(text)',
       'update public.pi_coin_wallets set balance=balance-price,updated_at=n where user_id=u;',
       'if not public.is_gameplay_admin() then update public.pi_coin_wallets set balance=balance-price,updated_at=n where user_id=u; end if;'),
      ('public.buy_map_item(text)',
       'insert into public.pi_coin_transactions(user_id,amount,reason,item_type)\n  values(u,-price,''item_purchase'',p_item_type);',
       'if not public.is_gameplay_admin() then insert into public.pi_coin_transactions(user_id,amount,reason,item_type)\n  values(u,-price,''item_purchase'',p_item_type); end if;'),
      ('public.get_map_item_status(bigint)',
       'select coalesce(role,''student'')=''admin'' into admin_user from public.profiles where id=u;',
       'select coalesce(role,''student'')=''admin'' and banned=false into admin_user from public.profiles where id=u;'),
      ('public.buy_pi_coin_turbo()',
       'if w.balance<price then',
       'if not public.is_gameplay_admin() and w.balance<price then'),
      ('public.buy_pi_coin_turbo()',
       'update public.pi_coin_wallets set balance=balance-price,updated_at=n where user_id=u;',
       'if not public.is_gameplay_admin() then update public.pi_coin_wallets set balance=balance-price,updated_at=n where user_id=u; end if;'),
      ('public.buy_pi_coin_turbo()',
       'insert into public.pi_coin_transactions(user_id,amount,reason)\n  values(u,-price,''turbo_purchase'');',
       'if not public.is_gameplay_admin() then insert into public.pi_coin_transactions(user_id,amount,reason)\n  values(u,-price,''turbo_purchase''); end if;'),
      ('public.use_map_bomb(integer,integer)',
       'if used>=2 then',
       'if not public.is_gameplay_admin() and used>=2 then'),
      ('public.place_map_beacon(integer,integer,text)',
       'if cnt>=3 then',
       'if not public.is_gameplay_admin() and cnt>=3 then'),
      ('public.place_map_beacon(integer,integer,text)',
       'if cnt>=10 then',
       'if not public.is_gameplay_admin() and cnt>=10 then'),
      ('public.start_unblock_me()',
       'if found and v_game.completed_at + interval ''3 hours'' > v_now then',
       'if found and not public.is_gameplay_admin() and v_game.completed_at + interval ''3 hours'' > v_now then'),
      ('public.get_unblock_me_status()',
       'when v_next_available_at <= v_now then ''available''',
       'when public.is_gameplay_admin() then ''available''\n            when v_next_available_at <= v_now then ''available'''),
      ('public.get_unblock_me_status()',
       '''next_available_at'', v_next_available_at,',
       '''next_available_at'', case when public.is_gameplay_admin() then null else v_next_available_at end,'),
      ('public.get_sokoban_status()',
       '''next_available_at'', v_progress.next_available_at,',
       '''next_available_at'', case when public.is_gameplay_admin() then null else v_progress.next_available_at end,'),
      ('public.move_sokoban(text)',
       'if v_progress.next_available_at is not null',
       'if not public.is_gameplay_admin() and v_progress.next_available_at is not null'),
      ('public.move_sokoban(text)',
       'v_next_available_at := v_now + interval ''4 hours'';',
       'v_next_available_at := case when public.is_gameplay_admin() then null else v_now + interval ''4 hours'' end;'),
      ('public.reset_sokoban_level()',
       'if v_progress.next_available_at is not null',
       'if not public.is_gameplay_admin() and v_progress.next_available_at is not null')
    ) as patches(signature, needle, substitute)
  loop
    definition := pg_get_functiondef(to_regprocedure(r.signature));
    if definition is null then raise exception 'Missing function: %', r.signature; end if;
    old_text := replace(r.needle, E'\\n', E'\n');
    replacement := replace(r.substitute, E'\\n', E'\n');
    if length(definition)-length(replace(definition,old_text,'')) <> length(old_text) then
      raise exception 'Unexpected function body for %: %', r.signature, old_text;
    end if;
    execute replace(definition,old_text,replacement);
  end loop;
end;
$patch$;
commit;
