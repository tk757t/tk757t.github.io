import { THEMES, type Theme } from '../data/tracks/schema';

/** Version of the editor document (stored in the `editor` field of a circuit file). */
export const EDITOR_VERSION = 1;

export const THEME_LABELS: Record<Theme, string> = { desert: 'Désert', city: 'Ville', forest: 'Forêt', coast: 'Côte', snow: 'Neige' };

/** A point of the centre line. The handle (hx, hy) is the outgoing tangent; the incoming one is its opposite (smooth curve). */
export interface ControlPoint {
  x: number;
  y: number;
  hx: number;
  hy: number;
}

/**
 * Positions along the lap are fractions of the centre line (0 = first control point), so zones survive edits that
 * change the number of cells. A range runs forward from `from` to `to` (it may wrap past 0).
 */
export interface CornerZone {
  from: number;
  to: number;
  stops: number;
  /** Risk rolls of the cells at the entry and the exit of the zone: > 0 makes it a chicane (§8). */
  risk: number;
}

export interface EditorDoc {
  version: number;
  id: string;
  name: string;
  /** 2 or 3 lanes. */
  lanes: number;
  /** Distance between two cells along the centre line, in world units. */
  cellLength: number;
  theme: Theme;
  weather: { rain: number; sun: number };
  /** Closed loop, in the direction of travel. */
  points: ControlPoint[];
  corners: CornerZone[];
  pit: { from: number; to: number } | null;
  /** Fractions of the team boxes (5, in the pit lane); null = spread evenly along it. */
  boxes: number[] | null;
  /** Start / finish line. */
  start: number;
  /** Pole position and number of grid slots, staggered backwards from the pole. */
  grid: { pole: number; size: number };
  /** Advised gears corrected by hand, by cell id. */
  gears: Record<string, [number, number, number, number]>;
  /** Laps the circuit is meant to be raced over (1 to 3): the random draw of the ranked and unranked queues uses it, and the setup screen starts from it. */
  laps?: number;
}

export const CELL_LENGTH = { min: 30, max: 60, default: 40 };
export const GRID_SIZE = { min: 4, max: 6, default: 5 };
export const LAPS = { min: 1, max: 3 };

/** A new circuit: a stadium (two straights, two half circles) without corners or pit lane, ready to be shaped. */
export function newDoc(id = 'nouveau', name = 'Nouveau circuit'): EditorDoc {
  const s = 450; // half length of the straights
  const r = 280; // radius of the ends
  const k = r * 0.5523; // Bézier handle of a quarter circle
  return {
    version: EDITOR_VERSION,
    id,
    name,
    lanes: 3,
    cellLength: CELL_LENGTH.default,
    theme: 'forest',
    weather: { rain: 7, sun: 13 },
    points: [
      { x: -s, y: r, hx: k, hy: 0 },
      { x: s, y: r, hx: k, hy: 0 },
      { x: s + r, y: 0, hx: 0, hy: -k },
      { x: s, y: -r, hx: -k, hy: 0 },
      { x: -s, y: -r, hx: -k, hy: 0 },
      { x: -s - r, y: 0, hx: 0, hy: k },
    ],
    corners: [],
    pit: null,
    boxes: null,
    start: 0.05,
    grid: { pole: 0.03, size: GRID_SIZE.default },
    gears: {},
  };
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown, fallback: number) => (typeof x === 'number' && Number.isFinite(x) ? x : fallback);
const frac = (x: unknown, fallback = 0) => {
  const v = num(x, fallback);
  return v >= 0 && v < 1 ? v : ((v % 1) + 1) % 1;
};
const clampInt = (x: unknown, min: number, max: number, fallback: number) => Math.min(max, Math.max(min, Math.round(num(x, fallback))));

/** Reads an editor document from unknown data (an imported file); throws with a readable message when it cannot. */
export function parseDoc(raw: unknown): EditorDoc {
  if (!isRecord(raw)) throw new Error('document de l’éditeur illisible');
  const version = num(raw.version, 1);
  if (version > EDITOR_VERSION) throw new Error(`document créé par une version plus récente de l’éditeur (${version})`);
  const points = Array.isArray(raw.points) ? raw.points.filter(isRecord).map((p) => ({ x: num(p.x, 0), y: num(p.y, 0), hx: num(p.hx, 0), hy: num(p.hy, 0) })) : [];
  if (points.length < 3) throw new Error('le tracé doit avoir au moins 3 points');
  const fresh = newDoc();
  const pit = isRecord(raw.pit) ? { from: frac(raw.pit.from), to: frac(raw.pit.to) } : null;
  const grid = isRecord(raw.grid) ? raw.grid : {};
  const weather = isRecord(raw.weather) ? raw.weather : {};
  const gears: EditorDoc['gears'] = {};
  if (isRecord(raw.gears)) {
    for (const [id, g] of Object.entries(raw.gears)) {
      if (Array.isArray(g) && g.length === 4) gears[id] = g.map((v) => clampInt(v, 1, 6, 1)) as [number, number, number, number];
    }
  }
  return {
    version: EDITOR_VERSION,
    id: typeof raw.id === 'string' && /^[a-z0-9-]{1,40}$/.test(raw.id) ? raw.id : fresh.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 60) : fresh.name,
    lanes: raw.lanes === 2 ? 2 : 3,
    cellLength: clampInt(raw.cellLength, CELL_LENGTH.min, CELL_LENGTH.max, CELL_LENGTH.default),
    theme: THEMES.includes(raw.theme as Theme) ? (raw.theme as Theme) : fresh.theme,
    weather: { rain: clampInt(weather.rain, 1, 19, 7), sun: clampInt(weather.sun, 2, 20, 13) },
    points,
    corners: Array.isArray(raw.corners)
      ? raw.corners.filter(isRecord).map((z) => ({ from: frac(z.from), to: frac(z.to), stops: clampInt(z.stops, 1, 3, 1), risk: clampInt(z.risk, 0, 3, 0) }))
      : [],
    pit,
    boxes: Array.isArray(raw.boxes) && raw.boxes.length === 5 ? raw.boxes.map((b) => frac(b)) : null,
    start: frac(raw.start, fresh.start),
    grid: { pole: frac(grid.pole, fresh.grid.pole), size: clampInt(grid.size, GRID_SIZE.min, GRID_SIZE.max, GRID_SIZE.default) },
    gears,
    ...(typeof raw.laps === 'number' ? { laps: clampInt(raw.laps, LAPS.min, LAPS.max, LAPS.min) } : {}),
  };
}

export const cloneDoc = (d: EditorDoc): EditorDoc => JSON.parse(JSON.stringify(d)) as EditorDoc;
