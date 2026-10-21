/**
 * Rules engine types. The rules follow docs/regles.md.
 * Section numbers (§n) in comments refer to that document.
 */

export const WEAR_CATEGORIES = ['tires', 'brakes', 'gearbox', 'body', 'engine', 'handling'] as const;
export type WearCategory = (typeof WEAR_CATEGORIES)[number];
export type Wear = Record<WearCategory, number>;

/** §7: 0 = hard, 1 = rain, 2 = soft. */
export const TIRE_TYPES = ['hard', 'rain', 'soft'] as const;
export type TireType = (typeof TIRE_TYPES)[number];

export type Weather = 'rain' | 'cloud' | 'sun';

/** Cell types of the circuit format (§15). */
export const CELL_TRACK = 0;
export const CELL_CORNER = 1;
export const CELL_PIT_LANE = 2;
/** Team boxes are types 3..7 (team index + 3). */
export const CELL_BOX_FIRST = 3;
export const CELL_BOX_LAST = 7;

export interface Corner {
  /** Consecutive cells sharing an id form one corner zone. */
  id: string;
  /** Stops required in the zone (1 to 3, §6). */
  stops: number;
}

export interface Cell {
  id: string;
  next: string[];
  /** Position along a lap: the "row" of §11, used for the order of play and the ranking. */
  row: number;
  /** 0 track, 1 corner, 2 pit lane, 3-7 team boxes. */
  type: number;
  /** Lane 0..2 on the track (3 for the pit lane). */
  lane: number;
  corner?: Corner;
  /** Advised gear by remaining stops 0..3 (used by the AIs, §6 and §14). */
  gear: [number, number, number, number];
  /** Number of risk rolls when entering the cell (§8). */
  risk: number;
  /** Neighbouring cells, for contacts (§8). */
  side: string[];
  /** Cell straight ahead in the same line, for slipstream (§13). */
  link?: string;
  /** Stepping onto this cell completes a lap. */
  startLine?: boolean;
  /** Starting grid position (0 = pole). */
  grid?: number;
}

export interface Track {
  cells: Record<string, Cell>;
  lapLength: number;
  /** Starting cells, pole position first (derived from `grid`). */
  grid: string[];
  /** Weather thresholds of the d20 (§9): below `rain` = rain, up to `sun` = cloudy, above = sun. */
  weather: { rain: number; sun: number };
}

export interface EngineConfig {
  /** Faces of the die for each gear, index 0 = gear 1 (§1). The die is drawn uniformly from the list. */
  dice: number[][];
  /** Starting points by race length, and for practice (§2). They are the base that car parts modify. */
  startPoints: { lap1: Wear; lap2: Wear; lap3: Wear; practice: Wear };
  /** Race length in laps (1 to 3 select the matching row of `startPoints`). */
  laps: number;
  /** Practice / qualifying: no wear, overshoots only add penalties (§2). */
  practice: boolean;
  /** Safety cap on the number of rounds. */
  maxRounds: number;
  startTires: TireType;
  /** 'random' draws the weather with a d20 (§9); the others fix it (tests, campaign). */
  weather: 'random' | Weather;
  /** d20 of the standing start: this value is a super start, 1 stalls (§4). */
  superStart: number;
  stall: number;
  superStartCells: number;
  /** At most this many missing cells cost brakes, the rest costs tires (§5). */
  brakeLossCap: number;
  /** Repair points a team has for the whole race (§10). */
  repairPoints: number;
  /** Fast stop: a d20 below this value restarts at once (§10). */
  fastStopBelow: number;
  /** Cells added by a slipstream (§13, hypothesis). */
  slipstreamBonus: number;
  /** d20 thresholds (the roll hits when <= value), dry / rain (§8). */
  contact: { dry: number; rain: number };
  engineRoll: { dry: number; rain: number; minGear: number };
  risk: { dry: number; rain: number };
  /** Extra tires lost on a corner overshoot in the rain, by tires worn (§7, §18 hypothesis). */
  rainOvershootExtra: { other: number; rain: number };
}

