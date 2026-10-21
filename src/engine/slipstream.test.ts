import { describe, expect, it } from 'vitest';
import { enumerateMoves, slipstreamAvailable } from './reducer';
import { adjust, asCurrent, inRace, linearTrack, patchCar, run, shift, twoLaneTrack } from './testing';
import type { RaceState } from './types';

// HYPOTHESIS tests (§13 / §18): a car ahead in the same line (our `link` cell), both in gear 4 or more, the
// one ahead in a gear lower than or equal to ours, gives +2 cells to the car behind.
const dice = { dice: [[2], [3], [6], [9], [15], [25]] };

/** Two lanes with lane changes along the whole track: car2 (ours) on a1, car1 on a2, right in front of it. */
const duo = (mine: number, ahead: number, aheadAt = 'a2'): RaceState => {
  const t = twoLaneTrack(60, { from: 0, to: 58 }, ['a1', 'b1']);
  const s = inRace(t, { ...dice, laps: 3 }, 2);
  return asCurrent(patchCar(patchCar(s, 'car1', { gear: ahead, position: aheadAt }), 'car2', { gear: mine, position: 'a1' }), 'car2');
};
const available = (s: RaceState) => slipstreamAvailable(s, s.cars[1]);

describe('§13 slipstream (hypothesis)', () => {
  it('is available behind a car in the same line when both are in gear 4+ and the front car is not faster', () => {
    expect(available(duo(4, 4))).toBe(true);
    expect(available(duo(5, 4))).toBe(true);
    expect(available(duo(6, 4))).toBe(true);
    expect(available(duo(6, 6))).toBe(true);
  });

  it('is not available when the car ahead is in a higher gear than ours', () => {
    expect(available(duo(4, 5))).toBe(false);
  });

  it('is not available in gear 3 or below, for us or for the car ahead', () => {
    expect(available(duo(3, 4))).toBe(false);
    expect(available(duo(4, 3))).toBe(false);
  });

  it('is not available when the car ahead is not right in front of us (further, or in the other lane)', () => {
    expect(available(duo(4, 4, 'a3'))).toBe(false);
    expect(available(duo(4, 4, 'b2'))).toBe(false);
  });

  it('is not available for a car with nobody ahead, or in neutral', () => {
    const s = inRace(linearTrack(30), {}, 1);
    expect(slipstreamAvailable(s, patchCar(s, 'car1', { gear: 5 }).cars[0])).toBe(false);
    expect(available(patchCar(duo(4, 4), 'car2', { gear: 0 }))).toBe(false);
  });

  it('adds 2 cells to the movement when used: gear 4 rolls 9, so 11 cells from a1 reach row 12', () => {
    const rolled = run(duo(4, 4), shift(4)).state;
    expect(rolled.turn!.roll).toBe(9);
    expect(enumerateMoves(rolled).map((o) => o.movement)).toEqual(Array(enumerateMoves(rolled).length).fill(9));
    const r = run(rolled, adjust(0, false, true));
    expect(r.events).toContainEqual({ type: 'ADJUSTED', carId: 'car2', brakes: 0, boost: false, slipstream: true, movement: 11 });
    const options = enumerateMoves(r.state).filter((o) => o.playable && o.missing === 0);
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((o) => o.cellId.endsWith('12'))).toBe(true);
  });

  it('combines with brakes and the gearbox boost, and a later ADJUST without it cancels it', () => {
    const rolled = run(duo(4, 4), shift(4)).state;
    const all = run(rolled, adjust(2, true, true));
    expect(all.state.turn).toMatchObject({ brakes: 2, boost: true, slipstream: true });
    expect(enumerateMoves(all.state)[0].movement).toBe(9 - 2 + 1 + 2);
    expect(run(all.state, adjust(0)).state.turn!.slipstream).toBe(false);
  });

  it('is refused by ADJUST when it is not available', () => {
    const rolled = run(duo(4, 5), shift(4)).state;
    expect(run(rolled, adjust(0, false, true)).events[0]).toMatchObject({ type: 'INVALID_ACTION', reason: 'NO_SLIPSTREAM' });
  });

  it('the bonus is configurable', () => {
    const t = twoLaneTrack(60, { from: 0, to: 58 }, ['a1', 'b1']);
    let s = inRace(t, { ...dice, laps: 3, slipstreamBonus: 5 }, 2);
    s = asCurrent(patchCar(patchCar(s, 'car1', { gear: 4, position: 'a2' }), 'car2', { gear: 4, position: 'a1' }), 'car2');
    const r = run(s, shift(4), adjust(0, false, true));
    expect(enumerateMoves(r.state)[0].movement).toBe(14);
  });
});
