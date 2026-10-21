import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { createGame } from './reducer';
import { distanceForFace, distanceRange, tireFactor } from './rules';
import { game, linearTrack, patchCar } from './testing';
import type { CarState, TireType } from './types';

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
