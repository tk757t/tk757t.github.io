-- 4 Mules : joueurs en ligne et joueurs en attente. Chaque appareil connecté signale sa présence toutes les 45 s (presence_ping) ;
-- lobby_stats compte ceux vus depuis moins de 90 s, les joueurs de la file classée et ceux des salles ouvertes de la course non classée.
-- Aucune donnée personnelle : un compte, une date. Les lignes de plus d'un jour sont effacées à chaque signal.
create table public.presence (
  user_id uuid primary key references auth.users on delete cascade,
  seen_at timestamptz not null default now()
);
create index presence_seen_at on public.presence (seen_at);
alter table public.presence enable row level security; -- aucune politique : tout passe par les fonctions ci-dessous
revoke all on public.presence from public, anon, authenticated;

create function public.presence_ping() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Connexion requise.' using errcode = 'P0001';
  end if;
  insert into public.presence (user_id, seen_at) values (uid, now())
  on conflict (user_id) do update set seen_at = now();
  delete from public.presence p where p.seen_at < now() - interval '1 day';
end;
$$;

create function public.lobby_stats() returns table (online integer, ranked_waiting integer, open_waiting integer)
language sql stable security definer set search_path = '' as $$
  select
    (select count(*)::integer from public.presence p where p.seen_at > now() - interval '90 seconds'),
    (select count(*)::integer from public.ranked_queue q where q.room is null and q.seen_at > now() - interval '15 seconds'),
    (select coalesce(sum(o.seats), 0)::integer from public.open_rooms o where not o.closed and o.created_at > now() - interval '40 seconds');
$$;

revoke all on function public.presence_ping(), public.lobby_stats() from public, anon;
grant execute on function public.presence_ping(), public.lobby_stats() to authenticated;
