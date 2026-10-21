import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, checkInvariants, createGame, createWalker, currentCar, distanceForFace, effectiveDrop, enumerateMoves, reducer, startPointsFor } from '../../engine';
import { adjust, game, inRace, linearTrack, moveTo, patchCar, reroll, run, shift } from '../../engine/testing';
import type { CarMods, GameEvent, RaceState } from '../../engine/types';
import { COSMETICS, ITEMS, PARTS, getPart } from './catalogue';
import { describeEffect, effectValue, modsFor, modsForLoadout, statRows } from './effects';
import { MAX_LEVEL, RARITIES, SLOTS, type Effect, type PartDef } from './types';

const fake = (effects: Effect[]): PartDef => ({ kind: 'part', id: 'fake', name: 'fake', slot: 'engine', rarity: 'common', effects });
const withPart = (e: Effect, level: number): CarMods => modsFor([{ part: fake([e]), level }]);
const ev = <T extends GameEvent['type']>(es: GameEvent[], t: T) => es.filter((x): x is Extract<GameEvent, { type: T }> => x.type === t);

describe('catalogue', () => {
  it('has unique ids and a part of every rarity in every slot', () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    for (const slot of SLOTS) {
      for (const r of RARITIES) {
        expect(PARTS.some((p) => p.slot === slot && p.rarity === r), `${slot}/${r}`).toBe(true);
      }
    }
  });

  it('has paint, number and helmet cosmetics', () => {
    for (const k of ['paint', 'number', 'helmet'] as const) expect(COSMETICS.filter((c) => c.cosmetic === k).length).toBeGreaterThanOrEqual(5);
  });

  it('every part has at least one effect and a readable description', () => {
    for (const p of PARTS) {
      expect(p.effects.length, p.id).toBeGreaterThan(0);
      for (const e of p.effects) expect(describeEffect(e, 1).length).toBeGreaterThan(3);
    }
  });

  it('rarer parts are not weaker: total effect value grows with rarity inside a slot', () => {
    const power = (p: PartDef) => p.effects.reduce((s, e) => s + effectValue(e, 1) * (e.kind === 'wear' ? 1 : 3), 0);
    for (const slot of SLOTS) {
      const best = (r: string) => Math.max(...PARTS.filter((p) => p.slot === slot && p.rarity === r).map(power));
      expect(best('legendary'), slot).toBeGreaterThanOrEqual(best('epic'));
      expect(best('epic'), slot).toBeGreaterThanOrEqual(best('rare'));
      expect(best('rare'), slot).toBeGreaterThanOrEqual(best('common'));
    }
  });
});

describe('effect values by level', () => {
  it('never decrease with level, and level 5 is stronger than level 1', () => {
    for (const p of PARTS) {
      for (const e of p.effects) {
        let prev = -1;
        for (let l = 1; l <= MAX_LEVEL; l++) {
          const v = effectValue(e, l);
          expect(v, `${p.id} level ${l}`).toBeGreaterThanOrEqual(prev);
          prev = v;
        }
        expect(effectValue(e, 5), p.id).toBeGreaterThanOrEqual(effectValue(e, 1));
      }
    }
  });

  it('wear grows by one per level, discrete effects by one at level 5', () => {
    expect(effectValue({ kind: 'wear', category: 'tires', amount: 2 }, 3)).toBe(4);
    expect(effectValue({ kind: 'reroll', amount: 1 }, 4)).toBe(1);
    expect(effectValue({ kind: 'reroll', amount: 1 }, 5)).toBe(2);
    expect(effectValue({ kind: 'wear', category: 'tires', amount: 2 }, 99)).toBe(effectValue({ kind: 'wear', category: 'tires', amount: 2 }, 5));
  });
});

