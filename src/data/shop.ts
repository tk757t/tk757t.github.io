import { nextFloat } from '../engine/rng';
import { COSMETICS, getItem } from './parts/catalogue';
import { addPacks } from './profile/ops';
import type { Profile } from './profile/profile';

export type Currency = 'gold' | 'gems';

export interface Offer {
  id: string;
  title: string;
  detail: string;
  icon: string;
  price: number;
  currency: Currency;
  /** Offers of the day only: the cosmetic they sell. */
  itemId?: string;
}

/** The permanent offers. */
export const OFFERS: Offer[] = [
  { id: 'pack-1', title: 'Coffre commun', detail: '3 cartes, prêt en 30 minutes', icon: '🎁', price: 120, currency: 'gold' },
  { id: 'pack-3', title: 'Lot de 3 coffres communs', detail: 'Le meilleur prix par coffre', icon: '📦', price: 300, currency: 'gold' },
  { id: 'fragments-40', title: '40 fragments', detail: 'Pour améliorer vos pièces', icon: '🔷', price: 150, currency: 'gold' },
  { id: 'pack-instant', title: 'Coffre rare express', detail: '4 cartes, or et gemmes, prêt tout de suite', icon: '⚡', price: 8, currency: 'gems' },
  { id: 'pack-epic', title: 'Coffre épique', detail: '5 cartes, or et gemmes, prêt en 8 heures', icon: '💜', price: 60, currency: 'gems' },
  { id: 'gold-400', title: '400 pièces d’or', detail: 'Contre des gemmes', icon: '🪙', price: 24, currency: 'gems' },
];

// ------------------------------------------------------------- offers of the day

/** A line of the pool the offers of the day are drawn from (docs/gdd/08-boutique.md, 8.4). */
interface DailyDef {
  id: string;
  title: string;
  detail: string;
  icon: string;
  price: number;
  weight: number;
  /** Cosmetic lines sell one common item of this kind, picked by the day's seed among those not owned yet. */
  cosmetic?: 'number' | 'helmet';
}

export const DAILY_POOL: DailyDef[] = [
  { id: 'fragments-25', title: 'Petit lot de fragments', detail: '25 fragments', icon: '🔷', price: 100, weight: 3 },
  { id: 'fragments-80', title: 'Lot de fragments', detail: '80 fragments', icon: '🔷', price: 280, weight: 3 },
  { id: 'fragments-200', title: 'Gros lot de fragments', detail: '200 fragments', icon: '💠', price: 650, weight: 1 },
  { id: 'pack-common', title: 'Coffre commun à prix réduit', detail: '3 cartes, prêt en 30 minutes', icon: '🎁', price: 90, weight: 3 },
  { id: 'pack-rare', title: 'Coffre rare', detail: '4 cartes, prêt en 3 heures', icon: '🎁', price: 450, weight: 2 },
  { id: 'number', title: 'Numéro de course', detail: 'Un numéro commun', icon: '🔢', price: 600, weight: 2, cosmetic: 'number' },
  { id: 'helmet', title: 'Casque du jour', detail: 'Un casque commun', icon: '⛑️', price: 600, weight: 2, cosmetic: 'helmet' },
];

export const DAILY_COUNT = 3;
/** At least one offer of the day costs less than this, so there is always something within reach. */
export const DAILY_CHEAP = 200;
export const DAILY_PREFIX = 'daily-';

/** The server's calendar day (Paris time), "YYYY-MM-DD": the offers change at midnight there. */
export function parisDay(now: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Milliseconds until the next Paris midnight, when the offers of the day change (exact on the days the clock changes too). */
export function msUntilNextDay(now: number): number {
  const day = parisDay(now);
  let lo = 0; // still the same day after `lo` seconds
  let hi = 25 * 3600; // always the next day
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (parisDay(now + mid * 1000) === day) lo = mid;
    else hi = mid;
  }
  return hi * 1000 - (now % 1000);
}

/** A uint32 from a string (FNV-1a): the seed of a day's draw. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0 || 1;
}

function pick<T>(items: T[], weight: (item: T) => number, rng: number): [T, number] {
  const [r, next] = nextFloat(rng);
  let left = r * items.reduce((sum, i) => sum + weight(i), 0);
  for (const item of items) {
    left -= weight(item);
    if (left < 0) return [item, next];
  }
  return [items[items.length - 1], next];
}

/**
 * The offers of a day: the same for everyone (the seed is the date), DAILY_COUNT distinct lines of the pool, at least one
 * under DAILY_CHEAP gold. A cosmetic line is left out when the player owns every common item of its kind.
 */
