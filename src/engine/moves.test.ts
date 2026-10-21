import { describe, expect, it } from 'vitest';
import { TRACKS, toTrack } from '../data/tracks';
import { createWalker } from './moves';
import { createGame } from './reducer';
import { game, inRace, linearTrack, patchCar, pitTrack, twoLaneTrack } from './testing';
import type { RaceState, Track } from './types';

/** Options for `carId` moving `m` cells from where it stands (the other cars stay where they are). */
function moves(state: RaceState, m: number, carId = 'car1', brakesSpent = 0) {
  const car = state.cars.find((c) => c.id === carId)!;
  return createWalker(state, car).moves(m, brakesSpent);
}
const ids = (opts: { cellId: string }[]) => opts.map((o) => o.cellId).sort();
const place = (s: RaceState, id: string, cell: string) => patchCar(s, id, { position: cell });

describe('§5 enumerating the paths', () => {
  it('a single line has a single destination for each roll', () => {
    const s = inRace(linearTrack(50), {}, 1);
    for (const m of [0, 1, 7, 30]) expect(ids(moves(s, m))).toEqual([`c${m}`]);
  });

  it('every destination of a fork is offered, once, however many paths lead there', () => {
    const s = inRace(twoLaneTrack(12, { from: 0, to: 4 }), {}, 1);
    // a lane change is possible from rows 0 to 3: many paths, but only two cells at the end
    expect(ids(moves(s, 3))).toEqual(['a3', 'b3']);
    expect(ids(moves(s, 1))).toEqual(['a1', 'b1']);
    const m4 = moves(s, 4);
    expect(ids(m4)).toEqual(['a4', 'b4']);
    expect(new Set(m4.map((o) => o.cellId)).size).toBe(m4.length);
    // after row 4 there is no more way to change lane
    expect(ids(moves(s, 7))).toEqual(['a7', 'b7']);
    expect(ids(moves(place(s, 'car1', 'a5'), 3))).toEqual(['a8']);
  });

  it('destinations are listed furthest first, then by id', () => {
    const s = inRace(twoLaneTrack(12, { from: 0, to: 4 }), {}, 1);
    const blocked = place(inRace(twoLaneTrack(12, { from: 0, to: 4 }), {}, 2), 'car2', 'a2');
    expect(moves(s, 3).map((o) => o.cellId)).toEqual(['a3', 'b3']);
    const o = moves(blocked, 3);
    expect(o.map((x) => x.cellId)).toEqual(['b3', 'a1', 'b1']); // a1 and b1 are blocked ends (the car on a2 cuts those paths)
  });

  it('a roll of 0 offers the current cell at no cost', () => {
    const o = moves(inRace(linearTrack(10), {}, 1), 0);
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ cellId: 'c0', missing: 0, cost: 0, playable: true });
  });

  it('a car that is out of the race has no moves', () => {
    const s = patchCar(inRace(linearTrack(10), {}, 1), 'car1', { position: null });
    expect(moves(s, 3)).toEqual([]);
  });

  it('crossing the finish line is counted along the path', () => {
    const t = linearTrack(6, { loop: true });
    const s = place(inRace(t, {}, 1), 'car1', 'c4');
    expect(moves(s, 3)[0]).toMatchObject({ cellId: 'c1', laps: 1 });
    expect(moves(s, 1)[0]).toMatchObject({ cellId: 'c5', laps: 0 });
  });

  it('is fast enough for a 30-cell roll on the real circuit', () => {
    const track = toTrack(TRACKS.oval);
    const s = patchCar(createGame({ seed: 1, track, cars: 4, config: { weather: 'sun' } }), 'car1', { started: true });
    const t0 = performance.now();
    const o = moves(s, 30);
    expect(performance.now() - t0).toBeLessThan(500);
    expect(o.length).toBeGreaterThanOrEqual(3);
  });
});

