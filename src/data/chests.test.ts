import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { taggedTable, num } from '../../tools/check-gdd';
import { CHESTS, CHEST_TIERS, PITY_CHESTS, WINS_PER_RARE, atLeastRare, openChest, rollTier, skipGemCost, tierOdds } from './chests';
import { addPacks, awardRace, openSlot, skipSlot } from './profile/ops';
import { newProfile, type Profile } from './profile/profile';
import { RARITIES } from './parts/types';

const NOW = 5_000_000;
const MIN = 60_000;
const empty = (): Profile => ({ ...newProfile(11), slots: [null, null, null, null] });

describe('chest definitions', () => {
  it('has the four qualities with the wanted unlock times', () => {
    expect(CHEST_TIERS).toEqual(['common', 'rare', 'epic', 'legendary']);
    expect(CHEST_TIERS.map((t) => CHESTS[t].unlockMs / MIN)).toEqual([30, 180, 480, 720]);
  });

  it('odds sum to 100 and get better with quality', () => {
    for (const t of CHEST_TIERS) expect(RARITIES.reduce((s, r) => s + CHESTS[t].weights[r], 0)).toBe(100);
    for (const r of ['rare', 'epic', 'legendary'] as const) {
      const shares = CHEST_TIERS.map((t) => CHESTS[t].weights[r]);
      expect(shares).toEqual([...shares].sort((a, b) => a - b));
    }
    const cards = CHEST_TIERS.map((t) => CHESTS[t].cards);
    expect(cards).toEqual([...cards].sort((a, b) => a - b));
  });

  it('gives gems only from Rare up', () => {
    expect(CHESTS.common.gems).toEqual([0, 0]);
    for (const t of ['rare', 'epic', 'legendary'] as const) expect(CHESTS[t].gems[0]).toBeGreaterThan(0);
  });

  it('matches the tables of docs/gdd/05-economie.md', () => {
    const md = readFileSync('docs/gdd/05-economie.md', 'utf8');
    const t = taggedTable(md, 'chests');
    expect(t).not.toBeNull();
    CHEST_TIERS.forEach((tier, i) => {
      const row = t!.rows[i];
      const d = CHESTS[tier];
      expect(row[0]).toBe(d.label);
      expect(row[1]).toBe(d.unlockMs >= 3_600_000 ? `${d.unlockMs / 3_600_000} h` : `${d.unlockMs / MIN} min`);
      expect(num(row[2])).toBe(d.cards);
      expect(row[3]).toBe(`${d.gold[0]} à ${d.gold[1]}`);
      expect(row[4]).toBe(d.gems[1] === 0 ? '0' : `${d.gems[0]} à ${d.gems[1]}`);
      expect(row[5]).toBe(RARITIES.map((r) => `${d.weights[r]} %`).join(' / '));
    });
    expect(md).toContain(`${PITY_CHESTS - 1} coffres`);
    expect(md).toContain(`tous les ${WINS_PER_RARE} victoires, le premier`);
  });
});

describe('opening', () => {
  it('is deterministic and advances the rng', () => {
    const a = openChest(42, {}, 'epic', 0);
    expect(openChest(42, {}, 'epic', 0)).toEqual(a);
    expect(a.rng).not.toBe(42);
    expect(a.cards).toHaveLength(5);
  });

  it('draws gold and gems inside the ranges, no gems in a Common chest', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const t of CHEST_TIERS) {
        const o = openChest(seed, {}, t, 0);
        expect(o.gold).toBeGreaterThanOrEqual(CHESTS[t].gold[0]);
        expect(o.gold).toBeLessThanOrEqual(CHESTS[t].gold[1]);
        expect(o.gems).toBeGreaterThanOrEqual(CHESTS[t].gems[0]);
        expect(o.gems).toBeLessThanOrEqual(CHESTS[t].gems[1]);
        if (t === 'common') expect(o.gems).toBe(0);
      }
    }
  });

  it('higher qualities hold more rare cards on average', () => {
    const score = (t: (typeof CHEST_TIERS)[number]) => {
      let s = 0;
      for (let seed = 1; seed <= 400; seed++) s += openChest(seed, {}, t, 0).cards.filter((c) => c.rarity !== 'common').length;
      return s / 400;
    };
    const scores = CHEST_TIERS.map(score);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
  });

  it('pity: the gauge counts chests without a legendary and the chest at the threshold holds one', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const forced = openChest(seed, {}, 'common', PITY_CHESTS - 1);
      expect(forced.cards.some((c) => c.rarity === 'legendary')).toBe(true);
      expect(forced.pity).toBe(0);
    }
    const none = openChest(3, {}, 'common', 5);
    expect(none.cards.some((c) => c.rarity === 'legendary')).toBe(false);
    expect(none.pity).toBe(6);
    expect(none.pityTriggered).toBe(false);
  });

  it('openSlot adds the gold and gems to the profile and updates the pity gauge', () => {
    const p = { ...addPacks(empty(), ['legendary'], NOW, 0), pity: 4 };
    const r = openSlot(p, 0, NOW)!;
    expect(r.tier).toBe('legendary');
    expect(r.cards).toHaveLength(6);
    expect(r.profile.gold).toBe(p.gold + r.gold);
    expect(r.profile.gems).toBe(p.gems + r.gems);
    expect(r.gems).toBeGreaterThanOrEqual(6);
    expect(r.profile.pity).toBe(r.cards.some((c) => c.rarity === 'legendary') ? 0 : 5);
  });
});

