import { getItem } from './parts/catalogue';
import { DUPLICATE_FRAGMENTS } from './parts/packs';
import { addPacks } from './profile/ops';
import type { Profile } from './profile/profile';
import { parisDay } from './shop';

// Daily gift and welcome pack (docs/gdd/08-boutique.md, 8.5 and 8.7). Pure rules, run by the game server for an account
// and by the device without one (the welcome pack is for accounts only: its deadline is set by the server).

export const GIFT_GOLD = 20;
export const GIFT_FRAGMENTS = 8;
/** The Nth consecutive day, the gift is a common chest. */
export const GIFT_STREAK_DAYS = 7;

export const WELCOME_GOLD = 2_000;
export const WELCOME_GEMS = 300;
export const WELCOME_PAINT = 'paint-lime';
export const WELCOME_MS = 72 * 3_600_000;

/** The calendar day before `day` ("YYYY-MM-DD"). */
export function prevDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

export interface GiftStatus {
  /** Not collected yet on this Paris day. */
  available: boolean;
  /** Consecutive days including the one the gift is (or was) collected on. */
  streak: number;
  /** 1..GIFT_STREAK_DAYS: which day of the week the gift of today is. */
  cycleDay: number;
  /** Whether today's gift is the chest. */
  chest: boolean;
}

export function giftStatus(profile: Profile, now: number): GiftStatus {
  const day = parisDay(now);
  const claimedToday = profile.gift.day === day;
  const streak = claimedToday ? profile.gift.streak : profile.gift.day === prevDay(day) ? profile.gift.streak + 1 : 1;
  const cycleDay = ((streak - 1) % GIFT_STREAK_DAYS) + 1;
  return { available: !claimedToday, streak, cycleDay, chest: cycleDay === GIFT_STREAK_DAYS };
}

export interface GiftReward {
  gold: number;
  fragments: number;
  /** A common chest instead of gold and fragments. */
  chest: boolean;
  streak: number;
  cycleDay: number;
}

/** Collects the gift of the day. Null when it was already collected today. */
export function claimGift(profile: Profile, now: number, unlockMs?: number): { profile: Profile; reward: GiftReward } | null {
  const s = giftStatus(profile, now);
  if (!s.available) return null;
  const gift = { day: parisDay(now), streak: Math.min(s.streak, 9_999) };
  const reward: GiftReward = { gold: s.chest ? 0 : GIFT_GOLD, fragments: s.chest ? 0 : GIFT_FRAGMENTS, chest: s.chest, streak: gift.streak, cycleDay: s.cycleDay };
  const paid: Profile = { ...profile, gift, gold: profile.gold + reward.gold, fragments: profile.fragments + reward.fragments };
  return { profile: s.chest ? addPacks(paid, 1, now, unlockMs) : paid, reward };
}

/** The welcome pack can be collected until `welcomeUntil` (set when the account is created, 0 once collected). */
export const welcomeAvailable = (profile: Profile, now: number): boolean => profile.welcomeUntil > now;

export interface WelcomeReward {
  gold: number;
  gems: number;
  /** The paint, or null when the player already owns it (then `fragments` are given instead). */
  itemId: string | null;
  fragments: number;
}

/** Collects the welcome pack, once. Null when it is not on offer (never opened, expired or already collected). */
export function claimWelcome(profile: Profile, now: number): { profile: Profile; reward: WelcomeReward } | null {
  if (!welcomeAvailable(profile, now)) return null;
  const owned = !!profile.owned[WELCOME_PAINT];
  const fragments = owned ? DUPLICATE_FRAGMENTS[getItem(WELCOME_PAINT)?.rarity ?? 'rare'] : 0;
  const reward: WelcomeReward = { gold: WELCOME_GOLD, gems: WELCOME_GEMS, itemId: owned ? null : WELCOME_PAINT, fragments };
  return {
    profile: {
      ...profile,
      welcomeUntil: 0,
      gold: profile.gold + reward.gold,
      gems: profile.gems + reward.gems,
      fragments: profile.fragments + fragments,
      owned: owned ? profile.owned : { ...profile.owned, [WELCOME_PAINT]: 1 },
    },
    reward,
  };
}
