import { allowedGears, currentCar, progressOf } from '../engine';
import type { CarState, Cell, RaceState, Track } from '../engine';
import { lapsLeft } from './lookahead';

/** Row of the cell the car stands on. */
export const cellOf = (state: RaceState, car: CarState): Cell => state.track.cells[car.position as string];

/** Advised gear of the circuit at the car's cell, by stops left (§6, §14); one less in the rain on non-rain tires in a corner. */
export function advisedGear(state: RaceState, car: CarState): number {
  const cell = cellOf(state, car);
  const stops = car.cornerId !== null ? Math.min(3, car.cornerLeft) : 0;
  let gear = cell.gear[stops];
  if (state.wetness >= 3 && car.tires !== 'rain' && cell.corner) gear -= 1;
  return Math.max(1, gear);
}

/** The allowed gear closest to `target` without going above it, or the lowest allowed one if all are above. */
export function gearNear(state: RaceState, car: CarState, target: number): number {
  const gears = car.started ? allowedGears(car, state.config) : [1];
  const below = gears.filter((g) => g <= target);
  return below.length ? Math.max(...below) : Math.min(...gears);
}

/** Whether the car should call at the pits (§14): tires nearly gone, wrong tires for the weather, or parts nearly out. */
export function pitDue(state: RaceState, car: CarState, thorough: boolean): boolean {
  if (car.pitLap === car.laps) return false; // one stop per lap
  const remaining = lapsLeft(state, car);
  if (remaining <= 0) return false;
  const raining = state.wetness >= 3;
  const tiresLow = car.wear.tires <= 1;
  const partsLow = car.repairLeft > 0 && (car.wear.engine <= 0 || car.wear.body <= 0 || car.wear.brakes <= 0 || car.wear.gearbox <= 0);
  // the AI also stops when its tires no longer match the weather (§14)
  const wrongTires = (raining && car.tires !== 'rain') || (!raining && car.tires === 'rain');
  if (tiresLow || partsLow || wrongTires) return true;
  if (!thorough) return false;
  return car.wear.tires <= 2 && remaining >= 1 && car.stint >= 1;
}

const zoneCache = new WeakMap<Track, Map<string, number>>();

/** Cells still to cross in the corner zone after `cell` (following the first way on). */
export function cellsLeftInZone(track: Track, cell: Cell): number {
  if (!cell.corner) return 0;
  let cache = zoneCache.get(track);
  if (!cache) zoneCache.set(track, (cache = new Map()));
  const hit = cache.get(cell.id);
  if (hit !== undefined) return hit;
  let n = 0;
  for (let c = cell; ; ) {
    const next = c.next.map((id) => track.cells[id]).find((x) => x.corner?.id === cell.corner?.id && x.lane === c.lane) ?? c.next.map((id) => track.cells[id]).find((x) => x.corner?.id === cell.corner?.id);
    if (!next) break;
    n++;
    c = next;
  }
  cache.set(cell.id, n);
  return n;
}

export const progressNow = (state: RaceState): number => {
  const car = currentCar(state);
  return car ? progressOf(state, car) : 0;
};
