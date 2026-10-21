import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, checkInvariants, createGame, distanceForFace, startPointsFor } from '../../engine';
import { linearTrack } from '../../engine/testing';
import type { CarMods, WearCategory } from '../../engine/types';
import { PARTS, getPart } from './catalogue';
import { describeEffect, levelLines, mainEffectIndex, modsFor, modsForLoadout } from './effects';
import { FAMILIES, FAMILY_SECONDARY, MAX_LEVEL, SLOT_GAUGE, type Effect, type PartDef } from './types';

const part = (id: string): PartDef => getPart(id) as PartDef;
const at = (id: string, level: number): CarMods => modsFor([{ part: part(id), level }]);
const gauge = (m: CarMods, c: WearCategory): number => m.wearBonus[c] ?? 0;

describe('docs/gdd/10-stats-voitures.md § 10.3: every level gives something', () => {
  it('a stock part: slot gauge at levels 2 and 4, secondary gauge of its family at 3 and 5, main effect +1 at 5', () => {
    // Plaquettes durcies: Freins, family Endurance (secondary gauge: Pneus), main effect +2 Freins
    const brakes = [1, 2, 3, 4, 5].map((l) => gauge(at('brk-stock', l), 'brakes'));
    const tires = [1, 2, 3, 4, 5].map((l) => gauge(at('brk-stock', l), 'tires'));
    expect(brakes).toEqual([2, 3, 3, 4, 5]); // 2, +1, +0, +1, +1 (main effect at 5)
    expect(tires).toEqual([0, 0, 1, 1, 2]);
  });

  it('a part with a special effect: the special effect gains 1 at level 5 and nothing before', () => {
    expect([1, 2, 3, 4, 5].map((l) => at('wng-drs', l).rerolls)).toEqual([1, 1, 1, 1, 1]); // relances never grow with the level
    expect([1, 2, 3, 4, 5].map((l) => at('tir-grip', l).overshootTireDiscount)).toEqual([1, 1, 1, 1, 2]);
  });

  it('only the main effect grows, and never the cells of the die: the other effects stay as they are at level 5', () => {
    const hybrid = at('eng-hybrid', 5);
    expect(hybrid.moveBonus.find((b) => Array.isArray(b.gears) && b.gears.length === 3)?.amount).toBe(1); // cells of the die never grow with the level
    expect(hybrid.rollWearDiscount.engine).toBe(2); // its main effect (1, +1 at level 5)
  });

  it('every part gives strictly more at level 5 than at level 1 (in gauge points or in effect)', () => {
    for (const p of PARTS) {
      const total = (m: CarMods) => Object.values(m.wearBonus).reduce((s, v) => s + (v ?? 0), 0) + m.rerolls + m.freeStops + m.downshiftDiscount + m.overshootTireDiscount + m.blockBrakeDiscount;
      expect(total(at(p.id, 5)), p.id).toBeGreaterThan(total(at(p.id, 1)));
    }
  });

  it('each level from 2 to 5 adds a gauge point or the main effect, which the garage lists', () => {
    for (const p of PARTS) {
      for (let l = 2; l <= MAX_LEVEL; l++) {
        const gained = JSON.stringify(at(p.id, l)) !== JSON.stringify(at(p.id, l - 1));
        expect(gained, `${p.id} level ${l}`).toBe(true);
      }
    }
    expect(levelLines(part('brk-stock'), 1)).toEqual([]);
    expect(levelLines(part('brk-stock'), 5)).toEqual(['+2 points de freins (niveau 5)', '+2 points de pneus (niveau 5)']);
  });

  it('the main effect is the first effect that is not a gauge, else the first gauge', () => {
    expect(part('eng-turbo').effects[mainEffectIndex(part('eng-turbo'))].kind).toBe('wear'); // cells of the die are never the main effect
    expect(part('eng-hybrid').effects[mainEffectIndex(part('eng-hybrid'))].kind).toBe('rollWearDiscount');
    expect(part('eng-stock').effects[mainEffectIndex(part('eng-stock'))].kind).toBe('wear');
    expect(mainEffectIndex({ effects: [{ kind: 'wear', category: 'tires', amount: -1 }] })).toBe(-1);
  });
});

