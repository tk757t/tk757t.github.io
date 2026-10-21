import { describe, expect, it } from 'vitest';
import { createGame, currentCar } from './reducer';
import { adjust, asCurrent, fixedDice, game, linearTrack, moveTo, patchCar, pitTrack, ready, run, shift } from './testing';
import type { GameEvent, RaceState } from './types';

const kinds = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const dice = fixedDice([2, 3, 10, 9, 15, 25]);
const sigma = (p: number, n: number) => 4 * Math.sqrt((p * (1 - p)) / n);

/** car1 on c0 plays a 10 in gear 3 (to c10); neighbours are the cells next to each other. */
function contactRace(config = {}, others = ['c11']) {
  const t = linearTrack(60, { grid: [0, 11, 12, 13].slice(0, 1 + others.length), contacts: true });
  t.cells.c10.side = ['c9', 'c11', 'c12']; // two cars can sit next to the arrival cell
  const s = ready(game(t, { ...dice, laps: 3, ...config }, 1 + others.length));
  const withOthers = others.reduce((acc, cell, i) => patchCar(acc, `car${i + 2}`, { position: cell }), s);
  return patchCar(asCurrent(withOthers, 'car1'), 'car1', { gear: 3 });
}
const play = (s: RaceState) => run(s, shift(3), adjust(0), moveTo('c10'));

describe('§8 contacts', () => {
  it('a hit costs the neighbour 1 bodywork and the active car 1 bodywork', () => {
    const r = play(contactRace({ contact: { dry: 20, rain: 20 } }));
    expect(kinds(r.events, 'CONTACT')).toMatchObject([{ carId: 'car1', other: 'car2', hit: true }]);
    expect(r.state.cars[1].wear.body).toBe(2); // lap-3 start points: body 3
    expect(r.state.cars[0].wear.body).toBe(2);
    expect(r.state.cars[0].contacted).toEqual(['car2']);
  });

  it('a miss costs nothing', () => {
    const r = play(contactRace({ contact: { dry: 0, rain: 0 } }));
    expect(kinds(r.events, 'CONTACT')).toMatchObject([{ hit: false }]);
    expect(r.state.cars.map((c) => c.wear.body)).toEqual([3, 3]);
  });

  it('the active car pays only once per neighbour over the whole race, the neighbour pays every time', () => {
    let s = contactRace({ contact: { dry: 20, rain: 20 } });
    s = play(s).state;
    expect(s.cars[0].wear.body).toBe(2);
    expect(s.cars[1].wear.body).toBe(2);
    // second contact with the same car: it is hit again, the active car is not
    s = asCurrent(patchCar(s, 'car1', { position: 'c0', gear: 3 }), 'car1');
    s = play(s).state;
    expect(s.cars[0].wear.body).toBe(2);
    expect(s.cars[1].wear.body).toBe(1);
  });

  it('every neighbour is rolled for, and each one costs the active car once', () => {
    const r = play(contactRace({ contact: { dry: 20, rain: 20 } }, ['c11', 'c12']));
    expect(kinds(r.events, 'CONTACT').map((e) => e.other).sort()).toEqual(['car2', 'car3']);
    expect(r.state.cars[0].wear.body).toBe(1); // 3 - 2
    expect(r.state.cars[0].contacted.sort()).toEqual(['car2', 'car3']);
  });

  it('cars that are not on a neighbouring cell are not rolled for', () => {
    const r = play(contactRace({ contact: { dry: 20, rain: 20 } }, ['c14']));
    expect(kinds(r.events, 'CONTACT')).toEqual([]);
  });

  it('a neighbour whose bodywork drops below 0 is out of the race', () => {
    const s = patchCar(contactRace({ contact: { dry: 20, rain: 20 } }), 'car2', { wear: { body: 0 } });
    const r = play(s);
    expect(r.state.cars[1]).toMatchObject({ retired: 'body', position: null });
    expect(kinds(r.events, 'CAR_RETIRED')).toEqual([{ type: 'CAR_RETIRED', carId: 'car2', reason: 'body' }]);
    expect(r.state.cars[0].retired).toBeNull();
  });

  it('the active car is out when its own bodywork drops below 0', () => {
    const s = patchCar(contactRace({ contact: { dry: 20, rain: 20 } }), 'car1', { wear: { body: 0 } });
    const r = play(s);
    expect(r.state.cars[0].retired).toBe('body');
  });

  it('1 on the d20 in the dry (5 %), 1 or 2 in the rain (10 %)', () => {
    const rate = (weather: 'sun' | 'rain') => {
      const n = 4000;
      let hits = 0;
      for (let seed = 1; seed <= n; seed++) {
        const base = contactRace({ weather });
        hits += kinds(run({ ...base, rng: seed }, shift(3), adjust(0), moveTo('c10')).events, 'CONTACT').filter((e) => e.hit).length;
      }
      return hits / n;
    };
    expect(Math.abs(rate('sun') - 0.05)).toBeLessThan(sigma(0.05, 4000));
    expect(Math.abs(rate('rain') - 0.1)).toBeLessThan(sigma(0.1, 4000));
  });

  it('the dry and rain thresholds are separate settings', () => {
    const cfg = { contact: { dry: 0, rain: 20 } };
    expect(kinds(play(contactRace({ ...cfg, weather: 'sun' })).events, 'CONTACT')[0].hit).toBe(false);
    expect(kinds(play(contactRace({ ...cfg, weather: 'rain' })).events, 'CONTACT')[0].hit).toBe(true);
  });
});

