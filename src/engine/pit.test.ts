import { describe, expect, it } from 'vitest';
import { checkInvariants } from './invariants';
import { currentCar, reducerWithFace } from './reducer';
import { adjust, destinations, game, moveTo, patchCar, pitTrack, ready, run, shift, skipPit } from './testing';
import type { GameEvent, RaceState, TireType, WearCategory } from './types';

// main line c0..c19 (start line c0), pit lane p4..p12; team 0's box is p6, team 1's is p9
const track = () => pitTrack(20, 4, 12, [6, 9]);
const oneStep = { dice: [[1], [1], [1], [1], [1], [1]] };
const kinds = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

/** Team 0's car on `at`, about to roll `cells` cells (gear g always rolls g). */
function arrive(at: string, cells: number, over: Parameters<typeof patchCar>[2] = {}, config = {}): RaceState {
  const s = patchCar(ready(game(track(), { ...oneStep, laps: 3, ...config }, 1)), 'car1', { gear: cells, position: at, ...over });
  const dice = [1, 2, 3, 4, 5, 6].map((g) => [g]);
  return { ...s, config: { ...s.config, dice } };
}
/** The car stops on its box (p6) and is asked what to do. */
const atBox = (over: Parameters<typeof patchCar>[2] = {}, config = {}) => run(arrive('p4', 2, over, config), shift(2), adjust(0), moveTo('p6')).state;

describe('§10 stopping at the box', () => {
  it('ending a move on the own box asks for a pit decision', () => {
    const s = atBox();
    expect(s.phase).toBe('pit');
    expect(currentCar(s)!.position).toBe('p6');
    expect(checkInvariants(s)).toEqual([]);
  });

  it('other pit lane cells and the main line do not', () => {
    expect(run(arrive('p4', 1), shift(1), adjust(0), moveTo('p5')).state.phase).toBe('gear');
    expect(run(arrive('c2', 2), shift(2), adjust(0), moveTo('c4')).state.phase).toBe('gear');
  });

  it('declining leaves everything as it was and passes the turn', () => {
    const before = atBox();
    const r = run(before, skipPit);
    expect(r.state.phase).toBe('gear');
    expect(r.state.cars[0].wear).toEqual(before.cars[0].wear);
    expect(r.state.cars[0].pitLap).toBe(-2); // -2: no stop yet, even before the first crossing of the line
  });

  it('can be reached from the track through the entry', () => {
    const s = arrive('c2', 4);
    const opts = destinations(run(s, shift(4)).state);
    expect(opts).toContain('p6'); // c3 -> p4 -> p5 -> p6
  });

  it('only once per lap: coming back on the box in the same lap does not offer a second stop', () => {
    let s = atBox();
    s = run(s, { type: 'PIT_STOP', tires: 'hard', repairs: { brakes: 1 } }).state; // hard: soft tires would change the die
    expect(s.cars[0].pitLap).toBe(0);
    const again = run(patchCar(s, 'car1', { position: 'p4', gear: 2 }), shift(2), adjust(0), moveTo('p6')).state;
    expect(again.phase).toBe('gear');
    // next lap: the stop is offered again
    const lap2 = run(patchCar(s, 'car1', { position: 'p4', gear: 2, laps: 1 }), shift(2), adjust(0), moveTo('p6')).state;
    expect(lap2.phase).toBe('pit');
  });
});

