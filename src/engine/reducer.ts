import { DEFAULT_CONFIG, startPointsFor } from './config';
import { createWalker } from './moves';
import { nextFloat } from './rng';
import {
  allowedGears,
  canShiftTo,
  distanceForFace,
  downshiftCost,
  driftWetness,
  effectiveDrop,
  isRaining,
  movementOf,
  progressOf,
  weatherFromD20,
  weatherOf,
  wetnessFor,
} from './rules';
import {
  CELL_BOX_FIRST,
  CELL_PIT_LANE,
  NO_MODS,
  TIRE_TYPES,
  WEAR_CATEGORIES,
  type Action,
  type CarMods,
  type CarState,
  type DnfReason,
  type EngineConfig,
  type GameEvent,
  type MoveOption,
  type RaceResult,
  type RaceState,
  type ReduceResult,
  type TireType,
  type Track,
  type TurnState,
  type WearCategory,
} from './types';

export { progressOf } from './rules';

export interface CreateGameOptions {
  seed: number;
  /** Number of cars (taken from the grid) or explicit ids. */
  cars?: number | string[];
  config?: Partial<EngineConfig>;
  track: Track;
  /** Part modifiers per car id (see CarMods). */
  mods?: Record<string, Partial<CarMods>>;
  /** Starting tires per car id (default `config.startTires`). */
  tires?: Record<string, TireType>;
}

const newTurn = (carId: string): TurnState => ({ carId, roll: null, face: null, brakes: 0, boost: false, slipstream: false, fixed: false, start: false });

export function createGame(options: CreateGameOptions): RaceState {
  const config: EngineConfig = { ...DEFAULT_CONFIG, ...options.config };
  const track = options.track;
  const wanted = options.cars ?? 4;
  const ids = Array.isArray(wanted) ? wanted : Array.from({ length: wanted }, (_, i) => `car${i + 1}`);
  if (ids.length > track.grid.length) throw new Error('more cars than grid slots');
  if (ids.length === 0) throw new Error('at least one car is required');
  const base = startPointsFor(config);
  const cars: CarState[] = ids.map((id, i) => {
    const mods: CarMods = { ...NO_MODS, ...options.mods?.[id] };
    const maxWear = { ...base };
    for (const cat of WEAR_CATEGORIES) maxWear[cat] += mods.wearBonus[cat] ?? 0;
    return {
      id,
      team: i % 5,
      gear: 1,
      wear: { ...maxWear },
      maxWear,
      mods,
      rerolls: mods.rerolls,
      freeStops: mods.freeStops,
      tires: options.tires?.[id] ?? config.startTires,
      stint: 0,
      position: track.grid[i],
      // a grid behind the line (rows near the end of the lap) starts on lap -1: the first crossing starts lap 1
      laps: track.cells[track.grid[i]].row > track.lapLength / 2 ? -1 : 0,
      cornerLeft: 0,
      cornerId: null,
      repairLeft: config.repairPoints,
      pitLap: -2,
      started: false,
      arrival: i,
      contacted: [],
      penalties: 0,
      retired: null,
      retiredRound: null,
      retiredProgress: null,
      finishRank: null,
    };
  });
  const state: RaceState = {
    config,
    track,
    rng: options.seed >>> 0,
    cars,
    round: 1,
    played: [],
    phase: 'gear',
    turn: null,
    wetness: 0,
    arrivals: ids.length,
    finishedCount: 0,
    status: 'racing',
    results: null,
  };
  // weather at the start (§9): a d20 against the circuit thresholds, unless fixed by the config
  if (config.weather === 'random') state.wetness = wetnessFor(weatherFromD20(draw(state, 20), track.weather));
  else state.wetness = wetnessFor(config.weather);
  pickNext(state, []);
  return state;
}

// ------------------------------------------------------------------ helpers

export function currentCar(state: RaceState): CarState | undefined {
  return state.turn ? state.cars.find((c) => c.id === state.turn!.carId) : undefined;
}