export function dailyOffers(day: string, owned: Record<string, number>): Offer[] {
  let rng = hash(day);
  const lines: { def: DailyDef; itemId?: string }[] = [];
  for (const def of DAILY_POOL) {
    if (!def.cosmetic) {
      lines.push({ def });
      continue;
    }
    const free = COSMETICS.filter((c) => c.cosmetic === def.cosmetic && c.rarity === 'common' && !owned[c.id]);
    if (free.length === 0) continue;
    const [r, next] = nextFloat(rng);
    rng = next;
    lines.push({ def, itemId: free[Math.floor(r * free.length)].id });
  }
  const chosen: typeof lines = [];
  let left = [...lines];
  while (chosen.length < DAILY_COUNT && left.length > 0) {
    const [line, next] = pick(left, (l) => l.def.weight, rng);
    rng = next;
    chosen.push(line);
    left = left.filter((l) => l !== line);
  }
  if (!chosen.some((l) => l.def.price < DAILY_CHEAP)) {
    const cheap = left.filter((l) => l.def.price < DAILY_CHEAP);
    if (cheap.length > 0) chosen[chosen.length - 1] = pick(cheap, (l) => l.def.weight, rng)[0];
  }
  return chosen.map(({ def, itemId }) => ({
    id: DAILY_PREFIX + def.id,
    title: def.title,
    detail: itemId ? (getItem(itemId)?.name ?? def.detail) : def.detail,
    icon: def.icon,
    price: def.price,
    currency: 'gold' as const,
    ...(itemId ? { itemId } : {}),
  }));
}

/** The offers of the day for this player now, each with whether it was already bought today. */
export function dailyView(profile: Profile, now: number): { day: string; offers: { offer: Offer; bought: boolean }[] } {
  const day = parisDay(now);
  const today = profile.shop.day === day ? profile.shop : { day, bought: [], items: [] };
  // the cosmetics bought today do not count as owned, so the day's draw does not change after a purchase
  const owned = { ...profile.owned };
  for (const item of today.items) delete owned[item];
  return { day, offers: dailyOffers(day, owned).map((offer) => ({ offer, bought: today.bought.includes(offer.id) })) };
}

// ------------------------------------------------------------- buying

export const canAfford = (profile: Profile, offer: Offer): boolean => profile[offer.currency] >= offer.price;

/** The offer with this id the player can buy now: a permanent one, or one of today's not bought yet. */
export function findOffer(profile: Profile, id: string, now: number): Offer | undefined {
  if (!id.startsWith(DAILY_PREFIX)) return OFFERS.find((o) => o.id === id);
  const entry = dailyView(profile, now).offers.find((o) => o.offer.id === id);
  return entry && !entry.bought ? entry.offer : undefined;
}

/** Buys an offer. Null when the player cannot pay, or the offer does not exist, is not one of today's or was bought today. */
export function buyOffer(profile: Profile, id: string, now: number, unlockMs?: number): Profile | null {
  const offer = findOffer(profile, id, now);
  if (!offer || !canAfford(profile, offer)) return null;
  const paid: Profile = { ...profile, [offer.currency]: profile[offer.currency] - offer.price };
  if (id.startsWith(DAILY_PREFIX)) {
    const granted = grantDaily(paid, id.slice(DAILY_PREFIX.length), offer, now, unlockMs);
    if (!granted) return null;
    const day = parisDay(now);
    const today = profile.shop.day === day ? profile.shop : { day, bought: [], items: [] };
    return { ...granted, shop: { day, bought: [...today.bought, id], items: offer.itemId ? [...today.items, offer.itemId] : today.items } };
  }
  switch (offer.id) {
    case 'pack-1':
      return addPacks(paid, 1, now, unlockMs);
    case 'pack-3':
      return addPacks(paid, 3, now, unlockMs);
    case 'pack-instant':
      return addPacks(paid, ['rare'], now, unlockMs, true);
    case 'pack-epic':
      return addPacks(paid, ['epic'], now, unlockMs);
    case 'fragments-40':
      return { ...paid, fragments: paid.fragments + 40 };
    case 'gold-400':
      return { ...paid, gold: paid.gold + 400 };
    default:
      return null;
  }
}

function grantDaily(paid: Profile, line: string, offer: Offer, now: number, unlockMs?: number): Profile | null {
  switch (line) {
    case 'fragments-25':
      return { ...paid, fragments: paid.fragments + 25 };
    case 'fragments-80':
      return { ...paid, fragments: paid.fragments + 80 };
    case 'fragments-200':
      return { ...paid, fragments: paid.fragments + 200 };
    case 'pack-common':
      return addPacks(paid, 1, now, unlockMs);
    case 'pack-rare':
      return addPacks(paid, ['rare'], now, unlockMs);
    case 'number':
    case 'helmet':
      return offer.itemId && !paid.owned[offer.itemId] ? { ...paid, owned: { ...paid.owned, [offer.itemId]: 1 } } : null;
    default:
      return null;
  }
}
