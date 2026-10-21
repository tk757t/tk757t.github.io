import { describe, expect, it } from 'vitest';
import { nextFloat } from '../../engine/rng';
import { ITEMS, itemsOfRarity } from './catalogue';
import {
  DUPLICATE_FRAGMENTS,
  GUARANTEED_RARITY,
  PACK_SIZE,
  RARITY_WEIGHTS,
  openPack,
  pickRarity,
  upgradeCost,
} from './packs';
import { RARITIES, type Rarity } from './types';

const stream = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    const [v, n] = nextFloat(s);
    s = n;
    return v;
  };
};

/** Binomial standard deviation of an observed rate. */
const sigma = (p: number, n: number) => Math.sqrt((p * (1 - p)) / n);

describe('rarity weights', () => {
  it('sum to 100 and get rarer with rarity', () => {
    const total = RARITIES.reduce((s, r) => s + RARITY_WEIGHTS[r], 0);
    expect(total).toBe(100);
    expect(RARITY_WEIGHTS.common).toBeGreaterThan(RARITY_WEIGHTS.rare);
    expect(RARITY_WEIGHTS.rare).toBeGreaterThan(RARITY_WEIGHTS.epic);
    expect(RARITY_WEIGHTS.epic).toBeGreaterThan(RARITY_WEIGHTS.legendary);
  });

  it('10 000 single draws follow the weights (within 4 sigma)', () => {
    const n = 10_000;
    const rand = stream(2024);
    const seen: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
    for (let i = 0; i < n; i++) seen[pickRarity(rand())]++;
    for (const r of RARITIES) {
      const p = RARITY_WEIGHTS[r] / 100;
      expect(Math.abs(seen[r] / n - p), `${r}: ${seen[r] / n} vs ${p}`).toBeLessThan(4 * sigma(p, n));
    }
  });

  it('the boundaries of the random range map to the right rarities', () => {
    expect(pickRarity(0)).toBe('common');
    expect(pickRarity(0.5999)).toBe('common');
    expect(pickRarity(0.6)).toBe('rare');
    expect(pickRarity(0.8799)).toBe('rare');
    expect(pickRarity(0.88)).toBe('epic');
    expect(pickRarity(0.9699)).toBe('epic');
    expect(pickRarity(0.97)).toBe('legendary');
    expect(pickRarity(0.999999)).toBe('legendary');
  });

  it('every rarity has several items to find', () => {
    for (const r of RARITIES) expect(itemsOfRarity(r).length).toBeGreaterThanOrEqual(5);
  });
});

describe('opening packs', () => {
  it('10 000 packs: card rarities follow the weights, the last card is guaranteed', () => {
    const packs = 10_000;
    let rng = 7;
    const early: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
    const last: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
    for (let i = 0; i < packs; i++) {
      const r = openPack(rng, {});
      rng = r.rng;
      expect(r.cards).toHaveLength(PACK_SIZE);
      r.cards.slice(0, -1).forEach((c) => early[c.rarity]++);
      last[r.cards.at(-1)!.rarity]++;
    }
    const n = packs * (PACK_SIZE - 1);
    for (const r of RARITIES) {
      const p = RARITY_WEIGHTS[r] / 100;
      expect(Math.abs(early[r] / n - p), r).toBeLessThan(4 * sigma(p, n));
    }
    expect(GUARANTEED_RARITY).toBe('rare');
    expect(last.common).toBe(0);
    const pool = RARITY_WEIGHTS.rare + RARITY_WEIGHTS.epic + RARITY_WEIGHTS.legendary;
    for (const r of ['rare', 'epic', 'legendary'] as const) {
      const p = RARITY_WEIGHTS[r] / pool;
      expect(Math.abs(last[r] / packs - p), `last ${r}`).toBeLessThan(4 * sigma(p, packs));
    }
  });

  it('items of one rarity come up evenly', () => {
    const rand = stream(5);
    const pool = itemsOfRarity('common');
    const counts = new Map<string, number>();
    let rng = 11;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const [x, next] = nextFloat(rng);
      rng = next;
      const item = pool[Math.min(pool.length - 1, Math.floor(x * pool.length))];
      counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
    }
    void rand;
    const expected = n / pool.length;
    for (const c of counts.values()) expect(Math.abs(c - expected)).toBeLessThan(expected * 0.25);
    // and the real pack draw reaches every item
    const seen = new Set<string>();
    rng = 3;
    for (let i = 0; i < 4000; i++) {
      const r = openPack(rng, {});
      rng = r.rng;
      r.cards.forEach((c) => seen.add(c.itemId));
    }
    expect(seen.size).toBe(ITEMS.length);
  });

  it('is deterministic: same rng state and collection give the same pack', () => {
    expect(openPack(99, {})).toEqual(openPack(99, {}));
    expect(openPack(99, {}).cards).not.toEqual(openPack(100, {}).cards);
  });

  it('returns the rng to store so the next pack is different', () => {
    const a = openPack(5, {});
    const b = openPack(a.rng, {});
    expect(a.rng).not.toBe(5);
    expect(b.cards.map((c) => c.itemId)).not.toEqual(a.cards.map((c) => c.itemId));
  });

  it('new cards give no fragments, duplicates give the rarity amount', () => {
    const fresh = openPack(42, {});
    expect(fresh.cards.every((c) => c.fragments === 0 || !c.isNew)).toBe(true);
    const owned = Object.fromEntries(fresh.cards.map((c) => [c.itemId, 1]));
    const again = openPack(42, owned);
    for (const c of again.cards) {
      expect(c.isNew).toBe(false);
      expect(c.fragments).toBe(DUPLICATE_FRAGMENTS[c.rarity]);
    }
  });

  it('a card repeated inside the same pack is a duplicate the second time', () => {
    let found = false;
    for (let seed = 1; seed < 3000 && !found; seed++) {
      const cards = openPack(seed, {}).cards;
      const ids = cards.map((c) => c.itemId);
      cards.forEach((c, i) => {
        if (ids.indexOf(c.itemId) < i) {
          found = true;
          expect(c.isNew).toBe(false);
          expect(c.fragments).toBeGreaterThan(0);
        }
      });
    }
    expect(found).toBe(true);
  });

  it('upgrade costs grow with level and rarity, and stop at level 5', () => {
    expect(upgradeCost('common', 1)).toBe(10);
    expect(upgradeCost('common', 4)).toBe(40);
    expect(upgradeCost('legendary', 1)).toBe(80);
    expect(upgradeCost('rare', 5)).toBeNull();
    for (const r of RARITIES) expect(upgradeCost(r, 2)!).toBeGreaterThan(upgradeCost(r, 1)!);
    expect(upgradeCost('epic', 1)!).toBeGreaterThan(upgradeCost('rare', 1)!);
  });
});