const isActive = (c: CarState): boolean => c.retired === null && c.finishRank === null;

/** Draws 1..sides and advances the seeded generator. */
function draw(s: RaceState, sides: number): number {
  const [r, next] = nextFloat(s.rng);
  s.rng = next;
  return 1 + Math.floor(r * sides);
}

function drawFrom<T>(s: RaceState, items: readonly T[]): T {
  const [r, next] = nextFloat(s.rng);
  s.rng = next;
  return items[Math.floor(r * items.length)];
}

function draft(s: RaceState): RaceState {
  return {
    ...s,
    cars: s.cars.map((c) => ({ ...c, wear: { ...c.wear }, contacted: [...c.contacted] })),
    played: [...s.played],
    turn: s.turn ? { ...s.turn } : null,
    results: s.results ? s.results.map((r) => ({ ...r })) : null,
  };
}

function loseWear(s: RaceState, car: CarState, category: WearCategory, amount: number, cause: string, events: GameEvent[]): void {
  if (amount <= 0) return;
  if (s.config.practice) {
    // practice and qualifying: no wear, only time penalties (§2)
    car.penalties += amount;
    return;
  }
  car.wear[category] -= amount;
  events.push({ type: 'WEAR_LOST', carId: car.id, category, amount, cause });
}

function gainWear(car: CarState, category: WearCategory, amount: number, cause: string, events: GameEvent[]): void {
  if (amount <= 0) return;
  car.wear[category] += amount;
  events.push({ type: 'WEAR_GAINED', carId: car.id, category, amount, cause });
}

function retire(s: RaceState, car: CarState, reason: DnfReason, events: GameEvent[]): void {
  if (car.retired !== null) return;
  car.retiredProgress = progressOf(s, car);
  car.retiredRound = s.round;
  car.retired = reason;
  car.position = null;
  events.push({ type: 'CAR_RETIRED', carId: car.id, reason });
}

/** A part below 0 means the car is out (§2). */
function checkWear(s: RaceState, car: CarState, events: GameEvent[]): boolean {
  if (car.retired !== null) return true;
  const broken = WEAR_CATEGORIES.find((c) => car.wear[c] < 0);
  if (broken) retire(s, car, broken, events);
  return car.retired !== null;
}

// -------------------------------------------------------- order of play (§11)

/** Leader first: highest position, then highest gear, then who arrived first. */
function nextToPlay(s: RaceState, candidates: CarState[]): CarState {
  return [...candidates].sort(
    (a, b) => progressOf(s, b) - progressOf(s, a) || b.gear - a.gear || a.arrival - b.arrival || s.cars.indexOf(a) - s.cars.indexOf(b),
  )[0];
}

/** Order the active cars would play in right now (leader first), for display. */
export function playingOrder(s: RaceState): string[] {
  const left = s.cars.filter((c) => isActive(c) && !s.played.includes(c.id));
  return [...left].sort((a, b) => progressOf(s, b) - progressOf(s, a) || b.gear - a.gear || a.arrival - b.arrival).map((c) => c.id);
}

function updateWeather(s: RaceState, events: GameEvent[]): void {
  if (s.config.weather !== 'random') return;
  const d20 = draw(s, 20);
  s.wetness = driftWetness(s.wetness, weatherFromD20(d20, s.track.weather));
  events.push({ type: 'WEATHER', weather: weatherOf(s.wetness), wetness: s.wetness, d20 });
}

function pickNext(s: RaceState, events: GameEvent[]): void {
  const active = s.cars.filter(isActive);
  if (active.length === 0) return finishRace(s, events);
  let candidates = active.filter((c) => !s.played.includes(c.id));
  if (candidates.length === 0) {
    s.round++;
    if (s.round > s.config.maxRounds) return finishRace(s, events);
    s.played = [];
    updateWeather(s, events);
    candidates = active;
    events.push({ type: 'ROUND_STARTED', round: s.round, order: playingOrder(s) });
  }
  const car = nextToPlay(s, candidates);
  s.turn = newTurn(car.id);
  s.phase = 'gear';
  events.push({ type: 'TURN_STARTED', carId: car.id, round: s.round });
}

