import type { ChestTier } from './chests';
import { getItem } from './parts/catalogue';
import { DUPLICATE_FRAGMENTS } from './parts/packs';
import { addPacks } from './profile/ops';
import type { Profile } from './profile/profile';
import { PASS_TIERS, TIER_POINTS } from './pass-constants';
import { parisDay } from './shop';

// Season pass (docs/gdd/09-passe.md). Free track only for now; the premium track is planned (paiement, étape 11).
// Pure rules, run by the game server for an account and by the device without one.

export { PASS_TIERS, TIER_POINTS };
export const SEASON_DAYS = 14;
/** A Monday (Paris calendar day): the first season starts on it, every season lasts SEASON_DAYS days. */
export const SEASON_ANCHOR = '2026-10-19';
/** Pass points: a finished race, a win (instead of the race points), a collected quest. */
export const PASS_RACE_POINTS = 10;
export const PASS_WIN_POINTS = 30;
export const PASS_QUEST_POINTS = 20;
/** The premium track is not on sale yet. */
export const PREMIUM_ENABLED = false;

export type PassReward =
  | { kind: 'gold'; amount: number }
  | { kind: 'gems'; amount: number }
  | { kind: 'fragments'; amount: number }
  | { kind: 'chest'; tier: ChestTier }
  /** A cosmetic. At tiers marked as skin slots (every 5th), a car skin replaces it once the skins exist. */
  | { kind: 'item'; itemId: string };

const gold = (amount: number): PassReward => ({ kind: 'gold', amount });
const gems = (amount: number): PassReward => ({ kind: 'gems', amount });
const fragments = (amount: number): PassReward => ({ kind: 'fragments', amount });
const chest = (tier: ChestTier): PassReward => ({ kind: 'chest', tier });
const item = (itemId: string): PassReward => ({ kind: 'item', itemId });

/** The free track, tier 1 first. Totals: 1 550 gold, 400 fragments, 60 gems, 2 common, 2 rare and 1 epic chest, 6 cosmetics. */
export const FREE_TRACK: readonly PassReward[] = [
  gold(150), // 1
  chest('common'), // 2
  fragments(40), // 3
  gold(150), // 4
  item('hlm-red'), // 5
  gold(150), // 6
  gems(10), // 7
  fragments(50), // 8
  gold(200), // 9
  item('num-13'), // 10
  chest('common'), // 11
  gold(200), // 12
  fragments(60), // 13
  gems(10), // 14
  item('paint-pink'), // 15
  gold(200), // 16
  fragments(70), // 17
  chest('rare'), // 18
  gold(250), // 19
  item('hlm-green'), // 20
  gems(10), // 21
  fragments(80), // 22
  gold(250), // 23
  chest('rare'), // 24
  item('num-27'), // 25
  gems(10), // 26
  fragments(100), // 27
  chest('epic'), // 28
  gems(20), // 29
  item('hlm-gold'), // 30
];

// ------------------------------------------------------------- seasons

const dayNumber = (day: string): number => {
  const [y, m, d] = day.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
};
const dayString = (n: number): string => new Date(n * 86_400_000).toISOString().slice(0, 10);

/** The season a time belongs to (0 for the first). */
export const seasonOf = (now: number): number => Math.max(0, Math.floor((dayNumber(parisDay(now)) - dayNumber(SEASON_ANCHOR)) / SEASON_DAYS));

