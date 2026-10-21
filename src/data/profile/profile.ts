import { ITEMS, getItem, getPart } from '../parts/catalogue';
import { DUPLICATE_FRAGMENTS } from '../parts/packs';
import { isChestTier, type ChestTier } from '../chests';
import { MAX_LEVEL, SLOTS, type Loadout, type Slot } from '../parts/types';
import { PASS_TIERS, TIER_POINTS } from '../pass-constants';
import { LEVEL_COUNT } from '../campaign/levels';
import { emptyProgress, progressFromStageCount, sanitizeProgress, type CampaignProgress } from '../../storage/campaign';

export const SAVE_VERSION = 5;
export const SAVE_KEY = '4mules.save';
export const BACKUP_KEY = '4mules.save.backup';
export const STARTING_PACKS = 3;
export const SLOT_COUNT = 4;
export const START_GOLD = 200;
export const START_GEMS = 25;

/** A chest waiting in one of the four slots; it can be opened once `readyAt` (ms since epoch) is past. Its quality is fixed when it is obtained. */
export interface PackSlot {
  readyAt: number;
  tier: ChestTier;
}

export interface Profile {
  version: typeof SAVE_VERSION;
  /** Chests kept in reserve while the four slots are busy (they move into a slot when one frees up, oldest first). */
  packs: ChestTier[];
  slots: (PackSlot | null)[];
  fragments: number;
  gold: number;
  gems: number;
  xp: number;
  /** Item id -> level (parts 1..5, cosmetics always 1). */
  owned: Record<string, number>;
  loadout: Loadout;
  /** Uint32 state of the pack rng, saved so reloading the page does not replay the same packs. */
  rng: number;
  races: number;
  wins: number;
  packsOpened: number;
  /** Pity gauge: chests opened since the last legendary card (see PITY_CHESTS). */
  pity: number;
  upgrades: number;
  /** Best stars on each campaign level (see src/storage/campaign.ts). */
  campaign: CampaignProgress;
  /** Quest ids whose reward was collected. */
  claimed: string[];
  /** What was bought from the offers of the day on `day` (Paris calendar day): offer ids, and the cosmetics among them. */
  shop: { day: string; bought: string[]; items: string[] };
  /** Daily gift: the Paris day it was last collected and the consecutive days so far. */
  gift: { day: string; streak: number };
  /** The welcome pack can be collected until this time (ms since epoch); 0 when not on offer or already collected. Set by the server. */
  welcomeUntil: number;
  /** Season pass: the season of these points, the points, and the free tiers collected (see src/data/pass.ts). */
  pass: { season: number; points: number; claimed: number[] };
}

/** The subset of the Web Storage API the save needs (so tests can use a plain object). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function newProfile(seed: number): Profile {
  const slots: (PackSlot | null)[] = Array.from({ length: SLOT_COUNT }, (_, i) => (i < STARTING_PACKS ? { readyAt: 0, tier: 'common' as const } : null));
  return {
    version: SAVE_VERSION,
    packs: [],
    slots,
    fragments: 0,
    gold: START_GOLD,
    gems: START_GEMS,
    xp: 0,
    owned: {},
    loadout: { parts: {} },
    rng: seed >>> 0,
    races: 0,
    wins: 0,
    packsOpened: 0,
    pity: 0,
    upgrades: 0,
    campaign: emptyProgress(),
    claimed: [],
    shop: { day: '', bought: [], items: [] },
    gift: { day: '', streak: 0 },
    welcomeUntil: 0,
    pass: { season: 0, points: 0, claimed: [] },
  };
}

/** Packs the player holds, in slots and in reserve. */
export const totalPacks = (p: Pick<Profile, 'packs' | 'slots'>): number => p.packs.length + p.slots.filter((s) => s !== null).length;

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const count = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0);

/** Format 1 (first release): a flat inventory list and an `equipped` map, no levels, no fragments. */
interface ProfileV1 {
  version: 1;
  packs?: number;
  seed?: number;
  inventory?: string[];
  equipped?: Record<string, string>;
}

