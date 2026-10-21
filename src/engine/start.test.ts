import { describe, expect, it } from 'vitest';
import { checkInvariants } from './invariants';
import { createGame, currentCar, reducerWithFace } from './reducer';
import { adjust, destinations, fixedDice, game, linearTrack, moveTo, run, shift } from './testing';
import type { GameEvent } from './types';

const track = linearTrack(300, { grid: [3, 2, 1, 0] });
const startRoll = (events: GameEvent[]) => events.find((e): e is Extract<GameEvent, { type: 'START_ROLL' }> => e.type === 'START_ROLL')!;

describe('§4 standing start', () => {
  it('the first turn of a car is a standing start: only gear 1 can be chosen', () => {
    const s = game(track, {}, 1);
    expect(currentCar(s)!.started).toBe(false);
    expect(run(s, shift(2)).events[0]).toMatchObject({ type: 'INVALID_ACTION', reason: 'GEAR_NOT_AVAILABLE' });
    expect(run(s, shift(1)).events.some((e) => e.type === 'INVALID_ACTION')).toBe(false);
  });

  it('a d20 of 20 is a super start: gear 1, 4 cells', () => {
    const r = reducerWithFace(game(track, {}, 1), shift(1), 20);
    expect(startRoll(r.events)).toMatchObject({ d20: 20, result: 'super' });
    expect(r.state.turn!.roll).toBe(4);
    expect(r.state.phase).toBe('adjust');
    expect(currentCar(r.state)!.gear).toBe(1);
    expect(currentCar(r.state)!.started).toBe(true);
    expect(destinations(r.state)).toEqual(['c7']); // pole is on c3: 3 + 4
  });

  it('a d20 of 1 stalls: the turn is lost, nobody moves, the next car plays', () => {
    const s = game(track, {}, 2);
    const r = reducerWithFace(s, shift(1), 1);
    expect(startRoll(r.events)).toMatchObject({ d20: 1, result: 'stall' });
    expect(r.state.phase).toBe('gear');
    expect(r.state.cars[0].position).toBe('c3');
    expect(r.state.cars[0].started).toBe(true);
    expect(currentCar(r.state)!.id).toBe('car2');
    expect(r.events.some((e) => e.type === 'DICE_ROLLED')).toBe(false);
  });

  it('any other d20 starts in gear 1 with a d2 (1 or 2 cells)', () => {
    for (const d20 of [2, 10, 19]) {
      const r = reducerWithFace(game(track, {}, 1), shift(1), d20);
      expect(startRoll(r.events)).toMatchObject({ d20, result: 'normal' });
      expect([1, 2]).toContain(r.state.turn!.roll);
    }
  });

  it('draws the d20 from the seeded generator: about one start in 20 is super, one in 20 stalls', () => {
    const n = 4000;
    let superStarts = 0;
    let stalls = 0;
    for (let seed = 1; seed <= n; seed++) {
      const e = startRoll(run(createGame({ seed, track, config: { weather: 'sun' }, cars: 1 }), shift(1)).events);
      if (e.result === 'super') superStarts++;
      if (e.result === 'stall') stalls++;
    }
    const sigma = 4 * Math.sqrt((0.05 * 0.95) / n);
    expect(Math.abs(superStarts / n - 0.05)).toBeLessThan(sigma);
    expect(Math.abs(stalls / n - 0.05)).toBeLessThan(sigma);
  });

  it('the thresholds are configurable', () => {
    const s = game(track, { superStart: 18, superStartCells: 6, stall: 3 }, 1);
    expect(reducerWithFace(s, shift(1), 18).state.turn!.roll).toBe(6);
    expect(startRoll(reducerWithFace(s, shift(1), 3).events).result).toBe('stall');
    expect(startRoll(reducerWithFace(s, shift(1), 4).events).result).toBe('normal');
  });

  it('after the start the car moves like any other, and the next turn is a normal gear choice', () => {
    let s = reducerWithFace(game(track, {}, 1), shift(1), 20).state;
    s = run(s, adjust(0), moveTo('c7')).state; // 3 + 4
    expect(currentCar(s)!.position).toBe('c7');
    expect(s.phase).toBe('gear');
    expect(run(s, shift(2)).events.some((e) => e.type === 'INVALID_ACTION')).toBe(false);
  });

  it('every car makes its standing start once, in the order of the grid', () => {
    let s = game(track, fixedDice([2, 3, 6, 9, 15, 25]), 4);
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      order.push(currentCar(s)!.id);
      s = reducerWithFace(s, shift(1), 10).state;
      s = run(s, adjust(0), moveTo(destinations(s)[0])).state;
    }
    expect(order).toEqual(['car1', 'car2', 'car3', 'car4']);
    expect(s.cars.every((c) => c.started)).toBe(true);
    expect(checkInvariants(s)).toEqual([]);
  });
});