function endTurn(s: RaceState, events: GameEvent[]): void {
  if (s.turn) s.played.push(s.turn.carId);
  s.turn = null;
  pickNext(s, events);
}

function finishRace(s: RaceState, events: GameEvent[]): void {
  s.status = 'finished';
  s.phase = 'finished';
  s.turn = null;
  const finished = s.cars.filter((c) => c.finishRank !== null).sort((a, b) => (a.finishRank as number) - (b.finishRank as number));
  const running = s.cars.filter(isActive).sort((a, b) => progressOf(s, b) - progressOf(s, a) || s.cars.indexOf(a) - s.cars.indexOf(b));
  // retired cars fill the bottom: the last to retire finishes best (§11)
  const out = s.cars
    .filter((c) => c.retired !== null)
    .sort((a, b) => (b.retiredRound ?? 0) - (a.retiredRound ?? 0) || (b.retiredProgress ?? 0) - (a.retiredProgress ?? 0) || s.cars.indexOf(a) - s.cars.indexOf(b));
  const results: RaceResult[] = [...finished, ...running, ...out].map((c, i) => ({
    carId: c.id,
    rank: i + 1,
    progress: progressOf(s, c),
    retired: c.retired,
    finished: c.finishRank !== null,
  }));
  s.results = results;
  events.push({ type: 'RACE_FINISHED', results });
}

// ------------------------------------------------------------- slipstream (§13)

/**
 * HYPOTHESIS (§18): the document says the other car is "behind" and that `link` is the cell "in front in
 * line". We read it as a car directly ahead of ours in the same line (its cell is our `link`), both in gear
 * 4 or more, the one ahead in a gear lower than or equal to ours. Using the slipstream adds
 * `config.slipstreamBonus` cells.
 */
export function slipstreamAvailable(s: RaceState, car: CarState): boolean {
  if (car.position === null || car.gear < 4) return false;
  const link = s.track.cells[car.position].link;
  if (!link) return false;
  const ahead = s.cars.find((c) => c !== car && c.position === link);
  return !!ahead && ahead.gear >= 4 && ahead.gear <= car.gear;
}

// ------------------------------------------------------------------ moves

/** Destinations for the current adjustments (§5). */
export function enumerateMoves(state: RaceState): MoveOption[] {
  const car = currentCar(state);
  if (!car || !state.turn || state.turn.roll === null) return [];
  return createWalker(state, car).moves(movementOf(state.config, state.turn), state.turn.brakes);
}

/** Cells the car could reach with the gear, over every face of the die and without adjustments (the preview of §1). */
export function potentialCells(state: RaceState, gear: number): Map<string, number> {
  const car = currentCar(state);
  const out = new Map<string, number>();
  if (!car || car.position === null) return out;
  const walker = createWalker(state, car);
  const rolls = new Set(state.config.dice[gear - 1].map((f) => distanceForFace(state.config, car, gear, f).roll));
  for (const roll of [...rolls].sort((a, b) => a - b)) {
    for (const o of walker.moves(roll)) if (o.playable && !out.has(o.cellId)) out.set(o.cellId, roll);
  }
  return out;
}

/** What the car can do with the roll, over every adjustment: a destination that is not the wall, or only the wall. */
function scanMoves(s: RaceState, car: CarState): { free: boolean; crash?: MoveOption } {
  const turn = s.turn;
  if (!turn || turn.roll === null) return { free: true };
  const walker = createWalker(s, car);
  const maxBrakes = turn.fixed ? 0 : Math.min(turn.roll, Math.max(0, car.wear.brakes));
  let crash: MoveOption | undefined;
  for (let b = 0; b <= maxBrakes; b++) {
    for (const boost of turn.fixed || car.wear.gearbox < 1 ? [false] : [false, true]) {
      const movement = movementOf(s.config, { roll: turn.roll, brakes: b, boost, slipstream: false });
      for (const o of walker.moves(movement, b)) {
        if (!o.playable) continue;
        if (!o.crash) return { free: true };
        crash ??= o;
      }
    }
  }
  return { free: false, crash };
}