/** Each entry upgrades a save of version N to N + 1. */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  1: (raw) => {
    const v1 = raw as unknown as ProfileV1;
    const owned: Record<string, number> = {};
    let fragments = 0;
    for (const id of Array.isArray(v1.inventory) ? v1.inventory : []) {
      const item = typeof id === 'string' ? getItem(id) : undefined;
      if (!item) continue; // item that no longer exists
      if (owned[item.id]) fragments += DUPLICATE_FRAGMENTS[item.rarity]; // v1 kept duplicates, v2 turns them into fragments
      else owned[item.id] = 1;
    }
    const parts: Record<string, string> = {};
    if (isRecord(v1.equipped)) for (const [slot, id] of Object.entries(v1.equipped)) if (typeof id === 'string') parts[slot] = id;
    return {
      version: 2,
      packs: count(v1.packs),
      fragments,
      owned,
      loadout: { parts },
      rng: typeof v1.seed === 'number' ? v1.seed : 1,
      races: 0,
      wins: 0,
    };
  },
  // v2 -> v3: currencies, XP, timed pack slots, campaign and quests
  2: (raw) => {
    const packs = count(raw.packs);
    const slots = Array.from({ length: SLOT_COUNT }, (_, i) => (i < packs ? { readyAt: 0 } : null));
    return {
      ...raw,
      version: 3,
      packs: Math.max(0, packs - SLOT_COUNT),
      slots,
      gold: START_GOLD,
      gems: START_GEMS,
      xp: count(raw.races) * 20 + count(raw.wins) * 30, // what the races played so far would have given
      packsOpened: 0,
      upgrades: 0,
      campaign: 0,
      claimed: [],
    };
  },
  // v3 -> v4: the campaign is three levels with stars (what was won before counts as levels finished once)
  3: (raw) => ({ ...raw, version: 4, campaign: progressFromStageCount(raw.campaign, LEVEL_COUNT) }),
  // v4 -> v5: chests have a quality; every pack held so far becomes a Common chest
  4: (raw) => ({
    ...raw,
    version: 5,
    packs: Array.from({ length: count(raw.packs) }, () => 'common'),
    slots: (Array.isArray(raw.slots) ? raw.slots : []).map((s: unknown) => (isRecord(s) ? { ...s, tier: 'common' } : s)),
    pity: 0,
  }),
};

function sanitizeSlots(x: unknown): (PackSlot | null)[] {
  const src = Array.isArray(x) ? x : [];
  return Array.from({ length: SLOT_COUNT }, (_, i) => {
    const s = src[i];
    return isRecord(s) && typeof s.readyAt === 'number' && Number.isFinite(s.readyAt) ? { readyAt: Math.max(0, s.readyAt), tier: isChestTier(s.tier) ? s.tier : 'common' } : null;
  });
}

const strings = (x: unknown): string[] => (Array.isArray(x) ? [...new Set(x.filter((s): s is string => typeof s === 'string' && s.length <= 40))].slice(0, 20) : []);

function sanitizeShop(x: unknown): Profile['shop'] {
  const s = isRecord(x) ? x : {};
  return { day: isDay(s.day) ? s.day : '', bought: strings(s.bought), items: strings(s.items).filter((id) => getItem(id)?.kind === 'cosmetic') };
}

const isDay = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);

function sanitizeGift(x: unknown): Profile['gift'] {
  const g = isRecord(x) ? x : {};
  return isDay(g.day) ? { day: g.day, streak: Math.min(9_999, Math.max(1, count(g.streak))) } : { day: '', streak: 0 };
}

function sanitizePass(x: unknown): Profile['pass'] {
  const s = isRecord(x) ? x : {};
  const claimed = Array.isArray(s.claimed) ? [...new Set(s.claimed.filter((t): t is number => Number.isInteger(t) && t >= 1 && t <= PASS_TIERS))].sort((a, b) => a - b) : [];
  return { season: Math.min(count(s.season), 10_000), points: Math.min(count(s.points), PASS_TIERS * TIER_POINTS), claimed };
}

