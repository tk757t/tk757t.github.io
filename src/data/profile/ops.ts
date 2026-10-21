import { getItem, getPart } from '../parts/catalogue';
import { modsForLoadout } from '../parts/effects';
import { openTierPack, upgradeCost, type Card } from '../parts/packs';
import { CHESTS, WINS_PER_RARE, atLeastRare, openChest, rollTier, skipGemCost, type ChestTier } from '../chests';
import { LEVELS } from '../campaign/levels';
import { recordResult } from '../../storage/campaign';
import { MAX_LEVEL, type Loadout, type Slot } from '../parts/types';
import type { CarMods } from '../../engine/types';
import type { RankedOutcome } from '../ranked';
import { nextFloat } from '../../engine/rng';
import { levelFromXp, raceXp, xpForLevel } from '../xp';
import { SLOT_COUNT, type Profile } from './profile';

/** How long a chest takes to unlock: its quality's time, or `override` (tests and dev only). */
export const unlockMsOf = (tier: ChestTier, override?: number): number => override ?? CHESTS[tier].unlockMs;

// --------------------------------------------------------------- levels

export { xpForLevel };

export const levelOf = (xp: number): number => levelFromXp(xp).level;

/** XP gained inside the current level and the size of that level, for the XP bar. */
export function levelProgress(xp: number): { level: number; into: number; span: number } {
  const l = levelFromXp(xp);
  return { level: l.level, into: l.into, span: l.needed };
}

// ------------------------------------------------------- chest slots

export type SlotState = { kind: 'empty' } | { kind: 'locked'; remainingMs: number; tier: ChestTier } | { kind: 'ready'; tier: ChestTier };

export function slotState(profile: Profile, index: number, now: number): SlotState {
  const slot = profile.slots[index];
  if (!slot) return { kind: 'empty' };
  return slot.readyAt <= now ? { kind: 'ready', tier: slot.tier } : { kind: 'locked', remainingMs: slot.readyAt - now, tier: slot.tier };
}

export const readyPacks = (profile: Profile, now: number): number => profile.slots.filter((s) => s && s.readyAt <= now).length;

/** Gems needed to open a locked chest right now: 1 per 10 minutes left, at least 1. */
export const skipCost = skipGemCost;

/** Moves reserve chests into free slots (each starts its timer), oldest first. */
export function refillSlots(profile: Profile, now: number, unlockOverride?: number): Profile {
  let used = 0;
  const slots = profile.slots.map((s) => {
    if (s || used >= profile.packs.length) return s;
    const tier = profile.packs[used++];
    return { readyAt: now + unlockMsOf(tier, unlockOverride), tier };
  });
  return used === 0 ? profile : { ...profile, packs: profile.packs.slice(used), slots };
}

/** Adds chests (a list of qualities, or a count of Common ones): into free slots first (timer running), the rest in reserve. `instant` skips the timer. */
export function addPacks(profile: Profile, chests: ChestTier[] | number, now: number, unlockOverride?: number, instant = false): Profile {
  const tiers: ChestTier[] = typeof chests === 'number' ? Array.from({ length: Math.max(0, chests) }, () => 'common') : chests;
  if (tiers.length === 0) return profile;
  const slots = [...profile.slots];
  const reserve = [...profile.packs];
  for (const tier of tiers) {
    const free = slots.indexOf(null);
    if (free < 0) reserve.push(tier);
    else slots[free] = { readyAt: instant ? now : now + unlockMsOf(tier, unlockOverride), tier };
  }
  return { ...profile, slots, packs: reserve };
}

export interface OpenedChest {
  profile: Profile;
  tier: ChestTier;
  cards: Card[];
  gold: number;
  gems: number;
  pityTriggered: boolean;
}

/** Opens a chest of `tier`, adds its loot to the profile and moves the pity gauge (no slot accounting). */
function drawChest(profile: Profile, tier: ChestTier): OpenedChest {
  const result = openChest(profile.rng, profile.owned, tier, profile.pity);
  const owned = { ...profile.owned };
  let fragments = profile.fragments;
  for (const c of result.cards) {
    if (c.isNew) owned[c.itemId] = 1;
    else fragments += c.fragments;
  }
  const next: Profile = {
    ...profile,
    fragments,
    owned,
    gold: profile.gold + result.gold,
    gems: profile.gems + result.gems,
    rng: result.rng,
    pity: result.pity,
    packsOpened: profile.packsOpened + 1,
  };
  return { profile: next, tier, cards: result.cards, gold: result.gold, gems: result.gems, pityTriggered: result.pityTriggered };
}