/** True when some adjustment lets the car reach a playable destination other than the wall. */
function canMove(s: RaceState, car: CarState): boolean {
  return scanMoves(s, car).free;
}

/** The car has nowhere to go: out against the wall when the only ways left end there (§6), else blocked. */
function retireStuck(s: RaceState, car: CarState, events: GameEvent[]): void {
  if (car.retired !== null) return;
  const { crash } = scanMoves(s, car);
  if (crash?.overshoot) events.push({ type: 'WALL_CRASH', carId: car.id, corner: crash.overshoot.corner, left: crash.overshoot.left });
  retire(s, car, crash ? 'crash' : 'no-move', events);
}

function applyMove(s: RaceState, car: CarState, option: MoveOption, events: GameEvent[]): void {
  const turn = s.turn as TurnState;
  const from = car.position as string;
  // adjustments paid on arrival (§3)
  if (turn.brakes > 0) loseWear(s, car, 'brakes', turn.brakes, 'adjustment', events);
  if (turn.boost) loseWear(s, car, 'gearbox', 1, 'adjustment', events);
  // blocked by a car (bodywork) or by the end of the way (brakes, then tires): missing steps (§5)
  const blockTires = option.blocked === 'end' ? Math.max(0, option.missing - s.config.brakeLossCap) : 0;
  if (option.blocked) {
    events.push({ type: 'BLOCKED', carId: car.id, missing: option.missing, brakes: option.brakesLoss, tires: blockTires, body: option.bodyLoss, by: option.blocked });
    loseWear(s, car, 'brakes', option.brakesLoss, 'blocked', events);
    loseWear(s, car, 'tires', blockTires, 'blocked', events);
    loseWear(s, car, 'body', option.bodyLoss, 'blocked', events);
  }
  // leaving a corner zone with stops missing (§6)
  const overshootTires = option.tiresLoss - blockTires;
  if (option.overshoot) events.push({ type: 'CORNER_OVERSHOOT', carId: car.id, ...option.overshoot, tires: overshootTires });
  loseWear(s, car, 'tires', overshootTires, 'overshoot', events);
  if (option.freeUsed > 0) {
    car.freeStops -= option.freeUsed;
    events.push({ type: 'FREE_STOP_USED', carId: car.id, corner: car.cornerId ?? '', used: option.freeUsed });
  }

  // the move itself
  car.position = option.cellId;
  car.arrival = ++s.arrivals;
  events.push({ type: 'CAR_MOVED', carId: car.id, from, to: option.cellId, cells: option.movement - option.missing, missing: option.missing });
  // two stops or more missing when leaving a corner: the car hits the wall and is out (§6)
  if (option.crash && option.overshoot) {
    events.push({ type: 'WALL_CRASH', carId: car.id, corner: option.overshoot.corner, left: option.overshoot.left });
    retire(s, car, 'crash', events);
    return endTurn(s, events);
  }
  for (let i = 0; i < option.laps; i++) {
    car.laps++;
    if (car.laps < 1) continue; // crossing the line from the grid only starts the first lap
    car.stint++;
    events.push({ type: 'LAP_COMPLETED', carId: car.id, laps: car.laps });
  }
  const cell = s.track.cells[option.cellId];
  car.cornerId = cell.corner ? option.cornerId : null;
  car.cornerLeft = cell.corner ? option.cornerLeft : 0;
  // a turn that ends in the zone counts as a stop (§6)
  if (cell.corner && car.cornerLeft > 0) {
    car.cornerLeft--;
    events.push({ type: 'CORNER_STOP', carId: car.id, corner: cell.corner.id, left: car.cornerLeft });
  }
  if (car.wear.tires === 0 && !s.config.practice) {
    car.gear = 0; // tires at exactly 0: the car is stopped, in neutral (§6)
    events.push({ type: 'CAR_STOPPED', carId: car.id });
  }

  // risk cells on the way (§8)
  const raining = isRaining(s);
  for (let i = 0; i < option.risk; i++) {
    const d20 = draw(s, 20);
    const hit = d20 <= (raining ? s.config.risk.rain : s.config.risk.dry);
    events.push({ type: 'RISK_ROLL', carId: car.id, d20, hit });
    if (hit) loseWear(s, car, 'handling', 1, 'risk', events);
  }
  // contacts with the neighbours (§8)
  for (const other of s.cars) {
    if (other === car || other.position === null || !cell.side.includes(other.position)) continue;
    const d20 = draw(s, 20);
    const hit = d20 <= (raining ? s.config.contact.rain : s.config.contact.dry);
    events.push({ type: 'CONTACT', carId: car.id, other: other.id, d20, hit });
    if (!hit) continue;
    loseWear(s, other, 'body', 1, 'contact', events);
    if (!car.contacted.includes(other.id)) {
      car.contacted.push(other.id);
      loseWear(s, car, 'body', 1, 'contact', events);
    }
    checkWear(s, other, events);
  }
  // engine roll after the turn, outside the pits (§8)
  if (car.gear >= s.config.engineRoll.minGear && cell.type < CELL_PIT_LANE) {
    const d20 = draw(s, 20);
    const threshold = (raining ? s.config.engineRoll.rain : s.config.engineRoll.dry) - (car.mods.rollWearDiscount.engine ?? 0);
    const hit = d20 <= threshold;
    events.push({ type: 'ENGINE_ROLL', carId: car.id, d20, hit });
    if (hit) loseWear(s, car, 'engine', 1, 'engine roll', events);
  }
  if (checkWear(s, car, events)) return endTurn(s, events);

  // finish line (§11)
  if (car.laps >= s.config.laps) {
    car.finishRank = ++s.finishedCount;
    car.position = null;
    events.push({ type: 'CAR_FINISHED', carId: car.id, rank: car.finishRank });
    return endTurn(s, events);
  }
  // the car's own box: stop here? (§10, once per lap)
  if (cell.type === CELL_BOX_FIRST + car.team && car.pitLap !== car.laps) {
    s.phase = 'pit';
    return;
  }
  endTurn(s, events);
}

