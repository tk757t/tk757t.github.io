-- 4 Mules : outils d'administration. Le rôle d'un compte (player, tester, vip, admin) est dans profiles.role ; il ne se donne que par ces fonctions
-- (ou, pour le tout premier administrateur, par une ligne SQL lancée par le propriétaire du projet : aucun pseudo n'est écrit dans le code).
-- Chaque fonction vérifie le rôle de l'appelant côté serveur ; le navigateur ne fait que cacher les boutons. Chaque action est inscrite dans admin_audit_log.

-- Le rôle de l'appelant : le jeu s'en sert pour montrer ou non les menus Admin et Testeur.
create function public.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select pr.role from public.profiles pr where pr.id = auth.uid()), 'player');
$$;
revoke all on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated;

-- Garde commune : connecté, et administrateur. N'est appelée que par les fonctions ci-dessous.
create function public.admin_guard() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.' using errcode = 'P0001';
  end if;
  if public.my_role() <> 'admin' then
    raise exception 'Réservé aux administrateurs.' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.admin_guard() from public, anon, authenticated;

create function public.admin_note(p_action text, p_target uuid, p_payload jsonb default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.admin_audit_log (actor, action, target, payload) values (auth.uid(), p_action, p_target, p_payload);
$$;
revoke all on function public.admin_note(text, uuid, jsonb) from public, anon, authenticated;

-- Les chiffres du jeu.
create function public.admin_stats()
returns table (accounts integer, with_pseudo integer, new_24h integer, online integer, suspended integer, muted integer, reports_pending integer, messages_hour integer, actions_hour integer)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  return query select
    (select count(*)::integer from public.profiles pr),
    (select count(*)::integer from public.profiles pr where pr.pseudo is not null),
    (select count(*)::integer from public.profiles pr where pr.created_at > now() - interval '24 hours'),
    (select count(*)::integer from public.presence pe where pe.seen_at > now() - interval '90 seconds'),
    (select count(*)::integer from public.suspensions su),
    (select count(*)::integer from public.chat_mutes mu where mu.until > now()),
    (select count(distinct r.message_id)::integer from public.chat_reports r join public.chat_messages cm on cm.id = r.message_id where not cm.hidden),
    (select count(*)::integer from public.chat_messages cm where cm.created_at > now() - interval '1 hour'),
    (select count(*)::integer from public.action_log al where al.created_at > now() - interval '1 hour');
end;
$$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;

-- Les joueurs avec un pseudo : les plus récents, ou ceux dont le pseudo commence par la recherche.
create function public.admin_players(p_query text default '', p_limit integer default 30)
returns table (id uuid, pseudo text, role text, created_at timestamptz, last_action timestamptz, suspension text, muted_until timestamptz, reports integer)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  return query
    select pr.id, pr.pseudo, pr.role, pr.created_at,
           (select max(al.created_at) from public.action_log al where al.user_id = pr.id),
           (select su.reason from public.suspensions su where su.user_id = pr.id),
           (select mu.until from public.chat_mutes mu where mu.user_id = pr.id and mu.until > now()),
           (select count(*)::integer from public.chat_reports r join public.chat_messages cm on cm.id = r.message_id where cm.sender = pr.id)
      from public.profiles pr
     where pr.pseudo is not null and (coalesce(p_query, '') = '' or starts_with(lower(pr.pseudo), lower(p_query)))
     order by pr.created_at desc
     limit least(greatest(coalesce(p_limit, 30), 1), 50);
end;
$$;
revoke all on function public.admin_players(text, integer) from public, anon;
grant execute on function public.admin_players(text, integer) to authenticated;

create function public.admin_set_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  prev_role text;
begin
  perform public.admin_guard();
  if p_role is null or p_role not in ('player', 'tester', 'vip', 'admin') then
    raise exception 'Rôle inconnu.' using errcode = 'P0001';
  end if;
  select pr.role into prev_role from public.profiles pr where pr.id = p_user;
  if prev_role is null then
    raise exception 'Joueur introuvable.' using errcode = 'P0001';
  end if;
  if prev_role = 'admin' and p_role <> 'admin' and (select count(*) from public.profiles pr where pr.role = 'admin') <= 1 then
    raise exception 'C’est le dernier administrateur : il ne peut pas perdre son rôle.' using errcode = 'P0001';
  end if;
  update public.profiles pr set role = p_role where pr.id = p_user;
  perform public.admin_note('role', p_user, jsonb_build_object('from', prev_role, 'to', p_role));
end;
$$;
revoke all on function public.admin_set_role(uuid, text) from public, anon;
grant execute on function public.admin_set_role(uuid, text) to authenticated;

-- Suspendre : le joueur garde sa partie et peut la lire, mais plus rien d'autre (jeu, file, chat) ; il sort de la file et ferme sa partie publique.
create function public.admin_suspend(p_user uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  why text := left(btrim(coalesce(p_reason, '')), 140);
begin
  perform public.admin_guard();
  if why = '' then
    raise exception 'Écrivez la raison de la suspension.' using errcode = 'P0001';
  end if;
  if p_user = auth.uid() then
    raise exception 'Vous ne pouvez pas vous suspendre vous-même.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles pr where pr.id = p_user) then
    raise exception 'Joueur introuvable.' using errcode = 'P0001';
  end if;
  if public.has_role(p_user, 'admin') then
    raise exception 'Un administrateur ne peut pas être suspendu : retirez-lui d’abord son rôle.' using errcode = 'P0001';
  end if;
  insert into public.suspensions (user_id, reason, by_admin) values (p_user, why, auth.uid())
  on conflict (user_id) do update set reason = excluded.reason, by_admin = excluded.by_admin, created_at = now();
  delete from public.ranked_queue q where q.user_id = p_user;
  delete from public.lobbies l where l.host = p_user;
  perform public.admin_note('suspend', p_user, jsonb_build_object('reason', why));
end;
$$;
revoke all on function public.admin_suspend(uuid, text) from public, anon;
grant execute on function public.admin_suspend(uuid, text) to authenticated;

create function public.admin_unsuspend(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  delete from public.suspensions su where su.user_id = p_user;
  perform public.admin_note('unsuspend', p_user, null);
end;
$$;
revoke all on function public.admin_unsuspend(uuid) from public, anon;
grant execute on function public.admin_unsuspend(uuid) to authenticated;

create function public.admin_mute(p_user uuid, p_minutes integer, p_reason text default '') returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  if p_user = auth.uid() or public.has_role(p_user, 'admin') then
    raise exception 'Un administrateur ne peut pas être réduit au silence.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles pr where pr.id = p_user) then
    raise exception 'Joueur introuvable.' using errcode = 'P0001';
  end if;
  perform public.chat_mute(p_user, p_minutes, p_reason);
  perform public.admin_note('mute', p_user, jsonb_build_object('minutes', p_minutes, 'reason', left(coalesce(p_reason, ''), 140)));
end;
$$;
revoke all on function public.admin_mute(uuid, integer, text) from public, anon;
grant execute on function public.admin_mute(uuid, integer, text) to authenticated;

create function public.admin_unmute(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  delete from public.chat_mutes mu where mu.user_id = p_user;
  perform public.admin_note('unmute', p_user, null);
end;
$$;
revoke all on function public.admin_unmute(uuid) from public, anon;
grant execute on function public.admin_unmute(uuid) to authenticated;

-- Les messages signalés : ceux qui attendent une décision d'abord, puis les autres.
create function public.admin_reports(p_limit integer default 30)
returns table (message_id bigint, body text, author uuid, author_pseudo text, reports integer, reasons text, hidden boolean, last_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  return query
    select cm.id, cm.body, cm.sender, cm.pseudo, count(r.id)::integer, string_agg(distinct r.reason, ', '), cm.hidden, max(r.created_at)
      from public.chat_messages cm
      join public.chat_reports r on r.message_id = cm.id
     group by cm.id
     order by cm.hidden asc, max(r.created_at) desc
     limit least(greatest(coalesce(p_limit, 30), 1), 50);
end;
$$;
revoke all on function public.admin_reports(integer) from public, anon;
grant execute on function public.admin_reports(integer) to authenticated;

create function public.admin_hide(p_message bigint, p_hidden boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  perform public.chat_hide(p_message, p_hidden);
  perform public.admin_note(case when coalesce(p_hidden, true) then 'hide' else 'unhide' end, null, jsonb_build_object('message', p_message));
end;
$$;
revoke all on function public.admin_hide(bigint, boolean) from public, anon;
grant execute on function public.admin_hide(bigint, boolean) to authenticated;

-- Écarter les signalements d'un message (il n'y a rien à lui reprocher).
create function public.admin_dismiss(p_message bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  delete from public.chat_reports r where r.message_id = p_message;
  perform public.admin_note('dismiss', null, jsonb_build_object('message', p_message));
end;
$$;
revoke all on function public.admin_dismiss(bigint) from public, anon;
grant execute on function public.admin_dismiss(bigint) to authenticated;

-- Les dernières actions d'un joueur (pour juger d'une triche ou d'un bogue).
create function public.admin_actions(p_user uuid, p_limit integer default 30)
returns table (at timestamptz, action text, summary text)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  return query
    select al.created_at, al.action, left(coalesce(al.summary::text, ''), 300)
      from public.action_log al
     where al.user_id = p_user
     order by al.created_at desc
     limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;
revoke all on function public.admin_actions(uuid, integer) from public, anon;
grant execute on function public.admin_actions(uuid, integer) to authenticated;

-- Le journal de ce que les administrateurs ont fait.
create function public.admin_audit(p_limit integer default 30)
returns table (at timestamptz, actor_pseudo text, action text, target_pseudo text, payload text)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  return query
    select au.created_at, pa.pseudo, au.action, pt.pseudo, left(coalesce(au.payload::text, ''), 200)
      from public.admin_audit_log au
      left join public.profiles pa on pa.id = au.actor
      left join public.profiles pt on pt.id = au.target
     order by au.created_at desc
     limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;
revoke all on function public.admin_audit(integer) from public, anon;
grant execute on function public.admin_audit(integer) to authenticated;

-- Les mots refusés du chat (modifiables sans redéploiement, en minuscules sans accent).
create function public.admin_words() returns table (word text)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  return query select bw.word from public.chat_blocked_words bw order by bw.word;
end;
$$;
revoke all on function public.admin_words() from public, anon;
grant execute on function public.admin_words() to authenticated;

create function public.admin_word_add(p_word text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  w text := lower(btrim(coalesce(p_word, '')));
begin
  perform public.admin_guard();
  if w !~ '^[a-z0-9]{2,30}$' then
    raise exception 'Mot invalide : 2 à 30 lettres ou chiffres, sans accent ni espace.' using errcode = 'P0001';
  end if;
  insert into public.chat_blocked_words (word) values (w) on conflict do nothing;
  perform public.admin_note('word_add', null, jsonb_build_object('word', w));
end;
$$;
revoke all on function public.admin_word_add(text) from public, anon;
grant execute on function public.admin_word_add(text) to authenticated;

create function public.admin_word_remove(p_word text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  delete from public.chat_blocked_words bw where bw.word = lower(btrim(coalesce(p_word, '')));
  perform public.admin_note('word_remove', null, jsonb_build_object('word', lower(btrim(coalesce(p_word, '')))));
end;
$$;
revoke all on function public.admin_word_remove(text) from public, anon;
grant execute on function public.admin_word_remove(text) to authenticated;
