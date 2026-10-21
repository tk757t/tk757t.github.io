-- 4 Mules : les salles ouvertes de la course non classée. Le premier joueur qui clique crée une salle, les suivants la remplissent jusqu'à 4,
-- puis le suivant en crée une nouvelle. La salle elle-même est celle des parties entre amis (canal temps réel, src/net/session.ts) ;
-- le serveur ne tient que le compte des places et le code, le temps de l'attente. Aucune récompense n'est liée à ces salles.
create table public.open_rooms (
  code text primary key,
  host uuid not null references auth.users on delete cascade,
  seats integer not null default 1,
  closed boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.open_rooms enable row level security; -- aucune politique : tout passe par les fonctions ci-dessous
revoke all on public.open_rooms from public, anon, authenticated;

-- Rejoint la salle ouverte la plus ancienne qui a de la place (ouverte depuis moins de 40 s), ou en crée une : l'hôte est celui qui l'a créée.
create function public.open_join() returns table (room text, host boolean, seats integer)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  found_room public.open_rooms%rowtype;
  new_code text := '';
  letters text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
begin
  if uid is null then
    raise exception 'Connexion requise.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles pr where pr.id = uid and pr.pseudo is not null) then
    raise exception 'Choisissez un pseudo avant de jouer en ligne.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.suspensions s where s.user_id = uid) then
    raise exception 'Compte suspendu.' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(4343);
  delete from public.open_rooms o where o.created_at < now() - interval '2 minutes';
  select * into found_room from public.open_rooms o
   where not o.closed and o.seats < 4 and o.host <> uid and o.created_at > now() - interval '40 seconds'
   order by o.created_at limit 1;
  if found then
    update public.open_rooms o set seats = o.seats + 1, closed = (o.seats + 1 >= 4) where o.code = found_room.code;
    return query select found_room.code, false, found_room.seats + 1;
    return;
  end if;
  for i in 1..5 loop
    new_code := new_code || substr(letters, 1 + floor(random() * length(letters))::integer, 1);
  end loop;
  insert into public.open_rooms (code, host) values (new_code, uid);
  return query select new_code, true, 1;
end;
$$;

-- L'hôte ferme sa salle quand la course part : plus personne n'y entre.
create function public.open_close(p_room text) returns void
language sql security definer set search_path = '' as $$
  update public.open_rooms set closed = true where code = p_room and host = auth.uid();
$$;

revoke all on function public.open_join(), public.open_close(text) from public, anon;
grant execute on function public.open_join(), public.open_close(text) to authenticated;
