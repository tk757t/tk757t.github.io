-- 4 Mules : chat du canal général (pas de messages privés pour l'instant).
-- Principes (docs/gdd/04-modes.md § 4.7, docs/audit-securite.md) :
--   * les tables ne sont lisibles ni modifiables par le navigateur : tout passe par des fonctions qui imposent le pseudo, la suspension, le silence,
--     la longueur, le débit, les doublons, les liens et le filtre de mots ;
--   * un message signalé par 3 joueurs différents est masqué en attendant la modération ;
--   * un joueur bloqué ne s'affiche plus pour celui qui l'a bloqué ;
--   * les messages de plus de 30 jours sont supprimés ; supprimer un compte supprime ses messages (on delete cascade).

-- ============ Messages ============
create table public.chat_messages (
  id bigint generated always as identity primary key,
  sender uuid not null references auth.users (id) on delete cascade,
  pseudo text not null,
  body text not null check (char_length(body) between 1 and 200),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index chat_messages_sender_idx on public.chat_messages (sender, created_at desc);
create index chat_messages_created_idx on public.chat_messages (created_at);

-- ============ Blocages (chacun les siens) ============
create table public.chat_blocks (
  blocker uuid not null references auth.users (id) on delete cascade,
  blocked uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);

-- ============ Signalements (lus par la modération seulement) ============
create table public.chat_reports (
  id bigint generated always as identity primary key,
  message_id bigint not null references public.chat_messages (id) on delete cascade,
  reporter uuid not null references auth.users (id) on delete cascade,
  reason text not null check (reason in ('insulte', 'spam', 'harcelement', 'autre')),
  created_at timestamptz not null default now(),
  unique (message_id, reporter)
);
create index chat_reports_reporter_idx on public.chat_reports (reporter, created_at desc);

-- ============ Silences (écrits par la modération) ============
create table public.chat_mutes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  until timestamptz not null,
  reason text not null default '' check (char_length(reason) <= 140),
  created_at timestamptz not null default now()
);

-- ============ Mots refusés (liste modifiable par la modération, sans redéploiement) ============
create table public.chat_blocked_words (
  word text primary key check (word ~ '^[a-z0-9]{2,30}$')
);

alter table public.chat_messages enable row level security;
alter table public.chat_blocks enable row level security;
alter table public.chat_reports enable row level security;
alter table public.chat_mutes enable row level security;
alter table public.chat_blocked_words enable row level security;
-- Aucune politique : ni lecture ni écriture directes. Les droits sont retirés explicitement.
revoke all on public.chat_messages, public.chat_blocks, public.chat_reports, public.chat_mutes, public.chat_blocked_words from anon, authenticated;

-- ============ Texte comparable : minuscules, sans accents, chiffres d'argot remis en lettres, séparateurs en espaces ============
create function public.chat_normalize(t text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(t, '')), 'àâäáãéèêëíìîïóòôöõúùûüçñ013457@$', 'aaaaaeeeeiiiiooooouuuucnoieastas'),
    '[^a-z0-9]+', ' ', 'g'));
$$;
revoke all on function public.chat_normalize(text) from public, anon, authenticated;

insert into public.chat_blocked_words (word) values
  ('connard'), ('connasse'), ('salope'), ('pute'), ('encule'), ('enculer'), ('batard'), ('fdp'), ('ntm'), ('nazi'),
  ('pedophile'), ('negre'), ('nigger'), ('fuck'), ('fucking'), ('shit'), ('bitch'), ('asshole'), ('cunt'), ('faggot'), ('retard')
on conflict do nothing;

