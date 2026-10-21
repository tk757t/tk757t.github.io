import { describe, expect, it } from 'vitest';
import { getItem } from './parts/catalogue';
import { DUPLICATE_FRAGMENTS } from './parts/packs';
import { FREE_TRACK, MAX_POINTS, PASS_TIERS, SEASON_ANCHOR, SEASON_DAYS, TIER_POINTS, addPassPoints, claimPassTier, parisMidnight, passView, seasonEnd, seasonOf, tierReached } from './pass';
import { newProfile, totalPacks } from './profile/profile';
import { parisDay } from './shop';

const DAY = 86_400_000;
// 12:00 Paris on the first day of season 0 (Monday 19 October 2026, summer time)
const START = Date.UTC(2026, 9, 19, 10);
const fresh = () => newProfile(1);

describe('seasons', () => {
  it('last two weeks, from a Monday, and change at Paris midnight', () => {
    expect(new Date(START).getUTCDay()).toBe(1); // Monday
    expect(parisDay(START)).toBe(SEASON_ANCHOR);
    expect(seasonOf(START)).toBe(0);
    expect(seasonOf(START + (SEASON_DAYS - 1) * DAY)).toBe(0);
    expect(seasonOf(START + SEASON_DAYS * DAY)).toBe(1);
    expect(seasonOf(START + 3 * SEASON_DAYS * DAY)).toBe(3);
    expect(seasonOf(Date.UTC(2026, 0, 1))).toBe(0); // before the first season: season 0
  });

  it('finds the exact end, also across a clock change', () => {
    // season 0 ends on Monday 2 November 00:00 Paris = Sunday 1 November 23:00 UTC (winter time again since 25 October)
    expect(seasonEnd(0)).toBe(Date.UTC(2026, 10, 1, 23));
    expect(parisDay(seasonEnd(0) - 1)).toBe('2026-11-01');
    expect(parisDay(seasonEnd(0))).toBe('2026-11-02');
    expect(seasonOf(seasonEnd(0) - 1)).toBe(0);
    expect(seasonOf(seasonEnd(0))).toBe(1);
    expect(parisMidnight('2026-10-25')).toBe(Date.UTC(2026, 9, 24, 22)); // summer time still
  });
});

describe('the free track', () => {
  it('has one reward for each of the 30 tiers, and every item exists', () => {
    expect(FREE_TRACK).toHaveLength(PASS_TIERS);
    for (const r of FREE_TRACK) if (r.kind === 'item') expect(getItem(r.itemId), r.itemId).toBeDefined();
  });

  it('keeps to the design totals', () => {
    const sum = (kind: string) => FREE_TRACK.filter((r) => r.kind === kind).reduce((n, r) => n + ('amount' in r ? r.amount : 1), 0);
    expect(sum('gold')).toBe(1550);
    expect(sum('fragments')).toBe(400);
    expect(sum('gems')).toBe(60);
    expect(FREE_TRACK.filter((r) => r.kind === 'chest')).toHaveLength(5);
    expect(FREE_TRACK.filter((r) => r.kind === 'item')).toHaveLength(6);
    // skin slots: a cosmetic every fifth tier
    expect(FREE_TRACK.map((r, i) => (r.kind === 'item' ? i + 1 : 0)).filter(Boolean)).toEqual([5, 10, 15, 20, 25, 30]);
  });

  it('never gives a legendary item, or any card', () => {
    for (const r of FREE_TRACK) if (r.kind === 'item') expect(getItem(r.itemId)!.rarity).not.toBe('legendary');
  });
});

