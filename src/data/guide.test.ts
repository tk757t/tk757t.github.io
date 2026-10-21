import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../engine/config';
import { WEAR_CATEGORIES } from '../engine/types';
import { GAUGES, STATS } from './glossary';
import { GEAR_RANGES, GUIDE, QUICK, TIPS } from './guide';
import { STAT_KEYS } from './parts/stats';

describe('guide', () => {
  it('tells the dice of the engine', () => {
    expect(GEAR_RANGES).toHaveLength(DEFAULT_CONFIG.dice.length);
    DEFAULT_CONFIG.dice.forEach((faces, i) => expect(GEAR_RANGES[i]).toEqual([Math.min(...faces), Math.max(...faces)]));
    const page = GUIDE.find((s) => s.id === 'dice')!;
    for (const [a, b] of GEAR_RANGES) expect(page.lines.some((l) => l.includes(`${a} à ${b} cases`))).toBe(true);
  });

  it('has a page for each question, in a fixed order, without empty text', () => {
    expect(GUIDE.map((s) => s.id)).toEqual(['goal', 'turn', 'dice', 'gauges', 'corners', 'overtake', 'colors', 'tires', 'slipstream', 'rewards']);
    for (const s of GUIDE) {
      expect(s.title.length).toBeGreaterThan(2);
      expect(s.lines.length).toBeGreaterThan(0);
      for (const l of s.lines) expect(l.trim().length).toBeGreaterThan(10);
    }
    expect(new Set(GUIDE.map((s) => s.id)).size).toBe(GUIDE.length);
  });

  it('has a short version that fits a race and a tip for each phase', () => {
    expect(QUICK.length).toBeGreaterThanOrEqual(5);
    expect(QUICK.length).toBeLessThanOrEqual(8);
    for (const l of QUICK) expect(l.length).toBeLessThan(200);
    expect(Object.keys(TIPS).sort()).toEqual(['adjust', 'gear', 'other', 'pit']);
  });

  it('explains every gauge and every stat of the car', () => {
    for (const c of WEAR_CATEGORIES) {
      const g = GAUGES[c];
      expect(g.name && g.role && g.uses && g.empty).toBeTruthy();
      expect(GUIDE.find((s) => s.id === 'gauges')!.lines.some((l) => l.includes(g.name))).toBe(true);
    }
    for (const k of STAT_KEYS) expect(STATS[k].hint && STATS[k].raise).toBeTruthy();
  });
});
