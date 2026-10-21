import { startPointsFor } from './config';
import type { CarState, EngineConfig, RaceState, TireType, Weather } from './types';

// ---------------------------------------------------------------- weather (§9)

/** 3-4 = rain, 2 = cloudy, 0-1 = sun. */
export const weatherOf = (wetness: number): Weather => (wetness >= 3 ? 'rain' : wetness === 2 ? 'cloud' : 'sun');

export const isRaining = (state: Pick<RaceState, 'wetness'>): boolean => state.wetness >= 3;

/** Weather drawn by a d20 with the circuit thresholds (§9): below `rain` rain, up to `sun` cloudy, above sunny. */
export function weatherFromD20(d20: number, thresholds: { rain: number; sun: number }): Weather {
  return d20 < thresholds.rain ? 'rain' : d20 <= thresholds.sun ? 'cloud' : 'sun';
}

/** Initial wetness for a weather (hypothesis, §18: the document only says the state moves by steps). */
export const wetnessFor = (w: Weather): number => (w === 'rain' ? 4 : w === 'cloud' ? 2 : 0);

/** Moves the wetness one step towards the weather drawn this round (§9, hypothesis for the exact stepping). */
export function driftWetness(wetness: number, target: Weather): number {
  const goal = target === 'rain' ? 4 : target === 'cloud' ? 2 : 0;
  return wetness + Math.sign(goal - wetness);
}

// ------------------------------------------------------------------- tires (§7)

/** Wear factor of the tires in a corner overshoot: soft x2 (x3 from the 3rd lap of the stint), rain tires on a dry track x2, hard x1. */
export function tireFactor(car: Pick<CarState, 'tires' | 'stint'>, raining: boolean): number {
  if (car.tires === 'soft') return car.stint + 1 >= 3 ? 3 : 2;
  if (car.tires === 'rain' && !raining) return 2;
  return 1;
}

/** Extra tires lost on a corner overshoot in the rain (§7, hypothesis): 3 on other tires, 1 on rain tires. */
export function rainExtra(config: EngineConfig, tires: TireType, raining: boolean): number {
  if (!raining) return 0;
  return tires === 'rain' ? config.rainOvershootExtra.rain : config.rainOvershootExtra.other;
}

// ------------------------------------------------------------------- gears (§3)

/** Gears counted for the cost of a downshift once part discounts are applied. */
export const effectiveDrop = (car: Pick<CarState, 'gear' | 'mods'>, target: number): number => Math.max(0, car.gear - target - car.mods.downshiftDiscount);

/** Points a downshift costs: 2 gears -1 gearbox, 3 -> + 1 brakes, 4 or more -> + 1 engine (§3). */
export function downshiftCost(drop: number): { gearbox: number; brakes: number; engine: number } {
  return { gearbox: drop >= 2 ? 1 : 0, brakes: drop >= 3 ? 1 : 0, engine: drop >= 4 ? 1 : 0 };
}

/** Whether the car can pay for the gear (§3): gearbox >= 1 for 2 down, brakes >= 1 for 3, engine >= 2 for 4+. */
export function canShiftTo(car: CarState, gear: number, gearCount: number): boolean {
  if (!Number.isInteger(gear) || gear < 1 || gear > gearCount) return false;
  if (gear > car.gear + 1) return false;
  const cost = downshiftCost(effectiveDrop(car, gear));
  if (cost.gearbox > 0 && car.wear.gearbox < 1) return false;
  if (cost.brakes > 0 && car.wear.brakes < 1) return false;
  if (cost.engine > 0 && car.wear.engine < 2) return false;
  return true;
}

export function allowedGears(car: CarState, config: EngineConfig): number[] {
  const out: number[] = [];
  for (let g = 1; g <= config.dice.length; g++) if (canShiftTo(car, g, config.dice.length)) out.push(g);
  return out;
}

// -------------------------------------------------------------------- dice (§1, §7)

/**
 * Distance rolled for a raw face: soft tires add 1 to the maximum face during the first two laps of the
 * stint and take 1 off during the third and later ones (§7, hypothesis for how a die maximum moves), then
 * parts add their bonus.
 */
export function distanceForFace(config: EngineConfig, car: CarState, gear: number, face: number): { roll: number; bonus: number } {
  const faces = config.dice[gear - 1];
  const max = Math.max(...faces);
  let roll = face;
  if (car.tires === 'soft') roll = car.stint + 1 <= 2 ? (face === max ? face + 1 : face) : Math.max(1, face - 1);
  let bonus = 0;
  for (const b of car.mods.moveBonus) if (b.gears === 'all' || b.gears.includes(gear)) bonus += b.amount;
  return { roll: Math.max(1, roll + bonus), bonus };
}

/** Smallest and largest distance a gear can give this car, for the preview before the roll (§1). */
export function distanceRange(config: EngineConfig, car: CarState, gear: number): { min: number; max: number } {
  const rolls = config.dice[gear - 1].map((f) => distanceForFace(config, car, gear, f).roll);
  return { min: Math.min(...rolls), max: Math.max(...rolls) };
}

// --------------------------------------------------------------------- misc

export const startWear = (config: EngineConfig) => startPointsFor(config);

/** Cells of movement after the player's adjustments (§3, §13). */
export function movementOf(config: EngineConfig, turn: { roll: number | null; brakes: number; boost: boolean; slipstream: boolean }): number {
  if (turn.roll === null) return 0;
  return Math.max(0, turn.roll - turn.brakes + (turn.boost ? 1 : 0) + (turn.slipstream ? config.slipstreamBonus : 0));
}

export const progressOf = (state: Pick<RaceState, 'track'>, car: CarState): number => {
  if (car.position === null) return car.retiredProgress ?? car.laps * state.track.lapLength;
  return car.laps * state.track.lapLength + state.track.cells[car.position].row;
};
