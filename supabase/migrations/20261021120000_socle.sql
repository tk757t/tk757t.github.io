-- 4 Mules : socle serveur (comptes, parties, journal, rôles, suspensions).
-- Inspiré d'un projet de référence local, nettoyé (docs/reprise-serveur.md). Principes :
--   * le navigateur peut seulement LIRE ses propres lignes ; toute écriture passe par des fonctions serveur ;
--   * aucune donnée personnelle : un identifiant technique et un pseudo choisi, ni e-mail, ni nom Discord, ni avatar ;
--   * toutes les fonctions fixent search_path = '' et ne sont exécutables que par les rôles voulus.

-- ============ Profils ============
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  pseudo text,
  role text not null default 'player' check (role in ('player', 'tester', 'vip', 'admin')),
  created_at timestamptz not null default now(),
  constraint profiles_pseudo_format check (pseudo is null or pseudo ~ '^[A-Za-z0-9_.-]{3,16}$')
);
-- Un pseudo est unique sans tenir compte des majuscules.
create unique index profiles_pseudo_unique on public.profiles (lower(pseudo));

-- ============ Partie (sauvegarde du joueur, écrite uniquement par le serveur) ============
create table public.game_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  version integer not null default 0,
  rules_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ Journal des actions du joueur ============
create table public.action_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  params jsonb,
  summary jsonb,
  created_at timestamptz not null default now()
);
create index action_log_user_created_idx on public.action_log (user_id, created_at desc);

-- ============ Suspensions et journal d'administration (aucune politique : service seul) ============
create table public.suspensions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 140),
  by_admin uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor uuid references auth.users (id) on delete set null,
  action text not null,
  target uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);

-- ============ Sécurité des lignes ============
alter table public.profiles enable row level security;
alter table public.game_state enable row level security;
alter table public.action_log enable row level security;
alter table public.suspensions enable row level security;
alter table public.admin_audit_log enable row level security;

create policy "Lecture de son profil" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "Lecture de sa partie" on public.game_state
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Lecture de son journal" on public.action_log
  for select to authenticated using ((select auth.uid()) = user_id);

-- Aucune politique d'écriture, et les droits d'écriture sont retirés explicitement.
revoke all on public.profiles, public.game_state, public.action_log, public.suspensions, public.admin_audit_log from anon, authenticated;
grant select on public.profiles, public.game_state, public.action_log to authenticated;

-- ============ Création du profil à l'inscription (invité ou Discord) : l'identifiant seul ============
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ Choix du pseudo (une seule fois, par la fonction ; les changements passeront par le serveur) ============
create function public.claim_pseudo(p text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  clean text := btrim(coalesce(p, ''));
begin
  if uid is null then
    raise exception 'Connexion requise.' using errcode = 'P0001';
  end if;
  if clean !~ '^[A-Za-z0-9_.-]{3,16}$' then
    raise exception 'Pseudo de 3 à 16 caractères : lettres, chiffres, « _ », « - » ou « . ».' using errcode = 'P0001';
  end if;
  -- noms réservés (rôles, équipe, système)
  if lower(clean) ~ '(admin|modo|moderat|staff|support|system|4mules|anonym)' then
    raise exception 'Ce pseudo n''est pas disponible.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.suspensions s where s.user_id = uid) then
    raise exception 'Compte suspendu.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles pr where pr.id = uid and pr.pseudo is not null) then
    raise exception 'Votre pseudo est déjà choisi.' using errcode = 'P0001';
  end if;
  begin
    update public.profiles set pseudo = clean where id = uid and pseudo is null;
  exception when unique_violation then
    raise exception 'Ce pseudo est déjà pris.' using errcode = 'P0001';
  end;
  if not found then
    raise exception 'Profil introuvable.' using errcode = 'P0001';
  end if;
  return clean;
end;
$$;
revoke all on function public.claim_pseudo(text) from public, anon;
grant execute on function public.claim_pseudo(text) to authenticated;

-- Pseudo libre ? (vérification avant validation, sans révéler d'autre donnée)
create function public.pseudo_available(p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select btrim(coalesce(p, '')) ~ '^[A-Za-z0-9_.-]{3,16}$'
     and lower(btrim(p)) !~ '(admin|modo|moderat|staff|support|system|4mules|anonym)'
     and not exists (select 1 from public.profiles pr where lower(pr.pseudo) = lower(btrim(p)));
$$;
revoke all on function public.pseudo_available(text) from public, anon;
grant execute on function public.pseudo_available(text) to authenticated;

-- ============ Rôle d'un joueur (utilisé par les politiques et les fonctions serveur ; jamais par le client) ============
create function public.has_role(uid uuid, wanted text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles pr where pr.id = uid and pr.role = wanted);
$$;
revoke all on function public.has_role(uuid, text) from public, anon, authenticated;
grant execute on function public.has_role(uuid, text) to service_role;
