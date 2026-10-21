import { COLORS } from '../ui/kit/tokens';

/**
 * How a playable cell is drawn on the board:
 * - `wear`: a corner, where tires wear if the stops are not made (orange, striped);
 * - `break`: a risk cell, whose d20 can cost Road holding and so end the race (red, crossed);
 * - `pit` / `box`: pit lane and team boxes; `neutral`: nothing special.
 */
export type CellKind = 'neutral' | 'wear' | 'break' | 'pit' | 'box';

export interface KindInput {
  type: number;
  risk: number;
  corner?: unknown;
}

export function cellKind(c: KindInput): CellKind {
  if (c.type >= 3) return 'box';
  if (c.type === 2) return 'pit';
  if (c.risk > 0) return 'break';
  if (c.corner || c.type === 1) return 'wear';
  return 'neutral';
}

const hex = (c: string) => parseInt(c.slice(1), 16);

/** Fill, ink (numbers and symbols) and edge of every kind; fill and ink come from the design tokens. */
export const CELL_STYLE: Record<CellKind, { fill: number; ink: number; edge: number }> = {
  neutral: { fill: hex(COLORS.cell), ink: hex(COLORS.cellInk), edge: 0x10151c },
  wear: { fill: hex(COLORS.wear), ink: hex(COLORS.wearInk), edge: 0x5a2a00 },
  break: { fill: hex(COLORS.crash), ink: hex(COLORS.crashInk), edge: 0x4d0d0c },
  pit: { fill: 0x2c4a66, ink: 0xffffff, edge: 0x10151c },
  box: { fill: 0x336ba8, ink: 0xffffff, edge: 0x10151c },
};

/** Outline of a rectangle of half sizes hw x hh turned by `rot`, with rounded corners (flat x,y list). */
export function roundedRectPoints(cx: number, cy: number, hw: number, hh: number, rot: number, rad: number, seg = 3): number[] {
  const r = Math.min(rad, hw, hh);
  const out: number[] = [];
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const put = (x: number, y: number) => out.push(cx + x * cos - y * sin, cy + x * sin + y * cos);
  const corners: [number, number, number][] = [
    [hw - r, -hh + r, -Math.PI / 2],
    [hw - r, hh - r, 0],
    [-hw + r, hh - r, Math.PI / 2],
    [-hw + r, -hh + r, Math.PI],
  ];
  for (const [ox, oy, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      put(ox + Math.cos(a) * r, oy + Math.sin(a) * r);
    }
  }
  return out;
}

/**
 * What a destination does to the car when it lands there, drawn as the colour of its highlight and a short label:
 * - `reach`: where the chosen gear could take it (before the roll); `free`: nothing lost;
 * - `tires` / `brakes`: points lost on the way (a corner left with a stop missing, a dead end);
 * - `body`: a car bars the way, the car stops behind it and loses bodywork; `crash`: the wall, the car is out.
 */
export type MarkKind = 'reach' | 'free' | 'tires' | 'brakes' | 'body' | 'crash';

export interface Mark {
  kind: MarkKind;
  /** Short text written on the cell, e.g. "-1 C"; none for free cells. */
  label?: string;
}

export interface Loss {
  crash: boolean;
  bodyLoss: number;
  brakesLoss: number;
  tiresLoss: number;
}

/** The mark of a playable destination; the worst consequence wins (wall, then a car in the way, then brakes, then tires). */
export function markOf(o: Loss): Mark {
  if (o.crash) return { kind: 'crash', label: 'MUR' };
  if (o.bodyLoss > 0) return { kind: 'body', label: `-${o.bodyLoss} C` };
  if (o.brakesLoss > 0) return { kind: 'brakes', label: `-${o.brakesLoss} F` };
  if (o.tiresLoss > 0) return { kind: 'tires', label: `-${o.tiresLoss} P` };
  return { kind: 'free' };
}

