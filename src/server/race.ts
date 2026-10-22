import type { RaceToken } from './state';

/**
 * Race checks of the server. NOT VERIFIED: the rank, the retirement, the "clean race" flag and the campaign statistics are
 * declared by the browser, and the dice are thrown on the device. The server only checks that the race was started with
 * one of its tokens, that the token is used once, that enough time went by for the declared laps on that circuit, and
 * that a player is not paid for more than `maxPerHour` races. Replaying the race on the server (seed + actions) is planned.
 */

/** Cells per lap of each of our circuits (kept here so the server bundle does not carry the circuit drawings; a test compares them with src/data/tracks). */
export const LAP_LENGTH: Readonly<Record<string, number>> = { oval: 48, anneau: 60, lac: 76, epingles: 64, dunes: 51, port: 36, corniche: 24, pins: 24, col: 17, cratere: 18 };

/** The circuits of the ranked and unranked queues, with the laps each is raced over (so every race lasts about five minutes); a test compares them with src/data/tracks. */
export const QUEUE_LAPS: Readonly<Record<string, number>> = { dunes: 1, port: 1, corniche: 2, pins: 2, col: 3, cratere: 3 };

export const MAX_LAPS = 3;
export const MAX_PLAYERS = 4;

export interface RaceRules {
  /** A turn moves at most this many cells on average (gear 6 throws 21 to 30, corners force low gears). */
  cellsPerTurn: number;
  /** A human turn takes at least this long (choose a gear, roll, move). */
  msPerTurn: number;
  /** No race is shorter than this, even a retirement in the first lap. */
  floorMs: number;
  maxPerHour: number;
  /** A token older than this cannot be paid any more. */
  tokenTtlMs: number;
}

export const RACE_RULES: RaceRules = { cellsPerTurn: 20, msPerTurn: 1000, floorMs: 20_000, maxPerHour: 30, tokenTtlMs: 3 * 3_600_000 };

/** Shortest plausible duration of a race: the human turns needed for the declared laps, or the floor for a retirement. */
export function minRaceMs(token: Pick<RaceToken, 'laps' | 'trackId'>, retired: boolean, rules: RaceRules = RACE_RULES): number {
  if (retired) return rules.floorMs;
  const lap = LAP_LENGTH[token.trackId] ?? 0;
  const turns = token.laps * Math.ceil(lap / rules.cellsPerTurn);
  return Math.max(rules.floorMs, turns * rules.msPerTurn);
}

/** 128 random bits as hex, from the server's randomness. */
export function tokenId(random: () => number): string {
  let out = '';
  for (let i = 0; i < 4; i++) out += (random() >>> 0).toString(16).padStart(8, '0');
  return out;
}

/** A race seed (1..2^31-1) from the server's randomness. */
export const raceSeed = (random: () => number): number => ((random() >>> 0) % 0x7ffffffe) + 1;
