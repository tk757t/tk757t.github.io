import { getItem, getPart } from '../data/parts/catalogue';
import { GIFT_STREAK_DAYS, WELCOME_MS } from '../data/gift';
import { CHESTS, PITY_CHESTS, type ChestTier } from '../data/chests';
import { parseProfile, SLOT_COUNT, type Profile } from '../data/profile/profile';
import { QUESTS } from '../data/quests';
import { xpForLevel } from '../data/xp';
import { UNLOCK_STARS } from '../storage/campaign';
import type { Loadout } from '../data/parts/types';
import { fail } from './errors';
import { rngFrom, STATE_VERSION, type ServerState } from './state';

/**
 * One-time import of the save of the device, at the first connection of an account (no game_state yet). The local save
 * cannot be trusted (anyone can edit localStorage): it is cleaned by parseProfile, then held to what an honest player can
 * plausibly have. Every value brought down is reported to the player and written to the action log.
 */
export const IMPORT_CAPS = {
  gold: 10_000,
  gems: 200,
  fragments: 3_000,
  /** XP of this account level. */
  level: 40,
  /** Highest level of an imported part. */
  partLevel: 3,
  /** Imported items of these rarities, at most (first ones kept). */
  legendaryItems: 2,
  epicItems: 5,
  /** Chests in slots and reserve together. */
  chests: 12,
  /** Epic or Legendary chests, at most (the others become Rare). */
  bigChests: 2,
  races: 2_000,
  packsOpened: 5_000,
  upgrades: 1_000,
} as const;

/** Longest text accepted for a save (the largest honest save is a few kilobytes). */
export const MAX_SAVE_CHARS = 64_000;

export interface Adjustment {
  field: string;
  from: number | string;
  to: number | string;
}

/** Holds a cleaned profile to the import caps; returns the bounded profile and what was changed. */
export function boundProfile(input: Profile, now: number): { profile: Profile; report: Adjustment[] } {
  const report: Adjustment[] = [];
  const cap = (field: string, value: number, max: number): number => {
    if (value <= max) return value;
    report.push({ field, from: value, to: max });
    return max;
  };
  const p: Profile = structuredClone(input);
  p.gold = cap('gold', p.gold, IMPORT_CAPS.gold);
  p.gems = cap('gems', p.gems, IMPORT_CAPS.gems);
  p.fragments = cap('fragments', p.fragments, IMPORT_CAPS.fragments);
  p.xp = cap('xp', p.xp, xpForLevel(IMPORT_CAPS.level));
  p.races = cap('races', p.races, IMPORT_CAPS.races);
  p.wins = cap('wins', p.wins, p.races);
  p.packsOpened = cap('packsOpened', p.packsOpened, IMPORT_CAPS.packsOpened);
  p.upgrades = cap('upgrades', p.upgrades, IMPORT_CAPS.upgrades);
  p.pity = cap('pity', p.pity, PITY_CHESTS - 1);

  // items: part levels, and few epic / legendary items
  const kept: Record<string, number> = {};
  let legendary = 0;
  let epic = 0;
  for (const [itemId, level] of Object.entries(p.owned)) {
    const item = getItem(itemId);
    if (!item) continue;
    if (item.rarity === 'legendary' && ++legendary > IMPORT_CAPS.legendaryItems) {
      report.push({ field: `owned.${itemId}`, from: level, to: 0 });
      continue;
    }
    if (item.rarity === 'epic' && ++epic > IMPORT_CAPS.epicItems) {
      report.push({ field: `owned.${itemId}`, from: level, to: 0 });
      continue;
    }
    kept[itemId] = item.kind === 'part' ? cap(`owned.${itemId}`, level, IMPORT_CAPS.partLevel) : 1;
  }
  p.owned = kept;
  const loadout: Loadout = { parts: {} };
  for (const [slot, partId] of Object.entries(p.loadout.parts)) if (partId && kept[partId] && getPart(partId)) loadout.parts[slot as keyof Loadout['parts']] = partId;
  for (const key of ['paint', 'number', 'helmet'] as const) if (p.loadout[key] && kept[p.loadout[key]]) loadout[key] = p.loadout[key];
  p.loadout = loadout;

  // chests: how many, how big, and timers that cannot be longer than the chest's own (device clocks are not trusted)
  let big = 0;
  const tierOf = (tier: ChestTier, field: string): ChestTier => {
    if (tier !== 'epic' && tier !== 'legendary') return tier;
    if (++big <= IMPORT_CAPS.bigChests) return tier;
    report.push({ field, from: tier, to: 'rare' });
    return 'rare';
  };
  let total = 0;
  p.slots = p.slots.slice(0, SLOT_COUNT).map((s, i) => {
    if (!s) return null;
    total++;
    const tier = tierOf(s.tier, `slots.${i}`);
    const latest = now + CHESTS[tier].unlockMs;
    return { tier, readyAt: Math.min(s.readyAt, latest) };
  });
  const room = Math.max(0, IMPORT_CAPS.chests - total);
  if (p.packs.length > room) report.push({ field: 'packs', from: p.packs.length, to: room });
  p.packs = p.packs.slice(0, room).map((t, i) => tierOf(t, `packs.${i}`));

  // campaign: a level has stars only if every level before it was finished
  const stars: number[] = [];
  for (const s of p.campaign.stars) {
    if (stars.length > 0 && stars[stars.length - 1] < UNLOCK_STARS) break;
    stars.push(s);
  }
  while (stars.length > 0 && stars[stars.length - 1] === 0) stars.pop();
  if (p.campaign.stars.slice(stars.length).some((s) => s > 0)) report.push({ field: 'campaign', from: p.campaign.stars.join(','), to: stars.join(',') });
  p.campaign = { stars };

  // the gift streak of a device is capped; the welcome pack is on offer from now, whatever the save says
  p.gift = { ...p.gift, streak: Math.min(p.gift.streak, GIFT_STREAK_DAYS) };
  p.welcomeUntil = now + WELCOME_MS;
  p.pass = { season: 0, points: 0, claimed: [] }; // the pass starts from zero on the server

  // quests: only ids that exist
  p.claimed = p.claimed.filter((q) => QUESTS.some((x) => x.id === q));
  return { profile: p, report };
}

/** Builds the first server state from the text of a local save. Throws a GameError when the text cannot be read. */
export function importSave(text: unknown, now: number, random: () => number): { state: ServerState; report: Adjustment[] } {
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_SAVE_CHARS) return fail('Sauvegarde illisible : elle n’a pas été importée.', 'invalid');
  const parsed = parseProfile(text);
  if (!parsed) return fail('Sauvegarde illisible : elle n’a pas été importée.', 'invalid');
  const { profile, report } = boundProfile(parsed.profile, now);
  // the chest rng of the device is never kept (it could have been chosen to draw a legendary card)
  profile.rng = rngFrom(random);
  // trophies are earned on the server only: whatever the device says is dropped
  profile.ranked = { trophies: 0, peak: 0, races: 0, wins: 0, season: 0 };
  return { state: { v: STATE_VERSION, profile, race: null, finishes: [], soloFinishes: [], rankedFinishes: [], importedAt: now, createdAt: now }, report };
}
