import { describe, expect, it } from 'vitest';
import {
  MATCH_MAX_WAIT_MS,
  RANK_LEAGUES,
  TROPHIES_BY_PLACE,
  applyRaceTrophies,
  RANKED_SEASON_ANCHOR,
  RANKED_SEASON_MS,
  canMatch,
  currentRanked,
  rankedTrack,
  gridOrder,
  leagueOf,
  matchWindow,
  mayFillWithBots,
  seasonReset,
  trophyDelta,
  trophyFloor,
} from './ranked';

describe('docs/gdd/04-modes.md § 4.5: leagues', () => {
  it('has six leagues that follow each other with no hole', () => {
    expect(RANK_LEAGUES.map((l) => l.id)).toEqual(['paddock', 'bitume', 'chicane', 'epingle', 'turbo', 'legende']);
    for (let i = 1; i < RANK_LEAGUES.length; i++) expect(RANK_LEAGUES[i].from).toBe((RANK_LEAGUES[i - 1].to as number) + 1);
    expect(RANK_LEAGUES[RANK_LEAGUES.length - 1].to).toBeNull();
  });

  it('puts a trophy count in the right league, on both sides of every threshold', () => {
    const expected: [number, string][] = [
      [0, 'paddock'],
      [399, 'paddock'],
      [400, 'bitume'],
      [999, 'bitume'],
      [1000, 'chicane'],
      [1799, 'chicane'],
      [1800, 'epingle'],
      [2799, 'epingle'],
      [2800, 'turbo'],
      [3999, 'turbo'],
      [4000, 'legende'],
      [9000, 'legende'],
    ];
    for (const [t, id] of expected) expect(leagueOf(t).id, String(t)).toBe(id);
    expect(leagueOf(-5).id).toBe('paddock');
    expect(leagueOf(405.9).id).toBe('bitume');
  });
});