/** Opens the chest of a slot if its timer is over. The slot is freed and refilled from the reserve. */
export function openSlot(profile: Profile, index: number, now: number, unlockOverride?: number): OpenedChest | null {
  const state = slotState(profile, index, now);
  if (state.kind !== 'ready') return null;
  const drawn = drawChest(profile, state.tier);
  const slots = [...drawn.profile.slots];
  slots[index] = null;
  return { ...drawn, profile: refillSlots({ ...drawn.profile, slots }, now, unlockOverride) };
}

/** Pays gems to finish the timer of a locked slot. Null when it is not locked or gems are short. */
export function skipSlot(profile: Profile, index: number, now: number): Profile | null {
  const state = slotState(profile, index, now);
  if (state.kind !== 'locked') return null;
  const cost = skipCost(state.remainingMs);
  if (profile.gems < cost) return null;
  const slots = [...profile.slots];
  slots[index] = { readyAt: now, tier: state.tier };
  return { ...profile, gems: profile.gems - cost, slots };
}

// -------------------------------------------------------- equipment

/** Equips an owned item in its slot (or cosmetic category). Null if it is not owned. */
export function equip(profile: Profile, itemId: string): Profile | null {
  const item = getItem(itemId);
  if (!item || !profile.owned[itemId]) return null;
  const loadout: Loadout = { ...profile.loadout, parts: { ...profile.loadout.parts } };
  if (item.kind === 'part') loadout.parts[item.slot] = item.id;
  else loadout[item.cosmetic] = item.id;
  return { ...profile, loadout };
}

export function unequipSlot(profile: Profile, slot: Slot): Profile {
  const parts = { ...profile.loadout.parts };
  delete parts[slot];
  return { ...profile, loadout: { ...profile.loadout, parts } };
}

export function unequipCosmetic(profile: Profile, kind: 'paint' | 'number' | 'helmet'): Profile {
  const loadout = { ...profile.loadout, parts: { ...profile.loadout.parts } };
  delete loadout[kind];
  return { ...profile, loadout };
}

/** Spends fragments to take an owned part one level up. Null if impossible. */
export function upgradePart(profile: Profile, partId: string): Profile | null {
  const part = getPart(partId);
  const level = profile.owned[partId];
  if (!part || !level || level >= MAX_LEVEL) return null;
  const cost = upgradeCost(part.rarity, level);
  if (cost === null || profile.fragments < cost) return null;
  return { ...profile, fragments: profile.fragments - cost, owned: { ...profile.owned, [partId]: level + 1 }, upgrades: profile.upgrades + 1 };
}

/** What the equipped parts give to a car. */
export const loadoutMods = (profile: Profile): CarMods => modsForLoadout(profile.loadout, profile.owned);

// ------------------------------------------------------------ rewards

export interface RaceRewards {
  packs: number;
  /** Quality of each chest won (the first is at least Rare every WINS_PER_RARE-th win). */
  chests: ChestTier[];
  gold: number;
  xp: number;
  /** Total XP of the profile before and after the race, for the level bar. */
  xpBefore: number;
  xpAfter: number;
  gems: number;
  levelUp: number | null;
  /** Season pass points the race added (set by awardRaceWithPass, src/data/rewards.ts). */
  pass?: number;
  /** Campaign level finished for the first time by this race. */
  stageCleared: boolean;
  /** What a ranked race did to the trophies (set by the server only). */
  ranked?: RankedOutcome;
  /** Set when the race was a campaign level. */
  campaign?: {
    level: number;
    stars: number;
    /** Stars above the best so far (each paid gems). */
    newStars: number;
    /** Cards of the reward pack, already added to the collection (first finish only). */
    cards: Card[];
  };
}

/** Packs earned by finishing a race: 1 for taking part, +1 for the win. */
export function raceReward(rank: number, retired: boolean): number {
  return (retired ? 0 : 1) + (rank === 1 && !retired ? 1 : 0);
}

/** Adds experience and reports the new level when it changed. */
export function addXp(profile: Profile, xp: number): { profile: Profile; levelUp: number | null } {
  const before = levelOf(profile.xp);
  const next = { ...profile, xp: profile.xp + xp };
  const after = levelOf(next.xp);
  return { profile: next, levelUp: after > before ? after : null };
}

