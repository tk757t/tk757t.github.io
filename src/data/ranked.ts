/**
 * Ranked rules, pure (docs/gdd/04-modes.md § 4.3 and § 4.5): the leagues, the trophies won or lost by place, the floor a league that was
 * reached protects, the end of the season, and the matchmaking window. Nothing here knows the server or the screen: the server applies
 * these functions to what it stored, and the screens only show their results.
 */

export interface RankLeague {
  id: 'paddock' | 'bitume' | 'chicane' | 'epingle' | 'turbo' | 'legende';
  label: string;
  /** First trophy count of the league. */
  from: number;
  /** Last trophy count of the league, null for the top one. */
  to: number | null;
}

export const RANK_LEAGUES: readonly RankLeague[] = [
  { id: 'paddock', label: 'Paddock', from: 0, to: 399 },
  { id: 'bitume', label: 'Bitume', from: 400, to: 999 },
  { id: 'chicane', label: 'Chicane', from: 1000, to: 1799 },
  { id: 'epingle', label: 'Épingle', from: 1800, to: 2799 },
  { id: 'turbo', label: 'Turbo', from: 2800, to: 3999 },
  { id: 'legende', label: 'Légende', from: 4000, to: null },
];

/** The league of a trophy count (a negative or fractional count is brought to a whole number from 0). */
export function leagueOf(trophies: number): RankLeague {
  const t = Math.max(0, Math.floor(trophies));
  return [...RANK_LEAGUES].reverse().find((l) => t >= l.from) ?? RANK_LEAGUES[0];
}

/** Trophies by place, for a race of 2, 3 or 4 cars (§ 4.5). An abandon counts as the last place. */
export const TROPHIES_BY_PLACE: Readonly<Record<number, readonly number[]>> = {
  2: [30, -20],
  3: [35, 5, -20],
  4: [40, 15, -5, -20],
};

export const MIN_RANKED_CARS = 2;
export const MAX_RANKED_CARS = 4;

/** Trophies won (or lost) at `rank` (1 = first) in a race of `cars` cars; throws on a race or a place that does not exist. */
export function trophyDelta(cars: number, rank: number): number {
  const table = Number.isInteger(cars) ? TROPHIES_BY_PLACE[cars] : undefined;
  if (!table) throw new Error(`a ranked race has ${MIN_RANKED_CARS} to ${MAX_RANKED_CARS} cars, not ${cars}`);
  if (!Number.isInteger(rank) || rank < 1 || rank > cars) throw new Error(`place ${rank} does not exist in a race of ${cars} cars`);
  return table[rank - 1];
}

/**
 * The trophies a player cannot fall under: the first count of the highest league they reached ("we never go down under the
 * threshold of a league reached"). In the top league one can fall out of it, but not under the league below (decision: the floor of
 * Légende is the threshold of Turbo, § 4.5 says "sauf en Légende" without naming one).
 */
export function trophyFloor(peak: number): number {
  const reached = leagueOf(peak);
  if (reached.id !== 'legende') return reached.from;
  return RANK_LEAGUES.find((l) => l.id === 'turbo')!.from;
}

export interface TrophyState {
  trophies: number;
  /** The most trophies ever held in the current season: it decides the protected floor. */
  peak: number;
}

export interface TrophyChange extends TrophyState {
  delta: number;
  league: RankLeague;
  /** The league before the race. */
  before: RankLeague;
  /** True when the race took the player into a higher league. */
  promoted: boolean;
  /** True when the race took the player into a lower league (only possible out of Légende). */
  demoted: boolean;
}

/** What a ranked race does to a player: the new trophies (never under the protected floor, never negative) and the new peak. */
export function applyRaceTrophies(state: TrophyState, cars: number, rank: number): TrophyChange {
  const delta = trophyDelta(cars, rank);
  const before = leagueOf(state.trophies);
  const peak = Math.max(state.peak, state.trophies);
  const trophies = Math.max(trophyFloor(peak), state.trophies + delta, 0);
  const league = leagueOf(trophies);
  const order = (l: RankLeague) => RANK_LEAGUES.findIndex((x) => x.id === l.id);
  return { trophies, peak: Math.max(peak, trophies), delta, league, before, promoted: order(league) > order(before), demoted: order(league) < order(before) };
}

