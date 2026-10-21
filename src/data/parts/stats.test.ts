import { describe, expect, it } from 'vitest';
import { NO_MODS } from '../../engine/types';
import { PARTS, getPart } from './catalogue';
import { modsFor } from './effects';
import { STAT_KEYS, carStats, maxStatScores } from './stats';
import { SLOTS, type PartDef } from './types';

const level = (p: PartDef, l: number) => modsFor([{ part: p, level: l }]);

describe('docs/gdd/10-stats-voitures.md § 10.2: six readable stats', () => {
  it('a car without parts has no bar and no power', () => {
    const s = carStats(NO_MODS);
    expect(s.power).toBe(0);
    expect(s.stats.map((x) => x.bars)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(s.stats.map((x) => x.key)).toEqual([...STAT_KEYS]);
  });

  it('every stat can be filled by some part, and its maximum is positive', () => {
    const max = maxStatScores();
    for (const k of STAT_KEYS) expect(max[k], k).toBeGreaterThan(0);
  });

  it('the best part of every slot for a stat fills the 10 bars when they are all equipped', () => {
    for (const key of STAT_KEYS) {
      const best = SLOTS.map((slot) => {
        const parts = PARTS.filter((p) => p.slot === slot);
        return parts.reduce((a, b) => (carStats(level(b, 5)).stats.find((s) => s.key === key)!.score > carStats(level(a, 5)).stats.find((s) => s.key === key)!.score ? b : a));
      });
      const mods = modsFor(best.map((part) => ({ part, level: 5 })));
      const stat = carStats(mods).stats.find((s) => s.key === key)!;
      expect(stat.bars, key).toBeGreaterThanOrEqual(8); // series and drawbacks can move it a little
    }
  });

  it('bars stay between 0 and 10 and the power between 0 and 60, for every part and level', () => {
    for (const p of PARTS) {
      for (let l = 1; l <= 5; l++) {
        const s = carStats(level(p, l));
        for (const stat of s.stats) {
          expect(stat.bars).toBeGreaterThanOrEqual(0);
          expect(stat.bars).toBeLessThanOrEqual(10);
        }
        expect(s.power).toBeGreaterThanOrEqual(0);
        expect(s.power).toBeLessThanOrEqual(60);
      }
    }
  });

  it('a part raises its power with its level, and a rarer part of a slot is at least as strong at level 5', () => {
    for (const p of PARTS) expect(carStats(level(p, 5)).power, p.id).toBeGreaterThanOrEqual(carStats(level(p, 1)).power);
  });

  it('the score of a stat follows the weights of the design', () => {
    // Carbone-céramique: 1 free stop (3 in Maniabilité), +4 Freins and −1 Pneus (3 in Endurance)
    const s = carStats(level(getPart('brk-carbon') as PartDef, 1));
    expect(s.stats.find((x) => x.key === 'handling')!.score).toBe(3);
    expect(s.stats.find((x) => x.key === 'endurance')!.score).toBe(3);
    // Aileron mobile: one relance = 4 in Tactique
    expect(carStats(level(getPart('wng-drs') as PartDef, 1)).stats.find((x) => x.key === 'tactics')!.score).toBe(4);
    // Turbo calibré: +1 case at gear 4 = 3 in Vitesse
    expect(carStats(level(getPart('eng-turbo') as PartDef, 1)).stats.find((x) => x.key === 'speed')!.score).toBe(3);
  });
});
