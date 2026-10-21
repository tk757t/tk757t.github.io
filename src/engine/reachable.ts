import { enumerateMoves, potentialCells } from './reducer';
import { currentCar } from './reducer';
import type { RaceState } from './types';

/**
 * Cells to highlight for the active car: the destinations it can click after the roll (§5), or, before
 * the roll, the cells the chosen gear could reach (§1). Maps cell id -> movement that reaches it.
 */
export function reachableCells(state: RaceState, gear?: number): Map<string, number> {
  const out = new Map<string, number>();
  const car = currentCar(state);
  if (state.status !== 'racing' || !car || car.position === null) return out;
  if (state.phase === 'adjust') {
    for (const o of enumerateMoves(state)) if (o.playable) out.set(o.cellId, o.movement);
    return out;
  }
  if (state.phase === 'gear') return potentialCells(state, gear ?? car.gear);
  return out;
}
