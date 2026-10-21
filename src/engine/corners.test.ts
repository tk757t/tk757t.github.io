import { describe, expect, it } from 'vitest';
import { checkInvariants } from './invariants';
import { createWalker } from './moves';
import { currentCar } from './reducer';
import { adjust, fixedDice, inRace, linearTrack, moveTo, patchCar, run, shift } from './testing';
import type { CarState, GameEvent, RaceState } from './types';

// corner K: cells c4..c8 (5 cells), 2 stops required; lap-1 start points: tires 4, brakes 3
const track = linearTrack(80, { corners: [{ from: 4, to: 8, stops: 2, id: 'K' }] });
const dice = fixedDice([2, 3, 5, 9, 15, 25]);

const inZone = (over: Partial<CarState>, config = {}, mods: Parameters<typeof inRace>[3] = {}): RaceState =>
  patchCar(inRace(track, { laps: 1, ...config }, 1, mods), 'car1', { position: 'c6', cornerId: 'K', cornerLeft: 1, ...over });
const moves = (s: RaceState, m: number) => createWalker(s, s.cars[0]).moves(m);
const find = (s: RaceState, m: number, cell: string) => moves(s, m).find((o) => o.cellId === cell)!;
const kinds = (events: GameEvent[], type: GameEvent['type']) => events.filter((e) => e.type === type);

describe('§6 the stops counter', () => {
  it('entering the zone sets the counter to the required stops, a turn ending inside takes one off', () => {
    let s = patchCar(inRace(track, { ...dice, laps: 1 }, 1), 'car1', { position: 'c2', gear: 3 });
    const r = run(s, shift(3), adjust(0), moveTo('c7')); // 5 cells: c3, then c4..c7 in the zone
    s = r.state;
    expect(currentCar(s)!.cornerId).toBe('K');
    expect(currentCar(s)!.cornerLeft).toBe(1); // 2 required, this turn ended inside: one left
    expect(r.events).toContainEqual({ type: 'CORNER_STOP', carId: 'car1', corner: 'K', left: 1 });
  });

  it('a second turn inside brings it to 0, a third stays at 0 without a new stop', () => {
    let s = patchCar(inRace(track, { ...dice, laps: 1 }, 1), 'car1', { position: 'c4', gear: 1, cornerId: 'K', cornerLeft: 2 });
    s = run(s, shift(2), adjust(0), moveTo('c7')).state; // 3 cells: ends in the zone
    expect(s.cars[0].cornerLeft).toBe(1);
    const second = run(patchCar(s, 'car1', { position: 'c4', cornerLeft: 1 }), shift(2), adjust(0), moveTo('c7'));
    expect(second.state.cars[0].cornerLeft).toBe(0);
    const third = run(patchCar(second.state, 'car1', { position: 'c4' }), shift(2), adjust(0), moveTo('c7'));
    expect(third.state.cars[0].cornerLeft).toBe(0);
    expect(kinds(third.events, 'CORNER_STOP')).toHaveLength(0);
  });

  it('a turn that ends outside the zone does not count, and the counter is cleared after leaving', () => {
    const s = patchCar(inRace(track, { ...dice, laps: 1 }, 1), 'car1', { position: 'c2', gear: 4 });
    const r = run(s, shift(4), adjust(0), moveTo('c11')); // 9 cells: through the whole zone with 2 stops missing
    // 2 stops missing -> 3 x starting tires: the option is not playable, so the car cannot even choose it
    expect(r.events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);
    expect(r.state.cars[0].position).toBe('c2');
  });

  it('with the counter at 0 leaving the zone costs nothing and clears the zone', () => {
    const s = inZone({ cornerLeft: 0, gear: 3 }, dice);
    expect(find(s, 5, 'c11')).toMatchObject({ tiresLoss: 0, cornerId: null, cornerLeft: 0, playable: true });
    const after = run(s, shift(3), adjust(0), moveTo('c11')).state.cars[0];
    expect(after.cornerId).toBeNull();
    expect(after.cornerLeft).toBe(0);
    expect(after.wear.tires).toBe(4);
  });
});

