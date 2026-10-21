import { DEFAULT_CONFIG } from './config';
import { createGame, enumerateMoves, reducer, reducerWithFace } from './reducer';
import type { Action, Cell, CarMods, CarState, EngineConfig, GameEvent, RaceState, TireType, Track, Wear } from './types';

export const fullGears = (): [number, number, number, number] => [6, 6, 6, 6];

/** A plain track cell: row = index, type 0, lane 0. */
export function cell(id: string, row: number, over: Partial<Cell> = {}): Cell {
  return { id, next: [], row, type: 0, lane: 0, gear: fullGears(), risk: 0, side: [], ...over };
}

export function makeTrack(cells: Cell[], grid: string[], over: Partial<Track> = {}): Track {
  const map: Record<string, Cell> = {};
  for (const c of cells) map[c.id] = c;
  grid.forEach((id, i) => (map[id].grid = i));
  return { cells: map, lapLength: Math.max(...cells.map((c) => c.row)) + 1, grid, weather: { rain: 7, sun: 13 }, ...over };
}

interface LinearOptions {
  loop?: boolean;
  corners?: { from: number; to: number; stops: number; id?: string }[];
  /** Indices of the grid cells, pole first. */
  grid?: number[];
  /** Risk rolls by cell index. */
  risk?: Record<number, number>;
  /** Make cells i and i+1 neighbours for contacts. */
  contacts?: boolean;
  lapLength?: number;
}

/** Straight line c0..c(n-1) in one lane, optionally closed into a loop. `link` points one cell ahead. */
export function linearTrack(n: number, opts: LinearOptions = {}): Track {
  const cells: Cell[] = [];
  for (let i = 0; i < n; i++) {
    const c = cell(`c${i}`, i);
    c.next = i < n - 1 ? [`c${i + 1}`] : opts.loop ? ['c0'] : [];
    if (i < n - 1 || opts.loop) c.link = `c${(i + 1) % n}`;
    if (i === 0 && opts.loop) c.startLine = true;
    if (opts.risk?.[i]) c.risk = opts.risk[i];
    if (opts.contacts) c.side = [i > 0 ? `c${i - 1}` : null, i < n - 1 ? `c${i + 1}` : null].filter((x): x is string => x !== null);
    cells.push(c);
  }
  (opts.corners ?? []).forEach((k, idx) => {
    for (let i = k.from; i <= k.to; i++) {
      cells[i].type = 1;
      cells[i].corner = { id: k.id ?? `K${idx}`, stops: k.stops };
    }
  });
  return makeTrack(cells, (opts.grid ?? [0]).map((i) => `c${i}`), opts.lapLength ? { lapLength: opts.lapLength } : {});
}

/**
 * A short two-lane track: lane A cells a0..a(n-1), lane B cells b0..b(n-1). Lane changes (a->b and b->a, one
 * row ahead) exist between rows `from` and `to`. Cells are neighbours of the other lane's cell of the same row.
 */
export function twoLaneTrack(n: number, change: { from: number; to: number }, grid: string[] = ['a0', 'b0']): Track {
  const cells: Cell[] = [];
  for (const [lane, p] of [[0, 'a'], [1, 'b']] as const) {
    for (let i = 0; i < n; i++) {
      const other = lane === 0 ? 'b' : 'a';
      const c = cell(`${p}${i}`, i, { lane, side: [`${other}${i}`] });
      if (i < n - 1) {
        c.next = [`${p}${i + 1}`];
        if (i >= change.from && i < change.to) c.next.push(`${other}${i + 1}`);
        c.link = `${p}${i + 1}`;
      }
      cells.push(c);
    }
  }
  return makeTrack(cells, grid);
}

/**
 * Main line c0..c(n-1) with a pit lane p(a)..p(b) beside it. Entry c(a-1) -> p(a), exit p(b) -> c(b+1).
 * The box of team t is the pit cell `boxes[t]` (type 3 + t).
 */
