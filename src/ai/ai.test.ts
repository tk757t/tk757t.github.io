import { describe, expect, it } from 'vitest';
import { TRACKS, toTrack } from '../data/tracks';
import { checkInvariants, createGame, currentCar, enumerateMoves, reducer, type Action, type RaceState, type Track } from '../engine';
import { nextFloat } from '../engine/rng';
import { asCurrent, fixedDice, inRace, linearTrack, patchCar, pitTrack, run, shift, twoLaneTrack } from '../engine/testing';
import { AI_LEVELS, chooseAction, isLegal, type AiLevel, type Rand } from './index';
import { plans } from './lookahead';
import { runBatch, runRace } from './sim';

const seeded = (seed: number): Rand => {
  let s = seed >>> 0;
  return () => {
    const [v, n] = nextFloat(s);
    s = n;
    return v;
  };
};

/** Plays the AI's actions until the turn passes to someone else (or the race ends). */
function playTurn(level: AiLevel, state: RaceState, rand = seeded(1)): { state: RaceState; actions: Action[] } {
  const id = state.turn!.carId;
  const actions: Action[] = [];
  let s = state;
  for (let i = 0; i < 12 && s.status === 'racing' && s.turn?.carId === id; i++) {
    const a = chooseAction(level, s, rand);
    actions.push(a);
    s = reducer(s, a).state;
    if (s.phase === 'gear') break; // the turn is over (a lone car would get the next turn at once)
  }
  return { state: s, actions };
}

/** Sets the advised gears of every cell with a function of the cell. */
function advise(track: Track, f: (id: string, inCorner: boolean) => [number, number, number, number]): Track {
  for (const c of Object.values(track.cells)) c.gear = f(c.id, !!c.corner);
  return track;
}

describe.each(AI_LEVELS)('AI %s', (level) => {
  it('only plays legal actions and always finishes the race', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const lineup: AiLevel[] = [level, AI_LEVELS[seed % 3], AI_LEVELS[(seed + 1) % 3], level].slice(0, 1 + (seed % 4)) as AiLevel[];
      const r = runRace(lineup, seed);
      expect(r.invalid, `seed ${seed}`).toBe(0);
      expect(r.finished, `seed ${seed}`).toBe(true);
      expect(r.actions).toBeLessThan(6000);
    }
  });

  it('returns a legal action in every state met along a race, without touching the state', () => {
    for (let seed = 100; seed < 110; seed++) {
      let state = createGame({ seed, cars: 4, track: toTrack(TRACKS.oval), config: { laps: 1, maxRounds: 200 } });
      const rand = seeded(seed);
      const walker = seeded(seed + 999); // a random mix of levels, to reach odd states
      let steps = 0;
      while (state.status === 'racing' && steps++ < 3000) {
        const snapshot = JSON.stringify(state);
        const action = chooseAction(level, state, rand);
        expect(JSON.stringify(state)).toBe(snapshot);
        expect(isLegal(state, action), JSON.stringify(action)).toBe(true);
        const next = reducer(state, walker() < 0.7 ? action : chooseAction(AI_LEVELS[Math.floor(walker() * 3)], state, rand));
        expect(next.events.some((e) => e.type === 'INVALID_ACTION')).toBe(false);
        expect(checkInvariants(next.state)).toEqual([]);
        state = next.state;
      }
      expect(state.status).toBe('finished');
    }
  });

  it('is deterministic for a given rng seed', () => {
    expect(runRace([level, 'medium', 'hard'], 42)).toEqual(runRace([level, 'medium', 'hard'], 42));
  });

  it('plays a solo race to the end, in the rain too', () => {
    expect(runRace([level], 7).finished).toBe(true);
    expect(runRace([level], 7, { config: { weather: 'rain' } }).finished).toBe(true);
  });

  it('every turn is gear, (adjustments), destination, in that order', () => {
    const s = inRace(toTrack(TRACKS.oval), { weather: 'sun', laps: 2 }, 2);
    const { actions } = playTurn(level, s);
    expect(actions[0].type).toBe('SHIFT_GEAR');
    expect(actions.at(-1)!.type).toBe('MOVE_TO');
    for (const a of actions.slice(1, -1)) expect(a.type).toBe('ADJUST');
  });

  it('the first turn is a standing start in gear 1', () => {
    const s = createGame({ seed: 3, cars: 2, track: toTrack(TRACKS.oval) });
    expect(chooseAction(level, s, seeded(1))).toEqual({ type: 'SHIFT_GEAR', gear: 1 });
  });

  it('never plans a move the engine refuses, even with almost nothing left', () => {
    let s = inRace(toTrack(TRACKS.oval), { weather: 'sun', laps: 3 }, 2);
    s = patchCar(s, 'car1', { gear: 3, wear: { tires: 0, brakes: 1, gearbox: 0, engine: 1 } });
    const { state } = playTurn(level, s);
    expect(checkInvariants(state)).toEqual([]);
  });
});