describe('§6 leaving the zone with stops missing', () => {
  it('one stop missing: tires lost = steps left x factor (1 for hard tires)', () => {
    const s = inZone({});
    // from c6: c7, c8, then the step c8->c9 leaves the zone. 5 cells: 3 steps are left when it leaves
    expect(find(s, 5, 'c11')).toMatchObject({ tiresLoss: 3, playable: true });
    expect(find(s, 4, 'c10')).toMatchObject({ tiresLoss: 2 });
    expect(find(s, 3, 'c9')).toMatchObject({ tiresLoss: 1 });
    expect(find(s, 2, 'c8')).toMatchObject({ tiresLoss: 0, cornerLeft: 1, cornerId: 'K' });
  });

  it('starting tires are 4: losing 4 is allowed (the car stops), losing 5 is not playable', () => {
    const s = inZone({});
    expect(find(s, 6, 'c12')).toMatchObject({ tiresLoss: 4, playable: true });
    expect(find(s, 7, 'c13')).toMatchObject({ tiresLoss: 5, playable: false, reason: 'tires' });
  });

  it('more than one stop missing: 3 x the starting tires (§6), far more than the car has', () => {
    const s = inZone({ cornerLeft: 2 });
    expect(find(s, 3, 'c9')).toMatchObject({ tiresLoss: 12, playable: false, reason: 'tires' });
    const rich = inZone({ cornerLeft: 2 }, { laps: 3 }); // 6 starting tires
    expect(find(rich, 3, 'c9')).toMatchObject({ tiresLoss: 18, playable: false });
    // a car that stops again inside the zone is fine
    expect(find(s, 2, 'c8')).toMatchObject({ tiresLoss: 0, playable: true });
  });

  it('the loss is applied when the car arrives, with the details announced', () => {
    const s = inZone({ gear: 3 }, dice);
    const r = run(s, shift(3), adjust(0), moveTo('c11')); // gear 3 rolls 5
    expect(r.state.cars[0].position).toBe('c11');
    expect(r.state.cars[0].wear.tires).toBe(1);
    expect(r.events).toContainEqual({ type: 'CORNER_OVERSHOOT', carId: 'car1', corner: 'K', left: 1, steps: 3, tires: 3 });
    expect(r.events).toContainEqual({ type: 'WEAR_LOST', carId: 'car1', category: 'tires', amount: 3, cause: 'overshoot' });
    expect(checkInvariants(r.state)).toEqual([]);
  });

  it('tires at exactly 0: the car is stopped, in neutral, and can only restart in gear 1', () => {
    const s = inZone({ gear: 4 }, fixedDice([2, 3, 6, 9, 15, 25]));
    const r = run(s, shift(4), adjust(0), moveTo('c12')); // gear 4 rolls 9? use adjust below
    void r;
    const six = inZone({ gear: 3 }, fixedDice([2, 3, 6, 9, 15, 25])); // gear 3 rolls 6: loss 4
    const done = run(six, shift(3), adjust(0), moveTo('c12'));
    const car = done.state.cars[0];
    expect(car.wear.tires).toBe(0);
    expect(car.gear).toBe(0);
    expect(car.retired).toBeNull();
    expect(kinds(done.events, 'CAR_STOPPED')).toHaveLength(1);
    expect(run(done.state, shift(2)).events[0]).toMatchObject({ reason: 'GEAR_NOT_AVAILABLE' });
    expect(run(done.state, shift(1)).events.some((e) => e.type === 'INVALID_ACTION')).toBe(false);
  });

  it('a destination that would need more tires than the car has cannot be chosen', () => {
    const s = run(inZone({ gear: 3 }, fixedDice([2, 3, 7, 9, 15, 25])), shift(3)).state; // rolls 7: loss 5 > 4
    expect(run(s, moveTo('c13')).events[0]).toMatchObject({ type: 'INVALID_ACTION' });
  });

  it('if every destination is unplayable the car cannot move at all and is out', () => {
    // 2 stops missing and the roll goes beyond the zone whatever the adjustments: only brakes could save it
    const s = patchCar(inRace(track, { ...fixedDice([2, 3, 9, 9, 15, 25]), laps: 1 }, 1), 'car1', { position: 'c8', gear: 3, cornerId: 'K', cornerLeft: 2, wear: { brakes: 0 } });
    const r = run(s, shift(3));
    expect(r.state.status).toBe('finished');
    expect(r.state.cars[0].retired).toBe('no-move');
    expect(kinds(r.events, 'CAR_RETIRED')).toHaveLength(1);
  });

  it('the brakes can save the car: removing cells keeps it inside the zone', () => {
    const base = patchCar(inRace(track, { ...fixedDice([2, 3, 9, 9, 15, 25]), laps: 1 }, 1), 'car1', { position: 'c4', gear: 3, cornerId: 'K', cornerLeft: 2 });
    // 3 brakes points are not enough to bring a 9 back inside the zone (c8 is 4 cells away): out of the race
    expect(run(base, shift(3)).state.cars[0].retired).toBe('no-move');
    // with 6 points the roll can be cut to 3: c7, still in the zone
    const strong = patchCar(base, 'car1', { wear: { brakes: 9 } });
    const rolled = run(strong, shift(3));
    expect(rolled.state.phase).toBe('adjust');
    const cut = run(rolled.state, adjust(6));
    expect(cut.state.cars[0].retired).toBeNull();
    const options = createWalker(cut.state, cut.state.cars[0]).moves(3, 6);
    expect(options.find((o) => o.cellId === 'c7')).toMatchObject({ playable: true, tiresLoss: 0 });
  });
});

