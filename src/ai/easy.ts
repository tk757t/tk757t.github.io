import { allowedGears, currentCar } from '../engine';
import { advisedGear } from './common';
import { plans, safeAction } from './lookahead';
import type { Strategy } from './types';

/** Easy never goes above this gear: it is clumsy, not suicidal. */
const EASY_TOP_GEAR = 3;
/** Share of the turns on which Easy ignores the advised gear of the circuit. */
const EASY_BLUNDER = 0.1;

/** Almost random: a random gear that does not exceed the advised one (most of the time), any destination, never at the pits. */
export const easy: Strategy = (state, rand) => {
  const car = currentCar(state);
  if (!car) return safeAction(state);
  if (state.phase === 'gear') {
    if (!car.started) return { type: 'SHIFT_GEAR', gear: 1 };
    const all = allowedGears(car, state.config);
    // usually a gear at or a little below the advised one, now and then anything up to the third
    const u = rand();
    const lower = u < 0.5 ? 0 : u < 0.8 ? 1 : 2;
    const limit = rand() < EASY_BLUNDER ? EASY_TOP_GEAR : Math.min(EASY_TOP_GEAR, Math.max(1, advisedGear(state, car) - lower));
    const pool = all.filter((g) => g <= limit);
    const list = pool.length ? pool : all.slice(0, 1);
    return { type: 'SHIFT_GEAR', gear: rand() < EASY_BLUNDER ? list[Math.floor(rand() * list.length)] : Math.max(...list) };
  }
  if (state.phase === 'adjust') {
    // no adjustments, unless the roll cannot be played without them
    const all = plans(state);
    const plain = all.filter((p) => p.brakes === 0 && !p.boost && !p.slipstream);
    const pool = plain.length ? plain : all;
    if (pool.length === 0) return safeAction(state);
    const pick = pool[Math.floor(rand() * pool.length)];
    const turn = state.turn!;
    if (pick.brakes !== turn.brakes || pick.boost !== turn.boost || pick.slipstream !== turn.slipstream) {
      return { type: 'ADJUST', brakes: pick.brakes, boost: pick.boost, slipstream: pick.slipstream };
    }
    return { type: 'MOVE_TO', cellId: pick.option.cellId };
  }
  return { type: 'SKIP_PIT' };
};
