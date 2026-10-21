import { describe, expect, it } from 'vitest';
import { checkInvariants } from './invariants';
import { createGame, currentCar, playingOrder } from './reducer';
import { adjust, asCurrent, game, inRace, linearTrack, moveTo, patchCar, ready, run, shift, twoLaneTrack } from './testing';
import type { GameEvent, RaceState } from './types';

const kinds = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const one = { dice: [[1], [1], [1], [1], [1], [1]] };
/** Plays one step with the current car: gear 1, 1 cell (the car must have a free cell ahead). */
function step(s: RaceState): RaceState {
  const car = currentCar(s)!;
  const at = Number(car.position!.slice(1));
  return run(s, shift(car.gear || 1), adjust(0), moveTo(`c${at + 1}`)).state;
}

describe('§11 order of play: the leader plays first', () => {
  it('starts with the car in the best position, then the next best, each once per round', () => {
    let s = inRace(linearTrack(50, { grid: [9, 6, 3, 0] }), one, 4);
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      order.push(currentCar(s)!.id);
      s = step(s);
    }
    expect(order).toEqual(['car1', 'car2', 'car3', 'car4']);
    expect(s.round).toBe(2);
  });

  it('the order is recomputed at each step, from the positions at that moment', () => {
    // car2 starts behind, but when it is the turn of the next car, whoever is furthest ahead plays
    let s = inRace(linearTrack(50, { grid: [9, 6, 3, 0] }), { dice: [[5], [5], [5], [5], [5], [5]] }, 4);
    s = run(s, shift(1), adjust(0), moveTo('c14')).state; // car1: 9 -> 14
    expect(currentCar(s)!.id).toBe('car2');
    // car2 jumps in front of car3 and car4; next must be car3 (c3) before car4 (c0)
    s = run(s, shift(1), adjust(0), moveTo('c11')).state;
    expect(currentCar(s)!.id).toBe('car3');
  });

  it('a car that overtakes the others during the round does not play twice', () => {
    let s = inRace(linearTrack(50, { grid: [3, 0] }), { dice: [[9], [9], [9], [9], [9], [9]] }, 2);
    s = run(s, shift(1), adjust(0), moveTo('c12')).state; // car1 rolls 9 cells: c3 -> c12
    expect(s.cars[0].position).toBe('c12');
    expect(currentCar(s)!.id).toBe('car2');
    s = run(s, shift(1), adjust(0), moveTo('c9')).state; // car2 jumps from c0 to c9: still behind
    expect(s.round).toBe(2);
    expect(currentCar(s)!.id).toBe('car1');
  });

  it('ties on position go to the highest gear, then to the car that arrived first', () => {
    const t = twoLaneTrack(10, { from: 0, to: 0 }, ['a0', 'b0']);
    const base = ready(game(t, one, 2));
    const gears = patchCar(patchCar(base, 'car1', { gear: 2 }), 'car2', { gear: 4 });
    expect(playingOrder(gears)).toEqual(['car2', 'car1']);
    const equal = patchCar(patchCar(base, 'car1', { gear: 3, arrival: 7 }), 'car2', { gear: 3, arrival: 5 });
    expect(playingOrder(equal)).toEqual(['car2', 'car1']);
    const equal2 = patchCar(patchCar(base, 'car1', { gear: 3, arrival: 4 }), 'car2', { gear: 3, arrival: 5 });
    expect(playingOrder(equal2)).toEqual(['car1', 'car2']);
  });

  it('the position counts laps: a car one lap ahead plays first even on an earlier cell', () => {
    const t = linearTrack(10, { loop: true, grid: [5, 1] });
    const s = patchCar(ready(game(t, { ...one, laps: 3 }, 2)), 'car2', { laps: 1 });
    expect(playingOrder(s)).toEqual(['car2', 'car1']);
  });

  it('the arrival counter makes a car that just arrived on a cell play after one that was already there', () => {
    let s = inRace(twoLaneTrack(12, { from: 0, to: 0 }, ['a0', 'b0']), one, 2);
    expect(currentCar(s)!.id).toBe('car1'); // equal position and gear: grid order (arrival 0 < 1)
    s = run(s, shift(1), adjust(0), moveTo('a1')).state;
    expect(currentCar(s)!.id).toBe('car2');
    s = run(s, shift(1), adjust(0), moveTo('b1')).state;
    // both on row 1, gear 1: car1 arrived first
    expect(s.cars.map((c) => c.arrival)).toEqual([3, 4]); // the counter starts after the grid arrivals (2 cars)
    expect(currentCar(s)!.id).toBe('car1');
  });
});

describe('§11 rounds', () => {
  it('a round ends when every active car has played; the next one announces the order', () => {
    let s = inRace(linearTrack(50, { grid: [9, 6] }), one, 2);
    s = step(s);
    const r = run(s, shift(1), adjust(0), moveTo('c7'));
    expect(kinds(r.events, 'ROUND_STARTED')).toEqual([{ type: 'ROUND_STARTED', round: 2, order: ['car1', 'car2'] }]);
    expect(r.state.round).toBe(2);
    expect(r.state.played).toEqual([]);
    expect(kinds(r.events, 'TURN_STARTED').at(-1)).toEqual({ type: 'TURN_STARTED', carId: 'car1', round: 2 });
  });

  it('retired cars are skipped and nobody plays for them', () => {
    let s = inRace(linearTrack(50, { grid: [9, 6, 3] }), one, 3);
    s = patchCar(s, 'car2', { position: null, retired: 'engine', retiredRound: 1, retiredProgress: 6 });
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(currentCar(s)!.id);
      s = step(s);
    }
    expect(seen).toEqual(['car1', 'car3', 'car1', 'car3']);
  });

  it('maxRounds ends the race; running cars are ranked by distance', () => {
    let s = inRace(linearTrack(50, { grid: [9, 3] }), { ...one, maxRounds: 2 }, 2);
    while (s.status === 'racing') s = step(s);
    expect(s.round).toBe(3);
    expect(s.results!.map((r) => [r.carId, r.rank, r.finished])).toEqual([['car1', 1, false], ['car2', 2, false]]);
    expect(checkInvariants(s)).toEqual([]);
  });
});

