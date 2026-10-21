import { allowedGears, canShiftTo, createWalker, currentCar, movementOf, slipstreamAvailable, TIRE_TYPES, WEAR_CATEGORIES } from '../engine';
import type { Action, CarState, MoveOption, RaceState, TireType, Walker, WearCategory } from '../engine';

/** One way to play the roll: the adjustments and the destination they lead to. */
export interface Plan {
  brakes: number;
  boost: boolean;
  slipstream: boolean;
  option: MoveOption;
}

/** Most brakes points an AI considers spending to shorten a roll. */
const MAX_BRAKES_TRIED = 4;

/**
 * Every playable (adjustments, destination) pair for the roll in front of the active car, without the ones that end
 * in the wall unless there is nothing else. The engine guarantees there is at least one when it is the AI's turn.
 */
export function plans(state: RaceState, shared?: Walker): Plan[] {
  const car = currentCar(state);
  const turn = state.turn;
  if (!car || !turn || turn.roll === null) return [];
  const walker = shared ?? createWalker(state, car);
  const out: Plan[] = [];
  const maxB = turn.fixed ? 0 : Math.min(turn.roll, car.wear.brakes, MAX_BRAKES_TRIED);
  const boosts = turn.fixed || car.wear.gearbox < 1 ? [false] : [false, true];
  const slips = !turn.fixed && slipstreamAvailable(state, car) ? [false, true] : [false];
  for (let brakes = 0; brakes <= maxB; brakes++) {
    for (const boost of boosts) {
      for (const slipstream of slips) {
        const movement = movementOf(state.config, { roll: turn.roll, brakes, boost, slipstream });
        for (const option of walker.moves(movement, brakes)) if (option.playable) out.push({ brakes, boost, slipstream, option });
      }
    }
  }
  // the wall is never chosen while another way exists
  const safe = out.filter((p) => !p.option.crash);
  return safe.length > 0 ? safe : out;
}

/** True if the action is legal in this state (structural check, no simulation of the move itself). */
export function isLegal(state: RaceState, action: Action): boolean {
  if (state.status !== 'racing') return false;
  const car = currentCar(state);
  const turn = state.turn;
  if (!car || !turn) return false;
  switch (action.type) {
    case 'SHIFT_GEAR':
      return state.phase === 'gear' && (car.started ? canShiftTo(car, action.gear, state.config.dice.length) : action.gear === 1);
    case 'ADJUST':
      return (
        state.phase === 'adjust' &&
        !turn.fixed &&
        turn.roll !== null &&
        Number.isInteger(action.brakes) &&
        action.brakes >= 0 &&
        action.brakes <= Math.min(turn.roll, car.wear.brakes) &&
        (!action.boost || car.wear.gearbox >= 1) &&
        (!action.slipstream || slipstreamAvailable(state, car))
      );
    case 'REROLL':
      return false; // the AIs never use rerolls
    case 'MOVE_TO':
      return state.phase === 'adjust' && createWalker(state, car).moves(movementOf(state.config, turn), turn.brakes).some((o) => o.cellId === action.cellId && o.playable);
    case 'PIT_STOP': {
      if (state.phase !== 'pit' || !TIRE_TYPES.includes(action.tires)) return false;
      let total = 0;
      for (const [cat, n] of Object.entries(action.repairs ?? {})) {
        if (!WEAR_CATEGORIES.includes(cat as WearCategory) || cat === 'tires' || !Number.isInteger(n) || (n as number) < 0) return false;
        total += n as number;
      }
      return total <= car.repairLeft;
    }
    case 'SKIP_PIT':
      return state.phase === 'pit';
  }
}

/** Always-legal action for the current phase. */
export function safeAction(state: RaceState): Action {
  const car = currentCar(state);
  if (!car || !state.turn) return { type: 'SKIP_PIT' };
  if (state.phase === 'pit') return { type: 'SKIP_PIT' };
  if (state.phase === 'adjust') {
    const first = plans(state)[0];
    if (!first) return { type: 'MOVE_TO', cellId: car.position as string };
    const turn = state.turn;
    if (first.brakes !== turn.brakes || first.boost !== turn.boost || first.slipstream !== turn.slipstream) {
      return { type: 'ADJUST', brakes: first.brakes, boost: first.boost, slipstream: first.slipstream };
    }
    return { type: 'MOVE_TO', cellId: first.option.cellId };
  }
  const gears = car.started ? allowedGears(car, state.config) : [1];
  return { type: 'SHIFT_GEAR', gear: gears.includes(car.gear) ? car.gear : gears[0] };
}

/** The ADJUST (if the turn does not already have it) or MOVE_TO action that plays `plan`. */
export function playPlan(state: RaceState, plan: Plan): Action {
  const turn = state.turn;
  if (turn && (plan.brakes !== turn.brakes || plan.boost !== turn.boost || plan.slipstream !== turn.slipstream)) {
    return { type: 'ADJUST', brakes: plan.brakes, boost: plan.boost, slipstream: plan.slipstream };
  }
  return { type: 'MOVE_TO', cellId: plan.option.cellId };
}

// ---------------------------------------------------------------- pit decisions (§10, §14)

export function lapsLeft(state: RaceState, car: CarState): number {
  return Math.max(0, state.config.laps - Math.max(0, car.laps));
}

/** Tires to put on at a stop: rain tires in the rain, soft ones for a last sprint, else hard (§7, §14). */
export function chooseTires(state: RaceState, car: CarState): TireType {
  if (state.wetness >= 3) return 'rain';
  return lapsLeft(state, car) <= 1 ? 'soft' : 'hard';
}

/** Spends the repair points on the parts that are lowest: engine, then body, brakes, then gearbox and handling (§14). */
export function chooseRepairs(car: CarState): Partial<Record<WearCategory, number>> {
  const order: WearCategory[] = ['engine', 'body', 'brakes', 'gearbox', 'handling'];
  const repairs: Partial<Record<WearCategory, number>> = {};
  let left = car.repairLeft;
  // first the parts that are nearly out, then whatever is below its maximum
  for (const threshold of [1, 99]) {
    for (const cat of order) {
      if (left <= 0) break;
      const missing = car.maxWear[cat] - car.wear[cat] - (repairs[cat] ?? 0);
      if (missing > 0 && car.wear[cat] <= threshold) {
        repairs[cat] = (repairs[cat] ?? 0) + 1;
        left--;
      }
    }
  }
  return repairs;
}

export const pitAction = (state: RaceState, car: CarState, repair: boolean): Action => ({
  type: 'PIT_STOP',
  tires: chooseTires(state, car),
  repairs: repair ? chooseRepairs(car) : {},
});
