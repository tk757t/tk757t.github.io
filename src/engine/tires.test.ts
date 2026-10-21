import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { createGame } from './reducer';
import { distanceForFace, distanceRange, lapTireWear, tireFactor } from './rules';
import { adjust, game, linearTrack, moveTo, patchCar, ready, run, shift } from './testing';
import type { CarState, GameEvent, TireType } from './types';

const track = linearTrack(100);
const car = (tires: TireType, stint = 0): CarState => patchCar(game(track, {}, 1, 1, { tires: { car1: tires } }), 'car1', { stint }).cars[0];

describe('§7 tire types', () => {
  it('every car starts on the configured tires, or on the one chosen for it', () => {
    expect(createGame({ seed: 1, track, cars: 1 }).cars[0].tires).toBe('hard');
    expect(createGame({ seed: 1, track, cars: 1, config: { startTires: 'soft' } }).cars[0].tires).toBe('soft');
    expect(createGame({ seed: 1, track: linearTrack(30, { grid: [0, 1] }), cars: ['a', 'b'], tires: { b: 'rain' } }).cars.map((c) => c.tires)).toEqual(['hard', 'rain']);
  });

  it('wear factor: hard 1, soft 2 (3 from the 3rd lap of the stint), rain tires 2 when dry, 1 when wet', () => {
    expect(tireFactor(car('hard'), false)).toBe(1);
    expect(tireFactor(car('hard', 9), true)).toBe(1);
    expect(tireFactor(car('soft', 0), false)).toBe(2);
    expect(tireFactor(car('soft', 1), false)).toBe(2);
    expect(tireFactor(car('soft', 2), false)).toBe(3);
    expect(tireFactor(car('rain'), false)).toBe(2);
    expect(tireFactor(car('rain'), true)).toBe(1);
  });
});

describe('§7 soft tires and the die (hypothesis: how a die maximum moves)', () => {
  const roll = (c: CarState, gear: number, face: number) => distanceForFace(DEFAULT_CONFIG, c, gear, face).roll;

  it('the first two laps of the stint: +1 on the maximum of the die', () => {
    for (const stint of [0, 1]) {
      const c = car('soft', stint);
      expect(roll(c, 2, 4)).toBe(5); // max of {2,3,3,4,4,4}
      expect(roll(c, 2, 3)).toBe(3);
      expect(roll(c, 1, 2)).toBe(3);
      expect(roll(c, 6, 30)).toBe(31);
      expect(roll(c, 6, 29)).toBe(29);
    }
  });

  it('from the third lap of the stint: -1 on the whole die (minimum 1)', () => {
    const c = car('soft', 2);
    expect(roll(c, 2, 4)).toBe(3);
    expect(roll(c, 2, 2)).toBe(1);
    expect(roll(c, 1, 1)).toBe(1);
    expect(roll(c, 5, 11)).toBe(10);
    expect(roll(car('soft', 7), 4, 12)).toBe(11);
  });

  it('hard and rain tires do not change the die', () => {
    for (const t of ['hard', 'rain'] as const) {
      for (const stint of [0, 2, 5]) {
        expect(roll(car(t, stint), 2, 4)).toBe(4);
        expect(roll(car(t, stint), 6, 21)).toBe(21);
      }
    }
  });

  it('the range shown before the roll includes the tires', () => {
    expect(distanceRange(DEFAULT_CONFIG, car('soft', 0), 3)).toEqual({ min: 4, max: 9 });
    expect(distanceRange(DEFAULT_CONFIG, car('soft', 2), 3)).toEqual({ min: 3, max: 7 });
    expect(distanceRange(DEFAULT_CONFIG, car('hard', 2), 3)).toEqual({ min: 4, max: 8 });
  });
});