/** The first instant of a Paris calendar day. */
export function parisMidnight(day: string): number {
  const base = dayNumber(day) * 86_400_000;
  let lo = base - 4 * 3_600_000; // still the day before in Paris
  let hi = base + 3_600_000; // already that day
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (parisDay(mid) < day) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** When a season ends (the next one begins), in ms since epoch. */
export const seasonEnd = (season: number): number => parisMidnight(dayString(dayNumber(SEASON_ANCHOR) + (season + 1) * SEASON_DAYS));

// ------------------------------------------------------------- progress

export interface PassProgress {
  season: number;
  /** Pass points earned this season (at most PASS_TIERS × TIER_POINTS). */
  points: number;
  /** Free tiers whose reward was collected. */
  claimed: number[];
}

export const MAX_POINTS = PASS_TIERS * TIER_POINTS;

/** The progress for the season of `now`: what was saved for an older season no longer counts. */
export function passProgress(profile: Profile, now: number): PassProgress {
  const season = seasonOf(now);
  return profile.pass.season === season ? profile.pass : { season, points: 0, claimed: [] };
}

/** The highest tier reached with these points (0..PASS_TIERS). */
export const tierReached = (points: number): number => Math.min(PASS_TIERS, Math.floor(points / TIER_POINTS));

export interface PassView {
  season: number;
  points: number;
  /** Tiers reached. */
  reached: number;
  /** Points still needed for the next tier (0 when the pass is complete). */
  toNext: number;
  /** Season end, ms since epoch. */
  endsAt: number;
  tiers: { tier: number; reward: PassReward; reached: boolean; claimed: boolean }[];
}

export function passView(profile: Profile, now: number): PassView {
  const p = passProgress(profile, now);
  const reached = tierReached(p.points);
  return {
    season: p.season,
    points: p.points,
    reached,
    toNext: reached >= PASS_TIERS ? 0 : (reached + 1) * TIER_POINTS - p.points,
    endsAt: seasonEnd(p.season),
    tiers: FREE_TRACK.map((reward, i) => ({ tier: i + 1, reward, reached: i + 1 <= reached, claimed: p.claimed.includes(i + 1) })),
  };
}

/** Adds pass points for the current season (rolling over to a new season when the saved one is over). */
export function addPassPoints(profile: Profile, points: number, now: number): Profile {
  const p = passProgress(profile, now);
  return { ...profile, pass: { ...p, points: Math.min(MAX_POINTS, p.points + Math.max(0, Math.floor(points))) } };
}

/** Tiers reached whose reward is waiting (shown as a badge on the Quests tab). */
export function passClaimableCount(profile: Profile, now: number): number {
  const p = passProgress(profile, now);
  return Math.max(0, tierReached(p.points) - p.claimed.length);
}

export interface PassClaim {
  profile: Profile;
  reward: PassReward;
  /** A cosmetic the player already owned was turned into this many fragments. */
  fragments: number;
}

/** Collects the free reward of a tier. Null when the tier does not exist, is not reached yet, or was collected. */
export function claimPassTier(profile: Profile, tier: number, now: number, unlockMs?: number): PassClaim | null {
  if (!Number.isInteger(tier) || tier < 1 || tier > PASS_TIERS) return null;
  const p = passProgress(profile, now);
  if (tierReached(p.points) < tier || p.claimed.includes(tier)) return null;
  const reward = FREE_TRACK[tier - 1];
  let next: Profile = { ...profile, pass: { ...p, claimed: [...p.claimed, tier].sort((a, b) => a - b) } };
  let converted = 0;
  switch (reward.kind) {
    case 'gold':
      next = { ...next, gold: next.gold + reward.amount };
      break;
    case 'gems':
      next = { ...next, gems: next.gems + reward.amount };
      break;
    case 'fragments':
      next = { ...next, fragments: next.fragments + reward.amount };
      break;
    case 'chest':
      next = addPacks(next, [reward.tier], now, unlockMs);
      break;
    case 'item': {
      const def = getItem(reward.itemId);
      if (!def) return null;
      if (next.owned[reward.itemId]) {
        converted = DUPLICATE_FRAGMENTS[def.rarity];
        next = { ...next, fragments: next.fragments + converted };
      } else next = { ...next, owned: { ...next.owned, [reward.itemId]: 1 } };
      break;
    }
  }
  return { profile: next, reward, fragments: converted };
}
