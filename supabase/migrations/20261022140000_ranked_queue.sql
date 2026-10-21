-- 4 Mules : mise en relation des courses classées (docs/gdd/04-modes.md § 4.3, règles pures dans src/data/ranked.ts).
-- Un joueur entre dans la file (queue_join), puis la relève toutes les 2 s (queue_poll) : le serveur forme les groupes de 2 à 4 joueurs dont l'écart de
-- trophées tient dans la fenêtre (±100, +50 toutes les 5 s d'attente, 20 s au plus), donne un code de salon et désigne l'hôte (le plus ancien dans la file).
-- Après 20 s d'attente, un groupe de la ligue Paddock (moins de 400 trophées) est complété par des IA jusqu'à 4 voitures ; les autres ligues attendent.
-- Le salon lui-même passe par le canal temps réel existant (src/net/session.ts) ; la file ne stocke que le temps de l'attente.
create table public.ranked_queue (
  user_id uuid primary key references auth.users on delete cascade,
  pseudo text not null,
  trophies integer not null,
  joined_at timestamptz not null default now(),
  seen_at timestamptz not null default now(),
  room text,
  host boolean not null default false,
  ais integer not null default 0,
  "group" jsonb,
  matched_at timestamptz
);
alter table public.ranked_queue enable row level security; -- aucune politique : tout passe par les fonctions ci-dessous
revoke all on public.ranked_queue from public, anon, authenticated;

-- Entrer dans la file. Les trophées annoncés ne peuvent pas dépasser ceux que le serveur connaît (ils peuvent être plus bas : début de saison).
create function public.queue_join(p_trophies integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  name text;
  known integer;
  mine integer;
begin
  if uid is null then
    raise exception 'Connexion requise.' using errcode = 'P0001';
  end if;
  select pr.pseudo into name from public.profiles pr where pr.id = uid;
  if name is null then
    raise exception 'Choisissez un pseudo avant de jouer en classé.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.suspensions s where s.user_id = uid) then
    raise exception 'Compte suspendu.' using errcode = 'P0001';
  end if;
  select coalesce((g.state #>> '{profile,ranked,trophies}')::integer, 0) into known from public.game_state g where g.user_id = uid;
  mine := greatest(0, least(coalesce(p_trophies, 0), coalesce(known, 0)));
  insert into public.ranked_queue (user_id, pseudo, trophies) values (uid, name, mine)
  on conflict (user_id) do update
    set pseudo = excluded.pseudo, trophies = excluded.trophies, joined_at = now(), seen_at = now(),
        room = null, host = false, ais = 0, "group" = null, matched_at = null;
end;
$$;

create function public.queue_leave() returns void
language sql security definer set search_path = '' as $$
  delete from public.ranked_queue where user_id = auth.uid();
$$;

-- Relève la file : renvoie l'état (none, waiting, matched) et, une fois le groupe formé, le salon.
create function public.queue_poll()
returns table (status text, room text, host boolean, ais integer, waited integer, gap integer, found integer, players jsonb)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  me public.ranked_queue%rowtype;
  my_wait double precision;
  chosen uuid[];
  sizes integer;
  oldest double precision;
  fill integer := 0;
  all_paddock boolean;
  code text;
  letters text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  grp jsonb;
  c record;
  ok boolean;
  x record;
begin
  if uid is null then
    raise exception 'Connexion requise.' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(4242);
  update public.ranked_queue q set seen_at = now() where q.user_id = uid;
  delete from public.ranked_queue q where (q.room is null and q.seen_at < now() - interval '15 seconds') or (q.room is not null and q.matched_at < now() - interval '3 minutes');
  select * into me from public.ranked_queue q where q.user_id = uid;
  if not found then
    return query select 'none'::text, null::text, false, 0, 0, 0, 0, null::jsonb;
    return;
  end if;
  my_wait := extract(epoch from (now() - me.joined_at));
  if me.room is not null then
    return query select 'matched'::text, me.room, me.host, me.ais, my_wait::integer, 0, jsonb_array_length(me."group"), me."group";
    return;
  end if;

  -- the group: me, then the others in order of closeness, each one fitting the window of everyone already chosen
  chosen := array[uid];
  for c in
    select q.* from public.ranked_queue q
    where q.room is null and q.user_id <> uid
    order by abs(q.trophies - me.trophies), q.joined_at
  loop
    exit when array_length(chosen, 1) >= 4;
    ok := true;
    for x in select q.* from public.ranked_queue q where q.user_id = any (chosen) loop
      if abs(x.trophies - c.trophies) > 100 + 50 * floor(least(greatest(extract(epoch from (now() - x.joined_at)), extract(epoch from (now() - c.joined_at))), 20) / 5) then
        ok := false;
      end if;
    end loop;
    if ok then chosen := chosen || c.user_id; end if;
  end loop;
  sizes := array_length(chosen, 1);
  select max(extract(epoch from (now() - q.joined_at))), bool_and(q.trophies < 400)
    into oldest, all_paddock
    from public.ranked_queue q where q.user_id = any (chosen);

  if sizes < 4 and not (sizes >= 2 and oldest >= 5) and not (oldest >= 20 and all_paddock) then
    return query select 'waiting'::text, null::text, false, 0, my_wait::integer, (100 + 50 * floor(least(my_wait, 20) / 5))::integer, sizes, null::jsonb;
    return;
  end if;
  if sizes < 4 and oldest >= 20 and all_paddock then
    fill := 4 - sizes;
  end if;
  code := '';
  for i in 1..5 loop
    code := code || substr(letters, 1 + floor(random() * length(letters))::integer, 1);
  end loop;
  select jsonb_agg(jsonb_build_object('id', q.user_id, 'pseudo', q.pseudo, 'trophies', q.trophies) order by q.joined_at, q.user_id)
    into grp from public.ranked_queue q where q.user_id = any (chosen);
  update public.ranked_queue q
     set room = code, ais = fill, "group" = grp, matched_at = now(),
         host = (q.user_id = (select q2.user_id from public.ranked_queue q2 where q2.user_id = any (chosen) order by q2.joined_at, q2.user_id limit 1))
   where q.user_id = any (chosen);
  select * into me from public.ranked_queue q where q.user_id = uid;
  return query select 'matched'::text, me.room, me.host, me.ais, my_wait::integer, 0, sizes, me."group";
end;
$$;

revoke all on function public.queue_join(integer), public.queue_leave(), public.queue_poll() from public, anon;
grant execute on function public.queue_join(integer), public.queue_leave(), public.queue_poll() to authenticated;
