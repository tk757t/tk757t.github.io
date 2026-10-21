import { runRace } from '../ai/sim';
import type { AiLevel } from '../ai/types';
import type { TrackDef } from '../data/tracks/schema';
import type { CellDef } from '../data/tracks/schema';

/** The four AIs of a test race; seats rotate from one race to the next. */
export const SIM_LINEUP: AiLevel[] = ['easy', 'medium', 'medium', 'hard'];
export const SIM_RACES = 100;
/** Real time of one turn of a human player, to turn rounds into minutes. */
export const SECONDS_PER_TURN = 6;

export interface CornerCost {
  id: string;
  stops: number;
  /** Corner exits with stops missing, over all the races. */
  overshoots: number;
  /** Tires lost on those exits. */
  tires: number;
  /** Cars retired there (after an overshoot in the corner, or stuck in it). */
  retirements: number;
  /** tires + 6 x retirements, per race: what the ranking of the costliest corners uses. */
  cost: number;
}

export interface SimReport {
  races: number;
  laps: number;
  lineup: AiLevel[];
  avgRounds: number;
  /** Estimated length of a race with as many human players, in minutes. */
  minutes: number;
  /** Retired cars over all cars. */
  retireRate: number;
  /** Races stopped by the round limit. */
  unfinished: number;
  /** Retirements by cause (worn part or 'no-move'). */
  causes: Record<string, number>;
  /** Corners, costliest first. */
  corners: CornerCost[];
}

export interface SimOptions {
  races?: number;
  laps?: number;
  lineup?: AiLevel[];
  baseSeed?: number;
}

interface Acc {
  races: number;
  rounds: number;
  cars: number;
  retired: number;
  unfinished: number;
  causes: Record<string, number>;
  corners: Map<string, CornerCost>;
}

function newAcc(def: TrackDef): Acc {
  const corners = new Map<string, CornerCost>();
  for (const c of def.cells) if (c.corner && !corners.has(c.corner.id)) corners.set(c.corner.id, { id: c.corner.id, stops: c.corner.stops, overshoots: 0, tires: 0, retirements: 0, cost: 0 });
  return { races: 0, rounds: 0, cars: 0, retired: 0, unfinished: 0, causes: {}, corners };
}

function raceInto(acc: Acc, def: TrackDef, seed: number, laps: number, lineup: AiLevel[], cells: Map<string, CellDef>): void {
  const seats = lineup.map((_, i) => lineup[(i + seed) % lineup.length]);
  const outcome = runRace(seats, seed, {
    track: def,
    laps,
    onEvents: (events, before) => {
      for (const e of events) {
        if (e.type === 'CORNER_OVERSHOOT') {
          const c = acc.corners.get(e.corner);
          if (c) {
            c.overshoots++;
            c.tires += e.tires;
          }
        } else if (e.type === 'CAR_RETIRED') {
          acc.causes[e.reason] = (acc.causes[e.reason] ?? 0) + 1;
          const overshoot = events.find((x) => x.type === 'CORNER_OVERSHOOT' && x.carId === e.carId);
          const pos = before.cars.find((c) => c.id === e.carId)?.position;
          const corner = overshoot?.type === 'CORNER_OVERSHOOT' ? overshoot.corner : pos ? cells.get(pos)?.corner?.id : undefined;
          const c = corner ? acc.corners.get(corner) : undefined;
          if (c) c.retirements++;
        }
      }
    },
  });
  acc.races++;
  acc.rounds += outcome.rounds;
  acc.cars += seats.length;
  acc.retired += outcome.retired.filter(Boolean).length;
  if (!outcome.finished) acc.unfinished++;
}

function report(acc: Acc, laps: number, lineup: AiLevel[]): SimReport {
  const avgRounds = acc.rounds / Math.max(1, acc.races);
  const corners = [...acc.corners.values()]
    .map((c) => ({ ...c, cost: (c.tires + 6 * c.retirements) / Math.max(1, acc.races) }))
    .sort((a, b) => b.cost - a.cost || a.id.localeCompare(b.id, 'fr', { numeric: true }));
  return {
    races: acc.races,
    laps,
    lineup,
    avgRounds,
    minutes: (avgRounds * lineup.length * SECONDS_PER_TURN) / 60,
    retireRate: acc.retired / Math.max(1, acc.cars),
    unfinished: acc.unfinished,
    causes: acc.causes,
    corners,
  };
}

/** Races AIs on a circuit (seeds baseSeed, baseSeed + 1...), all at once. */
export function simulateSync(def: TrackDef, o: SimOptions = {}): SimReport {
  const { races = SIM_RACES, laps = 2, lineup = SIM_LINEUP, baseSeed = 1 } = o;
  const acc = newAcc(def);
  const cells = new Map(def.cells.map((c) => [c.id, c]));
  for (let i = 0; i < races; i++) raceInto(acc, def, baseSeed + i, laps, lineup, cells);
  return report(acc, laps, lineup);
}

/** Same as simulateSync, a few races at a time so the page stays responsive; `onProgress(done, total)` after each batch. */
export async function simulate(def: TrackDef, o: SimOptions & { onProgress?: (done: number, total: number) => void; isCancelled?: () => boolean } = {}): Promise<SimReport | null> {
  const { races = SIM_RACES, laps = 2, lineup = SIM_LINEUP, baseSeed = 1 } = o;
  const acc = newAcc(def);
  const cells = new Map(def.cells.map((c) => [c.id, c]));
  for (let i = 0; i < races; i++) {
    raceInto(acc, def, baseSeed + i, laps, lineup, cells);
    if (i % 4 === 3 || i === races - 1) {
      o.onProgress?.(i + 1, races);
      await new Promise((r) => setTimeout(r, 0));
      if (o.isCancelled?.()) return null;
    }
  }
  return report(acc, laps, lineup);
}
