import { WELCOME_MS } from '../data/gift';
import { newProfile, parseProfile, type Profile } from '../data/profile/profile';
import { fail } from './errors';

/**
 * What the server keeps for a player in `game_state.state` (jsonb). Only the game server writes it; the browser can read
 * its own row (RLS) but every decision is taken here. `profile.rng` is redrawn from the server's randomness before each
 * action, so the stored value tells nothing about the next chest.
 */
export const STATE_VERSION = 1;
export const RULES_VERSION = 1;

/** A race the server allowed to start: the only one that can be paid. */
export interface RaceToken {
  id: string;
  seed: number;
  /** Server time (ms) when the token was issued. */
  startedAt: number;
  trackId: string;
  laps: number;
  players: number;
  /** Seats driven by an AI (the other seats are people on this device). */
  bots: number;
  /** Campaign level, or null for a free race. */
  level: number | null;
  /** A ranked race: its result moves the trophies (src/data/ranked.ts). Absent on a token stored before the ranked mode. */
  ranked?: boolean;
}

export interface ServerState {
  v: typeof STATE_VERSION;
  profile: Profile;
  /** The race in progress (one at a time): a new start replaces it, a finish consumes it. */
  race: RaceToken | null;
  /** Server times of the races paid during the last hour (rate limit). */
  finishes: number[];
  /** Server times of the paid solo races (against AIs only) during the last hour. */
  soloFinishes: number[];
  /** Server times of the ranked races that moved the trophies during the last hour (rate limit, while the results are not verified). */
  rankedFinishes: number[];
  /** When the local save of the device was imported (once), or null. */
  importedAt: number | null;
  createdAt: number;
}

/** What the browser receives: the profile without the rng state, and the race token. */
export interface PublicState {
  profile: Profile;
  race: RaceToken | null;
}

/** A uint32 from the server's randomness, never 0 (any value is a valid mulberry32 state; 0 is kept out for clarity). */
export const rngFrom = (random: () => number): number => random() >>> 0 || 1;

export function freshState(now: number, random: () => number): ServerState {
  // the welcome pack is on offer for 72 hours from the creation of the account
  const profile = { ...newProfile(rngFrom(random)), welcomeUntil: now + WELCOME_MS };
  return { v: STATE_VERSION, profile, race: null, finishes: [], soloFinishes: [], rankedFinishes: [], importedAt: null, createdAt: now };
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isInt = (x: unknown, min: number, max: number): x is number => typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;

function readToken(x: unknown): RaceToken | null {
  if (!isRecord(x)) return null;
  const ok =
    typeof x.id === 'string' &&
    /^[0-9a-f]{32}$/.test(x.id) &&
    isInt(x.seed, 1, 0x7fffffff) &&
    isInt(x.startedAt, 0, Number.MAX_SAFE_INTEGER) &&
    typeof x.trackId === 'string' &&
    isInt(x.laps, 1, 10) &&
    isInt(x.players, 1, 4) &&
    isInt(x.bots, 0, 3) &&
    (x.level === null || isInt(x.level, 0, 100)) &&
    (x.ranked === undefined || typeof x.ranked === 'boolean');
  return ok ? { id: x.id as string, seed: x.seed as number, startedAt: x.startedAt as number, trackId: x.trackId as string, laps: x.laps as number, players: x.players as number, bots: x.bots as number, level: x.level as number | null, ...(x.ranked === true ? { ranked: true } : {}) } : null;
}

/**
 * Reads a stored state. The profile goes through the same cleaning as a local save (parseProfile): a row that cannot be
 * understood is refused ("corrupt") rather than repaired silently.
 */
export function readState(raw: unknown): ServerState {
  if (!isRecord(raw) || raw.v !== STATE_VERSION || !isRecord(raw.profile)) return fail('Partie illisible sur le serveur. Contactez un administrateur.', 'corrupt', 409);
  const parsed = parseProfile(JSON.stringify(raw.profile));
  if (!parsed || parsed.migrated) return fail('Partie illisible sur le serveur. Contactez un administrateur.', 'corrupt', 409);
  const finishes = Array.isArray(raw.finishes) ? raw.finishes.filter((t): t is number => isInt(t, 0, Number.MAX_SAFE_INTEGER)).slice(-200) : [];
  const soloFinishes = Array.isArray(raw.soloFinishes) ? raw.soloFinishes.filter((t): t is number => isInt(t, 0, Number.MAX_SAFE_INTEGER)).slice(-50) : [];
  const rankedFinishes = Array.isArray(raw.rankedFinishes) ? raw.rankedFinishes.filter((t): t is number => isInt(t, 0, Number.MAX_SAFE_INTEGER)).slice(-50) : [];
  return {
    v: STATE_VERSION,
    profile: parsed.profile,
    race: readToken(raw.race),
    finishes,
    soloFinishes,
    rankedFinishes,
    importedAt: isInt(raw.importedAt, 0, Number.MAX_SAFE_INTEGER) ? raw.importedAt : null,
    createdAt: isInt(raw.createdAt, 0, Number.MAX_SAFE_INTEGER) ? raw.createdAt : 0,
  };
}

export const publicState = (s: ServerState): PublicState => ({ profile: { ...s.profile, rng: 0 }, race: s.race ? { ...s.race } : null });