// Every effect kind goes through a hook of the engine (docs/regles.md sections in brackets).
describe('every effect kind, applied by the engine', () => {
  const levels = [1, 5];
  const track = linearTrack(120, { corners: [{ from: 4, to: 8, stops: 2, id: 'K' }], grid: [0, 1] });
  const cfg = { laps: 2, weather: 'sun' as const };
  const solo = (mods: CarMods, config: object = {}): RaceState => patchCar(inRace(track, { ...cfg, ...config }, 1, { mods: { car1: mods } }), 'car1', {});
  const inK = (mods: CarMods, left: number): RaceState => patchCar(solo(mods), 'car1', { position: 'c6', cornerId: 'K', cornerLeft: left });
  const walk = (s: RaceState, m: number, cell: string) => createWalker(s, s.cars[0]).moves(m).find((o) => o.cellId === cell)!;

  it.each(levels)('wear: more points at the start (level %i) [§2]', (level) => {
    const e: Effect = { kind: 'wear', category: 'brakes', amount: 2 };
    const s = solo(withPart(e, level));
    expect(s.cars[0].wear.brakes).toBe(startPointsFor(s.config).brakes + effectValue(e, level));
    expect(s.cars[0].maxWear.brakes).toBe(s.cars[0].wear.brakes);
  });

  it.each(levels)('moveBonus: more cells on the listed gears (level %i) [§1]', (level) => {
    const e: Effect = { kind: 'moveBonus', gears: [3], amount: 1 };
    const c = solo(withPart(e, level)).cars[0];
    expect(distanceForFace(DEFAULT_CONFIG, c, 3, 6).roll).toBe(6 + effectValue(e, level));
    expect(distanceForFace(DEFAULT_CONFIG, c, 4, 9).roll).toBe(9);
  });

  it.each(levels)('rollWearDiscount: the engine roll hits less often (level %i) [§8]', (level) => {
    const e: Effect = { kind: 'rollWearDiscount', category: 'engine', amount: 1 };
    const hits = (mods: CarMods) => {
      let n = 0;
      for (let seed = 1; seed <= 400; seed++) {
        const base = patchCar(game(linearTrack(80, { grid: [0] }), { dice: [[2], [3], [6], [9], [15], [25]], engineRoll: { dry: 1, rain: 1, minGear: 5 }, weather: 'sun', laps: 3 }, 1, seed, { mods: { car1: mods } }), 'car1', { gear: 5, started: true });
        n += ev(run(base, shift(5), adjust(0), moveTo('c15')).events, 'ENGINE_ROLL').filter((x) => x.hit).length;
      }
      return n;
    };
    expect(hits({ ...withPart({ kind: 'wear', category: 'tires', amount: 0 }, 1) })).toBeGreaterThan(0); // 1 in 20 without the part
    expect(hits(withPart(e, level))).toBe(0); // threshold 1 - discount: never
  });

  it.each(levels)('downshiftDiscount: fewer gears to pay for (level %i) [§3]', (level) => {
    const e: Effect = { kind: 'downshiftDiscount', amount: 1 };
    const v = effectValue(e, level);
    const c = patchCar(solo(withPart(e, level)), 'car1', { gear: 6 }).cars[0];
    expect(effectiveDrop(c, 1)).toBe(Math.max(0, 5 - v));
  });

  it.each(levels)('overshootTireDiscount: fewer tires lost leaving a corner (level %i) [§6]', (level) => {
    const e: Effect = { kind: 'overshootTireDiscount', amount: 1 };
    const v = effectValue(e, level);
    expect(walk(inK(withPart(e, level), 1), 5, 'c11').tiresLoss).toBe(Math.max(0, 3 - v)); // 3 steps left, hard tires
  });

  it.each(levels)('blockBrakeDiscount: less bodywork lost behind a car (level %i) [§5]', (level) => {
    const e: Effect = { kind: 'blockBrakeDiscount', amount: 1 };
    const v = effectValue(e, level);
    const s = patchCar(inRace(track, cfg, 2, { mods: { car1: withPart(e, level) } }), 'car2', { position: 'c3' });
    expect(createWalker(s, s.cars[0]).moves(5)[0].bodyLoss).toBe(Math.max(0, Math.round(1 - v)));
  });

  it.each(levels)('freeStop: missing stops covered for free (level %i) [§6]', (level) => {
    const e: Effect = { kind: 'freeStop', amount: 1 };
    const v = effectValue(e, level);
    const s = inK(withPart(e, level), 2);
    expect(s.cars[0].freeStops).toBe(v);
    const o = walk(s, 5, 'c11');
    expect(o.freeUsed).toBe(Math.min(2, v));
    if (v >= 2) expect(o.tiresLoss).toBe(0);
    else expect(o.tiresLoss).toBeGreaterThan(0);
  });

  it.each(levels)('reroll: the die can be rolled again (level %i) [§1]', (level) => {
    const e: Effect = { kind: 'reroll', amount: 1 };
    const v = effectValue(e, level);
    let s = patchCar(inRace(track, { ...cfg }, 1, { mods: { car1: withPart(e, level) } }), 'car1', { gear: 3 });
    s = run(s, shift(3)).state;
    for (let i = 0; i < v; i++) {
      const r = reducer(s, reroll);
      expect(ev(r.events, 'REROLLED')).toHaveLength(1);
      s = r.state;
    }
    expect(reducer(s, reroll).events[0]).toMatchObject({ type: 'INVALID_ACTION' });
  });

  it('all parts of the catalogue, at every level, give a valid playable car', () => {
    for (const p of PARTS) {
      for (let level = 1; level <= MAX_LEVEL; level++) {
        const s = createGame({ seed: 1, track, cars: 1, config: { weather: 'sun' }, mods: { car1: modsFor([{ part: p, level }]) } });
        expect(checkInvariants(s), `${p.id} L${level}`).toEqual([]);
        // one full turn: standing start, then a normal move
        let state = run(s, shift(1)).state;
        if (state.phase === 'adjust') state = run(state, moveTo(enumerateMoves(state).find((o) => o.playable)!.cellId)).state;
        expect(checkInvariants(state), `${p.id} L${level} after play`).toEqual([]);
        expect(currentCar(state)).toBeDefined();
      }
    }
  });
});