describe('the gear', () => {
  // straights advise gear 4, the corner K (c20..c24, 2 stops) advises 2 with 2 stops left and 1 with 1
  const track = () =>
    advise(linearTrack(80, { corners: [{ from: 20, to: 24, stops: 2, id: 'K' }], grid: [0, 1] }), (_id, corner) => (corner ? [3, 2, 1, 1] : [4, 4, 4, 4]));
  const at = (cell: string, over: Parameters<typeof patchCar>[2] = {}) => patchCar(inRace(track(), { weather: 'sun', laps: 3 }, 1), 'car1', { position: cell, gear: 3, ...over });
  const gearOf = (level: AiLevel, s: RaceState) => (chooseAction(level, s, seeded(1)) as Extract<Action, { type: 'SHIFT_GEAR' }>).gear;

  it('Medium and Hard go for the advised gear on a straight', () => {
    expect(gearOf('medium', at('c5'))).toBe(4);
    expect([3, 4, 5]).toContain(gearOf('hard', at('c5')));
  });

  it('Medium takes the advised gear for the stops left in a corner (the 2-stop value, then the 1-stop value)', () => {
    // advice by stops left: 0 -> 3, 1 -> 2, 2 -> 1, 3 -> 1
    expect(gearOf('medium', at('c21', { cornerId: 'K', cornerLeft: 2, gear: 4 }))).toBe(1);
    expect(gearOf('medium', at('c22', { cornerId: 'K', cornerLeft: 1, gear: 2 }))).toBe(2);
    expect(gearOf('medium', at('c23', { cornerId: 'K', cornerLeft: 0, gear: 2 }))).toBe(3);
  });

  it('Medium takes one gear less than advised in the rain on dry tires in a corner (§14)', () => {
    const wet = patchCar(inRace(track(), { weather: 'rain', laps: 3 }, 1), 'car1', { position: 'c21', gear: 4, cornerId: 'K', cornerLeft: 1, tires: 'hard' });
    expect(gearOf('medium', wet)).toBe(1); // advised 2, minus one in the rain
    const wetTires = patchCar(wet, 'car1', { tires: 'rain' });
    expect(gearOf('medium', wetTires)).toBe(2);
  });

  it('Medium takes the best gear it can afford when the advised one is out of reach', () => {
    // the advised gear is 2 but going down from 6 costs gearbox, brakes and engine points the car does not have
    const s = at('c21', { cornerId: 'K', cornerLeft: 2, gear: 6, wear: { gearbox: 0, brakes: 0, engine: 0 } });
    expect(gearOf('medium', s)).toBeGreaterThanOrEqual(5);
  });

  it('Easy never goes above third gear and does not leave the advised gear much', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const g = (chooseAction('easy', at('c5'), seeded(seed)) as Extract<Action, { type: 'SHIFT_GEAR' }>).gear;
      expect(g).toBeLessThanOrEqual(3);
    }
  });

  it('Hard slows down before a corner it cannot take fast', () => {
    const approaching = at('c17', { gear: 4 });
    expect(gearOf('hard', approaching)).toBeLessThanOrEqual(3);
    const far = at('c2', { gear: 4 });
    expect(gearOf('hard', far)).toBeGreaterThanOrEqual(gearOf('hard', approaching));
  });
});