/** Cleans the current-version object: drops unknown items, clamps numbers, repairs the loadout. */
function sanitize(raw: Record<string, unknown>): Profile {
  const owned: Record<string, number> = {};
  if (isRecord(raw.owned)) {
    for (const [id, level] of Object.entries(raw.owned)) {
      const item = getItem(id);
      if (!item) continue;
      owned[id] = item.kind === 'part' ? Math.min(MAX_LEVEL, Math.max(1, count(level))) : 1;
    }
  }
  const loadout: Loadout = { parts: {} };
  const src = isRecord(raw.loadout) ? raw.loadout : {};
  const srcParts = isRecord(src.parts) ? src.parts : {};
  for (const slot of SLOTS) {
    const id = srcParts[slot];
    const part = typeof id === 'string' ? getPart(id) : undefined;
    if (part && part.slot === slot && owned[part.id]) loadout.parts[slot as Slot] = part.id;
  }
  for (const key of ['paint', 'number', 'helmet'] as const) {
    const id = src[key];
    const item = typeof id === 'string' ? getItem(id) : undefined;
    if (item?.kind === 'cosmetic' && item.cosmetic === key && owned[item.id]) loadout[key] = item.id;
  }
  const rng = typeof raw.rng === 'number' && Number.isInteger(raw.rng) && raw.rng >= 0 && raw.rng <= 0xffffffff ? raw.rng : 1;
  return {
    version: SAVE_VERSION,
    packs: Array.isArray(raw.packs) ? raw.packs.filter(isChestTier).slice(0, 200) : [],
    slots: sanitizeSlots(raw.slots),
    fragments: count(raw.fragments),
    gold: count(raw.gold),
    gems: count(raw.gems),
    xp: count(raw.xp),
    owned,
    loadout,
    rng,
    races: count(raw.races),
    wins: count(raw.wins),
    packsOpened: count(raw.packsOpened),
    pity: count(raw.pity),
    upgrades: count(raw.upgrades),
    campaign: sanitizeProgress(raw.campaign, LEVEL_COUNT),
    claimed: Array.isArray(raw.claimed) ? [...new Set(raw.claimed.filter((x): x is string => typeof x === 'string'))] : [],
    shop: sanitizeShop(raw.shop),
    gift: sanitizeGift(raw.gift),
    welcomeUntil: count(raw.welcomeUntil),
    pass: sanitizePass(raw.pass),
  };
}

export type LoadStatus = 'new' | 'loaded' | 'migrated' | 'recovered';

/** Parses a stored save (any known version). Returns null if it cannot be understood. */
export function parseProfile(text: string): { profile: Profile; migrated: boolean } | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw) || typeof raw.version !== 'number' || !Number.isInteger(raw.version)) return null;
  if (raw.version < 1 || raw.version > SAVE_VERSION) return null; // unknown / future format
  let current: Record<string, unknown> = raw;
  let version = raw.version;
  while (version < SAVE_VERSION) {
    current = MIGRATIONS[version](current);
    version++;
  }
  return { profile: sanitize(current), migrated: raw.version < SAVE_VERSION };
}

export function serializeProfile(profile: Profile): string {
  return JSON.stringify(profile);
}

/**
 * Loads the save. Without one (or with an unreadable one, which is kept under BACKUP_KEY so that
 * nothing is lost) a fresh profile is created from `seed`.
 */
export function loadProfile(store: KeyValueStore | null, seed: number): { profile: Profile; status: LoadStatus } {
  let text: string | null;
  try {
    text = store?.getItem(SAVE_KEY) ?? null;
  } catch {
    text = null;
  }
  if (text === null) return { profile: newProfile(seed), status: 'new' };
  const parsed = parseProfile(text);
  if (!parsed) {
    try {
      store?.setItem(BACKUP_KEY, text);
    } catch {
      /* nothing more we can do */
    }
    return { profile: newProfile(seed), status: 'recovered' };
  }
  return { profile: parsed.profile, status: parsed.migrated ? 'migrated' : 'loaded' };
}

/** Writes the save. Returns false when the storage refuses (private mode, quota...). */
export function saveProfile(store: KeyValueStore | null, profile: Profile): boolean {
  try {
    store?.setItem(SAVE_KEY, serializeProfile(profile));
    return store !== null;
  } catch {
    return false;
  }
}

export const itemCount = (): number => ITEMS.length;
