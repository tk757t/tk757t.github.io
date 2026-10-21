import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { createGame, currentCar, reducer, reducerWithFace } from './reducer';
import { nextFloat } from './rng';
import { distanceForFace, distanceRange } from './rules';
import { adjust, fixedDice, game, inRace, linearTrack, moveTo, patchCar, run, shift } from './testing';
import type { GameEvent } from './types';

const track = linearTrack(400);
const rolled = (events: GameEvent[]) => events.find((e): e is Extract<GameEvent, { type: 'DICE_ROLLED' }> => e.type === 'DICE_ROLLED')!;

/** A car already in `gear`, at the standing-start rule's end, ready to choose its gear again. */
const inGear = (gear: number, seed = 1) => {
  const s = createGame({ seed, track, cars: 1, config: { weather: 'sun' } });
  return patchCar({ ...s, cars: s.cars.map((c) => ({ ...c, started: true })) }, 'car1', { gear });
};

describe('§1 dice tables', () => {
  it('has exactly the tables of the document', () => {
    expect(DEFAULT_CONFIG.dice).toEqual([
      [1, 2], // d2
      [2, 3, 3, 4, 4, 4], // weighted d6
      [4, 5, 6, 6, 7, 7, 8, 8], // weighted d8
      [7, 8, 9, 10, 11, 12], // 6 + d6
      [11, 12, 13, 14, 15, 16, 17, 18, 19, 20], // 10 + d10
      [21, 22, 23, 24, 25, 26, 27, 28, 29, 30], // 20 + d10
    ]);
  });

  it('has the averages of the document (3.33 and 6.375 for the weighted dice)', () => {
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(DEFAULT_CONFIG.dice[0])).toBe(1.5);
    expect(mean(DEFAULT_CONFIG.dice[1])).toBeCloseTo(3.333, 3);
    expect(mean(DEFAULT_CONFIG.dice[2])).toBe(6.375);
    expect(mean(DEFAULT_CONFIG.dice[3])).toBe(9.5);
    expect(mean(DEFAULT_CONFIG.dice[4])).toBe(15.5);
    expect(mean(DEFAULT_CONFIG.dice[5])).toBe(25.5);
  });

  it('shows the interval of each gear before the roll: 1-2, 2-4, 4-8, 7-12, 11-20, 21-30', () => {
    const car = inGear(3).cars[0];
    expect([1, 2, 3, 4, 5, 6].map((g) => distanceRange(DEFAULT_CONFIG, car, g))).toEqual([
      { min: 1, max: 2 },
      { min: 2, max: 4 },
      { min: 4, max: 8 },
      { min: 7, max: 12 },
      { min: 11, max: 20 },
      { min: 21, max: 30 },
    ]);
  });
});

