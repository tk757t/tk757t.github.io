-- 4 Mules : la course non classée passe par la même file d'attente que la course classée, sans tenir compte des trophées.
-- Une ligne de la file est « classée » ou non ; les deux files ne se mélangent pas. En non classé : aucun écart de trophées à respecter,
-- le groupe se forme dès 2 joueurs après 5 s (4 joueurs : tout de suite), et après 20 s seul, n'importe qui est complété par des IA.
-- Les anciennes salles ouvertes (open_rooms) sont supprimées par la migration suivante, une fois la nouvelle version du jeu en ligne.
alter table public.ranked_queue add column ranked boolean not null default true;

drop function public.queue_join(integer);
create function public.queue_join(p_trophies integer, p_ranked boolean default true) returns void
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
  insert into public.ranked_queue (user_id, pseudo, trophies, ranked) values (uid, name, mine, coalesce(p_ranked, true))
  on conflict (user_id) do update
    set pseudo = excluded.pseudo, trophies = excluded.trophies, ranked = excluded.ranked, joined_at = now(), seen_at = now(),
        room = null, host = false, ais = 0, "group" = null, matched_at = null;
end;
$$;

create or replace function public.queue_poll()
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

  -- the group: me, then the others of the same queue in order of closeness (ranked: each one fitting the trophy window of everyone already chosen; unranked: anyone)
  chosen := array[uid];
  for c in
    select q.* from public.ranked_queue q
    where q.room is null and q.user_id <> uid and q.ranked = me.ranked
    order by case when me.ranked then abs(q.trophies - me.trophies) else 0 end, q.joined_at
  loop
    exit when array_length(chosen, 1) >= 4;
    ok := true;
    if me.ranked then
      for x in select q.* from public.ranked_queue q where q.user_id = any (chosen) loop
        if abs(x.trophies - c.trophies) > 100 + 50 * floor(least(greatest(extract(epoch from (now() - x.joined_at)), extract(epoch from (now() - c.joined_at))), 20) / 5) then
          ok := false;
        end if;
      end loop;
    end if;
    if ok then chosen := chosen || c.user_id; end if;
  end loop;
  sizes := array_length(chosen, 1);
  select max(extract(epoch from (now() - q.joined_at))), bool_and(not q.ranked or q.trophies < 400)
    into oldest, all_paddock
    from public.ranked_queue q where q.user_id = any (chosen);

  if sizes < 4 and not (sizes >= 2 and oldest >= 5) and not (oldest >= 20 and all_paddock) then
    return query select 'waiting'::text, null::text, false, 0, my_wait::integer, (case when me.ranked then 100 + 50 * floor(least(my_wait, 20) / 5) else 0 end)::integer, sizes, null::jsonb;
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

-- The counts of the Course tab: those waiting in the ranked queue, and those waiting in the unranked one.
create or replace function public.lobby_stats() returns table (online integer, ranked_waiting integer, open_waiting integer)
language sql stable security definer set search_path = '' as $$
  select
    (select count(*)::integer from public.presence p where p.seen_at > now() - interval '90 seconds'),
    (select count(*)::integer from public.ranked_queue q where q.room is null and q.ranked and q.seen_at > now() - interval '15 seconds'),
    (select count(*)::integer from public.ranked_queue q where q.room is null and not q.ranked and q.seen_at > now() - interval '15 seconds');
$$;

revoke all on function public.queue_join(integer, boolean) from public, anon;
grant execute on function public.queue_join(integer, boolean) to authenticated;
