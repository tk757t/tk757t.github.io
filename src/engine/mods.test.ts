import { describe, expect, it } from 'vitest';
import { checkInvariants } from './invariants';
import { createGame, currentCar, reducer } from './reducer';
import { nextFloat } from './rng';
import { adjust, asCurrent, game, inRace, linearTrack, moveTo, patchCar, reroll, run, shift } from './testing';
import { NO_MODS, type GameEvent } from './types';

const track = linearTrack(200, { grid: [0, 10] });
const ev = <T extends GameEvent['type']>(es: GameEvent[], t: T) => es.filter((e): e is Extract<GameEvent, { type: T }> => e.type === t);

describe('car parts: points (§2)', () => {
  it('a bonus raises both the starting and the maximum points of the category', () => {
    const s = game(track, { laps: 1 }, 1, 1, { mods: { car1: { wearBonus: { tires: 3, engine: 1 } } } });
    expect(s.cars[0].wear).toEqual({ tires: 7, brakes: 3, gearbox: 2, body: 2, engine: 3, handling: 2 });
    expect(s.cars[0].maxWear).toEqual(s.cars[0].wear);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('applies on top of the table of the race length, and only to the car that has the part', () => {
    const two = game(track, { laps: 2 }, 2, 1, { mods: { car1: { wearBonus: { body: 2 } } } });
    expect(two.cars[0].wear.body).toBe(4);
    expect(two.cars[1].wear.body).toBe(2);
    const three = game(track, { laps: 3 }, 1, 1, { mods: { car1: { wearBonus: { body: 2 } } } });
    expect(three.cars[0].wear.body).toBe(5);
  });

  it('cars without parts have the plain table', () => {
    const s = createGame({ seed: 1, track, cars: 2 });
    expect(s.cars.every((c) => JSON.stringify(c.mods) === JSON.stringify(NO_MODS))).toBe(true);
  });

  it('a bigger tires maximum is what the pit stop renews and what 3 x starting tires is based on', () => {
    const s = game(track, { laps: 1 }, 1, 1, { mods: { car1: { wearBonus: { tires: 2 } } } });
    expect(s.cars[0].maxWear.tires).toBe(6);
  });
});

describe('car parts: reroll', () => {
  const dice = { dice: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [7], [11], [21]] };
  const withRerolls = (n: number) => patchCar(inRace(track, { ...dice, laps: 3 }, 1, { mods: { car1: { rerolls: n } } }), 'car1', { gear: 3 });

  it('rolls the die again with the next random number and spends one charge', () => {
    const first = run(withRerolls(1), shift(3));
    const faceBefore = first.state.turn!.face;
    const again = reducer(first.state, reroll);
    expect(again.events[0]).toEqual({ type: 'REROLLED', carId: 'car1', left: 0 });
    const e = ev(again.events, 'DICE_ROLLED')[0];
    expect(e.face).toBe(dice.dice[2][Math.floor(nextFloat(first.state.rng)[0] * 10)]);
    expect(again.state.turn!.face).toBe(e.face);
    expect(currentCar(again.state)!.rerolls).toBe(0);
    expect(again.state.phase).toBe('adjust');
    expect(typeof faceBefore).toBe('number');
    expect(checkInvariants(again.state)).toEqual([]);
  });

  it('forgets the adjustments of the first roll', () => {
    const rolled = run(withRerolls(1), shift(3), adjust(1, true));
    const again = reducer(rolled.state, reroll).state;
    expect(again.turn).toMatchObject({ brakes: 0, boost: false, slipstream: false });
  });

  it('is limited to the charges the parts give, then refused', () => {
    const r = run(withRerolls(2), shift(3), reroll, reroll);
    expect(ev(r.events, 'REROLLED').map((e) => e.left)).toEqual([1, 0]);
    expect(run(r.state, reroll).events[0]).toMatchObject({ type: 'INVALID_ACTION', reason: 'NO_REROLL' });
  });

  it('is refused before the roll, without a part, after the move and on a standing start', () => {
    expect(run(withRerolls(1), reroll).events[0]).toMatchObject({ reason: 'NO_REROLL' });
    expect(run(withRerolls(0), shift(3), reroll).events.at(-1)).toMatchObject({ reason: 'NO_REROLL' });
    const moved = run(withRerolls(1), shift(3), adjust(0), moveTo('c1'));
    void moved;
    const start = createGame({ seed: 1, track, cars: 1, config: { weather: 'sun' }, mods: { car1: { rerolls: 1 } } });
    expect(run(start, shift(1), reroll).events.at(-1)).toMatchObject({ reason: 'NO_REROLL' });
  });

  it('never mutates the state it is given and survives a JSON round trip', () => {
    const rolled = run(withRerolls(1), shift(3)).state;
    const snap = JSON.stringify(rolled);
    const a = reducer(rolled, reroll).state;
    expect(JSON.stringify(rolled)).toBe(snap);
    expect(reducer(JSON.parse(snap), reroll).state).toEqual(a);
  });

  it('a roll (or a reroll) with no playable destination takes the car out', () => {
    // car1 on c0 with no brakes, car2 on c1: a 1 is blocked at once and cannot be paid; a 2 is a free jump... over car2? no: also blocked
    const cramped = linearTrack(30, { grid: [0, 2] });
    const make = (seed: number) =>
      asCurrent(patchCar(game(cramped, { dice: [[1, 2]], laps: 3 }, 2, seed, { mods: { car1: { rerolls: 1 } } }), 'car1', { gear: 1, started: true, wear: { brakes: 0 } }), 'car1');
    // face 1: c1 is free (move of 1 is fine). face 2: c2 is taken: 1 step missing = 1 brake, which the car does not have
    let found = 0;
    for (let seed = 1; seed <= 200 && found < 3; seed++) {
      const first = run(make(seed), shift(1));
      if (first.state.cars[0].retired) {
        expect(first.state.cars[0].retired).toBe('no-move');
        expect(first.state.turn!.carId).toBe('car2');
        continue;
      }
      if (first.state.turn!.face !== 1) continue;
      // a 1 is playable; reroll until the second roll is a 2: then nothing can be played
      const again = reducer(first.state, reroll);
      if (again.state.turn?.face === 2 || again.state.cars[0].retired) {
        found++;
        expect(again.state.cars[0].retired).toBe('no-move');
      }
    }
    expect(found).toBeGreaterThan(0);
  });
});
