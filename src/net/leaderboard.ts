import { RANKED_SEASON_ANCHOR, RANKED_SEASON_MS, leagueOf, rankedSeasonOf, type RankLeague } from '../data/ranked';
import { authClient } from './supabase';

/** One line of the ranking of the season (supabase/migrations/20261022120000_leaderboard.sql). */
export interface BoardEntry {
  rank: number;
  pseudo: string;
  trophies: number;
  wins: number;
  races: number;
  mine: boolean;
  league: RankLeague;
}

/** The place of the signed-in player: null when they have not raced ranked this season. */
export interface MyPlace {
  rank: number;
  trophies: number;
  total: number;
  league: RankLeague;
}

interface TopRow {
  rank: number;
  pseudo: string;
  trophies: number;
  wins: number;
  races: number;
  mine: boolean;
}

export async function fetchBoard(limit = 50): Promise<BoardEntry[]> {
  const { data, error } = await authClient().rpc('leaderboard_top', { p_limit: limit });
  if (error) throw error;
  return ((data ?? []) as TopRow[]).map((r) => ({ rank: Number(r.rank), pseudo: r.pseudo, trophies: Number(r.trophies), wins: Number(r.wins), races: Number(r.races), mine: r.mine === true, league: leagueOf(Number(r.trophies)) }));
}

export async function fetchMyPlace(): Promise<MyPlace | null> {
  const { data, error } = await authClient().rpc('leaderboard_me');
  if (error) throw error;
  const row = ((data ?? []) as { rank: number; trophies: number; total: number }[])[0];
  return row ? { rank: Number(row.rank), trophies: Number(row.trophies), total: Number(row.total), league: leagueOf(Number(row.trophies)) } : null;
}

/** "1er", "2e", "12e": the rank as a French ordinal. */
export const ordinal = (n: number): string => (n === 1 ? '1er' : `${n}e`);

/** Whole days left before the season ends (at least 1 while it is running), and the number of the season (from 1). */
export function seasonInfo(now: number): { number: number; daysLeft: number } {
  const season = rankedSeasonOf(now);
  const end = RANKED_SEASON_ANCHOR + (season + 1) * RANKED_SEASON_MS;
  return { number: season + 1, daysLeft: Math.max(1, Math.ceil((end - now) / 86_400_000)) };
}