describe('§7 tires wear a little every lap', () => {
  const wears = (tires: TireType, raining: boolean, laps: number) => Array.from({ length: laps }, (_, i) => lapTireWear(DEFAULT_CONFIG, car(tires, i + 1), raining));

  it('soft: 1 point every lap; hard: every 2 laps; rain tires: every lap when dry, every 2 laps when wet', () => {
    expect(wears('soft', false, 4)).toEqual([1, 1, 1, 1]);
    expect(wears('soft', true, 3)).toEqual([1, 1, 1]);
    expect(wears('hard', false, 4)).toEqual([0, 1, 0, 1]);
    expect(wears('hard', true, 4)).toEqual([0, 1, 0, 1]);
    expect(wears('rain', false, 3)).toEqual([1, 1, 1]);
    expect(wears('rain', true, 4)).toEqual([0, 1, 0, 1]);
  });

  it('nothing before a lap is finished, and "never" in the config means no wear', () => {
    expect(lapTireWear(DEFAULT_CONFIG, car('soft', 0), false)).toBe(0);
    expect(lapTireWear({ ...DEFAULT_CONFIG, lapTireWear: { soft: { dry: 0, wet: 0 }, hard: { dry: 0, wet: 0 }, rain: { dry: 0, wet: 0 } } }, car('soft', 3), false)).toBe(0);
  });

  /** One car on a loop of 8 cells, already on lap 0, 3 cells before the line; one move of 3 (4 on fresh soft tires: +1 on the die maximum) crosses it. */
  const crossLine = (tires: TireType, laps: number, done: number, stint: number): { events: GameEvent[]; car: CarState } => {
    const start = ready(game(linearTrack(8, { loop: true, grid: [6] }), { dice: [[3], [3], [3], [3], [3], [3]], laps }, 1, 1, { tires: { car1: tires } }));
    const roll = tires === 'soft' && stint <= 1 ? 4 : 3;
    const r = run(patchCar(start, 'car1', { laps: done, gear: 3, stint }), shift(3), adjust(0), moveTo(`c${(6 + roll) % 8}`));
    return { events: r.events, car: r.state.cars[0] };
  };

  it('finishing a lap costs the tires their point, with an event and the lap counted in the stint', () => {
    const r = crossLine('soft', 3, 0, 0);
    expect(r.events).toContainEqual({ type: 'TIRE_WEAR', carId: 'car1', amount: 1, laps: 1 });
    expect(r.events).toContainEqual({ type: 'WEAR_LOST', carId: 'car1', category: 'tires', amount: 1, cause: 'tire wear' });
    expect(r.car.wear.tires).toBe(DEFAULT_CONFIG.startPoints.lap3.tires - 1);
  });

  it('hard tires keep their point on the first lap and lose it on the second', () => {
    expect(crossLine('hard', 3, 0, 0).events.some((e) => e.type === 'TIRE_WEAR')).toBe(false);
    expect(crossLine('hard', 3, 1, 1).events).toContainEqual({ type: 'TIRE_WEAR', carId: 'car1', amount: 1, laps: 2 });
  });

  it('the last lap of the race is free: nothing is lost at the line', () => {
    const r = crossLine('soft', 2, 1, 1);
    expect(r.events.some((e) => e.type === 'TIRE_WEAR')).toBe(false);
    expect(r.car.wear.tires).toBe(DEFAULT_CONFIG.startPoints.lap2.tires);
    expect(r.car.finishRank).toBe(1);
  });

  it('there is no lap wear in practice (no wear at all there, only time penalties)', () => {
    const start = ready(game(linearTrack(8, { loop: true, grid: [6] }), { dice: [[3], [3], [3], [3], [3], [3]], laps: 3, practice: true }, 1, 1, { tires: { car1: 'soft' } }));
    const r = run(patchCar(start, 'car1', { laps: 0, gear: 3 }), shift(3), adjust(0), moveTo('c2'));
    expect(r.state.cars[0].wear.tires).toBe(DEFAULT_CONFIG.startPoints.practice.tires);
    expect(r.events.some((e) => e.type === 'TIRE_WEAR')).toBe(false);
  });
});