describe('the destination', () => {
  it('Medium and Hard take the free lane rather than a blocked one', () => {
    // a rival on a2: from a0 with 3 cells the lane a loses brakes, lane b does not
    const t = twoLaneTrack(30, { from: 0, to: 20 }, ['a0', 'b0']);
    let s = inRace(t, { ...fixedDice([1, 2, 3, 4, 5, 6]), weather: 'sun', laps: 3 }, 2);
    s = patchCar(patchCar(s, 'car1', { position: 'a2' }), 'car2', { position: 'a0', gear: 3 });
    s = run(asCurrent(s, 'car2'), shift(3)).state;
    expect(enumerateMoves(s).some((o) => o.cost > 0)).toBe(true);
    for (const level of ['medium', 'hard'] as const) {
      const after = playTurn(level, s).state;
      expect(after.cars[1].position, level).toMatch(/^[ab]3$/);
      expect(after.cars[1].wear.brakes, level).toBe(3);
    }
  });

  it('uses the brakes when nothing else can be played: it stays put rather than leave the corner with 2 stops missing', () => {
    const t = advise(linearTrack(60, { corners: [{ from: 4, to: 8, stops: 2, id: 'K' }], grid: [0, 1] }), () => [3, 3, 3, 3]);
    let s = patchCar(inRace(t, { ...fixedDice([2, 3, 3, 9, 15, 25]), weather: 'sun', laps: 1 }, 1), 'car1', { position: 'c8', gear: 3, cornerId: 'K', cornerLeft: 2 });
    s = run(s, shift(3)).state; // rolls 3: every way out of the zone costs 12 tires; 3 brakes points cancel the move
    expect(plans(s).every((p) => p.brakes === 3)).toBe(true);
    for (const level of ['easy', 'medium', 'hard'] as const) {
      const done = playTurn(level, s).state;
      expect(done.cars[0].position, level).toBe('c8');
      expect(done.cars[0].wear.brakes, level).toBe(0);
      expect(done.cars[0].wear.tires, level).toBe(4);
      expect(done.cars[0].retired, level).toBeNull();
    }
  });

  it('Easy does not adjust when it does not have to', () => {
    const t = linearTrack(60, { grid: [0, 1] });
    const s = run(patchCar(inRace(t, { ...fixedDice([2, 3, 5, 9, 15, 25]), weather: 'sun' }, 1), 'car1', { gear: 3 }), shift(3)).state;
    const a = chooseAction('easy', s, seeded(2));
    expect(a.type).toBe('MOVE_TO');
  });

  it('plans() lists every playable adjustment/destination pair, all of them accepted by the engine', () => {
    const t = twoLaneTrack(30, { from: 0, to: 20 }, ['a0', 'b0']);
    const s = run(patchCar(inRace(t, { ...fixedDice([1, 2, 3, 4, 5, 6]), weather: 'sun', laps: 3 }, 2), 'car1', { gear: 3 }), shift(3)).state;
    const all = plans(s);
    expect(all.length).toBeGreaterThan(4);
    for (const p of all) {
      const r = reducer(reducer(s, { type: 'ADJUST', brakes: p.brakes, boost: p.boost, slipstream: p.slipstream }).state, { type: 'MOVE_TO', cellId: p.option.cellId });
      expect(r.events.some((e) => e.type === 'INVALID_ACTION')).toBe(false);
    }
  });
});

describe('the pit stop (§10, §14)', () => {
  const track = () => advise(pitTrack(30, 4, 14, [6, 9]), () => [3, 3, 3, 3]);
  const atBox = (over: Parameters<typeof patchCar>[2] = {}, config = {}) => {
    const base = patchCar(inRace(track(), { weather: 'sun', laps: 3, dice: [[1], [2], [3], [4], [5], [6]], ...config }, 1), 'car1', { gear: 2, position: 'p4', ...over });
    return run(base, shift(2), { type: 'ADJUST', brakes: 0, boost: false }, { type: 'MOVE_TO', cellId: 'p6' }).state;
  };

  it('Easy never stops, Medium and Hard stop when the tires are nearly gone, with new tires and repairs', () => {
    const s = atBox({ wear: { tires: 1, engine: 0, body: 1, brakes: 3, gearbox: 3, handling: 2 } });
    expect(s.phase).toBe('pit');
    expect(chooseAction('easy', s, seeded(1))).toEqual({ type: 'SKIP_PIT' });
    for (const level of ['medium', 'hard'] as const) {
      const a = chooseAction(level, s, seeded(1)) as Extract<Action, { type: 'PIT_STOP' }>;
      expect(a.type, level).toBe('PIT_STOP');
      expect(a.tires).toBe('hard');
      expect(a.repairs).toMatchObject({ engine: 1 }); // the engine first (§14)
      expect(Object.values(a.repairs ?? {}).reduce((x, y) => x + (y as number), 0)).toBeLessThanOrEqual(2);
    }
  });

  it('puts rain tires on in the rain and soft ones for the last lap', () => {
    const wet = atBox({ wear: { tires: 1 } }, { weather: 'rain' });
    expect((chooseAction('medium', wet, seeded(1)) as Extract<Action, { type: 'PIT_STOP' }>).tires).toBe('rain');
    const last = patchCar(atBox({ wear: { tires: 1 } }), 'car1', { laps: 2 });
    expect((chooseAction('medium', last, seeded(1)) as Extract<Action, { type: 'PIT_STOP' }>).tires).toBe('soft');
  });

  it('does not stop when the car is fine, or already stopped this lap', () => {
    const fine = atBox();
    expect(chooseAction('medium', fine, seeded(1))).toEqual({ type: 'SKIP_PIT' });
    expect(chooseAction('hard', fine, seeded(1))).toEqual({ type: 'SKIP_PIT' });
  });

  it('with no part to repair it asks for a fast stop (no repairs)', () => {
    const s = atBox({ wear: { tires: 1 } });
    const a = chooseAction('hard', s, seeded(1)) as Extract<Action, { type: 'PIT_STOP' }>;
    expect(Object.keys(a.repairs ?? {})).toEqual([]);
  });

  it('steers into the pit lane when it needs a stop, and out of it when it does not', () => {
    const t = track();
    const worn = patchCar(inRace(t, { weather: 'sun', laps: 3, dice: [[1], [2], [3], [4], [5], [6]] }, 1), 'car1', { gear: 3, position: 'c2', wear: { tires: 1 } });
    for (const level of ['medium', 'hard'] as const) {
      const done = playTurn(level, run(worn, shift(3)).state).state;
      expect(done.cars[0].position, level).toMatch(/^p/);
    }
    const fine = patchCar(worn, 'car1', { wear: { tires: 6 } });
    const stay = playTurn('medium', run(fine, shift(3)).state).state;
    expect(stay.cars[0].position).toMatch(/^c/);
  });
});

