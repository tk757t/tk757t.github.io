import { describe, expect, it } from 'vitest';
import { checkInvariants } from './invariants';
import { currentCar, enumerateMoves } from './reducer';
import { movementOf } from './rules';
import { DEFAULT_CONFIG } from './config';
import { adjust, asCurrent, destinations, fixedDice, inRace, linearTrack, moveTo, patchCar, run, shift } from './testing';

const track = linearTrack(300, { grid: [0, 1] });
// gear g always rolls these values: 2, 3, 6, 9, 15, 25
const dice = fixedDice([2, 3, 6, 9, 15, 25]);
/** One car in gear 3 that has rolled a 6, waiting for its adjustments. */
const rolled = (wear: Parameters<typeof patchCar>[2]['wear'] = {}, track2 = linearTrack(300)) =>
  run(patchCar(inRace(track2, { ...dice, laps: 3 }, 1), 'car1', { gear: 3, wear }), shift(3)).state;

describe('§3 adjustments after the roll', () => {
  it('one brakes point removes one cell, up to the roll', () => {
    const s = rolled();
    expect(movementOf(DEFAULT_CONFIG, s.turn!)).toBe(6);
    const r = run(s, adjust(2));
    expect(r.events).toContainEqual({ type: 'ADJUSTED', carId: 'car1', brakes: 2, boost: false, slipstream: false, movement: 4 });
    expect(destinations(r.state)).toEqual(['c4']);
  });

  it('one gearbox point adds one cell, once per turn', () => {
    const r = run(rolled(), adjust(0, true));
    expect(r.events).toContainEqual({ type: 'ADJUSTED', carId: 'car1', brakes: 0, boost: true, slipstream: false, movement: 7 });
    expect(destinations(r.state)).toEqual(['c7']);
  });

  it('brakes and gearbox combine', () => {
    const r = run(rolled(), adjust(1, true));
    expect(r.state.turn!.brakes).toBe(1);
    expect(destinations(r.state)).toEqual(['c6']);
  });

  it('a new ADJUST replaces the previous one instead of adding to it', () => {
    const r = run(rolled(), adjust(2), adjust(1));
    expect(r.state.turn!.brakes).toBe(1);
    expect(destinations(r.state)).toEqual(['c5']);
    expect(destinations(run(r.state, adjust(0)).state)).toEqual(['c6']);
  });

  it('the points are spent when the car arrives, not before', () => {
    let s = run(rolled(), adjust(2, true)).state;
    expect(currentCar(s)!.wear.brakes).toBe(3);
    expect(currentCar(s)!.wear.gearbox).toBe(3);
    s = run(s, moveTo('c5')).state; // 6 - 2 + 1
    const car = s.cars[0];
    expect(car.position).toBe('c5');
    expect(car.wear.brakes).toBe(1);
    expect(car.wear.gearbox).toBe(2);
  });

  it('cannot remove more cells than the roll or than the brakes points', () => {
    expect(run(rolled(), adjust(4)).events[0]).toMatchObject({ reason: 'BAD_BRAKES' }); // car has 3 brakes points
    expect(run(rolled({ brakes: 9 }), adjust(7)).events[0]).toMatchObject({ reason: 'BAD_BRAKES' }); // roll is 6
    expect(run(rolled({ brakes: 9 }), adjust(6)).events[0]).not.toMatchObject({ type: 'INVALID_ACTION' });
    expect(run(rolled(), adjust(-1)).events[0]).toMatchObject({ reason: 'BAD_BRAKES' });
    expect(run(rolled(), adjust(1.5)).events[0]).toMatchObject({ reason: 'BAD_BRAKES' });
  });

  it('removing the whole roll leaves the car where it is', () => {
    const s = run(rolled({ brakes: 6 }), adjust(6)).state;
    expect(movementOf(DEFAULT_CONFIG, s.turn!)).toBe(0);
    expect(destinations(s)).toEqual(['c0']);
    const after = run(s, moveTo('c0')).state;
    expect(after.cars[0].position).toBe('c0');
    expect(after.cars[0].wear.brakes).toBe(0);
  });

  it('the gearbox boost needs a gearbox point', () => {
    const s = rolled({ gearbox: 0 });
    expect(run(s, adjust(0, true)).events[0]).toMatchObject({ type: 'INVALID_ACTION', reason: 'NO_GEARBOX_POINT' });
    expect(run(rolled({ gearbox: 1 }), adjust(0, true)).events[0]).not.toMatchObject({ type: 'INVALID_ACTION' });
  });

  it('spent points never take a part below 0', () => {
    const s = run(rolled({ brakes: 2, gearbox: 1 }), adjust(2, true), moveTo('c5')).state;
    expect(s.cars[0].wear.brakes).toBe(0);
    expect(s.cars[0].wear.gearbox).toBe(0);
    expect(s.cars[0].retired).toBeNull();
    expect(checkInvariants(s)).toEqual([]);
  });

  it('adjustments are only possible after the roll, and not after the move', () => {
    const before = inRace(track, dice, 1);
    expect(run(before, adjust(1)).events[0]).toMatchObject({ reason: 'WRONG_PHASE' });
    const moved = run(rolled(), moveTo('c6')).state;
    expect(run(moved, adjust(1)).events[0]).toMatchObject({ reason: 'WRONG_PHASE' });
  });

  it('brakes spent count against the brakes lost by being blocked: both together must fit in the points', () => {
    // car1 sits on c8; car2 on c3 rolls 6: c9 is out of reach, the car stops on c7 with 2 steps missing
    const t = linearTrack(300, { grid: [8, 3] });
    const base = patchCar(inRace(t, { ...dice, laps: 3 }, 2), 'car2', { gear: 3 });
    const moving = run(asCurrent(base, 'car2'), shift(3)).state;
    expect(currentCar(moving)!.id).toBe('car2');
    expect(enumerateMoves(moving).find((o) => o.cellId === 'c7')).toMatchObject({ missing: 2, brakesLoss: 2, playable: true });
    // adjusting does not change that, but with only 1 brakes point left the option is greyed out
    const cut = patchCar(moving, 'car2', { wear: { brakes: 1 } });
    expect(enumerateMoves(cut).find((o) => o.cellId === 'c7')).toMatchObject({ playable: false, reason: 'brakes' });
    // spend 1 point on the adjustment: 5 cells now, c8 still blocks, 1 step is missing -> 1 + 1 = 2 points of 3
    const exact = run(moving, adjust(1)).state;
    expect(enumerateMoves(exact).find((o) => o.cellId === 'c7')).toMatchObject({ missing: 1, brakesLoss: 1, playable: true });
    // with a single point, the spent point plus the lost one do not fit
    const tight = run(cut, adjust(1)).state;
    expect(enumerateMoves(tight).find((o) => o.cellId === 'c7')).toMatchObject({ missing: 1, playable: false, reason: 'brakes' });
  });
});