/** The effect of a ranked race on the player, as the server tells it (for the end-of-race screen). */
export interface RankedOutcome {
  /** Trophies of the place (before the protected floor). */
  delta: number;
  /** Trophies before and after the race (the real change is the difference: a protected floor can hold a loss). */
  before: number;
  trophies: number;
  league: RankLeague['id'];
  promoted: boolean;
  demoted: boolean;
  season: number;
}

/** What the ranked figures of a profile are worth now: the figures of an older season are first brought through the end of the season. */
export function currentRanked(ranked: { trophies: number; peak: number; races: number; wins: number; season: number }, now: number): { trophies: number; league: RankLeague; races: number; wins: number } {
  const season = rankedSeasonOf(now);
  const held = ranked.season < season ? seasonReset(ranked) : ranked;
  return { trophies: held.trophies, league: leagueOf(held.trophies), races: ranked.races, wins: ranked.wins };
}

/** The end of a season (every 4 weeks): above 4 000 the trophies come back to 4 000 plus half of the excess. The peak starts again. */
export function seasonReset(state: TrophyState): TrophyState {
  const top = RANK_LEAGUES[RANK_LEAGUES.length - 1].from;
  const trophies = state.trophies > top ? top + Math.floor((state.trophies - top) / 2) : state.trophies;
  return { trophies, peak: trophies };
}

// ---------------------------------------------------------------- seasons (§ 4.5)

/** A ranked season lasts 4 weeks; the first one starts on this Monday (UTC). */
export const RANKED_SEASON_ANCHOR = Date.UTC(2026, 9, 19);
export const RANKED_SEASON_MS = 28 * 86_400_000;

/** The ranked season a time belongs to (0 for the first, and for anything before it). */
export const rankedSeasonOf = (now: number): number => Math.max(0, Math.floor((now - RANKED_SEASON_ANCHOR) / RANKED_SEASON_MS));

// ---------------------------------------------------------------- matchmaking (§ 4.3)

/** First gap of trophies allowed between two players, widened every `MATCH_EVERY_MS` of waiting, up to `MATCH_MAX_WAIT_MS`. */
export const MATCH_BASE_GAP = 100;
export const MATCH_STEP = 50;
export const MATCH_EVERY_MS = 5_000;
export const MATCH_MAX_WAIT_MS = 20_000;

/** The gap of trophies a player who has waited `waitedMs` accepts. */
export function matchWindow(waitedMs: number): number {
  const waited = Math.min(Math.max(0, waitedMs), MATCH_MAX_WAIT_MS);
  return MATCH_BASE_GAP + MATCH_STEP * Math.floor(waited / MATCH_EVERY_MS);
}

/** Two players can meet when their gap fits the window of the one who has waited the longest. */
export function canMatch(a: { trophies: number; waitedMs: number }, b: { trophies: number; waitedMs: number }): boolean {
  return Math.abs(a.trophies - b.trophies) <= matchWindow(Math.max(a.waitedMs, b.waitedMs));
}

/** After the maximum wait, a race of the Paddock league is completed with named AIs; other leagues keep waiting (§ 4.3). */
export function mayFillWithBots(waitedMs: number, trophies: number): boolean {
  return waitedMs >= MATCH_MAX_WAIT_MS && leagueOf(trophies).id === 'paddock';
}

/** The starting grid: the fewest trophies in pole, to even things out (ties by id, so the order is always the same). */
export function gridOrder<T extends { id: string; trophies: number }>(players: readonly T[]): T[] {
  return [...players].sort((a, b) => a.trophies - b.trophies || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The circuit of a ranked or unranked race: drawn at random from the circuits of the game, the same for everyone in the room because it comes from the room code
 * (a hash of it, so the order of the list does not matter either). Each circuit carries its own number of laps, so every race lasts about the same.
 */
export function queueCircuit(roomCode: string, trackIds: readonly string[]): string {
  const ids = [...trackIds].sort();
  let h = 0x811c9dc5;
  for (let i = 0; i < roomCode.length; i++) h = Math.imul(h ^ roomCode.charCodeAt(i), 0x01000193) >>> 0;
  return ids[h % ids.length];
}

/** How the matchmaking server (supabase/migrations/20261022140000_ranked_queue.sql) fills a race: from 2 to 4 cars, AIs only for the Paddock league. */
export const MATCH_MIN_WAIT_MS = 5_000;
export const MATCH_FILL_CARS = 4;
