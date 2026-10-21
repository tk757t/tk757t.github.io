// Account experience: XP paid by a finished race (decreasing with the place) and the level curve.
// Pure; the formulas are documented in docs/gdd/05-economie.md (5.1). This computation must move server-side
// once the server grants rewards.

/** XP for each place in a 4-player race; other field sizes are interpolated from this curve. */
export const PLACE_XP_4: readonly number[] = [100, 70, 50, 35];

export const CLEAN_RACE_BONUS = 0.1;
export const BOT_MALUS = 0.5;
/** A finisher always earns something, even against bots. */
export const MIN_FINISH_XP = 1;

/** Base XP for `rank` (1-based) in a race of `players` (1 to 8). Strictly decreasing with the rank. */
export function placeXp(rank: number, players: number, table: readonly number[] = PLACE_XP_4): number {
  const n = Math.max(1, Math.min(8, Math.floor(players)));
  const r = Math.max(1, Math.min(n, Math.floor(rank)));
  if (n === 1) return table[0];
  const pos = ((r - 1) / (n - 1)) * (table.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(table.length - 1, lo + 1);
  return Math.round(table[lo] + (table[hi] - table[lo]) * (pos - lo));
}

export interface XpContext {
  rank: number;
  players: number;
  retired: boolean;
  /** Finished with no part broken (every wear category above zero). */
  clean?: boolean;
  /** At least one opponent is an AI. */
  vsBots?: boolean;
}

/** XP of one race: nothing when retired, place table, +10 % for a clean finish, x0.5 against bots (never below 1). */
export function raceXp(c: XpContext): number {
  if (c.retired) return 0;
  let xp = placeXp(c.rank, c.players);
  if (c.clean) xp *= 1 + CLEAN_RACE_BONUS;
  if (c.vsBots) xp *= BOT_MALUS;
  return Math.max(MIN_FINISH_XP, Math.round(xp));
}

// --------------------------------------------------------------- levels

/** Cumulative XP needed to reach `level`: 0 for level 1, then 100 x (level - 1)^1.4 (level 2 = 100, 3 = 264, 4 = 483...). */
export const xpForLevel = (level: number): number => (level <= 1 ? 0 : Math.round(100 * Math.pow(level - 1, 1.4)));

export interface LevelInfo {
  level: number;
  /** XP gained inside the level. */
  into: number;
  /** Size of the level. */
  needed: number;
}

export function levelFromXp(xp: number): LevelInfo {
  const x = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0));
  let level = Math.max(1, Math.floor(Math.pow(x / 100, 1 / 1.4)) + 1);
  while (level > 1 && xpForLevel(level) > x) level--;
  while (xpForLevel(level + 1) <= x) level++;
  return { level, into: x - xpForLevel(level), needed: xpForLevel(level + 1) - xpForLevel(level) };
}