/** Per-car modifiers coming from equipped parts (see src/data/parts). The engine reads them through hooks. */
export interface CarMods {
  /** Added to the starting (and maximum) points of a category. */
  wearBonus: Partial<Record<WearCategory, number>>;
  /** Times per race the die can be rolled again after seeing the result. */
  rerolls: number;
  /** Corner stops granted for free when leaving a zone with stops missing. */
  freeStops: number;
  /** Gears not counted when downshifting several gears at once (§3). */
  downshiftDiscount: number;
  /** Tires saved when a corner overshoot costs tires (§6). */
  overshootTireDiscount: number;
  /** Brakes saved when the way is blocked (§5). */
  blockBrakeDiscount: number;
  /** Lowers the d20 threshold of the engine roll, per category (only `engine` is used, §8). */
  rollWearDiscount: Partial<Record<WearCategory, number>>;
  /** Extra cells added to the die result, for the listed gears (or all). */
  moveBonus: { gears: number[] | 'all'; amount: number }[];
}

export const NO_MODS: CarMods = {
  wearBonus: {},
  rerolls: 0,
  freeStops: 0,
  downshiftDiscount: 0,
  overshootTireDiscount: 0,
  blockBrakeDiscount: 0,
  rollWearDiscount: {},
  moveBonus: [],
};

export type DnfReason = WearCategory | 'no-move';

export interface CarState {
  id: string;
  /** Pit team 0..4: its box is cell type 3 + team (§10). */
  team: number;
  /** 0 = neutral, 1..6. */
  gear: number;
  wear: Wear;
  /** Starting points = maximum points (start points + part bonuses). */
  maxWear: Wear;
  mods: CarMods;
  rerolls: number;
  freeStops: number;
  tires: TireType;
  /** Laps finished since the last pit stop (the "relais" of §7). */
  stint: number;
  /** null once retired or finished. */
  position: string | null;
  laps: number;
  /** Stops still required in the corner zone the car is in (§6). */
  cornerLeft: number;
  cornerId: string | null;
  repairLeft: number;
  /** Lap on which the last pit stop was taken (one per lap, §10), -1 if none. */
  pitLap: number;
  /** False until the standing start has been rolled (§4). */
  started: boolean;
  /** Arrival counter: who reached its cell first (tie-break of the order of play, §11). */
  arrival: number;
  /** Ids of the neighbours that already cost this car bodywork in a contact (§8). */
  contacted: string[];
  /** Practice mode: time penalties instead of wear. */
  penalties: number;
  retired: DnfReason | null;
  retiredRound: number | null;
  retiredProgress: number | null;
  /** 1-based finishing order, once the car has completed its laps. */
  finishRank: number | null;
}

export type Phase = 'gear' | 'adjust' | 'pit' | 'finished';

export interface TurnState {
  carId: string;
  /** Distance of the die after tires and parts, before adjustments (null before the roll). */
  roll: number | null;
  /** Raw face of the die (or the d20 of a standing start). */
  face: number | null;
  /** Brakes points spent to remove cells (§3). */
  brakes: number;
  /** A gearbox point spent to add one cell (once per turn, §3). */
  boost: boolean;
  /** Slipstream used (+slipstreamBonus cells, §13). */
  slipstream: boolean;
  /** Movement imposed by a fast pit stop: no gear, no adjustments. */
  fixed: boolean;
  /** The roll was the standing-start d20 (§4): it cannot be rolled again. */
  start: boolean;
}

export interface RaceResult {
  carId: string;
  rank: number;
  progress: number;
  retired: DnfReason | null;
  finished: boolean;
}

export interface RaceState {
  config: EngineConfig;
  track: Track;
  /** Uint32 state of the seeded PRNG. */
  rng: number;
  cars: CarState[];
  round: number;
  /** Ids that already played this round (§11). */
  played: string[];
  phase: Phase;
  turn: TurnState | null;
  /** 0..4: 3-4 rain, 2 cloudy, 0-1 sun (§9). */
  wetness: number;
  /** Counts cars arriving on a cell (tie-break of the order of play). */
  arrivals: number;
  finishedCount: number;
  status: 'racing' | 'finished';
  results: RaceResult[] | null;
}

