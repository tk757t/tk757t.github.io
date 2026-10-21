import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { currentCar } from './reducer';
import { allowedGears, canShiftTo, downshiftCost, effectiveDrop } from './rules';
import { inRace, linearTrack, patchCar, run, shift } from './testing';
import type { CarState, GameEvent } from './types';

const track = linearTrack(300);
/** One car in `gear` with the given points. */
const car = (gear: number, wear: Partial<CarState['wear']> = {}, mods: Parameters<typeof inRace>[3] = {}) =>
  patchCar(inRace(track, { laps: 3 }, 1, mods), 'car1', { gear, wear });
const lost = (events: GameEvent[]) => events.filter((e): e is Extract<GameEvent, { type: 'WEAR_LOST' }> => e.type === 'WEAR_LOST');

describe('§3 shifting up: one gear at a time', () => {
  it('can keep the gear or go up by one, never more', () => {
    for (let g = 1; g <= 5; g++) {
      const c = car(g).cars[0];
      expect(canShiftTo(c, g, 6)).toBe(true);
      expect(canShiftTo(c, g + 1, 6)).toBe(true);
      expect(canShiftTo(c, g + 2, 6)).toBe(false);
    }
    expect(canShiftTo(car(6).cars[0], 7, 6)).toBe(false);
  });

  it('refuses a jump of two gears in the reducer', () => {
    const r = run(car(2), shift(4));
    expect(r.events[0]).toMatchObject({ type: 'INVALID_ACTION', reason: 'GEAR_NOT_AVAILABLE' });
    expect(currentCar(r.state)!.gear).toBe(2);
  });

  it('going up costs nothing', () => {
    const s = car(3);
    const r = run(s, shift(4));
    expect(lost(r.events)).toEqual([]);
    expect(currentCar(r.state)!.wear).toEqual(s.cars[0].wear);
  });

  it('neutral can only go to gear 1', () => {
    const c = car(0).cars[0];
    expect(allowedGears(c, DEFAULT_CONFIG)).toEqual([1]);
    expect(run(car(0), shift(2)).events[0]).toMatchObject({ reason: 'GEAR_NOT_AVAILABLE' });
    expect(currentCar(run(car(0), shift(1)).state)!.gear).toBe(1);
  });

  it('refuses gears outside 1-6 and non-integers', () => {
    expect(canShiftTo(car(6).cars[0], 0, 6)).toBe(false);
    expect(canShiftTo(car(6).cars[0], 1.5, 6)).toBe(false);
    expect(canShiftTo(car(6).cars[0], -1, 6)).toBe(false);
  });
});

