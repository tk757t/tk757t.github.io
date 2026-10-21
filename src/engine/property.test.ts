import { describe, expect, it } from 'vitest';
import { TRACKS, toTrack } from '../data/tracks';
import { MAX_ACTIONS, playRandomGame } from './randomGame';
import { canShiftTo } from './rules';
import { createGame, currentCar, reducer } from './reducer';

const oval = toTrack(TRACKS.oval);

describe('property: random games', () => {
  it('1000 seeded games all finish with valid states, no infinite loop', () => {
    let retirements = 0;
    let finishers = 0;
    let pitStops = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const { state, events, actions } = playRandomGame(seed);
      expect(state.status, `seed ${seed}`).toBe('finished');
      expect(actions, `seed ${seed}`).toBeLessThan(MAX_ACTIONS);
      expect(state.results).toHaveLength(state.cars.length);
      expect(state.results!.map((r) => r.rank)).toEqual(state.cars.map((_, i) => i + 1));
      retirements += state.cars.filter((c) => c.retired).length;
      finishers += state.cars.filter((c) => c.finishRank !== null).length;
      pitStops += events.filter((e) => e.type === 'PIT_STOP').length;
    }
    // sanity: the random player exercises every outcome
    expect(retirements).toBeGreaterThan(0);
    expect(finishers).toBeGreaterThan(0);
    expect(pitStops).toBeGreaterThan(0);
  }, 120_000);

  it('random games on every test circuit (4 cars, 1 lap) finish with valid states', () => {
    for (const [id, def] of Object.entries(TRACKS)) {
      for (let seed = 1; seed <= 8; seed++) {
        const { state, actions } = playRandomGame(seed, toTrack(def), 4, 1);
        expect(state.status, `${id} seed ${seed}`).toBe('finished');
        expect(actions, `${id} seed ${seed}`).toBeLessThan(MAX_ACTIONS);
      }
    }
  }, 120_000);

  it('the same seed gives an identical result (state and events)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const a = playRandomGame(seed);
      const b = playRandomGame(seed);
      expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
      expect(b.events).toEqual(a.events);
    }
  }, 60_000);

  it('different seeds give different races', () => {
    const results = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) results.add(JSON.stringify(playRandomGame(seed).state.results));
    expect(results.size).toBeGreaterThan(5);
  });

  it('every legal gear offered by the rules is accepted by the reducer, every other one is refused', () => {
    for (let seed = 1; seed <= 30; seed++) {
      let state = playRandomGame(seed).state;
      void state;
      state = createGame({ seed, track: oval, cars: 2, config: { weather: 'sun' } });
      const car = currentCar(state)!;
      const stable = { ...state, cars: state.cars.map((c) => ({ ...c, started: true, gear: 1 + (seed % 6), wear: { ...c.wear, gearbox: seed % 3, brakes: seed % 2, engine: seed % 4 } })) };
      const now = currentCar(stable)!;
      void car;
      for (let g = 0; g <= 7; g++) {
        const accepted = !reducer(stable, { type: 'SHIFT_GEAR', gear: g }).events.some((e) => e.type === 'INVALID_ACTION');
        expect(accepted, `seed ${seed} gear ${g}`).toBe(canShiftTo(now, g, 6));
      }
    }
  });
});
