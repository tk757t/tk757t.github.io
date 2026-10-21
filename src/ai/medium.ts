import { allowedGears, currentCar, potentialCells } from '../engine';
import type { CarState, RaceState } from '../engine';
import { advisedGear, gearNear, pitDue } from './common';
import { pitAction, playPlan, plans, safeAction, type Plan } from './lookahead';
import type { Strategy } from './types';

/**
 * With the gearbox out of points a car can only shed one gear per turn (§3), so it has to slow down early: the
 * highest gear (not above `target`) from which every cell it can reach still lets it match the advised gear of that
 * cell one gear at a time. The AI "only downshifts what the state of the car allows" (§14).
 */
function cautiousGear(state: RaceState, car: CarState, target: number): number {
  const base = gearNear(state, car, target);
  if (!car.started || car.wear.gearbox >= 1) return base;
  const gears = allowedGears(car, state.config).filter((g) => g <= base).sort((a, b) => b - a);
  for (const g of gears) {
    let safe = true;
    for (const id of potentialCells(state, g).keys()) {
      const cell = state.track.cells[id];
      const advised = cell.corner ? cell.gear[Math.min(3, cell.corner.stops)] : cell.gear[0];
      if (g - 1 > advised) {
        safe = false;
        break;
      }
    }
    if (safe) return g;
  }
  return Math.min(...allowedGears(car, state.config));
}

/**
 * Medium plays the AI of §14: it aims for the circuit's advised gear, picks the
 * destination that loses the fewest tires (and three times as much for brakes), and stops at the pits when
 * its tires or parts are nearly gone. It does not weigh wear against speed, does not block anyone.
 */
export const medium: Strategy = (state) => {
  const car = currentCar(state);
  if (!car || !state.turn) return safeAction(state);

  if (state.phase === 'gear') {
    return { type: 'SHIFT_GEAR', gear: cautiousGear(state, car, car.started ? advisedGear(state, car) : 1) };
  }

  if (state.phase === 'adjust') {
    const all = plans(state);
    if (all.length === 0) return safeAction(state);
    const due = pitDue(state, car, false);
    const cells = state.track.cells;
    // lower is better: the loss of §14, plus what the adjustments cost, plus pit lane manners
    const score = (p: Plan): number => {
      const dest = cells[p.option.cellId];
      let s = p.option.cost + 3 * p.brakes + (p.boost ? 2 : 0);
      if (due) s -= dest.type === 3 + car.team ? 6 : dest.type >= 2 ? 3 : 0;
      else if (dest.type >= 2 && cells[car.position as string].type < 2) s += 8; // do not wander into the pit lane
      return s;
    };
    const far = (p: Plan) => p.option.laps * state.track.lapLength + cells[p.option.cellId].row;
    all.sort((a, b) => score(a) - score(b) || far(b) - far(a));
    return playPlan(state, all[0]);
  }

  // at the box: stop if the car needs it
  return pitDue(state, car, false) ? pitAction(state, car, true) : { type: 'SKIP_PIT' };
};