-- ============ Écrire dans le canal général ============
create function public.chat_send(p_body text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  me text;
  clean text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
  norm text;
  new_id bigint;
begin
  if uid is null then
    raise exception 'Connexion requise.' using errcode = 'P0001';
  end if;
  select pr.pseudo into me from public.profiles pr where pr.id = uid;
  if me is null then
    raise exception 'Choisissez un pseudo avant d''écrire dans le chat.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.suspensions s where s.user_id = uid) then
    raise exception 'Compte suspendu.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.chat_mutes mu where mu.user_id = uid and mu.until > now()) then
    raise exception 'Vous êtes réduit au silence pour le moment.' using errcode = 'P0001';
  end if;
  if char_length(clean) not between 1 and 200 then
    raise exception 'Un message fait de 1 à 200 caractères.' using errcode = 'P0001';
  end if;
  if clean ~* '(https?://|www\.|[a-z0-9-]+\.(com|fr|net|org|io|gg|ly|me|tv|xyz|ru|cc)([^a-z0-9]|$))' then
    raise exception 'Les liens ne sont pas autorisés dans le chat.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.chat_messages m where m.sender = uid and m.created_at > now() - interval '1 second') then
    raise exception 'Doucement : un message par seconde au maximum.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.chat_messages m where m.sender = uid and m.created_at > now() - interval '30 seconds') >= 10 then
    raise exception 'Trop de messages : patientez quelques secondes.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.chat_messages m where m.sender = uid and lower(m.body) = lower(clean) and m.created_at > now() - interval '60 seconds') then
    raise exception 'Vous venez d''envoyer ce message.' using errcode = 'P0001';
  end if;
  norm := public.chat_normalize(clean);
  if exists (select 1 from public.chat_blocked_words w where norm ~ ('\m' || w.word || '\M')) then
    raise exception 'Message refusé : langage inapproprié.' using errcode = 'P0001';
  end if;
  insert into public.chat_messages (sender, pseudo, body) values (uid, me, clean) returning id into new_id;
  -- purge des messages de plus de 30 jours, de temps en temps (sans tâche planifiée)
  if random() < 0.02 then
    delete from public.chat_messages m where m.created_at < now() - interval '30 days';
  end if;
  return new_id;
end;
$$;
revoke all on function public.chat_send(text) from public, anon;
grant execute on function public.chat_send(text) to authenticated;

-- ============ Lire le canal : les derniers messages (ou ceux qui suivent `p_after`), sans les masqués ni les joueurs bloqués ============
create function public.chat_fetch(p_after bigint default null, p_limit integer default 50)
returns table (id bigint, sender uuid, pseudo text, body text, created_at timestamptz, mine boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  lim integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if uid is null then
    raise exception 'Connexion requise.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles pr where pr.id = uid and pr.pseudo is not null) then
    raise exception 'Choisissez un pseudo avant d''ouvrir le chat.' using errcode = 'P0001';
  end if;
  return query
    select t.id, t.sender, t.pseudo, t.body, t.created_at, t.mine
    from (
      select m.id, m.sender, m.pseudo, m.body, m.created_at, (m.sender = uid) as mine
      from public.chat_messages m
      where not m.hidden
        and m.created_at > now() - interval '30 days'
        and (p_after is null or m.id > p_after)
        and not exists (select 1 from public.chat_blocks b where b.blocker = uid and b.blocked = m.sender)
      order by m.id desc
      limit lim
    ) t
    order by t.id;
end;
$$;
revoke all on function public.chat_fetch(bigint, integer) from public, anon;
grant execute on function public.chat_fetch(bigint, integer) to authenticated;

-- ============ Signaler un message ============
create function public.chat_report(p_message bigint, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  owner uuid;
begin
  if uid is null then
    raise exception 'Connexion requise.' using errcode = 'P0001';
  end if;
  if p_reason is null or p_reason not in ('insulte', 'spam', 'harcelement', 'autre') then
    raise exception 'Motif de signalement inconnu.' using errcode = 'P0001';
  end if;
  select m.sender into owner from public.chat_messages m where m.id = p_message;
  if owner is null then
    raise exception 'Message introuvable.' using errcode = 'P0001';
  end if;
  if owner = uid then
    raise exception 'Vous ne pouvez pas signaler votre propre message.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.chat_reports r where r.reporter = uid and r.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Trop de signalements : réessayez plus tard.' using errcode = 'P0001';
  end if;
  insert into public.chat_reports (message_id, reporter, reason) values (p_message, uid, p_reason) on conflict do nothing;
  -- trois joueurs différents : le message est masqué en attendant la modération
  if (select count(*) from public.chat_reports r where r.message_id = p_message) >= 3 then
    update public.chat_messages m set hidden = true where m.id = p_message;
  end if;
end;
$$;
revoke all on function public.chat_report(bigint, text) from public, anon;
grant execute on function public.chat_report(bigint, text) to authenticated;

-- ============ Bloquer, débloquer, lister ses blocages ============
create function public.chat_block(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Connexion requise.' using errcode = 'P0001';
  end if;
  if p_user is null or p_user = uid then
    raise exception 'Joueur invalide.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles pr where pr.id = p_user) then
    raise exception 'Joueur introuvable.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.chat_blocks b where b.blocker = uid) >= 200 then
    raise exception 'Trop de joueurs bloqués.' using errcode = 'P0001';
  end if;
  insert into public.chat_blocks (blocker, blocked) values (uid, p_user) on conflict do nothing;
end;
$$;
revoke all on function public.chat_block(uuid) from public, anon;
grant execute on function public.chat_block(uuid) to authenticated;

create function public.chat_unblock(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.' using errcode = 'P0001';
  end if;
  delete from public.chat_blocks b where b.blocker = auth.uid() and b.blocked = p_user;
end;
$$;
revoke all on function public.chat_unblock(uuid) from public, anon;
grant execute on function public.chat_unblock(uuid) to authenticated;

create function public.chat_blocked() returns table (user_id uuid, pseudo text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.' using errcode = 'P0001';
  end if;
  return query
    select b.blocked, coalesce(pr.pseudo, '?')
    from public.chat_blocks b
    left join public.profiles pr on pr.id = b.blocked
    where b.blocker = auth.uid()
    order by b.created_at desc;
end;
$$;
revoke all on function public.chat_blocked() from public, anon;
grant execute on function public.chat_blocked() to authenticated;

-- ============ Modération (service seulement : jamais le navigateur) ============
create function public.chat_mute(p_user uuid, p_minutes integer, p_reason text default '') returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.chat_mutes (user_id, until, reason)
  values (p_user, now() + make_interval(mins => greatest(1, least(coalesce(p_minutes, 10), 525600))), left(coalesce(p_reason, ''), 140))
  on conflict (user_id) do update set until = excluded.until, reason = excluded.reason;
end;
$$;
revoke all on function public.chat_mute(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.chat_mute(uuid, integer, text) to service_role;

create function public.chat_hide(p_message bigint, p_hidden boolean default true) returns void
language sql security definer set search_path = '' as $$
  update public.chat_messages m set hidden = coalesce(p_hidden, true) where m.id = p_message;
$$;
revoke all on function public.chat_hide(bigint, boolean) from public, anon, authenticated;
grant execute on function public.chat_hide(bigint, boolean) to service_role;
