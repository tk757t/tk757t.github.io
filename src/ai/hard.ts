import { allowedGears, createWalker, currentCar, downshiftCost, effectiveDrop, reducerWithFace } from '../engine';
import type { CarState, RaceState, WearCategory } from '../engine';
import { advisedGear, cellOf, cellsLeftInZone, gearNear, pitDue } from './common';
import { pitAction, playPlan, plans, safeAction, type Plan } from './lookahead';
import type { Strategy } from './types';

/** What one point of each part is worth, in cells of progress (the parts are scarce: 2 to 6 points). */
const VALUE: Record<WearCategory, number> = { tires: 6, brakes: 7, gearbox: 5, body: 8, engine: 9, handling: 5 };
const RETIRE_PENALTY = 300;
const STOPPED_PENALTY = 14;
const PIT_BONUS = { lane: 18, box: 34, wander: 18 };
const BLOCK_BONUS = 1.5;
const FACE_SAMPLES = 5;
const PROGRESS_WEIGHT = 1.9;

/** Points get more precious as they run out. */
const scarcity = (rem: number, max: number) => 1 + 3 * (1 - Math.max(0, rem) / Math.max(1, max)) ** 2;
const lose = (car: CarState, cat: WearCategory, amount: number) => (amount > 0 ? amount * VALUE[cat] * scarcity(car.wear[cat], car.maxWear[cat]) : 0);

/** Value of the downshifts needed to get from `gear` down to what the next cell advises. */
function slowingCost(car: CarState, gear: number, advised: number): number {
  if (gear <= advised) return 0;
  const cost = downshiftCost(effectiveDrop({ gear, mods: car.mods }, advised));
  const affordable = (cost.gearbox === 0 || car.wear.gearbox >= 1) && (cost.brakes === 0 || car.wear.brakes >= 1) && (cost.engine === 0 || car.wear.engine >= 2);
  return lose(car, 'gearbox', cost.gearbox) + lose(car, 'brakes', cost.brakes) + lose(car, 'engine', cost.engine) + (affordable ? 0 : 40);
}

/**
 * How good a plan is: cells gained, minus the points it costs (weighted by how few are left), minus what
 * the next turn will cost if the car arrives too fast for the corner ahead, plus pit and blocking incentives.
 */
function planValue(state: RaceState, car: CarState, plan: Plan, gear: number, due: boolean): number {
  const track = state.track;
  const here = cellOf(state, car);
  const o = plan.option;
  const dest = track.cells[o.cellId];
  let v = PROGRESS_WEIGHT * (o.laps * track.lapLength + dest.row - here.row);
  v -= lose(car, 'tires', o.tiresLoss) + lose(car, 'brakes', o.brakesLoss + plan.brakes) + (plan.boost ? lose(car, 'gearbox', 1) : 0);
  if (car.wear.tires - o.tiresLoss === 0) v -= STOPPED_PENALTY; // tires at 0: the car stops in neutral
  // the engine roll of fast gears (§8)
  if (gear >= state.config.engineRoll.minGear && dest.type < 2) v -= 0.2 * lose(car, 'engine', 1);
  // arriving in the corner: stops still to make against the cells left in the zone
  if (dest.corner) {
    const stopsLeft = Math.max(0, o.cornerLeft - 1);
    if (stopsLeft > 0 && cellsLeftInZone(track, dest) < stopsLeft) v -= stopsLeft > 1 ? 3 * lose(car, 'tires', 1) * Math.max(1, car.maxWear.tires / 2) : lose(car, 'tires', 3);
    v -= slowingCost(car, gear, dest.gear[Math.min(3, stopsLeft)] - (state.wetness >= 3 && car.tires !== 'rain' ? 1 : 0));
  } else {
    v -= slowingCost(car, gear, dest.gear[0]);
  }
  // pits
  const inPit = here.type >= 2;
  if (due) {
    if (dest.type === 3 + car.team) v += PIT_BONUS.box;
    else if (dest.type >= 2) v += PIT_BONUS.lane;
  } else if (dest.type >= 2 && !inPit) v -= PIT_BONUS.wander;
  // parking in front of a rival in the same lane makes it lose brakes
  for (const rival of state.cars) {
    if (rival === car || rival.position === null) continue;
    const rc = track.cells[rival.position];
    if (rc.lane === dest.lane && dest.row - rc.row >= 1 && dest.row - rc.row <= 6) v += BLOCK_BONUS;
  }
  return v;
}

/** Faces of the die to try for a gear: evenly spread over the sorted faces, so every gear costs the same to evaluate. */
function sampleFaces(faces: number[]): number[] {
  const sorted = [...faces].sort((a, b) => a - b);
  if (sorted.length <= FACE_SAMPLES) return sorted;
  return Array.from({ length: FACE_SAMPLES }, (_, i) => sorted[Math.round((i * (sorted.length - 1)) / (FACE_SAMPLES - 1))]);
}

/**
 * Hard: for every gear it can afford near the advised one, it plays out the roll for a spread of die faces
 * (with the real rules), picks the best adjustments and destination for each, and keeps the gear with the
 * best average. Wear is priced by scarcity, being out of the race by a heavy penalty. It also decides when
 * to stop at the pits and what to repair.
 */
export const hard: Strategy = (state) => {
  const car = currentCar(state);
  if (!car || !state.turn) return safeAction(state);
  const due = pitDue(state, car, true);

  if (state.phase === 'gear') {
    if (!car.started) return { type: 'SHIFT_GEAR', gear: 1 };
    const advised = advisedGear(state, car);
    const allowed = allowedGears(car, state.config);
    const near = allowed.filter((g) => g >= advised - 2 && g <= advised + 1);
    const candidates = [...new Set([...near, gearNear(state, car, advised), ...(allowed.includes(car.gear) ? [car.gear] : [])])];
    let best = candidates[0];
    let bestValue = -Infinity;
    for (const gear of candidates) {
      const faces = sampleFaces(state.config.dice[gear - 1]);
      let walker: ReturnType<typeof createWalker> | null = null;
      let total = 0;
      for (const face of faces) {
        const r = reducerWithFace(state, { type: 'SHIFT_GEAR', gear }, face).state;
        const after = r.cars.find((c) => c.id === car.id) as CarState;
        if (after.retired !== null) {
          total -= RETIRE_PENALTY;
          continue;
        }
        walker ??= createWalker(r, after);
        const options = plans(r, walker);
        if (options.length === 0) {
          total -= RETIRE_PENALTY;
          continue;
        }
        // the cost of the downshift itself, from the points it took
        let paid = 0;
        for (const cat of ['gearbox', 'brakes', 'engine'] as const) paid += lose(car, cat, car.wear[cat] - after.wear[cat]);
        total += Math.max(...options.map((p) => planValue(r, after, p, gear, due))) - paid;
      }
      const value = total / faces.length;
      if (value > bestValue + 1e-9 || (Math.abs(value - bestValue) <= 1e-9 && gear > best)) {
        bestValue = value;
        best = gear;
      }
    }
    return { type: 'SHIFT_GEAR', gear: best };
  }

  if (state.phase === 'adjust') {
    const all = plans(state);
    if (all.length === 0) return safeAction(state);
    let best = all[0];
    let bestValue = -Infinity;
    for (const p of all) {
      const v = planValue(state, car, p, car.gear, due);
      if (v > bestValue) {
        bestValue = v;
        best = p;
      }
    }
    return playPlan(state, best);
  }

  // at the box
  return due || car.wear.engine <= 1 || car.wear.body <= 0 ? pitAction(state, car, true) : { type: 'SKIP_PIT' };
};