describe('§5 occupied cells cannot be crossed', () => {
  const line = (n = 20, blockerAt = 3) => place(inRace(linearTrack(n, { grid: [0, 1] }), {}, 2), 'car2', `c${blockerAt}`);

  it('the car stops before the occupied cell and loses bodywork', () => {
    const o = moves(line(), 3); // c0 -> c1, c2, then c3 is taken: 1 step missing
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ cellId: 'c2', missing: 1, blocked: 'car', bodyLoss: 1, brakesLoss: 0, tiresLoss: 0, cost: 6, playable: true, crash: false });
  });

  it('the bodywork lost does not grow with the number of missing steps, and no brakes or tires are lost', () => {
    for (const m of [4, 5, 6, 9]) expect(moves(line(), m)[0]).toMatchObject({ cellId: 'c2', missing: m - 2, blocked: 'car', bodyLoss: 1, brakesLoss: 0, tiresLoss: 0, cost: 6 });
  });

  it('a roll that does not reach the other car is not affected', () => {
    expect(moves(line(), 2)[0]).toMatchObject({ cellId: 'c2', missing: 0, blocked: null, bodyLoss: 0, cost: 0 });
  });

  it('a car directly ahead blocks everything: the car stays where it is', () => {
    const o = moves(line(20, 1), 5)[0];
    expect(o).toMatchObject({ cellId: 'c0', missing: 5, bodyLoss: 1, brakesLoss: 0, tiresLoss: 0 });
  });

  it('a dead end (none on our circuits) costs brakes, then tires', () => {
    const s = inRace(linearTrack(5), {}, 1);
    expect(moves(s, 5)[0]).toMatchObject({ cellId: 'c4', missing: 1, blocked: 'end', brakesLoss: 1, tiresLoss: 0, bodyLoss: 0 });
    expect(moves(s, 8)[0]).toMatchObject({ cellId: 'c4', missing: 4, blocked: 'end', brakesLoss: 3, tiresLoss: 1, bodyLoss: 0 });
  });

  it('parts can reduce the bodywork lost behind a car', () => {
    const s = place(inRace(linearTrack(20, { grid: [0, 1] }), {}, 2, { mods: { car1: { blockBrakeDiscount: 2 } } }), 'car2', 'c3');
    expect(moves(s, 5)[0]).toMatchObject({ missing: 3, bodyLoss: 0, cost: 0 });
    const weak = place(inRace(linearTrack(20, { grid: [0, 1] }), {}, 2, { mods: { car1: { blockBrakeDiscount: 0.25 } } }), 'car2', 'c3');
    expect(moves(weak, 5)[0]).toMatchObject({ missing: 3, bodyLoss: 1 });
  });

  it('a free lane keeps its cost-free destination next to the blocked one', () => {
    const s = place(inRace(twoLaneTrack(12, { from: 0, to: 6 }), {}, 2), 'car2', 'a2');
    const o = moves(s, 3);
    expect(o.find((x) => x.cellId === 'b3' || x.cellId === 'a3')).toMatchObject({ missing: 0, cost: 0 });
    expect(o.find((x) => x.cellId === 'a1')).toMatchObject({ missing: 2, blocked: 'car', bodyLoss: 1, brakesLoss: 0 });
  });

  it('retired cars and cars that finished no longer block', () => {
    const s = patchCar(line(), 'car2', { position: null, retired: 'engine' });
    expect(moves(s, 5)[0]).toMatchObject({ cellId: 'c5', missing: 0 });
  });
});

describe('§5 playable and greyed-out destinations', () => {
  const behindCar = (brakes: number, tires = 6, m = 5) => {
    const s = place(inRace(linearTrack(20, { grid: [0, 1] }), {}, 2), 'car2', 'c3');
    return moves(patchCar(s, 'car1', { wear: { brakes, tires } }), m)[0];
  };
  const deadEnd = (brakes: number, tires = 6, m = 8) => moves(patchCar(inRace(linearTrack(5), {}, 1), 'car1', { wear: { brakes, tires } }), m)[0];

  it('behind a car no brakes and no tires are needed: it stays playable with nothing left', () => {
    expect(behindCar(0, 0, 6)).toMatchObject({ playable: true, bodyLoss: 1, brakesLoss: 0, tiresLoss: 0 });
    expect(behindCar(0, 0, 6).reason).toBeUndefined();
  });

  it('at a dead end, brakes are enough when they cover the loss', () => {
    expect(deadEnd(3)).toMatchObject({ brakesLoss: 3, playable: true });
    expect(deadEnd(3).reason).toBeUndefined();
  });

  it('at a dead end, not enough brakes: greyed out, reason brakes', () => {
    expect(deadEnd(2)).toMatchObject({ playable: false, reason: 'brakes' });
    expect(deadEnd(0, 6, 5)).toMatchObject({ playable: false, reason: 'brakes' });
  });

  it('points already spent on the roll count against the brakes at a dead end', () => {
    const s = inRace(linearTrack(5), {}, 1);
    expect(moves(s, 5, 'car1', 0)[0].playable).toBe(true);
    expect(moves(s, 8, 'car1', 1)[0]).toMatchObject({ playable: false, reason: 'brakes' });
  });

  it('at a dead end, not enough tires for the excess: greyed out, reason tires; exactly enough is fine', () => {
    expect(deadEnd(3, 0)).toMatchObject({ tiresLoss: 1, playable: false, reason: 'tires' });
    expect(deadEnd(3, 1)).toMatchObject({ tiresLoss: 1, playable: true });
  });
});