/** Highlight colour, ink of its label and the sentence that explains it in the message line. */
export const MARK_STYLE: Record<MarkKind, { color: number; ink: number; legend: string }> = {
  reach: { color: 0x5fdcff, ink: 0x06202b, legend: '' },
  free: { color: 0x4ade80, ink: 0x052e16, legend: 'Vert : sans perte.' },
  tires: { color: 0xffe14d, ink: 0x2b2200, legend: 'Jaune (P) : perd des pneus.' },
  brakes: { color: 0xb388ff, ink: 0x140a2e, legend: 'Violet (F) : perd des freins.' },
  body: { color: 0xff7ad9, ink: 0x33051f, legend: 'Rose (C) : une voiture barre la route, la vôtre s’arrête derrière et perd de la carrosserie.' },
  crash: { color: 0xff4d4d, ink: 0xffffff, legend: 'Rouge : le mur, la voiture abandonne.' },
};

/** Half sizes of a cell along the road (hl) and across it (hw), in world units: the cells of a lane touch each other, like the tiles of a board. */
export interface CellSize {
  hl: number;
  hw: number;
}

interface SizeInput {
  id: string;
  x: number;
  y: number;
  next: string[];
  link?: string;
  side: string[];
  lane: number;
  angle?: number;
}

/** Share of the room between two cell centres that a cell fills: what is left is the joint between two tiles. */
const FILL = 0.92;
const MIN_HALF = 0.7;
const MAX_HALF = 1.3;

/**
 * How big every cell can be drawn: half the distance to its neighbour in the lane along the road, half the distance to the
 * nearest cell of the next lane across it, both bounded to [0.7, 1.3] cell radii so that a tight bend or a lonely cell stays sensible.
 */
export function cellSizes(cells: readonly SizeInput[], r: number): Map<string, CellSize> {
  const byId = new Map(cells.map((c) => [c.id, c]));
  const prev = new Map<string, string>();
  for (const c of cells) for (const n of c.next) if (!prev.has(n) || n === c.link) prev.set(n, c.id);
  const out = new Map<string, CellSize>();
  const heading = (c: SizeInput): number => {
    if (c.angle !== undefined) return c.angle;
    const n = byId.get(c.next[0]);
    return n ? Math.atan2(n.y - c.y, n.x - c.x) : 0;
  };
  const clamp = (v: number) => Math.min(MAX_HALF * r, Math.max(MIN_HALF * r, v));
  for (const c of cells) {
    const rot = heading(c);
    const nx = -Math.sin(rot);
    const ny = Math.cos(rot);
    const along: number[] = [];
    const nextInLane = byId.get(c.link ?? c.next[0]);
    const prevInLane = byId.get(prev.get(c.id) ?? '');
    for (const o of [nextInLane, prevInLane]) if (o) along.push(Math.hypot(o.x - c.x, o.y - c.y));
    const across: number[] = [];
    for (const sid of c.side) {
      const o = byId.get(sid);
      if (!o || o.lane === c.lane) continue;
      const d = Math.abs((o.x - c.x) * nx + (o.y - c.y) * ny);
      if (d > 0.3 * r) across.push(d);
    }
    out.set(c.id, {
      hl: clamp(along.length ? (Math.min(...along) / 2) * FILL : 0.92 * r),
      hw: clamp(across.length ? (Math.min(...across) / 2) * FILL : 0.92 * r),
    });
  }
  return out;
}

export interface Pickable {
  id: string;
  x: number;
  y: number;
  /** Heading and half sizes of the cell; without them the cell is a disc of the cell radius. */
  rot?: number;
  hl?: number;
  hw?: number;
}

/**
 * The cell a tap at world point `p` selects. Distances are measured in the frame of each cell, in cell halves (1 = its edge):
 * a highlighted destination within 1.9 halves wins over a nearer cell that is not one (so a lane of 3 cells never hides a
 * destination behind its neighbour); otherwise the nearest cell within 1.5 halves. Scenery is never a candidate: only cells are.
 */
export function pickCell(cells: Iterable<Pickable>, marked: ReadonlySet<string>, p: { x: number; y: number }, r: number): string | null {
  let best: string | null = null;
  let bestD = 1.9;
  let any: string | null = null;
  let anyD = 1.5;
  for (const c of cells) {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const cos = Math.cos(c.rot ?? 0);
    const sin = Math.sin(c.rot ?? 0);
    const d = Math.max(Math.abs(dx * cos + dy * sin) / (c.hl ?? r), Math.abs(-dx * sin + dy * cos) / (c.hw ?? r));
    if (marked.has(c.id) && d < bestD) {
      best = c.id;
      bestD = d;
    }
    if (d < anyD) {
      any = c.id;
      anyD = d;
    }
  }
  return best ?? any;
}