describe('isLegal', () => {
  const s = inRace(toTrack(TRACKS.oval), { weather: 'sun' }, 2);

  it('knows the legal gears, and that REROLL is never used by the AIs', () => {
    expect(isLegal(s, { type: 'SHIFT_GEAR', gear: 1 })).toBe(true);
    expect(isLegal(s, { type: 'SHIFT_GEAR', gear: 5 })).toBe(false);
    expect(isLegal(s, { type: 'REROLL' })).toBe(false);
    expect(isLegal(s, { type: 'SKIP_PIT' })).toBe(false);
    expect(isLegal(s, { type: 'MOVE_TO', cellId: 'L0S10' })).toBe(false);
  });

  it('checks adjustments against the roll and the points', () => {
    const rolled = run(patchCar(s, 'car1', { gear: 3 }), shift(3)).state;
    expect(isLegal(rolled, { type: 'ADJUST', brakes: 0, boost: false })).toBe(true);
    expect(isLegal(rolled, { type: 'ADJUST', brakes: 9, boost: false })).toBe(false);
    expect(isLegal(rolled, { type: 'ADJUST', brakes: 0, boost: true })).toBe(true);
    expect(isLegal(patchCar(rolled, currentCar(rolled)!.id, { wear: { gearbox: 0 } }), { type: 'ADJUST', brakes: 0, boost: true })).toBe(false);
    expect(isLegal(rolled, { type: 'ADJUST', brakes: 0, boost: false, slipstream: true })).toBe(false);
  });

  it('checks the pit stop requests', () => {
    const pit: RaceState = { ...s, phase: 'pit' };
    expect(isLegal(pit, { type: 'PIT_STOP', tires: 'soft', repairs: { engine: 1 } })).toBe(true);
    expect(isLegal(pit, { type: 'PIT_STOP', tires: 'soft', repairs: { engine: 3 } })).toBe(false);
    expect(isLegal(pit, { type: 'PIT_STOP', tires: 'soft', repairs: { tires: 1 } as never })).toBe(false);
    expect(isLegal(pit, { type: 'SKIP_PIT' })).toBe(true);
  });

  it('nothing is legal once the race is over', () => {
    expect(isLegal({ ...s, status: 'finished' }, { type: 'SHIFT_GEAR', gear: 1 })).toBe(false);
  });
});

describe('balance (regression on the simulation)', () => {
  it('Difficile beats Moyen beats Facile clearly, with a sane retirement rate', () => {
    const r = runBatch(240, ['easy', 'medium', 'hard'], { laps: 2 }, 1);
    const rate = Object.fromEntries(r.perLevel.map((x) => [x.level, x.winRate]));
    expect(rate.hard - rate.medium).toBeGreaterThan(0.1);
    expect(rate.medium - rate.easy).toBeGreaterThan(0.1);
    expect(r.retireRate).toBeLessThan(0.25);
    expect(r.unfinished).toBe(0);
    expect(r.invalid).toBe(0);
  }, 120_000);
});