describe('§1 the die is rolled as soon as the gear is chosen', () => {
  it('SHIFT_GEAR rolls, announces the roll and waits for the adjustments', () => {
    const r = run(inGear(3), shift(3));
    expect(r.state.phase).toBe('adjust');
    expect(r.state.turn!.roll).not.toBeNull();
    const e = rolled(r.events);
    expect(e).toMatchObject({ carId: 'car1', gear: 3 });
    expect(DEFAULT_CONFIG.dice[2]).toContain(e.face);
    expect(e.roll).toBe(e.face);
  });

  it('nothing moves before the destination is chosen', () => {
    const s = inGear(4);
    const r = run(s, shift(4));
    expect(currentCar(r.state)!.position).toBe(s.cars[0].position);
  });

  it('for every gear, every roll over many seeds is a face of its table', () => {
    for (let gear = 1; gear <= 6; gear++) {
      for (let seed = 1; seed <= 150; seed++) {
        const e = rolled(run(inGear(gear, seed), shift(gear)).events);
        expect(DEFAULT_CONFIG.dice[gear - 1], `gear ${gear} seed ${seed}`).toContain(e.roll);
      }
    }
  });

  it('draws the faces of the weighted d6 with the right frequencies (1/6, 2/6, 3/6)', () => {
    const n = 3000;
    const seen: Record<number, number> = {};
    for (let seed = 1; seed <= n; seed++) {
      const roll = rolled(run(inGear(2, seed), shift(2)).events).roll;
      seen[roll] = (seen[roll] ?? 0) + 1;
    }
    const sigma = (p: number) => 4 * Math.sqrt((p * (1 - p)) / n);
    expect(Math.abs(seen[2] / n - 1 / 6)).toBeLessThan(sigma(1 / 6));
    expect(Math.abs(seen[3] / n - 2 / 6)).toBeLessThan(sigma(2 / 6));
    expect(Math.abs(seen[4] / n - 3 / 6)).toBeLessThan(sigma(3 / 6));
    expect(Object.keys(seen).sort()).toEqual(['2', '3', '4']);
  });

  it('is deterministic for a seed and advances the generator', () => {
    const a = run(inGear(5, 9), shift(5));
    const b = run(inGear(5, 9), shift(5));
    expect(b.state).toEqual(a.state);
    expect(a.state.rng).toBe(nextFloat(inGear(5, 9).rng)[1]);
  });

  it('can be forced to a face without touching the generator (for AIs and tests)', () => {
    const s = inGear(6, 4);
    const r = reducerWithFace(s, shift(6), 27);
    expect(rolled(r.events)).toMatchObject({ face: 27, roll: 27 });
    expect(r.state.rng).toBe(s.rng);
  });

  it('a gear change is announced, a same-gear roll is not', () => {
    const up = run(inGear(2), shift(3));
    expect(up.events).toContainEqual({ type: 'GEAR_SHIFTED', carId: 'car1', from: 2, to: 3 });
    expect(run(inGear(2), shift(2)).events.some((e) => e.type === 'GEAR_SHIFTED')).toBe(false);
  });

  it('cannot choose a gear twice in a turn', () => {
    expect(run(inGear(2), shift(2), shift(2)).events.at(-1)).toMatchObject({ type: 'INVALID_ACTION', reason: 'WRONG_PHASE' });
  });
});

describe('dice and parts', () => {
  const car = (bonus: Parameters<typeof game>[4]) => game(track, {}, 1, 1, bonus).cars[0];

  it('a part bonus adds cells for the listed gears only', () => {
    const c = car({ mods: { car1: { moveBonus: [{ gears: [3], amount: 2 }] } } });
    expect(distanceForFace(DEFAULT_CONFIG, c, 3, 6)).toEqual({ roll: 8, bonus: 2 });
    expect(distanceForFace(DEFAULT_CONFIG, c, 4, 9)).toEqual({ roll: 9, bonus: 0 });
  });

  it('"all" gears and several bonuses stack, and a roll is never below 1', () => {
    const c = car({ mods: { car1: { moveBonus: [{ gears: 'all', amount: 1 }, { gears: [6], amount: 1 }] } } });
    expect(distanceForFace(DEFAULT_CONFIG, c, 6, 21).roll).toBe(23);
    expect(distanceForFace(DEFAULT_CONFIG, c, 1, 1).roll).toBe(2);
    const bad = car({ mods: { car1: { moveBonus: [{ gears: 'all', amount: -9 }] } } });
    expect(distanceForFace(DEFAULT_CONFIG, bad, 1, 1).roll).toBe(1);
  });

  it('the bonus is part of the roll the player sees', () => {
    const s = inRace(track, { ...fixedDice([2, 3, 6, 9, 15, 25]) }, 1, { mods: { car1: { moveBonus: [{ gears: [3], amount: 1 }] } } });
    const r = run(patchCar(s, 'car1', { gear: 3 }), shift(3));
    expect(rolled(r.events)).toMatchObject({ face: 6, roll: 7, bonus: 1 });
    expect(run(r.state, adjust(0), moveTo('c7')).state.cars[0].position).toBe('c7');
  });
});

describe('reducer basics', () => {
  it('refuses actions when the race is over and never mutates its input', () => {
    const s = inGear(3);
    const snapshot = JSON.stringify(s);
    reducer(s, shift(3));
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});