describe('§11 finishing and ranking', () => {
  const loop = () => linearTrack(8, { loop: true, grid: [6, 4, 2] });
  /** The grid of `loop` is behind the line (lap -1); these cars are already on lap 0, as in the middle of a race. */
  const lap0 = (s: RaceState) => asCurrent(['car1', 'car2', 'car3'].reduce((acc, id) => patchCar(acc, id, { laps: 0 }), s), 'car1');
  const finishing = (s: RaceState) => run(s, shift(3), adjust(0), moveTo(`c${(Number(currentCar(s)!.position!.slice(1)) + 3) % 8}`));

  it('a car that completes its laps finishes, leaves the track and gets the next rank', () => {
    let s = lap0(ready(game(loop(), { dice: [[3], [3], [3], [3], [3], [3]], laps: 1 }, 3)));
    s = patchCar(s, 'car1', { gear: 3 });
    const r = finishing(s);
    expect(r.state.cars[0]).toMatchObject({ finishRank: 1, position: null, laps: 1 });
    expect(kinds(r.events, 'CAR_FINISHED')).toEqual([{ type: 'CAR_FINISHED', carId: 'car1', rank: 1 }]);
    expect(kinds(r.events, 'LAP_COMPLETED')).toHaveLength(1);
    expect(r.state.status).toBe('racing');
    expect(checkInvariants(r.state)).toEqual([]);
  });

  it('a grid behind the line starts on lap -1: the first crossing starts lap 1, it takes a whole lap to finish', () => {
    let s = ready(game(loop(), { dice: [[3], [3], [3], [3], [3], [3]], laps: 1 }, 3));
    expect(s.cars.map((c) => c.laps)).toEqual([-1, 0, 0]); // rows 6, 4 and 2 of 8: only the first is behind the line
    s = patchCar(asCurrent(s, 'car1'), 'car1', { gear: 3 });
    const first = finishing(s); // c6 -> c1: crosses the line
    expect(first.state.cars[0]).toMatchObject({ laps: 0, position: 'c1' });
    expect(first.state.cars[0].finishRank).toBeNull();
    expect(kinds(first.events, 'LAP_COMPLETED')).toHaveLength(0);
    // a grid in front of the line (rows 1 and 2 of 8) starts on lap 0
    const ahead = ready(game(linearTrack(8, { loop: true, grid: [2, 1] }), { dice: [[3], [3], [3], [3], [3], [3]], laps: 1 }, 2));
    expect(ahead.cars.map((c) => c.laps)).toEqual([0, 0]);
  });

  it('finished cars no longer block the track and no longer play', () => {
    let s = lap0(ready(game(loop(), { dice: [[3], [3], [3], [3], [3], [3]], laps: 1 }, 3)));
    s = patchCar(patchCar(patchCar(s, 'car1', { gear: 3 }), 'car2', { gear: 3 }), 'car3', { gear: 3 });
    s = finishing(s).state; // car1 finishes from c6
    expect(s.cars[0].position).toBeNull();
    expect(currentCar(s)!.id).toBe('car2');
    s = finishing(s).state; // car2 from c4 reaches c7: no finish yet, it just moves
    expect(currentCar(s)!.id).toBe('car3');
  });

  it('the race ends when every car has finished or retired; finishers first, in the order they finished', () => {
    let s = lap0(ready(game(loop(), { dice: [[3], [3], [3], [3], [3], [3]], laps: 1 }, 3)));
    s = patchCar(patchCar(patchCar(s, 'car1', { gear: 3 }), 'car2', { gear: 3 }), 'car3', { gear: 3 });
    for (let i = 0; i < 40 && s.status === 'racing'; i++) s = finishing(s).state;
    expect(s.status).toBe('finished');
    expect(s.results!.map((r) => r.carId)).toEqual(['car1', 'car2', 'car3']);
    expect(s.results!.every((r) => r.finished)).toBe(true);
    expect(s.phase).toBe('finished');
    expect(s.turn).toBeNull();
    expect(checkInvariants(s)).toEqual([]);
  });

  it('retired cars rank after the finishers; the last to retire finishes best', () => {
    let s = ready(game(linearTrack(80, { grid: [3, 2, 1, 0] }), { ...one, laps: 1, maxRounds: 3 }, 4));
    s = patchCar(s, 'car2', { position: null, retired: 'tires', retiredRound: 2, retiredProgress: 5 });
    s = patchCar(s, 'car3', { position: null, retired: 'body', retiredRound: 1, retiredProgress: 9 });
    s = patchCar(s, 'car4', { position: null, retired: 'engine', retiredRound: 2, retiredProgress: 7 });
    while (s.status === 'racing') s = step(s);
    // car1 is still running; among the retired: round 2 before round 1, then the further one first
    expect(s.results!.map((r) => r.carId)).toEqual(['car1', 'car4', 'car2', 'car3']);
    expect(s.results![1]).toMatchObject({ retired: 'engine', finished: false });
  });

  it('createGame makes cars play in a consistent order from the first turn', () => {
    const s = createGame({ seed: 5, track: linearTrack(30, { grid: [4, 3, 2, 1] }), cars: 4 });
    expect(playingOrder(s)).toEqual(['car1', 'car2', 'car3', 'car4']);
    expect(asCurrent(s, 'car3').turn!.carId).toBe('car3');
  });
});