describe('trophies by place', () => {
  it('follows the table of the design', () => {
    expect(TROPHIES_BY_PLACE).toEqual({ 2: [30, -20], 3: [35, 5, -20], 4: [40, 15, -5, -20] });
    expect([1, 2].map((r) => trophyDelta(2, r))).toEqual([30, -20]);
    expect([1, 2, 3].map((r) => trophyDelta(3, r))).toEqual([35, 5, -20]);
    expect([1, 2, 3, 4].map((r) => trophyDelta(4, r))).toEqual([40, 15, -5, -20]);
  });

  it('refuses a race or a place that does not exist', () => {
    for (const cars of [0, 1, 5, 2.5, NaN]) expect(() => trophyDelta(cars, 1)).toThrow();
    for (const rank of [0, 3, -1, 1.5]) expect(() => trophyDelta(2, rank)).toThrow();
  });

  it('gives the loss of 20 to the last place in every race, and the group never loses trophies as a whole', () => {
    for (const cars of [2, 3, 4]) expect(trophyDelta(cars, cars)).toBe(-20);
    for (const cars of [2, 3, 4]) expect(TROPHIES_BY_PLACE[cars].reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(0);
  });
});

describe('protected floors and promotions', () => {
  it('never goes down under the threshold of a league reached, and never under 0', () => {
    expect(trophyFloor(0)).toBe(0);
    expect(trophyFloor(405)).toBe(400);
    expect(trophyFloor(1799)).toBe(1000);
    expect(applyRaceTrophies({ trophies: 405, peak: 405 }, 2, 2).trophies).toBe(400); // 405 - 20 would be 385
    expect(applyRaceTrophies({ trophies: 10, peak: 10 }, 2, 2).trophies).toBe(0);
  });

  it('the floor follows the peak of the season, not the current count', () => {
    // 1 010 reached the league Chicane; back to 1 005 the floor stays at 1 000
    expect(applyRaceTrophies({ trophies: 1005, peak: 1010 }, 2, 2).trophies).toBe(1000);
  });

  it('can fall out of Légende, but not under Turbo', () => {
    expect(trophyFloor(4200)).toBe(2800);
    const r = applyRaceTrophies({ trophies: 4005, peak: 4005 }, 3, 3);
    expect(r.trophies).toBe(3985);
    expect(r.demoted).toBe(true);
    expect(r.league.id).toBe('turbo');
  });

  it('tells when a race promotes the player', () => {
    const r = applyRaceTrophies({ trophies: 390, peak: 390 }, 4, 1);
    expect(r).toMatchObject({ trophies: 430, delta: 40, promoted: true, demoted: false });
    expect(r.before.id).toBe('paddock');
    expect(r.league.id).toBe('bitume');
    expect(r.peak).toBe(430);
  });

  it('keeps the peak when the trophies go down', () => {
    expect(applyRaceTrophies({ trophies: 1100, peak: 1100 }, 2, 2)).toMatchObject({ trophies: 1080, peak: 1100 });
  });
});

describe('end of the season', () => {
  it('brings what is above 4 000 back to 4 000 plus half of the excess, and leaves the rest', () => {
    expect(seasonReset({ trophies: 4000, peak: 4300 })).toEqual({ trophies: 4000, peak: 4000 });
    expect(seasonReset({ trophies: 4600, peak: 4600 })).toEqual({ trophies: 4300, peak: 4300 });
    expect(seasonReset({ trophies: 4601, peak: 4601 }).trophies).toBe(4300);
    expect(seasonReset({ trophies: 1500, peak: 1700 })).toEqual({ trophies: 1500, peak: 1500 });
  });
});

describe('docs/gdd/04-modes.md § 4.3: matchmaking', () => {
  it('starts at 100 trophies of gap and widens by 50 every 5 seconds, up to 20 seconds', () => {
    expect([0, 4999, 5000, 9999, 10000, 15000, 20000].map(matchWindow)).toEqual([100, 100, 150, 150, 200, 250, 300]);
    expect(matchWindow(MATCH_MAX_WAIT_MS + 60_000)).toBe(300);
    expect(matchWindow(-10)).toBe(100);
  });

  it('matches two players when the gap fits the window of the one who waited the longest', () => {
    const a = { trophies: 1000, waitedMs: 0 };
    expect(canMatch(a, { trophies: 1100, waitedMs: 0 })).toBe(true);
    expect(canMatch(a, { trophies: 1101, waitedMs: 0 })).toBe(false);
    expect(canMatch(a, { trophies: 1101, waitedMs: 5000 })).toBe(true); // the other one has waited 5 s: window 150
    expect(canMatch(a, { trophies: 1400, waitedMs: 20000 })).toBe(false);
  });

  it('completes with AIs only in the Paddock league, after the maximum wait', () => {
    expect(mayFillWithBots(19_999, 100)).toBe(false);
    expect(mayFillWithBots(20_000, 100)).toBe(true);
    expect(mayFillWithBots(40_000, 1200)).toBe(false);
  });

  it('puts the player with the fewest trophies in pole, always in the same order', () => {
    const grid = gridOrder([
      { id: 'c', trophies: 900 },
      { id: 'a', trophies: 1200 },
      { id: 'b', trophies: 900 },
      { id: 'd', trophies: 50 },
    ]);
    expect(grid.map((p) => p.id)).toEqual(['d', 'b', 'c', 'a']);
  });
});

describe('the ranked figures shown to the player', () => {
  const ranked = { trophies: 1400, peak: 1500, races: 12, wins: 4, season: 1 };

  it('keeps the figures of the season in progress', () => {
    const now = RANKED_SEASON_ANCHOR + RANKED_SEASON_MS + 1000; // second season
    expect(currentRanked(ranked, now)).toMatchObject({ trophies: 1400, races: 12, wins: 4 });
    expect(currentRanked(ranked, now).league.id).toBe(leagueOf(1400).id);
  });

  it('brings the figures of an older season through the end of the season first', () => {
    const now = RANKED_SEASON_ANCHOR + 2 * RANKED_SEASON_MS + 1000; // third season
    const high = { ...ranked, trophies: 4200, peak: 4200 };
    const shown = currentRanked(high, now);
    expect(shown.trophies).toBe(seasonReset(high).trophies);
    expect(shown.trophies).toBeLessThan(4200);
    expect(shown.races).toBe(12);
  });
});

describe('the circuit of the ranked week', () => {
  const ids = ['lac', 'oval', 'anneau', 'epingles'];

  it('is one of the first three circuits by name (only the host picks it: the guests follow the room), the same whatever the order of the list', () => {
    const now = RANKED_SEASON_ANCHOR + 1000;
    expect(['anneau', 'epingles', 'lac']).toContain(rankedTrack(ids, now));
    expect(rankedTrack([...ids].reverse(), now)).toBe(rankedTrack(ids, now));
  });

  it('changes every week and goes round the three circuits', () => {
    const week = 7 * 86_400_000;
    const picks = [0, 1, 2, 3].map((w) => rankedTrack(ids, RANKED_SEASON_ANCHOR + w * week + 5));
    expect(new Set(picks.slice(0, 3)).size).toBe(3);
    expect(picks[3]).toBe(picks[0]);
  });
});
