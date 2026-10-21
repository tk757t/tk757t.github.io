import { describe, expect, it } from 'vitest';
import { PARTS } from './catalogue';
import { modsFor } from './effects';
import { carStats } from './stats';
import { RARITIES, SLOTS } from './types';

const power = (id: string, level: number) => carStats(modsFor([{ part: PARTS.find((p) => p.id === id)!, level }])).power;

// docs/gdd/10-stats-voitures.md § 10.8: the duel of the balance script only guards the extremes; the order of the rarities is checked here,
// with the power of the car sheet (the sum of the six bars).
describe('the rarer a part, the more power it gives (docs/equilibrage-pieces.md)', () => {
  for (const level of [1, 5]) {
    it(`in every slot, the best part of a rarity is not weaker than the best part of the rarity below (level ${level})`, () => {
      for (const slot of SLOTS) {
        const best = RARITIES.map((r) => Math.max(...PARTS.filter((p) => p.slot === slot && p.rarity === r).map((p) => power(p.id, level))));
        for (let i = 1; i < best.length; i++) expect(best[i], `${slot}: ${RARITIES[i]} (${best[i]}) vs ${RARITIES[i - 1]} (${best[i - 1]}) at level ${level}`).toBeGreaterThanOrEqual(best[i - 1]);
      }
    });
  }

  it('on average, power grows with rarity at every level', () => {
    for (const level of [1, 3, 5]) {
      const mean = RARITIES.map((r) => {
        const list = PARTS.filter((p) => p.rarity === r).map((p) => power(p.id, level));
        return list.reduce((a, b) => a + b, 0) / list.length;
      });
      for (let i = 1; i < mean.length; i++) expect(mean[i], `level ${level}`).toBeGreaterThan(mean[i - 1]);
    }
  });

  it('no part is without power at level 5, and a part gets stronger with its level', () => {
    for (const p of PARTS) {
      expect(power(p.id, 5), p.id).toBeGreaterThan(0);
      expect(power(p.id, 5), p.id).toBeGreaterThanOrEqual(power(p.id, 1));
    }
  });
});
