import { describe, expect, it } from 'vitest';
import { WEAR_CATEGORIES } from '../../engine/types';
import { LEAGUES, capLoadoutMods, getLeague, type League } from './caps';
import { modsForLoadout } from './effects';
import { PARTS } from './catalogue';
import type { Loadout } from './types';

// every part, one per slot: the strongest loadout of the Précision and Vitesse families
const loadout = (ids: string[]): Loadout => ({ parts: Object.fromEntries(ids.map((id) => [PARTS.find((p) => p.id === id)!.slot, id])) });
const ids = ['eng-hybrid', 'gbx-dct', 'brk-recup', 'tir-proto', 'wng-wind', 'chs-carbon'];
const everyAt5 = Object.fromEntries(ids.map((id) => [id, 5]));
const league = (id: string): League => getLeague(id)!;
const gaugeBonus = (m: ReturnType<typeof capLoadoutMods>['mods'], c: (typeof WEAR_CATEGORIES)[number]) => m.wearBonus[c] ?? 0;

describe('docs/gdd/03-ajouts.md § 3.3: ceilings of the ranked leagues', () => {
  it('has the six leagues of the design, from the weakest to the strongest', () => {
    expect(LEAGUES.map((l) => l.id)).toEqual(['paddock', 'bitume', 'chicane', 'epingle', 'turbo', 'legende']);
    for (let i = 1; i < LEAGUES.length; i++) {
      expect(LEAGUES[i].pieceLevel).toBeGreaterThanOrEqual(LEAGUES[i - 1].pieceLevel);
      expect(LEAGUES[i].gaugeTotal).toBeGreaterThan(LEAGUES[i - 1].gaugeTotal);
      expect(LEAGUES[i].cases).toBeGreaterThanOrEqual(LEAGUES[i - 1].cases);
    }
  });

  it('cuts levels, gauges, totals, cells, relances, free stops and discounts to the league', () => {
    for (const l of LEAGUES) {
      const { mods } = capLoadoutMods(loadout(ids), everyAt5, l);
      for (const c of WEAR_CATEGORIES) expect(gaugeBonus({ ...mods }, c), `${l.id} ${c}`).toBeLessThanOrEqual(l.gauge);
      expect(WEAR_CATEGORIES.reduce((sum, c) => sum + Math.max(0, gaugeBonus(mods, c)), 0), l.id).toBeLessThanOrEqual(l.gaugeTotal);
      expect(mods.moveBonus.reduce((sum, b) => sum + (b.amount > 0 ? b.amount * (b.gears === 'all' ? 6 : b.gears.length) : 0), 0), l.id).toBeLessThanOrEqual(l.cases);
      expect(mods.rerolls, l.id).toBeLessThanOrEqual(l.rerolls);
      expect(mods.freeStops, l.id).toBeLessThanOrEqual(l.freeStops);
      expect(mods.downshiftDiscount + mods.overshootTireDiscount + mods.blockBrakeDiscount + (mods.rollWearDiscount.engine ?? 0), l.id).toBeLessThanOrEqual(l.discounts);
    }
  });

  it('the weakest league cuts the most, and says what was cut', () => {
    const paddock = capLoadoutMods(loadout(ids), everyAt5, league('paddock'));
    expect(paddock.clamped).toEqual(expect.arrayContaining(['piece-level', 'cases', 'freeStops']));
    expect(paddock.mods.freeStops).toBe(0);
    expect(paddock.mods.moveBonus.every((b) => b.amount <= 0)).toBe(true);
  });

  it('parts above the level ceiling play at the ceiling level', () => {
    const l = league('bitume');
    const capped = capLoadoutMods(loadout(['eng-cooler']), { 'eng-cooler': 5 }, l).mods;
    const atCeiling = modsForLoadout(loadout(['eng-cooler']), { 'eng-cooler': 3 });
    expect(capped.rollWearDiscount.engine).toBe(atCeiling.rollWearDiscount.engine);
  });

  it('drawbacks are never lifted by the ceilings', () => {
    const v8 = capLoadoutMods(loadout(['eng-v8']), { 'eng-v8': 5 }, league('paddock')).mods;
    expect(v8.wearBonus.gearbox).toBe(-1);
  });

  it('the strongest league leaves a normal loadout untouched', () => {
    const light = loadout(['eng-turbo', 'tir-grip']);
    const owned = { 'eng-turbo': 1, 'tir-grip': 1 };
    const r = capLoadoutMods(light, owned, league('legende'));
    expect(r.clamped).toEqual([]);
    expect(r.mods).toEqual(modsForLoadout(light, owned));
  });
});
