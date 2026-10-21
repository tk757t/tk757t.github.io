// Test helper: a random-but-legal player (property tests, and the dev-only circuit tests).
import { expect } from 'vitest';
import { TRACKS, toTrack } from '../data/tracks';
import { checkInvariants } from './invariants';
import { allowedGears } from './rules';
import { createGame, currentCar, enumerateMoves, reducer, slipstreamAvailable } from './reducer';
import { nextFloat } from './rng';
import { TIRE_TYPES, WEAR_CATEGORIES, type Action, type GameEvent, type RaceState, type Track } from './types';

export const MAX_ACTIONS = 4000;
const oval = toTrack(TRACKS.oval);

/** Plays a whole race with a random-but-legal player driven by its own seeded generator. */
export function playRandomGame(seed: number, track: Track = oval, cars = 1 + (seed % 4), laps = 1 + (seed % 3)): { state: RaceState; events: GameEvent[]; actions: number } {
  let state = createGame({
    seed,
    track,
    cars,
    config: { laps, maxRounds: 80, weather: seed % 5 === 0 ? 'rain' : 'random' },
    tires: { car1: TIRE_TYPES[seed % 3] },
  });
  let pr = (seed * 7919 + 13) >>> 0;
  const rand = (): number => {
    const [v, n] = nextFloat(pr);
    pr = n;
    return v;
  };
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
  const events: GameEvent[] = [];
  let actions = 0;
  while (state.status === 'racing' && actions < MAX_ACTIONS) {
    const car = currentCar(state)!;
    let action: Action;
    if (state.phase === 'gear') {
      const gears = car.started ? allowedGears(car, state.config) : [1];
      // mostly keep or raise the gear, sometimes slow down
      action = { type: 'SHIFT_GEAR', gear: rand() < 0.7 ? pick(gears.filter((g) => g >= car.gear).length ? gears.filter((g) => g >= car.gear) : gears) : pick(gears) };
    } else if (state.phase === 'adjust') {
      const turn = state.turn!;
      if (!turn.fixed && rand() < 0.3) {
        // try a random adjustment; keep it only if it still leaves a playable destination
        const brakes = Math.floor(rand() * (Math.min(turn.roll as number, car.wear.brakes) + 1));
        const tryAction: Action = { type: 'ADJUST', brakes, boost: car.wear.gearbox > 0 && rand() < 0.3, slipstream: slipstreamAvailable(state, car) && rand() < 0.5 };
        const r = reducer(state, tryAction);
        expect(r.events.some((e) => e.type === 'INVALID_ACTION'), JSON.stringify(tryAction)).toBe(false);
        if (enumerateMoves(r.state).some((o) => o.playable)) {
          state = r.state;
          events.push(...r.events);
          actions++;
        }
      }
      if (!enumerateMoves(state).some((o) => o.playable)) {
        // the roll only works with some adjustment (the engine guarantees one exists): find it
        let fixed = false;
        for (let b = 0; b <= Math.min(turn.roll as number, car.wear.brakes) && !fixed; b++) {
          for (const boost of car.wear.gearbox > 0 ? [false, true] : [false]) {
            const r = reducer(state, { type: 'ADJUST', brakes: b, boost });
            if (!r.events.some((e) => e.type === 'INVALID_ACTION') && enumerateMoves(r.state).some((o) => o.playable)) {
              state = r.state;
              events.push(...r.events);
              actions++;
              fixed = true;
              break;
            }
          }
        }
      }
      const options = enumerateMoves(state).filter((o) => o.playable);
      expect(options.length, `seed ${seed}: some move must exist`).toBeGreaterThan(0);
      // prefer the cheapest moves most of the time
      const cheap = options.filter((o) => o.cost === Math.min(...options.map((x) => x.cost)));
      action = { type: 'MOVE_TO', cellId: pick(rand() < 0.8 ? cheap : options).cellId };
    } else {
      // pit decision
      if (rand() < 0.6) action = { type: 'SKIP_PIT' };
      else {
        const cat = pick(WEAR_CATEGORIES.filter((c) => c !== 'tires'));
        action = { type: 'PIT_STOP', tires: pick([...TIRE_TYPES]), repairs: rand() < 0.5 ? { [cat]: 1 } : {} };
      }
    }
    const r = reducer(state, action);
    expect(r.events.some((e) => e.type === 'INVALID_ACTION'), `seed ${seed}: ${JSON.stringify(action)}`).toBe(false);
    const problems = checkInvariants(r.state);
    if (problems.length) throw new Error(`seed ${seed}, action ${actions} ${JSON.stringify(action)}: ${problems.join('; ')}`);
    state = r.state;
    events.push(...r.events);
    actions++;
  }
  return { state, events, actions };
}