/** A free race against AIs only (no other person, no campaign) pays this much gold, no chest, up to SOLO_PAID_PER_HOUR races per hour. */
export const SOLO_GOLD = 10;
export const SOLO_PAID_PER_HOUR = 5;

export interface RaceContext {
  rank: number;
  retired: boolean;
  /** Field size, whether an opponent is an AI, and whether no part broke: they scale the XP (default: 4 players, bots, not clean). */
  players?: number;
  vsBots?: boolean;
  clean?: boolean;
  now: number;
  /** Overrides every chest's unlock time (tests and dev only). */
  unlockMs?: number;
  /** The campaign level that was played and the stars the race earned, if any. */
  campaign?: { level: number; stars: number };
  /** Free race against AIs only: it pays SOLO_GOLD (nothing once `soloPaid` is false, nothing when retired) and no chest. */
  soloVsAi?: boolean;
  soloPaid?: boolean;
}

/** Everything a finished race pays: packs, gold, XP, and the campaign progress. */
export function awardRace(profile: Profile, ctx: RaceContext): { profile: Profile; rewards: RaceRewards } {
  const won = ctx.rank === 1 && !ctx.retired;
  const solo = ctx.soloVsAi === true && !ctx.campaign;
  const packs = solo ? 0 : raceReward(ctx.rank, ctx.retired);
  const players = ctx.players ?? 4;
  let gold = solo ? (!ctx.retired && ctx.soloPaid !== false ? SOLO_GOLD : 0) : ctx.retired ? 10 : 30 + (won ? 70 : ctx.rank === 2 ? 30 : 0);
  let xp = raceXp({ rank: ctx.rank, players, retired: ctx.retired, clean: ctx.clean, vsBots: ctx.vsBots ?? true });
  let gems = 0;
  let stageCleared = false;
  let campaign = profile.campaign;
  let collection: Pick<Profile, 'owned' | 'fragments' | 'rng' | 'packsOpened'> = { owned: profile.owned, fragments: profile.fragments, rng: profile.rng, packsOpened: profile.packsOpened };
  let campaignRewards: RaceRewards['campaign'];
  if (ctx.campaign) {
    const level = LEVELS[ctx.campaign.level];
    const rec = level ? recordResult(profile.campaign, ctx.campaign.level, ctx.campaign.stars) : null;
    if (level && rec) {
      campaign = rec.progress;
      gems += rec.newStars * level.starGems;
      let cards: Card[] = [];
      if (rec.firstClear) {
        stageCleared = true;
        gold += level.reward.gold;
        gems += level.reward.gems;
        xp += level.reward.xp;
        const result = openTierPack(profile.rng, profile.owned, level.reward.pack.tier, level.reward.pack.guaranteedPart);
        const owned = { ...profile.owned };
        let fragments = profile.fragments;
        for (const c of result.cards) {
          if (c.isNew) owned[c.itemId] = 1;
          else fragments += c.fragments;
        }
        collection = { owned, fragments, rng: result.rng, packsOpened: profile.packsOpened + 1 };
        cards = result.cards;
      } else if (won) {
        gold += Math.floor(level.reward.gold / 4); // replaying a finished level pays a little gold
      }
      campaignRewards = { level: ctx.campaign.level, stars: ctx.campaign.stars, newStars: rec.newStars, cards };
    }
  }
  const base: Profile = {
    ...profile,
    races: profile.races + 1,
    wins: profile.wins + (won ? 1 : 0),
    gold: profile.gold + gold,
    gems: profile.gems + gems,
    campaign,
    ...collection,
  };
  // each chest has its own quality, drawn from the saved rng; every WINS_PER_RARE-th win gives at least a Rare one
  let rng = base.rng;
  const chests: ChestTier[] = [];
  for (let i = 0; i < packs; i++) {
    const [r, next] = nextFloat(rng);
    rng = next;
    chests.push(rollTier(ctx.rank, players, r));
  }
  if (won && base.wins % WINS_PER_RARE === 0 && chests.length > 0) chests[0] = atLeastRare(chests[0]);
  const withPacks = addPacks({ ...base, rng }, chests, ctx.now, ctx.unlockMs);
  const leveled = addXp(withPacks, xp);
  return { profile: leveled.profile, rewards: { packs, chests, gold, xp, xpBefore: profile.xp, xpAfter: leveled.profile.xp, gems, levelUp: leveled.levelUp, stageCleared, campaign: campaignRewards } };
}

export const SLOT_TOTAL = SLOT_COUNT;