describe('§7 tire factor in the overshoot', () => {
  const loss = (over: Partial<CarState>, config = {}) => find(inZone(over, config), 3, 'c9').tiresLoss; // 1 step lost per factor unit

  it('hard x1, soft x2 then x3 from the 3rd lap of the stint, rain tires x2 on a dry track', () => {
    expect(loss({ tires: 'hard' })).toBe(1);
    expect(loss({ tires: 'soft', stint: 0 })).toBe(2);
    expect(loss({ tires: 'soft', stint: 1 })).toBe(2);
    expect(loss({ tires: 'soft', stint: 2 })).toBe(3);
    expect(loss({ tires: 'soft', stint: 5 })).toBe(3);
    expect(loss({ tires: 'rain' })).toBe(2);
  });

  it('rain tires on a wet track are x1', () => {
    expect(loss({ tires: 'rain' }, { weather: 'rain' })).toBe(1 + 1); // x1 + the rain extra for rain tires
  });

  it('in the rain other tires lose 3 more and rain tires 1 more (hypothesis of §18)', () => {
    expect(loss({ tires: 'hard' }, { weather: 'rain' })).toBe(1 + 3);
    expect(loss({ tires: 'soft', stint: 0 }, { weather: 'rain' })).toBe(2 + 3);
    expect(loss({ tires: 'hard' }, { weather: 'cloud' })).toBe(1);
  });

  it('the factor multiplies the steps left', () => {
    const s = inZone({ tires: 'soft', stint: 0 });
    expect(find(s, 5, 'c11').tiresLoss).toBe(6); // 3 steps x 2
  });
});

describe('§6 car parts in corners', () => {
  it('free stops cover missing stops: no loss, then they are used up', () => {
    const s = inZone({}, { ...dice, laps: 1 }, { mods: { car1: { freeStops: 1 } } });
    expect(find(s, 5, 'c11')).toMatchObject({ tiresLoss: 0, freeUsed: 1 });
    const r = run(patchCar(s, 'car1', { gear: 3 }), shift(3), adjust(0), moveTo('c11'));
    expect(r.state.cars[0].freeStops).toBe(0);
    expect(r.state.cars[0].wear.tires).toBe(4);
    expect(kinds(r.events, 'FREE_STOP_USED')).toHaveLength(1);
    // used up: the next overshoot costs tires
    const again = inZone({ freeStops: 0 }, {}, { mods: { car1: { freeStops: 1 } } });
    expect(find(again, 5, 'c11').tiresLoss).toBe(3);
  });

  it('one free stop out of two missing leaves one: the loss is steps x factor, not 3 x tires', () => {
    const s = inZone({ cornerLeft: 2 }, {}, { mods: { car1: { freeStops: 1 } } });
    expect(find(s, 3, 'c9')).toMatchObject({ tiresLoss: 1, freeUsed: 1, playable: true });
  });

  it('two free stops cover two missing stops', () => {
    const s = inZone({ cornerLeft: 2 }, {}, { mods: { car1: { freeStops: 2 } } });
    expect(find(s, 5, 'c11')).toMatchObject({ tiresLoss: 0, freeUsed: 2 });
  });

  it('a tires discount shaves the loss, never below 0', () => {
    const s = inZone({}, {}, { mods: { car1: { overshootTireDiscount: 2 } } });
    expect(find(s, 5, 'c11').tiresLoss).toBe(1); // 3 - 2
    expect(find(s, 3, 'c9').tiresLoss).toBe(0); // 1 - 2 -> 0
  });
});

describe('§2 practice and qualifying', () => {
  it('overshoots only add time penalties: no wear', () => {
    const s = inZone({ gear: 3 }, { ...dice, practice: true });
    expect(s.cars[0].wear.tires).toBe(12);
    const r = run(s, shift(3), adjust(0), moveTo('c11'));
    expect(r.state.cars[0].wear.tires).toBe(12);
    expect(r.state.cars[0].penalties).toBe(3);
    expect(r.state.cars[0].retired).toBeNull();
  });

  it('unplayable-by-tires options do not exist in practice', () => {
    const s = inZone({ cornerLeft: 2 }, { practice: true });
    expect(find(s, 3, 'c9').playable).toBe(true);
  });
});
