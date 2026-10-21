-- 4 Mules : les parties publiques de « Course perso ». Un joueur crée une partie (circuit, tours, places) ; elle apparaît dans la liste des autres joueurs
-- tant que son hôte est là (signal toutes les 8 s) et qu'il reste une place. La partie elle-même est celle des parties entre amis (canal temps réel,
-- src/net/session.ts) : le serveur ne tient que la liste et le code. Aucune récompense n'est liée à ces parties.
create table public.lobbies (
  code text primary key,
  host uuid not null unique references auth.users on delete cascade,
  host_pseudo text not null,
  track_id text not null check (track_id ~ '^[a-z0-9_-]{1,30}$'),
  laps integer not null check (laps between 1 and 3),
  max_seats integer not null check (max_seats between 2 and 4),
  seats integer not null default 1 check (seats between 1 and 4),
  closed boolean not null default false,
  created_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);
alter table public.lobbies enable row level security; -- aucune politique : tout passe par les fonctions ci-dessous
revoke all on public.lobbies from public, anon, authenticated;

-- Vérifications communes : connecté, pseudo choisi, pas suspendu. Renvoie le pseudo.
create function public.lobby_player() returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  name text;
begin
  if uid is null then
    raise exception 'Connexion requise.' using errcode = 'P0001';
  end if;
  select pr.pseudo into name from public.profiles pr where pr.id = uid;
  if name is null then
    raise exception 'Choisissez un pseudo avant de jouer en ligne.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.suspensions s where s.user_id = uid) then
    raise exception 'Compte suspendu.' using errcode = 'P0001';
  end if;
  return name;
end;
$$;

-- Crée la partie de l'hôte (la précédente, s'il en avait une, est supprimée) et renvoie son code.
create function public.lobby_create(p_track text, p_laps integer, p_max integer) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  name text := public.lobby_player();
  new_code text;
  letters text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
begin
  perform pg_advisory_xact_lock(4444);
  delete from public.lobbies l where l.host = uid or l.seen_at < now() - interval '1 hour';
  loop
    new_code := '';
    for i in 1..5 loop
      new_code := new_code || substr(letters, 1 + floor(random() * length(letters))::integer, 1);
    end loop;
    exit when not exists (select 1 from public.lobbies l where l.code = new_code);
  end loop;
  insert into public.lobbies (code, host, host_pseudo, track_id, laps, max_seats) values (new_code, uid, name, p_track, p_laps, p_max);
  return new_code;
end;
$$;

-- Les parties qui attendent des joueurs : ouvertes, avec une place, dont l'hôte a donné signe de vie il y a moins de 25 s.
create function public.lobby_list() returns table (code text, host_pseudo text, track_id text, laps integer, seats integer, max_seats integer)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.lobby_player();
  return query
    select l.code, l.host_pseudo, l.track_id, l.laps, l.seats, l.max_seats
      from public.lobbies l
     where not l.closed and l.seats < l.max_seats and l.host <> auth.uid() and l.seen_at > now() - interval '25 seconds'
     order by l.created_at desc
     limit 30;
end;
$$;

-- Prend une place dans la partie.
create function public.lobby_join(p_code text) returns table (code text, host_pseudo text, track_id text, laps integer, seats integer, max_seats integer)
language plpgsql security definer set search_path = '' as $$
declare
  found_lobby public.lobbies%rowtype;
begin
  perform public.lobby_player();
  perform pg_advisory_xact_lock(4444);
  select * into found_lobby from public.lobbies l
   where l.code = upper(p_code) and not l.closed and l.seats < l.max_seats and l.host <> auth.uid() and l.seen_at > now() - interval '25 seconds';
  if not found then
    raise exception 'Cette partie est complète ou fermée.' using errcode = 'P0001';
  end if;
  update public.lobbies l set seats = l.seats + 1 where l.code = found_lobby.code;
  return query select found_lobby.code, found_lobby.host_pseudo, found_lobby.track_id, found_lobby.laps, found_lobby.seats + 1, found_lobby.max_seats;
end;
$$;

-- Signal de l'hôte : il est toujours là, et voici combien de joueurs sont dans sa salle.
create function public.lobby_touch(p_code text, p_seats integer) returns void
language sql security definer set search_path = '' as $$
  update public.lobbies l set seen_at = now(), seats = least(greatest(coalesce(p_seats, 1), 1), l.max_seats)
   where l.code = p_code and l.host = auth.uid() and not l.closed;
$$;

-- L'hôte ferme sa partie (la course part, ou il quitte).
create function public.lobby_close(p_code text) returns void
language sql security definer set search_path = '' as $$
  delete from public.lobbies l where l.code = p_code and l.host = auth.uid();
$$;

revoke all on function public.lobby_player(), public.lobby_create(text, integer, integer), public.lobby_list(), public.lobby_join(text), public.lobby_touch(text, integer), public.lobby_close(text) from public, anon;
grant execute on function public.lobby_create(text, integer, integer), public.lobby_list(), public.lobby_join(text), public.lobby_touch(text, integer), public.lobby_close(text) to authenticated;
