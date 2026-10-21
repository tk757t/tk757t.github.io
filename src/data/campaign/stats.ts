import { progressOf } from '../../engine/rules';
import type { GameEvent, RaceState } from '../../engine/types';
import { WEAR_CATEGORIES } from '../../engine/types';

/** What the third star can ask about the player's race, collected move after move. */
export interface RaceStats {
  /** Tire points lost (missed corners, blocked road), not counting what a pit stop gives back. */
  tireLoss: number;
  /** A part (tires included) fell to 0 points at some moment of the race. */
  partBroken: boolean;
  /** Cars passed by the player's own move, ending it in a corner. */
  cornerOvertakes: number;
}

export const EMPTY_STATS: RaceStats = { tireLoss: 0, partBroken: false, cornerOvertakes: 0 };

/**
 * Updates the stats of car `carId` after an action took the race from `prev` to `next` and reported `events`.
 * Pure: returns a new object.
 */
export function trackStats(stats: RaceStats, carId: string, prev: RaceState, next: RaceState, events: GameEvent[]): RaceStats {
  let { tireLoss, partBroken, cornerOvertakes } = stats;
  for (const e of events) if (e.type === 'WEAR_LOST' && e.carId === carId && e.category === 'tires') tireLoss += e.amount;
  const car = next.cars.find((c) => c.id === carId);
  if (car && car.retired === null && WEAR_CATEGORIES.some((c) => car.wear[c] <= 0)) partBroken = true;
  const moved = events.some((e) => e.type === 'CAR_MOVED' && e.carId === carId);
  const before = prev.cars.find((c) => c.id === carId);
  if (moved && car && before && car.position !== null && before.position !== null && next.track.cells[car.position].corner) {
    const was = progressOf(prev, before);
    const now = progressOf(next, car);
    for (const other of next.cars) {
      if (other.id === carId || other.position === null) continue;
      const o = prev.cars.find((c) => c.id === other.id);
      if (!o || o.position === null) continue;
      if (progressOf(prev, o) > was && progressOf(next, other) < now) cornerOvertakes++;
    }
  }
  return { tireLoss, partBroken, cornerOvertakes };
}