describe('§8 engine roll', () => {
  const t = linearTrack(80);
  const turn = (gear: number, config = {}, mods: Parameters<typeof game>[4] = {}) => {
    const s = patchCar(ready(game(t, { ...fixedDice([2, 3, 6, 9, 15, 25]), laps: 3, ...config }, 1, 1, mods)), 'car1', { gear });
    return run(s, shift(gear), adjust(0), moveTo(`c${[2, 3, 6, 9, 15, 25][gear - 1]}`));
  };

  it('a car in gear 5 or 6 rolls a d20 after its move; a hit costs 1 engine point', () => {
    for (const gear of [5, 6]) {
      const r = turn(gear, { engineRoll: { dry: 20, rain: 20, minGear: 5 } });
      expect(kinds(r.events, 'ENGINE_ROLL')).toHaveLength(1);
      expect(r.state.cars[0].wear.engine).toBe(2); // lap-3 engine 3
    }
  });

  it('gears below 5 do not roll', () => {
    for (const gear of [1, 2, 3, 4]) expect(kinds(turn(gear, { engineRoll: { dry: 20, rain: 20, minGear: 5 } }).events, 'ENGINE_ROLL')).toEqual([]);
  });

  it('a miss costs nothing', () => {
    const r = turn(5, { engineRoll: { dry: 0, rain: 0, minGear: 5 } });
    expect(kinds(r.events, 'ENGINE_ROLL')).toMatchObject([{ hit: false }]);
    expect(r.state.cars[0].wear.engine).toBe(3);
  });

  it('is 1-4 in the dry (20 %) and 1-3 in the rain (15 %)', () => {
    const rate = (weather: 'sun' | 'rain', mods: Parameters<typeof game>[4] = {}) => {
      const n = 5000;
      let hits = 0;
      for (let seed = 1; seed <= n; seed++) {
        const s = patchCar(ready(game(t, { ...fixedDice([2, 3, 6, 9, 15, 25]), weather, laps: 3 }, 1, seed, mods)), 'car1', { gear: 5 });
        hits += kinds(run(s, shift(5), adjust(0), moveTo('c15')).events, 'ENGINE_ROLL').filter((e) => e.hit).length;
      }
      return hits / n;
    };
    expect(Math.abs(rate('sun') - 0.2)).toBeLessThan(sigma(0.2, 5000));
    expect(Math.abs(rate('rain') - 0.15)).toBeLessThan(sigma(0.15, 5000));
    // a part that lowers the threshold by one: 1-3 in the dry
    expect(Math.abs(rate('sun', { mods: { car1: { rollWearDiscount: { engine: 1 } } } }) - 0.15)).toBeLessThan(sigma(0.15, 5000));
  });

  it('there is no roll in the pit lane', () => {
    const pt = pitTrack(20, 4, 12, [6]);
    const one = patchCar(ready(game(pt, { dice: [[1], [1], [1], [1], [1], [1]], engineRoll: { dry: 20, rain: 20, minGear: 5 }, laps: 3 }, 1)), 'car1', { gear: 5, position: 'c3' });
    const moved = run(one, shift(5), adjust(0), moveTo('p4'));
    expect(moved.state.cars[0].position).toBe('p4');
    expect(kinds(moved.events, 'ENGINE_ROLL')).toEqual([]);
  });

  it('engine at 0 survives a miss, and one more hit takes the car out', () => {
    const s = patchCar(ready(game(t, { ...fixedDice([2, 3, 6, 9, 15, 25]), engineRoll: { dry: 20, rain: 20, minGear: 5 }, laps: 3 }, 1)), 'car1', { gear: 5, wear: { engine: 0 } });
    expect(run(s, shift(5), adjust(0), moveTo('c15')).state.cars[0].retired).toBe('engine');
  });
});