export function pitTrack(n: number, a: number, b: number, boxes: number[], grid = ['c0']): Track {
  const cells: Cell[] = [];
  for (let i = 0; i < n; i++) {
    const c = cell(`c${i}`, i, { next: i < n - 1 ? [`c${i + 1}`] : ['c0'], link: `c${(i + 1) % n}` });
    if (i === a - 1) c.next.push(`p${a}`);
    if (i === 0) c.startLine = true;
    cells.push(c);
  }
  for (let i = a; i <= b; i++) {
    const team = boxes.indexOf(i);
    cells.push(cell(`p${i}`, i, { type: team >= 0 ? 3 + team : 2, lane: 3, next: [i < b ? `p${i + 1}` : `c${(b + 1) % n}`], link: i < b ? `p${i + 1}` : undefined }));
  }
  return makeTrack(cells, grid);
}

/** One face per gear: every die is deterministic (gear g always gives values[g - 1]). */
export function fixedDice(values: number[]): Partial<EngineConfig> {
  return { dice: values.map((v) => [v]) };
}

/** A test config: sunny, laps given, no random weather. */
export function testConfig(over: Partial<EngineConfig> = {}): Partial<EngineConfig> {
  return { weather: 'sun', ...over };
}

export function game(track: Track, config: Partial<EngineConfig> = {}, cars: number | string[] = track.grid.length, seed = 1, extra: { mods?: Record<string, Partial<CarMods>>; tires?: Record<string, TireType> } = {}): RaceState {
  return createGame({ seed, track, config: testConfig(config), cars, ...extra });
}

/** Runs actions in order, returning the final state and all events. */
export function run(state: RaceState, ...actions: Action[]): { state: RaceState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  for (const a of actions) {
    const r = reducer(state, a);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

/** Same as run, but the first SHIFT_GEAR shows `face`. */
export function runWithFace(state: RaceState, action: Action, face: number) {
  return reducerWithFace(state, action, face);
}

export const shift = (gear: number): Action => ({ type: 'SHIFT_GEAR', gear });
export const moveTo = (cellId: string): Action => ({ type: 'MOVE_TO', cellId });
export const adjust = (brakes: number, boost = false, slipstream = false): Action => ({ type: 'ADJUST', brakes, boost, slipstream });
export const reroll: Action = { type: 'REROLL' };
export const skipPit: Action = { type: 'SKIP_PIT' };

/** A copy of a car with part of its state replaced (tests set up situations directly). */
export function patchCar(state: RaceState, id: string, over: Partial<Omit<CarState, 'wear'>> & { wear?: Partial<Wear> }): RaceState {
  return {
    ...state,
    cars: state.cars.map((c) => (c.id === id ? { ...c, ...over, wear: { ...c.wear, ...over.wear } } : c)),
  };
}

export { DEFAULT_CONFIG };

/** Marks every car as having done its standing start (§4), so tests can begin in mid-race. */
export function ready(state: RaceState): RaceState {
  return { ...state, cars: state.cars.map((c) => ({ ...c, started: true })) };
}

/** game() + ready(): a race in progress. */
export function inRace(track: Track, config: Partial<EngineConfig> = {}, cars: number | string[] = track.grid.length, extra: Parameters<typeof game>[4] = {}): RaceState {
  return ready(game(track, config, cars, 1, extra));
}

/** Destinations offered right now, by id. */
export function destinations(state: RaceState): string[] {
  return enumerateMoves(state).filter((o) => o.playable).map((o) => o.cellId);
}

/**
 * Hands the turn to `id` (even when it is not the leader), with a fresh turn in the gear phase.
 * The other cars are marked as having played this round.
 */
export function asCurrent(state: RaceState, id: string): RaceState {
  return {
    ...state,
    phase: 'gear',
    turn: { carId: id, roll: null, face: null, brakes: 0, boost: false, slipstream: false, fixed: false, start: false },
    played: state.cars.filter((c) => c.id !== id).map((c) => c.id),
  };
}