describe('§3 downshift costs', () => {
  it('table of the document: 1 gear free, 2 gears -1 gearbox, 3 -1 gearbox -1 brakes, 4+ -1 gearbox -1 brakes -1 engine', () => {
    expect([0, 1, 2, 3, 4, 5].map(downshiftCost)).toEqual([
      { gearbox: 0, brakes: 0, engine: 0 },
      { gearbox: 0, brakes: 0, engine: 0 },
      { gearbox: 1, brakes: 0, engine: 0 },
      { gearbox: 1, brakes: 1, engine: 0 },
      { gearbox: 1, brakes: 1, engine: 1 },
      { gearbox: 1, brakes: 1, engine: 1 },
    ]);
  });

  it.each([
    [5, 6, {}],
    [4, 6, { gearbox: -1 }],
    [3, 6, { gearbox: -1, brakes: -1 }],
    [2, 6, { gearbox: -1, brakes: -1, engine: -1 }],
    [1, 6, { gearbox: -1, brakes: -1, engine: -1 }],
  ])('going to gear %i from gear %i pays %j', (to, from, delta) => {
    const s = car(from, { gearbox: 3, brakes: 3, engine: 3 });
    const r = run(s, shift(to));
    const after = currentCar(r.state)!.wear;
    const before = currentCar(s)!.wear;
    expect(after.gearbox - before.gearbox).toBe((delta as Record<string, number>).gearbox ?? 0);
    expect(after.brakes - before.brakes).toBe((delta as Record<string, number>).brakes ?? 0);
    expect(after.engine - before.engine).toBe((delta as Record<string, number>).engine ?? 0);
    expect(after.tires).toBe(before.tires);
    expect(currentCar(r.state)!.gear).toBe(to);
  });

  it('every payment is announced as a wear loss caused by the downshift', () => {
    const r = run(car(6, { gearbox: 3, brakes: 3, engine: 3 }), shift(2));
    expect(lost(r.events).map((e) => [e.category, e.amount, e.cause])).toEqual([
      ['gearbox', 1, 'downshift'],
      ['brakes', 1, 'downshift'],
      ['engine', 1, 'downshift'],
    ]);
  });

  it('a gear is only offered when the car can pay: gearbox >= 1 for 2 down, brakes >= 1 for 3, engine >= 2 for 4+', () => {
    expect(canShiftTo(car(6, { gearbox: 0 }).cars[0], 4, 6)).toBe(false); // 2 down needs gearbox
    expect(canShiftTo(car(6, { gearbox: 1 }).cars[0], 4, 6)).toBe(true);
    expect(canShiftTo(car(6, { brakes: 0 }).cars[0], 3, 6)).toBe(false); // 3 down needs brakes
    expect(canShiftTo(car(6, { brakes: 1 }).cars[0], 3, 6)).toBe(true);
    expect(canShiftTo(car(6, { engine: 1 }).cars[0], 2, 6)).toBe(false); // 4 down needs engine >= 2
    expect(canShiftTo(car(6, { engine: 2 }).cars[0], 2, 6)).toBe(true);
    expect(canShiftTo(car(6, { engine: 1 }).cars[0], 3, 6)).toBe(true); // only 3 down: engine is not needed
  });

  it('allowedGears lists exactly what the car can afford', () => {
    expect(allowedGears(car(6, { gearbox: 3, brakes: 3, engine: 3 }).cars[0], DEFAULT_CONFIG)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(allowedGears(car(6, { gearbox: 0 }).cars[0], DEFAULT_CONFIG)).toEqual([5, 6]);
    expect(allowedGears(car(6, { brakes: 0 }).cars[0], DEFAULT_CONFIG)).toEqual([4, 5, 6]);
    expect(allowedGears(car(6, { engine: 1 }).cars[0], DEFAULT_CONFIG)).toEqual([3, 4, 5, 6]);
    expect(allowedGears(car(3).cars[0], DEFAULT_CONFIG)).toEqual([1, 2, 3, 4]);
  });

  it('refuses a downshift the car cannot pay, with nothing changed', () => {
    const s = car(6, { gearbox: 0 });
    const r = run(s, shift(3));
    expect(r.events[0]).toMatchObject({ type: 'INVALID_ACTION', reason: 'GEAR_NOT_AVAILABLE' });
    expect(r.state).toBe(s);
  });

  it('the points used leave the part at 0, never below', () => {
    const r = run(car(6, { gearbox: 1, brakes: 1, engine: 2 }), shift(2));
    expect(currentCar(r.state)!.wear).toMatchObject({ gearbox: 0, brakes: 0, engine: 1 });
    expect(currentCar(r.state)!.retired).toBeNull();
  });
});

describe('§3 downshift and car parts', () => {
  it('a discount removes gears from the count: -1 turns a 3-gear drop into a 2-gear drop', () => {
    const c = car(6, {}, { mods: { car1: { downshiftDiscount: 1 } } }).cars[0];
    expect(effectiveDrop(c, 3)).toBe(2); // 6 -> 3 is 3 gears, minus 1
    expect(effectiveDrop(c, 5)).toBe(0);
    const r = run(car(6, {}, { mods: { car1: { downshiftDiscount: 1 } } }), shift(3));
    expect(lost(r.events).map((e) => e.category)).toEqual(['gearbox']);
  });

  it('a big enough discount makes any downshift free, and available without points', () => {
    const s = car(6, { gearbox: 0, brakes: 0, engine: 0 }, { mods: { car1: { downshiftDiscount: 5 } } });
    const r = run(s, shift(1));
    expect(lost(r.events)).toEqual([]);
    expect(currentCar(r.state)!.gear).toBe(1);
  });
});
