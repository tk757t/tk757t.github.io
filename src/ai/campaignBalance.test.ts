import { describe, expect, it } from 'vitest';
import { LEVELS } from '../data/campaign';
import { runLevelBatch } from './campaignSim';

// The campaign must stay playable with the starter car: an AI Moyen driving it wins between 30 % and 90 % of the races
// of each level and gives up in less than 25 % (docs/equilibrage-campagne.md). Seeds are fixed, so the result is exact.
describe('campaign balance (200 races per level, AI Moyen at the wheel of the starter car)', () => {
  for (const [i, level] of LEVELS.entries()) {
    it(`level ${i + 1} ${level.name}`, () => {
      const b = runLevelBatch(i, 200, 1, 'medium');
      expect(b.unfinished).toBe(0);
      expect(b.winRate, `win rate ${b.winRate}`).toBeGreaterThanOrEqual(0.3);
      expect(b.winRate, `win rate ${b.winRate}`).toBeLessThanOrEqual(0.9);
      expect(b.retireRate, `retire rate ${b.retireRate}`).toBeLessThan(0.25);
    }, 300_000);
  }
});
