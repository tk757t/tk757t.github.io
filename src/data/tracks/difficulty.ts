import type { TrackDef } from './schema';

/** Difficulty indicators of a circuit: what makes it hard to drive (used to order the campaign circuits). */
export interface Indicators {
  id: string;
  name: string;
  cells: number;
  lapLength: number;
  corners: number;
  stops: number;
  stopsList: number[];
  /** Corner cells over the cells of the racing line (pit lane excluded). */
  cornerShare: number;
  /** Corners following one another within CHICANE_GAP rows. */
  chicanes: number;
  /** Highest 3-stop corners and 2-stop corners. */
  hard: number;
  rain: number;
  sun: number;
  score: number;
}

export const CHICANE_GAP = 25;

export function indicators(def: TrackDef): Indicators {
  const zones = new Map<string, { stops: number; rows: number[] }>();
  for (const c of def.cells) {
    if (!c.corner) continue;
    const z = zones.get(c.corner.id) ?? { stops: c.corner.stops, rows: [] };
    z.rows.push(c.row);
    zones.set(c.corner.id, z);
  }
  const list = [...zones.values()].map((z) => ({ stops: z.stops, start: Math.min(...z.rows), end: Math.max(...z.rows) })).sort((a, b) => a.start - b.start);
  let chicanes = 0;
  for (let i = 0; i < list.length; i++) {
    const next = list[(i + 1) % list.length];
    const gap = (next.start - list[i].end + def.lapLength) % def.lapLength;
    if (gap < CHICANE_GAP) chicanes++;
  }
  const racing = def.cells.filter((c) => c.type < 2);
  const stops = list.reduce((a, z) => a + z.stops, 0);
  const cornerShare = racing.filter((c) => c.corner).length / racing.length;
  const hard = list.filter((z) => z.stops >= 2).length;
  // what makes a circuit hard to drive: stops to make (each one costs speed), corners to prepare, corners that come
  // in a row, and how much of the lap is spent in them
  const score = stops * 2 + list.length * 1.5 + chicanes * 2 + cornerShare * 30;
  return { id: def.id, name: def.name, cells: def.cells.length, lapLength: def.lapLength, corners: list.length, stops, stopsList: list.map((z) => z.stops), cornerShare, chicanes, hard, rain: def.weather.rain, sun: def.weather.sun, score };
}

