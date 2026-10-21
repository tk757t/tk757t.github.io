import type { Action, RaceState } from '../engine';
import { easy } from './easy';
import { hard } from './hard';
import { isLegal, safeAction } from './lookahead';
import { medium } from './medium';
import type { AiLevel, Rand, Strategy } from './types';

export { AI_LABELS, AI_LEVELS, type AiLevel, type Rand } from './types';
export { isLegal, plans } from './lookahead';

const STRATEGIES: Record<AiLevel, Strategy> = { easy, medium, hard };

/**
 * The AI entry point: looks at the state and returns the next action for the active car.
 * Never returns an illegal action (falls back to a safe one) and never modifies the state.
 */
export function chooseAction(level: AiLevel, state: RaceState, rand: Rand): Action {
  const action = STRATEGIES[level](state, rand);
  return isLegal(state, action) ? action : safeAction(state);
}