// ----------------------------------------------------------------- pit (§10)

function applyPit(s: RaceState, car: CarState, action: Extract<Action, { type: 'PIT_STOP' }>, events: GameEvent[], forcedD20?: number): string | null {
  if (!TIRE_TYPES.includes(action.tires)) return 'BAD_TIRES';
  const wanted = action.repairs ?? {};
  let total = 0;
  for (const [cat, n] of Object.entries(wanted)) {
    if (cat === 'tires' || !WEAR_CATEGORIES.includes(cat as WearCategory) || !Number.isInteger(n) || (n as number) < 0) return 'BAD_REPAIR';
    total += n as number;
  }
  if (total > car.repairLeft) return 'NOT_ENOUGH_REPAIR_POINTS';

  let spent = 0;
  for (const cat of WEAR_CATEGORIES) {
    const n = (wanted as Partial<Record<WearCategory, number>>)[cat] ?? 0;
    const gain = Math.min(n, Math.max(0, car.maxWear[cat] - car.wear[cat]));
    if (gain > 0) {
      gainWear(car, cat, gain, 'repair', events);
      spent += gain;
    }
  }
  car.repairLeft -= spent;
  gainWear(car, 'tires', Math.max(0, car.maxWear.tires - car.wear.tires), 'new tires', events);
  car.tires = action.tires;
  car.stint = 0;
  car.pitLap = car.laps;
  car.cornerId = null;
  car.cornerLeft = 0;
  if (car.gear === 0) car.gear = 1;

  if (total === 0) {
    // fast stop: a d20 below the threshold restarts at once in gear 4 (§10, hypothesis for the details)
    const d20 = forcedD20 ?? draw(s, 20);
    if (d20 < s.config.fastStopBelow) {
      const cells = Math.max(2, Math.ceil(d20 / 2));
      car.gear = 4;
      events.push({ type: 'PIT_STOP', carId: car.id, fast: true, tires: action.tires, repairs: 0, d20, restartCells: cells });
      s.turn = { carId: car.id, roll: cells, face: d20, brakes: 0, boost: false, slipstream: false, fixed: true, start: false };
      s.phase = 'adjust';
      if (!canMove(s, car)) {
        retireStuck(s, car, events);
        endTurn(s, events);
      }
      return null;
    }
    car.gear = 3;
    events.push({ type: 'PIT_STOP', carId: car.id, fast: false, tires: action.tires, repairs: 0, d20, restartCells: null });
    endTurn(s, events);
    return null;
  }
  car.gear = 3; // a long stop: the turn is lost
  events.push({ type: 'PIT_STOP', carId: car.id, fast: false, tires: action.tires, repairs: spent, d20: null, restartCells: null });
  endTurn(s, events);
  return null;
}