describe('progress', () => {
  it('points fill tiers of 50, up to 30 tiers', () => {
    expect(tierReached(0)).toBe(0);
    expect(tierReached(49)).toBe(0);
    expect(tierReached(50)).toBe(1);
    expect(tierReached(MAX_POINTS)).toBe(PASS_TIERS);
    expect(tierReached(MAX_POINTS + 999)).toBe(PASS_TIERS);
  });

  it('adds points, capped at the end of the pass', () => {
    let p = addPassPoints(fresh(), 30, START);
    p = addPassPoints(p, 30, START + 1);
    expect(p.pass).toEqual({ season: 0, points: 60, claimed: [] });
    expect(addPassPoints(p, 99_999, START).pass.points).toBe(MAX_POINTS);
    expect(addPassPoints(p, -50, START).pass.points).toBe(60); // never negative
  });

  it('a new season starts from zero: old points and collected tiers no longer count', () => {
    const old = { ...fresh(), pass: { season: 0, points: 400, claimed: [1, 2] } };
    expect(passView(old, START).reached).toBe(8);
    const next = START + SEASON_DAYS * DAY;
    expect(passView(old, next)).toMatchObject({ season: 1, points: 0, reached: 0, toNext: TIER_POINTS });
    expect(passView(old, next).tiers.some((t) => t.claimed)).toBe(false);
    expect(addPassPoints(old, 10, next).pass).toEqual({ season: 1, points: 10, claimed: [] });
  });

  it('the view says what is reached, collected and still needed', () => {
    const p = { ...fresh(), pass: { season: 0, points: 120, claimed: [1] } };
    const v = passView(p, START);
    expect(v).toMatchObject({ season: 0, points: 120, reached: 2, toNext: 30, endsAt: seasonEnd(0) });
    expect(v.tiers[0]).toMatchObject({ tier: 1, reached: true, claimed: true });
    expect(v.tiers[1]).toMatchObject({ tier: 2, reached: true, claimed: false });
    expect(v.tiers[2]).toMatchObject({ tier: 3, reached: false, claimed: false });
    expect(passView({ ...fresh(), pass: { season: 0, points: MAX_POINTS, claimed: [] } }, START).toNext).toBe(0);
  });
});

describe('collecting a tier', () => {
  const at = (points: number, claimed: number[] = []) => ({ ...fresh(), pass: { season: 0, points, claimed } });

  it('pays gold, gems and fragments', () => {
    const r1 = claimPassTier(at(50), 1, START)!;
    expect(r1.reward).toEqual({ kind: 'gold', amount: 150 });
    expect(r1.profile.gold).toBe(fresh().gold + 150);
    expect(r1.profile.pass.claimed).toEqual([1]);
    expect(claimPassTier(at(350), 3, START)!.profile.fragments).toBe(40);
    expect(claimPassTier(at(350), 7, START)!.profile.gems).toBe(fresh().gems + 10);
  });

  it('gives a chest in a slot, with its real timer', () => {
    const r = claimPassTier(at(100), 2, START)!;
    expect(totalPacks(r.profile)).toBe(totalPacks(fresh()) + 1);
    const added = r.profile.slots.find((s, i) => s && !fresh().slots[i])!;
    expect(added.tier).toBe('common');
    expect(added.readyAt).toBeGreaterThan(START);
  });

  it('gives a cosmetic, or fragments when it is already owned', () => {
    const r = claimPassTier(at(250), 5, START)!;
    expect(r.reward).toEqual({ kind: 'item', itemId: 'hlm-red' });
    expect(r.profile.owned['hlm-red']).toBe(1);
    expect(r.fragments).toBe(0);
    const dup = claimPassTier({ ...at(250), owned: { 'hlm-red': 1 } }, 5, START)!;
    expect(dup.fragments).toBe(DUPLICATE_FRAGMENTS.common);
    expect(dup.profile.fragments).toBe(DUPLICATE_FRAGMENTS.common);
  });

  it('refuses a tier not reached, collected, or outside 1..30', () => {
    expect(claimPassTier(at(49), 1, START)).toBeNull();
    expect(claimPassTier(at(50, [1]), 1, START)).toBeNull();
    expect(claimPassTier(at(MAX_POINTS), 0, START)).toBeNull();
    expect(claimPassTier(at(MAX_POINTS), 31, START)).toBeNull();
    expect(claimPassTier(at(MAX_POINTS), 1.5, START)).toBeNull();
  });

  it('collecting every tier gives each reward exactly once', () => {
    let p = at(MAX_POINTS);
    for (let t = 1; t <= PASS_TIERS; t++) p = claimPassTier(p, t, START)!.profile;
    expect(p.pass.claimed).toEqual(Array.from({ length: PASS_TIERS }, (_, i) => i + 1));
    expect(p.gold).toBe(fresh().gold + 1550);
    expect(p.gems).toBe(fresh().gems + 60);
    expect(p.fragments).toBe(400);
    expect(claimPassTier(p, 30, START)).toBeNull();
  });

  it('points of an older season cannot be spent in the new one', () => {
    const old = at(MAX_POINTS);
    expect(claimPassTier(old, 1, START + SEASON_DAYS * DAY)).toBeNull();
  });
});
