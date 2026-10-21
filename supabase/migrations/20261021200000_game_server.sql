-- 4 Mules : serveur de jeu qui fait foi (Edge Function « game », logique dans src/server).
-- La partie d'un joueur (game_state.state, jsonb) contient son profil, le jeton de la course en cours (un seul actif)
-- et les heures serveur des courses payées dans la dernière heure. Le jeton de course vit dans l'état pour être écrit
-- sous le même verrou optimiste (game_state.version) que le reste : pas de table à part, pas d'écriture en deux temps.
-- RLS inchangée : le navigateur lit sa ligne, n'écrit rien. Seules les deux fonctions ci-dessous écrivent, et elles ne
-- sont exécutables que par service_role (la clé de service, lue par l'Edge Function dans Deno.env).

-- ============ Garde-fous sur la partie ============
alter table public.game_state
  add constraint game_state_state_object check (jsonb_typeof(state) = 'object'),
  add constraint game_state_version_positive check (version >= 0),
  add constraint game_state_state_size check (octet_length(state::text) < 262144);

-- Journal : recherche par joueur et par action (courses payées, imports, futur rejeu des courses).
create index action_log_user_action_idx on public.action_log (user_id, action, created_at desc);

-- ============ Création de la partie (première connexion : partie neuve ou sauvegarde importée) ============
-- Renvoie false si la partie existe déjà (l'import n'a lieu qu'une fois). Écrit la partie et le journal ensemble.
create function public.game_create(p_user uuid, p_state jsonb, p_rules integer, p_action text, p_params jsonb, p_summary jsonb)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'Partie invalide.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.suspensions s where s.user_id = p_user) then
    raise exception 'Compte suspendu.' using errcode = 'P0001';
  end if;
  insert into public.game_state (user_id, state, version, rules_version)
    values (p_user, p_state, 0, coalesce(p_rules, 1))
    on conflict (user_id) do nothing;
  if not found then
    return false;
  end if;
  insert into public.action_log (user_id, action, params, summary)
    values (p_user, left(coalesce(p_action, '?'), 32), coalesce(p_params, '{}'::jsonb), coalesce(p_summary, '{}'::jsonb));
  return true;
end;
$$;
revoke all on function public.game_create(uuid, jsonb, integer, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.game_create(uuid, jsonb, integer, text, jsonb, jsonb) to service_role;

-- ============ Écriture d'une action (verrou optimiste) ============
-- N'écrit que si la version lue est toujours celle en base ; renvoie la nouvelle version, ou null si une autre requête
-- a écrit entre-temps (la fonction relit et rejoue la règle). La partie et la ligne du journal sont écrites ensemble.
create function public.game_commit(p_user uuid, p_version integer, p_state jsonb, p_rules integer, p_action text, p_params jsonb, p_summary jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v integer;
begin
  if p_user is null or p_version is null or p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'Partie invalide.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.suspensions s where s.user_id = p_user) then
    raise exception 'Compte suspendu.' using errcode = 'P0001';
  end if;
  update public.game_state
     set state = p_state, version = version + 1, rules_version = coalesce(p_rules, rules_version), updated_at = now()
   where user_id = p_user and version = p_version
  returning version into v;
  if v is null then
    return null;
  end if;
  insert into public.action_log (user_id, action, params, summary)
    values (p_user, left(coalesce(p_action, '?'), 32), coalesce(p_params, '{}'::jsonb), coalesce(p_summary, '{}'::jsonb));
  return v;
end;
$$;
revoke all on function public.game_commit(uuid, integer, jsonb, integer, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.game_commit(uuid, integer, jsonb, integer, text, jsonb, jsonb) to service_role;
