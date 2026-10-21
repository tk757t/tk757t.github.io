import { nextFloat } from '../engine/rng';
import { itemsOfRarity } from './parts/catalogue';
import { DUPLICATE_FRAGMENTS, pickRarity, type Card } from './parts/packs';
import type { Rarity } from './parts/types';

// Pure chest rules: qualities, unlock times, contents, odds, pity and how a race decides the quality.
// These calculations run on the client for now; they must move to the server when it grants rewards.

export const CHEST_TIERS = ['common', 'rare', 'epic', 'legendary'] as const;
export type ChestTier = (typeof CHEST_TIERS)[number];

const MIN = 60_000;
const HOUR = 60 * MIN;

export interface ChestDef {
  label: string;
  /** Time before the chest can be opened. */
  unlockMs: number;
  /** Number of cards. */
  cards: number;
  /** Odds (percent, sum 100) of the rarity of each card. */
  weights: Record<Rarity, number>;
  /** Gold range [min, max]. */
  gold: [number, number];
  /** Gems range: [0, 0] for a Common chest. */
  gems: [number, number];
}

export const CHESTS: Record<ChestTier, ChestDef> = {
  common: { label: 'Commun', unlockMs: 30 * MIN, cards: 3, weights: { common: 85, rare: 13, epic: 2, legendary: 0 }, gold: [20, 40], gems: [0, 0] },
  rare: { label: 'Rare', unlockMs: 3 * HOUR, cards: 4, weights: { common: 60, rare: 32, epic: 7, legendary: 1 }, gold: [50, 90], gems: [1, 3] },
  epic: { label: 'Épique', unlockMs: 8 * HOUR, cards: 5, weights: { common: 40, rare: 40, epic: 17, legendary: 3 }, gold: [100, 180], gems: [3, 6] },
  legendary: { label: 'Légendaire', unlockMs: 12 * HOUR, cards: 6, weights: { common: 20, rare: 40, epic: 30, legendary: 10 }, gold: [250, 400], gems: [6, 12] },
};

export const isChestTier = (x: unknown): x is ChestTier => typeof x === 'string' && (CHEST_TIERS as readonly string[]).includes(x);

/** Pity: the chest opened after this many chests without a legendary card holds one for sure. */
export const PITY_CHESTS = 30;

/** A Rare chest is guaranteed on every this-many-th victory. */
export const WINS_PER_RARE = 5;

/** One gem per started slice of this duration left. */
export const SKIP_MS_PER_GEM = 10 * MIN;

/** Gems to open a chest that still has `remainingMs` to wait (1 per 10 minutes, at least 1). */
export const skipGemCost = (remainingMs: number): number => Math.max(1, Math.ceil(remainingMs / SKIP_MS_PER_GEM));

// ------------------------------------------------------------ opening

export interface ChestOpening {
  cards: Card[];
  gold: number;
  gems: number;
  rng: number;
  /** Whether the pity guarantee turned a card legendary. */
  pityTriggered: boolean;
  /** The pity gauge after this chest. */
  pity: number;
}

const between = (r: number, [lo, hi]: [number, number]): number => lo + Math.floor(r * (hi - lo + 1));

/**
 * Opens one chest. Pure and seeded: the same rng state, collection and pity gauge always give the same loot.
 * `owned` is the collection before the chest; duplicates (also inside the chest) become fragments.
 */
export function openChest(rngState: number, owned: Record<string, number>, tier: ChestTier, pity: number): ChestOpening {
  let rng = rngState >>> 0;
  const draw = (): number => {
    const [v, next] = nextFloat(rng);
    rng = next;
    return v;
  };
  const def = CHESTS[tier];
  const forced = pity >= PITY_CHESTS - 1;
  const have = new Set(Object.keys(owned));
  const cards: Card[] = [];
  let pityTriggered = false;
  for (let i = 0; i < def.cards; i++) {
    let rarity = pickRarity(draw(), def.weights);
    if (forced && i === def.cards - 1 && !cards.some((c) => c.rarity === 'legendary') && rarity !== 'legendary') {
      rarity = 'legendary';
      pityTriggered = true;
    }
    const pool = itemsOfRarity(rarity);
    const item = pool[Math.min(pool.length - 1, Math.floor(draw() * pool.length))];
    const isNew = !have.has(item.id);
    have.add(item.id);
    cards.push({ itemId: item.id, rarity, isNew, fragments: isNew ? 0 : DUPLICATE_FRAGMENTS[rarity] });
  }
  const gold = between(draw(), def.gold);
  const gems = between(draw(), def.gems);
  const hasLegendary = cards.some((c) => c.rarity === 'legendary');
  return { cards, gold, gems, rng, pityTriggered, pity: hasLegendary ? 0 : pity + 1 };
}

// --------------------------------------------------------- obtaining

const BEST_ODDS: Record<ChestTier, number> = { common: 30, rare: 40, epic: 22, legendary: 8 };
const WORST_ODDS: Record<ChestTier, number> = { common: 85, rare: 13, epic: 2, legendary: 0 };

/** Odds (percent) of each chest quality for a finishing place: first leans high, last is mostly Common. */
export function tierOdds(rank: number, players: number): Record<ChestTier, number> {
  const r = players <= 1 ? 0 : Math.min(1, Math.max(0, (rank - 1) / (players - 1)));
  const out = {} as Record<ChestTier, number>;
  for (const t of CHEST_TIERS) out[t] = BEST_ODDS[t] + (WORST_ODDS[t] - BEST_ODDS[t]) * r;
  return out;
}

/** The quality of a chest won at `rank` of `players`; `rand` in [0, 1). */
export function rollTier(rank: number, players: number, rand: number): ChestTier {
  const odds = tierOdds(rank, players);
  let x = rand * 100;
  for (const t of CHEST_TIERS) {
    x -= odds[t];
    if (x < 0) return t;
  }
  return 'common';
}

/** Raises a quality to at least Rare. */
export const atLeastRare = (tier: ChestTier): ChestTier => (tier === 'common' ? 'rare' : tier);