describe('§5 lane changes', () => {
  it('are not possible across a neighbour (the cell beside the car is taken)', () => {
    // car2 on b1: from a0 the diagonal to b1 is occupied, and from a1 the change to b2 passes beside it
    const s = place(inRace(twoLaneTrack(10, { from: 0, to: 6 }), {}, 2), 'car2', 'b1');
    expect(ids(moves(s, 2))).toEqual(['a0', 'a2']);
    expect(moves(s, 2).find((o) => o.cellId === 'a0')).toMatchObject({ missing: 2 });
    // without the neighbour both lanes are open
    const free = inRace(twoLaneTrack(10, { from: 0, to: 6 }), {}, 1);
    expect(ids(moves(free, 2))).toEqual(['a2', 'b2']);
  });

  it('are only possible between two plain track cells, never in a corner', () => {
    const t = twoLaneTrack(10, { from: 0, to: 6 });
    t.cells.a2.type = 1;
    t.cells.a2.corner = { id: 'K', stops: 1 };
    t.cells.b2.type = 1;
    t.cells.b2.corner = { id: 'K', stops: 1 };
    const s = inRace(t, {}, 1);
    // from a1 the way to b2 would be a lane change into the corner: forbidden, the car follows its lane
    expect(ids(moves(place(s, 'car1', 'a1'), 1))).toEqual(['a2']);
    // from a0 a change to b1 is still possible (plain track)
    expect(ids(moves(s, 1))).toEqual(['a1', 'b1']);
    // and inside the corner, no change either
    expect(ids(moves(place(s, 'car1', 'a2'), 1))).toEqual(['a3']);
  });
});

describe('§5 the pit lane', () => {
  // main line c0..c11, pit lane p4..p8 entered after c3 and left towards c9; team 0 box = p5, team 1 box = p7
  const t = (): Track => pitTrack(12, 4, 8, [5, 7]);
  const at = (cell: string) => place(inRace(t(), {}, 1), 'car1', cell);

  it('can be entered to stop in it', () => {
    expect(ids(moves(at('c2'), 2))).toEqual(['c4', 'p4']);
    expect(ids(moves(at('c2'), 4))).toEqual(['c6', 'p6']);
  });

  it('boxes are ordinary cells of the pit lane: a car can stop on any of them and drive through the others', () => {
    expect(ids(moves(at('c2'), 3))).toEqual(['c5', 'p5']); // team 0 owns p5
    expect(ids(moves(at('c2'), 5))).toEqual(['c7', 'p7']); // p7 is team 1's box
    expect(ids(moves(at('p5'), 3))).toEqual(['p8']);
  });

  it('cannot be used as a shortcut: entering and leaving in the same move is not possible', () => {
    const o = moves(at('c2'), 7);
    expect(o.find((x) => x.cellId === 'c9')).toMatchObject({ missing: 0, cost: 0 });
    // the pit path stops at the end of the lane with the remaining step missing
    expect(o.find((x) => x.cellId === 'p8')).toMatchObject({ missing: 1, brakesLoss: 1 });
    expect(o.filter((x) => x.cellId === 'c9')).toHaveLength(1);
  });

  it('a car already in the pit lane can leave it', () => {
    expect(ids(moves(at('p6'), 4))).toEqual(['c10']);
    expect(ids(moves(at('p6'), 2))).toEqual(['p8']);
  });
});

describe('modifiers of other cars', () => {
  it('only the car that moves counts: its own position is not an obstacle', () => {
    const s = inRace(linearTrack(10, { grid: [0, 1] }), {}, 2);
    expect(ids(moves(s, 1, 'car2'))).toEqual(['c2']);
  });

  it('works for a state built by createGame with several cars on the grid', () => {
    const s = game(linearTrack(30, { grid: [3, 2, 1, 0] }), {}, 4);
    // car4 on c0 is blocked by the three cars in front of it after 0 cells
    expect(moves(s, 2, 'car4')[0]).toMatchObject({ cellId: 'c0', missing: 2 });
  });
});