describe('§10 long stop: repairs and new tires', () => {
  const worn = { wear: { tires: 1, brakes: 0, gearbox: 1, body: 0, engine: 1, handling: 0 } };

  it('2 repair points for the whole race, spent freely on brakes, gearbox, body, engine, handling', () => {
    const s = atBox(worn);
    expect(s.cars[0].repairLeft).toBe(2);
    const r = run(s, { type: 'PIT_STOP', tires: 'hard', repairs: { engine: 1, brakes: 1 } });
    const car = r.state.cars[0];
    expect(car.wear.engine).toBe(2);
    expect(car.wear.brakes).toBe(1);
    expect(car.wear.gearbox).toBe(1);
    expect(car.repairLeft).toBe(0);
    expect(kinds(r.events, 'WEAR_GAINED').map((e) => [e.category, e.amount, e.cause]).sort()).toEqual([
      ['brakes', 1, 'repair'],
      ['engine', 1, 'repair'],
      ['tires', 5, 'new tires'],
    ]);
  });

  it('the tires are renewed to the starting value and the type is the one chosen', () => {
    const s = atBox({ ...worn, tires: 'hard', stint: 2 });
    for (const type of ['hard', 'rain', 'soft'] as TireType[]) {
      const car = run(s, { type: 'PIT_STOP', tires: type, repairs: { engine: 1 } }).state.cars[0];
      expect(car.wear.tires).toBe(car.maxWear.tires);
      expect(car.wear.tires).toBe(6); // lap-3 start points
      expect(car.tires).toBe(type);
      expect(car.stint).toBe(0);
    }
  });

  it('is a lost turn: gear 3, no cells, and the next car plays', () => {
    const r = run(atBox(worn), { type: 'PIT_STOP', tires: 'hard', repairs: { body: 1 } });
    expect(r.state.cars[0].gear).toBe(3);
    expect(r.state.cars[0].position).toBe('p6');
    expect(r.state.phase).toBe('gear');
    expect(r.state.cars[0].pitLap).toBe(0);
    expect(kinds(r.events, 'PIT_STOP')).toMatchObject([{ fast: false, repairs: 1, tires: 'hard', d20: null }]);
  });

  it('cannot spend more than the points left, in one stop or over the whole race', () => {
    const s = atBox(worn);
    expect(run(s, { type: 'PIT_STOP', tires: 'hard', repairs: { engine: 1, brakes: 1, body: 1 } }).events[0]).toMatchObject({ reason: 'NOT_ENOUGH_REPAIR_POINTS' });
    const first = run(s, { type: 'PIT_STOP', tires: 'hard', repairs: { engine: 1 } }).state;
    expect(first.cars[0].repairLeft).toBe(1);
    const second = run(patchCar(first, 'car1', { position: 'p4', gear: 2, laps: 1 }), shift(2), adjust(0), moveTo('p6')).state;
    expect(second.phase).toBe('pit');
    expect(run(second, { type: 'PIT_STOP', tires: 'hard', repairs: { engine: 1, brakes: 1 } }).events[0]).toMatchObject({ reason: 'NOT_ENOUGH_REPAIR_POINTS' });
    expect(run(second, { type: 'PIT_STOP', tires: 'hard', repairs: { engine: 1 } }).state.cars[0].repairLeft).toBe(0);
  });

  it('a repair stops at the starting value and the unused points stay available', () => {
    const s = atBox({ wear: { engine: 2 } }); // engine already at its maximum (lap 3: 3)
    const car = run(s, { type: 'PIT_STOP', tires: 'hard', repairs: { engine: 2 } }).state.cars[0];
    expect(car.wear.engine).toBe(3);
    expect(car.repairLeft).toBe(1); // only one point was needed
  });

  it('tires cannot be repaired with points, and bad requests are refused without effect', () => {
    const s = atBox(worn);
    expect(run(s, { type: 'PIT_STOP', tires: 'hard', repairs: { tires: 1 } as Partial<Record<WearCategory, number>> }).events[0]).toMatchObject({ reason: 'BAD_REPAIR' });
    expect(run(s, { type: 'PIT_STOP', tires: 'hard', repairs: { engine: -1 } }).events[0]).toMatchObject({ reason: 'BAD_REPAIR' });
    expect(run(s, { type: 'PIT_STOP', tires: 'hard', repairs: { engine: 0.5 } }).events[0]).toMatchObject({ reason: 'BAD_REPAIR' });
    expect(run(s, { type: 'PIT_STOP', tires: 'slick' as TireType }).events[0]).toMatchObject({ reason: 'BAD_TIRES' });
    expect(run(s, { type: 'PIT_STOP', tires: 'hard', repairs: { engine: 1 } }).state).not.toBe(s);
  });

  it('PIT_STOP and SKIP_PIT only exist at the box', () => {
    const s = arrive('c2', 2);
    expect(run(s, { type: 'PIT_STOP', tires: 'hard' }).events[0]).toMatchObject({ reason: 'WRONG_PHASE' });
    expect(run(s, skipPit).events[0]).toMatchObject({ reason: 'WRONG_PHASE' });
  });

  it('a stopped car (neutral) leaves the stop in gear 3', () => {
    const r = run(patchCar(atBox(worn), 'car1', { gear: 0 }), { type: 'PIT_STOP', tires: 'hard', repairs: { engine: 1 } });
    expect(r.state.cars[0].gear).toBe(3);
  });
});

describe('§10 fast stop (no repair)', () => {
  const stop = (d20: number, over: Parameters<typeof patchCar>[2] = {}) => reducerWithFace(atBox(over), { type: 'PIT_STOP', tires: 'soft' }, d20);

  it('a d20 below 11 restarts at once in gear 4 with ceil(d20 / 2) cells, at least 2', () => {
    const cells = (d20: number) => stop(d20).state.turn!.roll;
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(cells)).toEqual([2, 2, 2, 2, 3, 3, 4, 4, 5, 5]);
    const r = stop(7);
    expect(r.state.cars[0].gear).toBe(4);
    expect(r.state.phase).toBe('adjust');
    expect(r.state.turn).toMatchObject({ fixed: true, roll: 4 });
    expect(kinds(r.events, 'PIT_STOP')).toMatchObject([{ fast: true, d20: 7, restartCells: 4 }]);
  });

  it('the restart is a normal move from the box, with no adjustment possible', () => {
    const r = stop(7);
    expect(destinations(r.state)).toEqual(['p10']);
    expect(run(r.state, adjust(1)).events[0]).toMatchObject({ reason: 'WRONG_PHASE' });
    const done = run(r.state, moveTo('p10')).state;
    expect(done.cars[0].position).toBe('p10');
    expect(done.phase).toBe('gear');
    expect(checkInvariants(done)).toEqual([]);
  });

  it('a d20 of 11 or more turns it into a long stop: turn lost, gear 3', () => {
    for (const d20 of [11, 15, 20]) {
      const r = stop(d20);
      expect(r.state.cars[0].gear).toBe(3);
      expect(r.state.cars[0].position).toBe('p6');
      expect(r.state.phase).toBe('gear');
      expect(kinds(r.events, 'PIT_STOP')).toMatchObject([{ fast: false, d20, restartCells: null }]);
    }
  });

  it('either way the tires are new and the stop counts for the lap', () => {
    for (const d20 of [4, 18]) {
      const car = stop(d20, { wear: { tires: 1 } }).state.cars[0];
      expect(car.wear.tires).toBe(6);
      expect(car.tires).toBe('soft');
      expect(car.pitLap).toBe(0);
      expect(car.repairLeft).toBe(2);
    }
  });

  it('draws its d20 from the seeded generator: about 50 % of fast stops restart at once', () => {
    let restart = 0;
    const n = 2000;
    for (let seed = 1; seed <= n; seed++) {
      const s = { ...atBox(), rng: seed };
      if (run(s, { type: 'PIT_STOP', tires: 'hard' }).state.phase === 'adjust') restart++;
    }
    expect(Math.abs(restart / n - 0.5)).toBeLessThan(4 * Math.sqrt(0.25 / n));
  });
});
