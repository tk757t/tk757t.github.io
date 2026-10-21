-- 4 Mules : classement des trophées de la saison en cours (docs/gdd/04-modes.md § 4.5 et § 4.11).
-- Les trophées vivent dans game_state.state (profile.ranked), écrits par la seule fonction serveur `game`. Ces fonctions les lisent pour le classement ;
-- le navigateur ne lit toujours que sa propre ligne. Ne s'affichent que les joueurs qui ont un pseudo, ne sont pas suspendus et ont joué
-- au moins une course classée DANS LA SAISON EN COURS (les trophées d'une saison passée ne comptent plus tant que le joueur n'a pas rejoué).

-- La saison classée : 4 semaines à partir du lundi 19 octobre 2026 (UTC), comme rankedSeasonOf() dans src/data/ranked.ts (à garder identique).
create function public.ranked_season() returns integer
language sql stable set search_path = '' as $$
  select greatest(0, floor(extract(epoch from (now() - timestamptz '2026-10-19 00:00:00+00')) / (28 * 86400))::integer);
$$;
revoke all on function public.ranked_season() from public, anon;
grant execute on function public.ranked_season() to authenticated;

-- Les meilleurs de la saison (au plus 100), à égalité de trophées le même rang.
create function public.leaderboard_top(p_limit integer default 50)
returns table (rank integer, pseudo text, trophies integer, wins integer, races integer, mine boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  lim integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  cur integer := public.ranked_season();
begin
  if uid is null then
    raise exception 'Connexion requise.' using errcode = 'P0001';
  end if;
  return query
    select t.rk::integer, t.name, t.score, t.won, t.played, (t.user_id = uid)
    from (
      select g.user_id,
             pr.pseudo as name,
             (g.state #>> '{profile,ranked,trophies}')::integer as score,
             coalesce((g.state #>> '{profile,ranked,wins}')::integer, 0) as won,
             coalesce((g.state #>> '{profile,ranked,races}')::integer, 0) as played,
             rank() over (order by (g.state #>> '{profile,ranked,trophies}')::integer desc) as rk
      from public.game_state g
      join public.profiles pr on pr.id = g.user_id
      where pr.pseudo is not null
        and not exists (select 1 from public.suspensions s where s.user_id = g.user_id)
        and coalesce((g.state #>> '{profile,ranked,season}')::integer, -1) = cur
        and coalesce((g.state #>> '{profile,ranked,races}')::integer, 0) > 0
    ) t
    order by t.rk, t.name
    limit lim;
end;
$$;
revoke all on function public.leaderboard_top(integer) from public, anon;
grant execute on function public.leaderboard_top(integer) to authenticated;

-- Ma place : mon rang, mes trophées et le nombre de joueurs classés (aucune ligne si je n'ai pas encore joué de course classée cette saison).
create function public.leaderboard_me() returns table (rank integer, trophies integer, total integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  cur integer := public.ranked_season();
begin
  if uid is null then
    raise exception 'Connexion requise.' using errcode = 'P0001';
  end if;
  return query
    select t.rk::integer, t.score, t.n::integer
    from (
      select g.user_id,
             (g.state #>> '{profile,ranked,trophies}')::integer as score,
             rank() over (order by (g.state #>> '{profile,ranked,trophies}')::integer desc) as rk,
             count(*) over () as n
      from public.game_state g
      join public.profiles pr on pr.id = g.user_id
      where pr.pseudo is not null
        and not exists (select 1 from public.suspensions s where s.user_id = g.user_id)
        and coalesce((g.state #>> '{profile,ranked,season}')::integer, -1) = cur
        and coalesce((g.state #>> '{profile,ranked,races}')::integer, 0) > 0
    ) t
    where t.user_id = uid;
end;
$$;
revoke all on function public.leaderboard_me() from public, anon;
grant execute on function public.leaderboard_me() to authenticated;
