import type { Cell, Track } from '../../engine/types';

/**
 * Circuit data format (stored as JSON in /src/data/tracks), after §15 of docs/regles.md.
 * Coordinates are world units, y grows downwards (screen convention).
 */
export interface CellDef {
  id: string;
  x: number;
  y: number;
  /** Position along a lap, 0..lapLength-1. Parallel lanes share the same row per slot. */
  row: number;
  /** Ids of the cells a car may step onto next (several = fork / lane change / pit entry). */
  next: string[];
  /** 0 track, 1 corner, 2 pit lane, 3-7 team boxes. */
  type: number;
  /** Lane 0..2 (3 for the pit lane). */
  lane: number;
  corner?: { id: string; stops: number };
  /** Advised gear by remaining stops 0..3. */
  gear: [number, number, number, number];
  /** Risk rolls when entering the cell. */
  risk: number;
  /** Neighbouring cells for contacts. */
  side: string[];
  /** The cell straight ahead in the same line (slipstream). */
  link?: string;
  startLine?: boolean;
  /** Starting grid position, 0 = pole. */
  grid?: number;
  /** Free-form markers for the renderer. */
  tags?: string[];
  /** Direction of travel on the cell, in radians (screen convention, y down). Circuits drawn on a board only. */
  angle?: number;
  /** Circuits drawn on a board: cells left before the next corner (cells left in the zone on a corner). */
  toCorner?: number;
}

/** Version of the circuit file format written by the editor (files without `version` are version 1). */
export const TRACK_FORMAT = 1;

/** Scenery themes of the procedural background (src/render/scenery.ts). */
export const THEMES = ['desert', 'city', 'forest', 'coast', 'snow'] as const;
export type Theme = (typeof THEMES)[number];

export interface TrackDef {
  /** File format version (TRACK_FORMAT). */
  version?: number;
  id: string;
  name: string;
  /** Procedural scenery drawn under the cells (circuits without a board picture). */
  theme?: Theme;
  /** The editor document the circuit was generated from (src/editor/doc.ts), so it can be edited again. */
  editor?: unknown;
  lapLength: number;
  /** Laps the circuit is meant to be raced over (1 to 3), from the editor document. */
  laps?: number;
  /** d20 thresholds of the weather: below `rain` rain, up to `sun` cloudy, above sunny. */
  weather: { rain: number; sun: number };
  cells: CellDef[];
  /** Board picture the cells are placed on ; coordinates are then picture pixels. */
  image?: { src: string; width: number; height: number };
  /** Drawn radius of a cell, in world units (default: the oval's). */
  cellRadius?: number;
}

/** Strips the drawing data to get the track the rules engine plays on. */
export function toTrack(def: TrackDef): Track {
  const cells: Record<string, Cell> = {};
  const grid: { id: string; pos: number }[] = [];
  for (const c of def.cells) {
    const cell: Cell = { id: c.id, next: [...c.next], row: c.row, type: c.type, lane: c.lane, gear: [...c.gear] as Cell['gear'], risk: c.risk, side: [...c.side] };
    if (c.corner) cell.corner = { ...c.corner };
    if (c.link) cell.link = c.link;
    if (c.startLine) cell.startLine = true;
    if (c.grid !== undefined) {
      cell.grid = c.grid;
      grid.push({ id: c.id, pos: c.grid });
    }
    cells[c.id] = cell;
  }
  return { cells, lapLength: def.lapLength, grid: grid.sort((a, b) => a.pos - b.pos).map((g) => g.id), weather: { ...def.weather } };
}