describe('speeding up', () => {
  it('costs 1 gem per started 10 minutes, at least 1', () => {
    expect(skipGemCost(1)).toBe(1);
    expect(skipGemCost(10 * MIN)).toBe(1);
    expect(skipGemCost(10 * MIN + 1)).toBe(2);
    expect(skipGemCost(3 * 60 * MIN)).toBe(18);
    expect(skipGemCost(12 * 60 * MIN)).toBe(72);
  });

  it('skipSlot charges for the time left of that quality and keeps the quality', () => {
    const p = { ...addPacks(empty(), ['rare'], NOW), gems: 100 };
    const r = skipSlot(p, 0, NOW + 60 * MIN)!; // 2 h left -> 12 gems
    expect(r.gems).toBe(88);
    expect(r.slots[0]).toEqual({ readyAt: NOW + 60 * MIN, tier: 'rare' });
  });
});

describe('obtaining', () => {
  it('quality odds lean up for the first and down for the last', () => {
    for (const rank of [1, 2, 3, 4]) expect(Object.values(tierOdds(rank, 4)).reduce((s, x) => s + x, 0)).toBeCloseTo(100, 6);
    expect(tierOdds(1, 4).common).toBeLessThan(tierOdds(4, 4).common);
    expect(tierOdds(4, 4).common).toBeGreaterThan(80);
    expect(tierOdds(1, 4).legendary).toBeGreaterThan(tierOdds(4, 4).legendary);
    expect(tierOdds(1, 1)).toEqual(tierOdds(1, 4));
  });

  it('rollTier follows the odds', () => {
    expect(rollTier(4, 4, 0)).toBe('common');
    expect(rollTier(1, 4, 0.999)).toBe('legendary');
    const count = (rank: number) => {
      const seen = { common: 0, rare: 0, epic: 0, legendary: 0 };
      for (let i = 0; i < 1000; i++) seen[rollTier(rank, 4, (i + 0.5) / 1000)]++;
      return seen;
    };
    expect(count(4).common).toBeGreaterThan(count(1).common + 300);
  });

  it('atLeastRare lifts only Common', () => {
    expect([atLeastRare('common'), atLeastRare('rare'), atLeastRare('epic'), atLeastRare('legendary')]).toEqual(['rare', 'rare', 'epic', 'legendary']);
  });

  it('awardRace stores one quality per chest and every 5th win gives at least a Rare', () => {
    let p = empty();
    for (let i = 1; i <= 10; i++) {
      const r = awardRace(p, { rank: 1, retired: false, now: NOW, unlockMs: 1000 });
      expect(r.rewards.chests).toHaveLength(2);
      if (i % WINS_PER_RARE === 0) expect(r.rewards.chests[0]).not.toBe('common');
      p = { ...r.profile, slots: [null, null, null, null], packs: [] };
    }
    const lost = awardRace(empty(), { rank: 4, retired: false, now: NOW });
    expect(lost.rewards.chests).toHaveLength(1);
    expect(awardRace(empty(), { rank: 1, retired: true, now: NOW }).rewards.chests).toEqual([]);
  });

  it('chests that do not fit go to the reserve with their quality', () => {
    const full = addPacks(empty(), ['common', 'common', 'common', 'common'], NOW);
    const r = addPacks(full, ['epic', 'rare'], NOW);
    expect(r.packs).toEqual(['epic', 'rare']);
  });
});
