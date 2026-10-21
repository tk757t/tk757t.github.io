import { nextFloat } from '../../engine/rng';
import { ITEMS, getItem, itemsOfRarity } from './catalogue';
import { MAX_LEVEL, RARITIES, type ItemDef, type Rarity } from './types';

/** Drop weights (sum 100): the odds of each rarity for a card. */
export const RARITY_WEIGHTS: Record<Rarity, number> = { common: 60, rare: 28, epic: 9, legendary: 3 };

export const PACK_SIZE = 5;

/** The last card of a pack is at least this rare. */
export const GUARANTEED_RARITY: Rarity = 'rare';

/** Fragments given when a card is a duplicate. */
export const DUPLICATE_FRAGMENTS: Record<Rarity, number> = { common: 5, rare: 12, epic: 30, legendary: 70 };

const UPGRADE_BASE: Record<Rarity, number> = { common: 10, rare: 20, epic: 40, legendary: 80 };

/** Fragments needed to take a part from `level` to `level + 1` (null at the maximum level). */
export function upgradeCost(rarity: Rarity, level: number): number | null {
  return level >= MAX_LEVEL ? null : UPGRADE_BASE[rarity] * level;
}

export interface Card {
  itemId: string;
  rarity: Rarity;
  /** False for a duplicate, which was turned into fragments. */
  isNew: boolean;
  fragments: number;
}

export interface PackResult {
  cards: Card[];
  /** The rng state after the draw: store it so the next pack differs. */
  rng: number;
}

export function pickRarity(rand: number, weights: Partial<Record<Rarity, number>> = RARITY_WEIGHTS): Rarity {
  const pool = RARITIES.filter((r) => (weights[r] ?? 0) > 0);
  const total = pool.reduce((sum, r) => sum + (weights[r] ?? 0), 0);
  let x = rand * total;
  for (const r of pool) {
    x -= weights[r] ?? 0;
    if (x < 0) return r;
  }
  return pool[pool.length - 1];
}

function pickItem(rarity: Rarity, rand: number): ItemDef {
  const pool = itemsOfRarity(rarity);
  return pool[Math.min(pool.length - 1, Math.floor(rand * pool.length))];
}

/**
 * Opens one pack. Pure and seeded: the same rng state and collection always give the same cards.
 * `owned` is the collection (id -> level) before the pack; duplicates, also inside the pack, give fragments.
 */
export function openPack(rngState: number, owned: Record<string, number>): PackResult {
  let rng = rngState >>> 0;
  const draw = (): number => {
    const [v, next] = nextFloat(rng);
    rng = next;
    return v;
  };
  const have = new Set(Object.keys(owned));
  const cards: Card[] = [];
  for (let i = 0; i < PACK_SIZE; i++) {
    const last = i === PACK_SIZE - 1;
    const weights: Partial<Record<Rarity, number>> = last
      ? Object.fromEntries(RARITIES.slice(RARITIES.indexOf(GUARANTEED_RARITY)).map((r) => [r, RARITY_WEIGHTS[r]]))
      : RARITY_WEIGHTS;
    const rarity = pickRarity(draw(), weights);
    const item = pickItem(rarity, draw());
    const isNew = !have.has(item.id);
    have.add(item.id);
    cards.push({ itemId: item.id, rarity, isNew, fragments: isNew ? 0 : DUPLICATE_FRAGMENTS[rarity] });
  }
  return { cards, rng };
}

export const totalItems = (): number => ITEMS.length;
export const rarityOf = (id: string): Rarity | undefined => getItem(id)?.rarity;

// ------------------------------------------------------- campaign reward packs

export type PackTier = 'common' | 'rare' | 'epic';

/** Drop weights of a reward pack and the rarity its last card is at least. */
export const TIER_WEIGHTS: Record<PackTier, { weights: Record<Rarity, number>; last: Rarity | null }> = {
  common: { weights: { common: 80, rare: 18, epic: 2, legendary: 0 }, last: null },
  rare: { weights: { common: 40, rare: 45, epic: 13, legendary: 2 }, last: 'rare' },
  epic: { weights: { common: 15, rare: 40, epic: 38, legendary: 7 }, last: 'epic' },
};

/**
 * Opens a campaign reward pack of a tier. Same rules as `openPack` (seeded, duplicates become fragments), with the
 * tier's odds; `guaranteedPart` replaces the first card, whatever the draw gave (the rest of the draw is unchanged).
 */
export function openTierPack(rngState: number, owned: Record<string, number>, tier: PackTier, guaranteedPart?: string): PackResult {
  let rng = rngState >>> 0;
  const draw = (): number => {
    const [v, next] = nextFloat(rng);
    rng = next;
    return v;
  };
  const { weights, last } = TIER_WEIGHTS[tier];
  const lastWeights: Partial<Record<Rarity, number>> | null = last
    ? Object.fromEntries(RARITIES.slice(RARITIES.indexOf(last)).map((r) => [r, weights[r]]))
    : null;
  const have = new Set(Object.keys(owned));
  const cards: Card[] = [];
  for (let i = 0; i < PACK_SIZE; i++) {
    const rarity = pickRarity(draw(), i === PACK_SIZE - 1 && lastWeights ? lastWeights : weights);
    let item = pickItem(rarity, draw());
    const forced = i === 0 && guaranteedPart ? getItem(guaranteedPart) : undefined;
    if (forced) item = forced;
    const isNew = !have.has(item.id);
    have.add(item.id);
    cards.push({ itemId: item.id, rarity: item.rarity, isNew, fragments: isNew ? 0 : DUPLICATE_FRAGMENTS[item.rarity] });
  }
  return { cards, rng };
}
