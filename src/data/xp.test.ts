import { describe, expect, it } from 'vitest';
import { levelFromXp, placeXp, raceXp, xpForLevel } from './xp';

describe('placeXp', () => {
  it('4 players: 100 / 70 / 50 / 35', () => {
    expect([1, 2, 3, 4].map((r) => placeXp(r, 4))).toEqual([100, 70, 50, 35]);
  });
  it('strictly decreasing and within bounds for 1 to 8 players', () => {
    for (let n = 1; n <= 8; n++) {
      const xs = Array.from({ length: n }, (_, i) => placeXp(i + 1, n));
      expect(xs[0]).toBe(100);
      if (n > 1) expect(xs[n - 1]).toBe(35);
      for (let i = 1; i < n; i++) expect(xs[i]).toBeLessThan(xs[i - 1]);
      xs.forEach((x) => expect(x).toBeGreaterThanOrEqual(35));
    }
  });
  it('clamps out of range input', () => {
    expect(placeXp(0, 4)).toBe(100);
    expect(placeXp(9, 4)).toBe(35);
    expect(placeXp(2, 20)).toBe(placeXp(2, 8));
  });
});

describe('raceXp', () => {
  const base = { rank: 1, players: 4, retired: false };
  it('nothing when retired', () => expect(raceXp({ ...base, retired: true, clean: true })).toBe(0));
  it('clean finish +10 %, bots x0.5', () => {
    expect(raceXp(base)).toBe(100);
    expect(raceXp({ ...base, clean: true })).toBe(110);
    expect(raceXp({ ...base, vsBots: true })).toBe(50);
    expect(raceXp({ ...base, clean: true, vsBots: true })).toBe(55);
  });
  it('never 0 for a finisher', () => expect(raceXp({ rank: 4, players: 4, retired: false, vsBots: true })).toBeGreaterThan(0));
  it('decreases with the place', () => {
    const xs = [1, 2, 3, 4].map((rank) => raceXp({ ...base, rank, vsBots: true, clean: true }));
    expect(xs).toEqual([...xs].sort((a, b) => b - a));
  });
});

describe('levels', () => {
  it('thresholds are increasing', () => {
    for (let l = 1; l < 100; l++) expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
  });
  it('levelFromXp is consistent with the thresholds', () => {
    for (let l = 1; l < 60; l++) {
      const t = xpForLevel(l);
      expect(levelFromXp(t).level).toBe(l);
      expect(levelFromXp(t).into).toBe(0);
      if (t > 0) expect(levelFromXp(t - 1).level).toBe(l - 1);
      const i = levelFromXp(xpForLevel(l + 1) - 1);
      expect(i.level).toBe(l);
      expect(i.into).toBe(i.needed - 1);
    }
  });
  it('handles junk', () => {
    expect(levelFromXp(-5)).toMatchObject({ level: 1, into: 0 });
    expect(levelFromXp(NaN).level).toBe(1);
    expect(levelFromXp(1e9).level).toBeGreaterThan(1000);
  });
});
