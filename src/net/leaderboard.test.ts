import { describe, expect, it } from 'vitest';
import { RANKED_SEASON_ANCHOR, RANKED_SEASON_MS } from '../data/ranked';
import { ordinal, seasonInfo } from './leaderboard';

describe('the words of the ranking', () => {
  it('writes the place as a French ordinal', () => {
    expect([1, 2, 3, 12, 100].map(ordinal)).toEqual(['1er', '2e', '3e', '12e', '100e']);
  });

  it('tells the season and the days left, at least one while it runs', () => {
    const day = 86_400_000;
    expect(seasonInfo(RANKED_SEASON_ANCHOR)).toEqual({ number: 1, daysLeft: 28 });
    expect(seasonInfo(RANKED_SEASON_ANCHOR + 27 * day + 1000)).toEqual({ number: 1, daysLeft: 1 });
    expect(seasonInfo(RANKED_SEASON_ANCHOR + RANKED_SEASON_MS)).toEqual({ number: 2, daysLeft: 28 });
    expect(seasonInfo(RANKED_SEASON_ANCHOR - day).number).toBe(1); // before the first season: counted as the first
  });
});