// ------------------------------------------------------------------ reducer

export function reducer(state: RaceState, action: Action): ReduceResult {
  return reduce(state, action);
}

/**
 * Same as reducer, but the die of a SHIFT_GEAR shows `face` instead of being drawn (the generator is left
 * untouched). For an opening turn `face` is the d20 of the start; for a fast PIT_STOP it is the d20 of the
 * stop. Used by AIs and tests ("what if the die shows N?").
 */
export function reducerWithFace(state: RaceState, action: Action, face: number): ReduceResult {
  return reduce(state, action, face);
}

function invalid(state: RaceState, action: Action, reason: string): ReduceResult {
  return { state, events: [{ type: 'INVALID_ACTION', reason, action }] };
}

function reduce(state: RaceState, action: Action, forcedFace?: number): ReduceResult {
  if (state.status === 'finished') return invalid(state, action, 'RACE_FINISHED');
  const live = currentCar(state);
  if (!live || !state.turn) return invalid(state, action, 'NO_CURRENT_CAR');
  const s = draft(state);
  const car = currentCar(s) as CarState;
  const turn = s.turn as TurnState;
  const events: GameEvent[] = [];

  switch (action.type) {
    case 'SHIFT_GEAR': {
      if (s.phase !== 'gear') return invalid(state, action, 'WRONG_PHASE');
      const gear = action.gear;
      if (!car.started ? gear !== 1 : !canShiftTo(car, gear, s.config.dice.length)) return invalid(state, action, 'GEAR_NOT_AVAILABLE');
      // pay the downshift (§3)
      const cost = downshiftCost(effectiveDrop(car, gear));
      const from = car.gear;
      if (cost.gearbox) loseWear(s, car, 'gearbox', cost.gearbox, 'downshift', events);
      if (cost.brakes) loseWear(s, car, 'brakes', cost.brakes, 'downshift', events);
      if (cost.engine) loseWear(s, car, 'engine', cost.engine, 'downshift', events);
      car.gear = gear;
      if (gear !== from) events.push({ type: 'GEAR_SHIFTED', carId: car.id, from, to: gear });

      // the die is rolled as soon as the gear is chosen (§1); the first turn is a standing start (§4)
      if (!car.started) {
        car.started = true;
        const d20 = forcedFace ?? draw(s, 20);
        if (d20 <= s.config.stall) {
          events.push({ type: 'START_ROLL', carId: car.id, d20, result: 'stall' });
          endTurn(s, events);
          return { state: s, events };
        }
        turn.start = true;
        if (d20 >= s.config.superStart) {
          events.push({ type: 'START_ROLL', carId: car.id, d20, result: 'super' });
          turn.face = d20;
          turn.roll = s.config.superStartCells;
          events.push({ type: 'DICE_ROLLED', carId: car.id, gear, face: d20, roll: turn.roll, bonus: 0 });
        } else {
          events.push({ type: 'START_ROLL', carId: car.id, d20, result: 'normal' });
          const face = drawFrom(s, s.config.dice[0]);
          const r = distanceForFace(s.config, car, 1, face);
          turn.face = face;
          turn.roll = r.roll;
          events.push({ type: 'DICE_ROLLED', carId: car.id, gear, face, roll: r.roll, bonus: r.bonus });
        }
      } else {
        const face = forcedFace ?? drawFrom(s, s.config.dice[gear - 1]);
        const r = distanceForFace(s.config, car, gear, face);
        turn.face = face;
        turn.roll = r.roll;
        events.push({ type: 'DICE_ROLLED', carId: car.id, gear, face, roll: r.roll, bonus: r.bonus });
      }
      s.phase = 'adjust';
      if (checkWear(s, car, events) || !canMove(s, car)) {
        retireStuck(s, car, events);
        endTurn(s, events);
      }
      return { state: s, events };
    }

    case 'ADJUST': {
      if (s.phase !== 'adjust' || turn.fixed) return invalid(state, action, 'WRONG_PHASE');
      const roll = turn.roll as number;
      if (!Number.isInteger(action.brakes) || action.brakes < 0 || action.brakes > Math.min(roll, car.wear.brakes)) return invalid(state, action, 'BAD_BRAKES');
      if (action.boost && car.wear.gearbox < 1) return invalid(state, action, 'NO_GEARBOX_POINT');
      if (action.slipstream && !slipstreamAvailable(s, car)) return invalid(state, action, 'NO_SLIPSTREAM');
      turn.brakes = action.brakes;
      turn.boost = action.boost;
      turn.slipstream = !!action.slipstream;
      events.push({ type: 'ADJUSTED', carId: car.id, brakes: turn.brakes, boost: turn.boost, slipstream: turn.slipstream, movement: movementOf(s.config, turn) });
      return { state: s, events };
    }

    case 'REROLL': {
      if (s.phase !== 'adjust' || turn.fixed || turn.start || car.rerolls <= 0) return invalid(state, action, 'NO_REROLL');
      car.rerolls--;
      const face = drawFrom(s, s.config.dice[car.gear - 1]);
      const r = distanceForFace(s.config, car, car.gear, face);
      turn.face = face;
      turn.roll = r.roll;
      turn.brakes = 0;
      turn.boost = false;
      turn.slipstream = false;
      events.push({ type: 'REROLLED', carId: car.id, left: car.rerolls });
      events.push({ type: 'DICE_ROLLED', carId: car.id, gear: car.gear, face, roll: r.roll, bonus: r.bonus });
      if (!canMove(s, car)) {
        retireStuck(s, car, events);
        endTurn(s, events);
      }
      return { state: s, events };
    }

    case 'MOVE_TO': {
      if (s.phase !== 'adjust') return invalid(state, action, 'WRONG_PHASE');
      const option = enumerateMoves(s).find((o) => o.cellId === action.cellId);
      if (!option) return invalid(state, action, 'NOT_AN_OPTION');
      if (!option.playable) return invalid(state, action, 'NOT_PLAYABLE');
      applyMove(s, car, option, events);
      return { state: s, events };
    }

    case 'PIT_STOP': {
      if (s.phase !== 'pit') return invalid(state, action, 'WRONG_PHASE');
      const error = applyPit(s, car, action, events, forcedFace);
      if (error) return invalid(state, action, error);
      return { state: s, events };
    }

    case 'SKIP_PIT': {
      if (s.phase !== 'pit') return invalid(state, action, 'WRONG_PHASE');
      endTurn(s, events);
      return { state: s, events };
    }

    default:
      return invalid(state, action as Action, 'UNKNOWN_ACTION');
  }
}

export { allowedGears };