describe('loadout to mods', () => {
  it('sums the effects of every equipped part at their levels', () => {
    const loadout = { parts: { engine: 'eng-turbo', tires: 'tir-grip', wing: 'wng-drs' } };
    const mods = modsForLoadout(loadout, { 'eng-turbo': 1, 'tir-grip': 5, 'wng-drs': 3 });
    expect(mods.wearBonus.engine).toBe(2);
    expect(mods.moveBonus).toEqual([{ gears: [4], amount: 1 }]);
    expect(mods.overshootTireDiscount).toBe(2); // 1 + floor(0.25 * 4)
    expect(mods.rerolls).toBe(1);
  });

  it('ignores parts that are not owned or sit in the wrong slot', () => {
    const mods = modsForLoadout({ parts: { engine: 'tir-grip', tires: 'eng-turbo', wing: 'wng-drs' } }, { 'tir-grip': 1, 'wng-drs': 1 });
    expect(mods.overshootTireDiscount).toBe(0);
    expect(mods.wearBonus.engine).toBeUndefined();
    expect(mods.rerolls).toBe(1);
  });

  it('two parts adding to the same category stack', () => {
    const mods = modsFor([
      { part: getPart('tir-stock')!, level: 1 },
      { part: getPart('tir-wet')!, level: 1 },
    ]);
    expect(mods.wearBonus.tires).toBe(3);
  });

  it('statRows reflects the mods for the preview, on top of the starting points of the race', () => {
    const mods = modsFor([{ part: getPart('brk-carbon')!, level: 1 }]);
    const rows = Object.fromEntries(statRows(mods, startPointsFor(DEFAULT_CONFIG)).map((r) => [r.key, r.value]));
    expect(rows.freeStops).toBe(1);
    expect(rows['wear-tires']).toBe(6); // lap-2 start points
    expect(rows['wear-handling']).toBe(2);
    const boosted = Object.fromEntries(statRows(modsFor([{ part: getPart('tir-stock')!, level: 1 }]), startPointsFor(DEFAULT_CONFIG)).map((r) => [r.key, r.value]));
    expect(boosted['wear-tires']).toBe(8);
  });
});

