-- 4 Mules : le chat montre le rang de chaque auteur (ses trophées de la saison en cours, null s'il n'a pas encore joué de course classée).
-- Remplace chat_fetch (même règles : sans les messages masqués ni les joueurs bloqués) en ajoutant la colonne `trophies`.
-- Demande la migration 20261022120000_leaderboard.sql (ranked_season).
drop function public.chat_fetch(bigint, integer);

create function public.chat_fetch(p_after bigint default null, p_limit integer default 50)
returns table (id bigint, sender uuid, pseudo text, body text, created_at timestamptz, mine boolean, trophies integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  lim integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  cur integer := public.ranked_season();
begin
  if uid is null then
    raise exception 'Connexion requise.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles pr where pr.id = uid and pr.pseudo is not null) then
    raise exception 'Choisissez un pseudo avant d''ouvrir le chat.' using errcode = 'P0001';
  end if;
  return query
    select t.id, t.sender, t.pseudo, t.body, t.created_at, t.mine, t.score
    from (
      select m.id, m.sender, m.pseudo, m.body, m.created_at, (m.sender = uid) as mine,
             (select (g.state #>> '{profile,ranked,trophies}')::integer
                from public.game_state g
               where g.user_id = m.sender
                 and coalesce((g.state #>> '{profile,ranked,season}')::integer, -1) = cur
                 and coalesce((g.state #>> '{profile,ranked,races}')::integer, 0) > 0) as score
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