describe('docs/gdd/10-stats-voitures.md § 10.4: drawbacks of the epic and legendary parts', () => {
  const costOf = (p: PartDef) => p.effects.filter((e) => e.amount < 0);

  it('every epic and legendary part has a drawback, no common or rare part has one', () => {
    for (const p of PARTS) {
      if (p.rarity === 'epic' || p.rarity === 'legendary') expect(costOf(p).length, p.id).toBeGreaterThan(0);
      else expect(costOf(p).length, p.id).toBe(0);
    }
  });

  it('a drawback is a fixed loss that does not shrink or grow with the level', () => {
    expect(gauge(at('eng-v8', 1), 'gearbox')).toBe(-1);
    expect(gauge(at('eng-v8', 5), 'gearbox')).toBe(-1);
    expect(gauge(at('eng-hybrid', 5), 'gearbox')).toBe(-1);
    expect(gauge(at('chs-carbon', 1), 'engine')).toBe(0); // +1 Moteur of the part, −1 as the drawback
  });

  it('a drawback in cells is possible, and the die never gives less than 1', () => {
    const slow: Effect[] = [{ kind: 'moveBonus', gears: [1], amount: -1, perLevel: 0 }];
    const mods = modsFor([{ part: { kind: 'part', id: 'slow', name: 'slow', slot: 'chassis', rarity: 'epic', family: 'endurance', effects: slow }, level: 1 }]);
    expect(mods.moveBonus).toContainEqual({ gears: [1], amount: -1 });
    const s = createGame({ seed: 1, track: linearTrack(60), cars: 1, mods: { car1: mods } });
    expect(distanceForFace(DEFAULT_CONFIG, s.cars[0], 1, 1).roll).toBe(1); // 1 - 1 = 0, never below 1
    expect(distanceForFace(DEFAULT_CONFIG, s.cars[0], 1, 2).roll).toBe(1);
    expect(distanceForFace(DEFAULT_CONFIG, s.cars[0], 2, 3).roll).toBe(3);
  });

  it('a gauge never starts below 0, whatever the drawbacks', () => {
    const heavy: Effect[] = [{ kind: 'wear', category: 'gearbox', amount: -9, perLevel: 0 }];
    const mods = modsFor([{ part: { kind: 'part', id: 'heavy', name: 'heavy', slot: 'engine', rarity: 'epic', family: 'speed', effects: heavy }, level: 1 }]);
    const s = createGame({ seed: 1, track: linearTrack(60), cars: 1, mods: { car1: mods } });
    expect(s.cars[0].wear.gearbox).toBe(0);
    expect(s.cars[0].maxWear.gearbox).toBe(0);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('describes a drawback in French', () => {
    expect(describeEffect({ kind: 'wear', category: 'gearbox', amount: -1, perLevel: 0 }, 3)).toBe('−1 point de boîte (contrepartie)');
    expect(describeEffect({ kind: 'moveBonus', gears: [1], amount: -1, perLevel: 0 }, 1)).toBe('−1 case au rapport 1 (contrepartie)');
  });
});

describe('docs/gdd/10-stats-voitures.md § 10.5: families and series', () => {
  it('every part has a family, and each family has parts on at most five slots', () => {
    for (const p of PARTS) expect(FAMILIES).toContain(p.family);
    for (const f of FAMILIES) {
      const slots = new Set(PARTS.filter((p) => p.family === f).map((p) => p.slot));
      expect(slots.size, f).toBe(5);
    }
  });

  it('three parts of a family add a point on its secondary gauge', () => {
    // three Précision parts at level 1: engine (cooler), gearbox (clutch), brakes (abs)
    const three = modsFor(['eng-cooler', 'gbx-clutch', 'brk-abs'].map((id) => ({ part: part(id), level: 1 })));
    expect(gauge(three, FAMILY_SECONDARY.precision)).toBe(1);
    const two = modsFor(['eng-cooler', 'gbx-clutch'].map((id) => ({ part: part(id), level: 1 })));
    expect(gauge(two, FAMILY_SECONDARY.precision)).toBe(0);
  });

  it('five parts of a family: the biggest drawback eased by one and the bonus of the family', () => {
    const ids = { engine: 'eng-stock', gearbox: 'gbx-stock', brakes: 'brk-stock', tires: 'tir-pro', chassis: 'chs-ti' } as const; // all Endurance
    const equipped = (list: string[]) => list.map((id) => ({ part: part(id), level: 1 }));
    const five = modsFor(equipped(Object.values(ids)));
    const four = modsFor(equipped(Object.values(ids).slice(0, 4)));
    expect(five.freeStops).toBe(1);
    expect(four.freeStops).toBe(0);
    // Slicks pro (-1 handling) and Titane (-1 tires): the first biggest drawback is eased
    expect(gauge(five, 'handling')).toBe(gauge(modsFor(equipped(Object.values(ids))), 'handling'));
    const withoutEase = gauge(four, 'handling') + 3; // the 5th part adds 3 handling, the series adds the point back
    expect(gauge(five, 'handling')).toBe(withoutEase + 1);
  });

  it('the series bonus of the family: a point of Boîte (Vitesse, never a cell of the die), an extra relance (Précision)', () => {
    const speed = modsFor(['eng-turbo', 'gbx-oil', 'tir-stock', 'wng-flap', 'chs-light'].map((id) => ({ part: part(id), level: 1 })));
    // Moteur: turbo 2 + oil 1 + 1 (series of 3); Boîte: oil 1 + 1 (series of 5)
    expect(gauge(speed, 'engine')).toBe(4);
    expect(gauge(speed, 'gearbox')).toBe(2);
    expect(speed.moveBonus).not.toContainEqual({ gears: [6], amount: 1 });
    const precision = modsFor(['eng-cooler', 'gbx-clutch', 'brk-abs', 'tir-grip', 'wng-drs'].map((id) => ({ part: part(id), level: 1 })));
    expect(precision.rerolls).toBe(2); // the relance of Aileron mobile and the series
  });

  it('the garage loadout goes through the same folding', () => {
    const mods = modsForLoadout({ parts: { engine: 'eng-cooler', gearbox: 'gbx-clutch', brakes: 'brk-abs' } }, { 'eng-cooler': 1, 'gbx-clutch': 1, 'brk-abs': 1 });
    expect(gauge(mods, 'handling')).toBe(1);
  });

  it('a car with every part of every family at every level stays valid for the engine', () => {
    for (const f of FAMILIES) {
      const parts = PARTS.filter((p) => p.family === f);
      const bySlot = new Map(parts.map((p) => [p.slot, p]));
      const mods = modsFor([...bySlot.values()].map((p) => ({ part: p, level: 5 })));
      const s = createGame({ seed: 1, track: linearTrack(60), cars: 1, mods: { car1: mods } });
      expect(checkInvariants(s), f).toEqual([]);
      for (const c of Object.keys(startPointsFor(DEFAULT_CONFIG)) as WearCategory[]) expect(s.cars[0].wear[c], `${f} ${c}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('slot gauges are the ones of the design', () => {
    expect(SLOT_GAUGE).toEqual({ engine: 'engine', gearbox: 'gearbox', brakes: 'brakes', tires: 'tires', wing: 'handling', chassis: 'body' });
  });
});