export type Action =
  /** Chooses the gear and rolls the die at once (§1). */
  | { type: 'SHIFT_GEAR'; gear: number }
  /** Sets the adjustments made after the roll (§3, §13). Replaces the previous ones. */
  | { type: 'ADJUST'; brakes: number; boost: boolean; slipstream?: boolean }
  /** Rolls the die again (a part, once per race). */
  | { type: 'REROLL' }
  /** Moves to one of the enumerated destinations (§5). */
  | { type: 'MOVE_TO'; cellId: string }
  /** At the team box: change tires, spend repair points (§10). */
  | { type: 'PIT_STOP'; tires: TireType; repairs?: Partial<Record<WearCategory, number>> }
  | { type: 'SKIP_PIT' };

export type GameEvent =
  | { type: 'ROUND_STARTED'; round: number; order: string[] }
  | { type: 'TURN_STARTED'; carId: string; round: number }
  | { type: 'WEATHER'; weather: Weather; wetness: number; d20: number | null }
  | { type: 'GEAR_SHIFTED'; carId: string; from: number; to: number }
  | { type: 'START_ROLL'; carId: string; d20: number; result: 'super' | 'stall' | 'normal' }
  | { type: 'DICE_ROLLED'; carId: string; gear: number; face: number; roll: number; bonus: number }
  | { type: 'REROLLED'; carId: string; left: number }
  | { type: 'ADJUSTED'; carId: string; brakes: number; boost: boolean; slipstream: boolean; movement: number }
  | { type: 'CAR_MOVED'; carId: string; from: string; to: string; cells: number; missing: number }
  | { type: 'BLOCKED'; carId: string; missing: number; brakes: number; tires: number }
  | { type: 'CORNER_STOP'; carId: string; corner: string; left: number }
  | { type: 'CORNER_OVERSHOOT'; carId: string; corner: string; left: number; steps: number; tires: number }
  | { type: 'FREE_STOP_USED'; carId: string; corner: string; used: number }
  | { type: 'WEAR_LOST'; carId: string; category: WearCategory; amount: number; cause: string }
  | { type: 'WEAR_GAINED'; carId: string; category: WearCategory; amount: number; cause: string }
  | { type: 'LAP_COMPLETED'; carId: string; laps: number }
  | { type: 'CONTACT'; carId: string; other: string; d20: number; hit: boolean }
  | { type: 'ENGINE_ROLL'; carId: string; d20: number; hit: boolean }
  | { type: 'RISK_ROLL'; carId: string; d20: number; hit: boolean }
  | { type: 'PIT_STOP'; carId: string; fast: boolean; tires: TireType; repairs: number; d20: number | null; restartCells: number | null }
  | { type: 'CAR_STOPPED'; carId: string }
  | { type: 'CAR_RETIRED'; carId: string; reason: DnfReason }
  | { type: 'CAR_FINISHED'; carId: string; rank: number }
  | { type: 'RACE_FINISHED'; results: RaceResult[] }
  | { type: 'INVALID_ACTION'; reason: string; action: Action };

export interface ReduceResult {
  state: RaceState;
  events: GameEvent[];
}

/** One destination offered after the roll (§5). */
export interface MoveOption {
  cellId: string;
  /** Cells of the movement this option was computed for. */
  movement: number;
  /** Steps that could not be taken (blocked or dead end). */
  missing: number;
  /** Brakes lost because of the missing steps (max 3, parts may reduce it). */
  brakesLoss: number;
  /** Tires lost: corner overshoots plus missing steps beyond the brakes cap. */
  tiresLoss: number;
  /** tiresLoss + 3 x brakesLoss, the figure the AI minimises (§14). */
  cost: number;
  laps: number;
  /** Risk rolls on the way (§8). */
  risk: number;
  freeUsed: number;
  /** The first corner zone left with stops missing on this path (§6), if any. */
  overshoot?: { corner: string; left: number; steps: number };
  /** Corner zone state at the end of the path (before the end-of-turn stop is counted). */
  cornerId: string | null;
  cornerLeft: number;
  /** False when brakes or tires would not suffice: shown greyed and not selectable (§5). */
  playable: boolean;
  reason?: 'brakes' | 'tires';
}