describe('§8 risk cells', () => {
  const t = linearTrack(40, { risk: { 5: 2 } });
  const play5 = (config = {}, ending = 'c8') => run(
    patchCar(ready(game(t, { ...fixedDice([2, 3, 8, 9, 15, 25]), laps: 3, ...config }, 1)), 'car1', { gear: 3 }),
    shift(3),
    adjust(0),
    moveTo(ending),
  );

  it('entering a cell with risk 2 means two d20 rolls; each hit costs 1 handling', () => {
    const r = play5({ risk: { dry: 20, rain: 20 } });
    expect(kinds(r.events, 'RISK_ROLL')).toHaveLength(2);
    expect(r.state.cars[0].wear.handling).toBe(0); // lap-3 handling 2
    expect(r.state.cars[0].retired).toBeNull();
  });

  it('the rolls happen when the cell is passed, not only when the car stops on it', () => {
    expect(kinds(play5({ risk: { dry: 0, rain: 0 } }).events, 'RISK_ROLL')).toHaveLength(2);
  });

  it('a car that never reaches the cell does not roll', () => {
    const s = patchCar(ready(game(t, { dice: [[3], [3], [3], [3], [3], [3]], laps: 3 }, 1)), 'car1', { gear: 3 });
    expect(kinds(run(s, shift(3), adjust(0), moveTo('c3')).events, 'RISK_ROLL')).toEqual([]);
  });

  it('thresholds: up to 4 in the dry, up to 5 in the rain', () => {
    const cfg = { risk: { dry: 0, rain: 20 } };
    expect(kinds(play5({ ...cfg, weather: 'sun' }).events, 'RISK_ROLL').every((e) => !e.hit)).toBe(true);
    expect(kinds(play5({ ...cfg, weather: 'rain' }).events, 'RISK_ROLL').every((e) => e.hit)).toBe(true);
    const rate = (weather: 'sun' | 'rain') => {
      const n = 3000;
      let hits = 0;
      for (let seed = 1; seed <= n; seed++) {
        const s = patchCar(ready(game(t, { ...fixedDice([2, 3, 8, 9, 15, 25]), weather, laps: 3 }, 1, seed)), 'car1', { gear: 3 });
        hits += kinds(run(s, shift(3), adjust(0), moveTo('c8')).events, 'RISK_ROLL').filter((e) => e.hit).length;
      }
      return hits / (2 * n);
    };
    expect(Math.abs(rate('sun') - 0.2)).toBeLessThan(sigma(0.2, 6000));
    expect(Math.abs(rate('rain') - 0.25)).toBeLessThan(sigma(0.25, 6000));
  });
});

describe('createGame', () => {
  it('rejects more cars than grid slots and empty races', () => {
    expect(() => createGame({ seed: 1, track: linearTrack(10), cars: 2 })).toThrow();
    expect(() => createGame({ seed: 1, track: linearTrack(10), cars: 0 })).toThrow();
  });

  it('puts cars on the grid, pole first, with the first car to play being the pole', () => {
    const s = createGame({ seed: 1, track: linearTrack(20, { grid: [3, 2, 1] }), cars: 3 });
    expect(s.cars.map((c) => c.position)).toEqual(['c3', 'c2', 'c1']);
    expect(currentCar(s)!.id).toBe('car1');
  });
});
