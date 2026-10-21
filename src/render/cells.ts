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

export interface Pickable {
  id: string;
  x: number;
  y: number;
}

/**
 * The cell a tap at world point `p` selects. A highlighted destination within 2.1 radii wins over a nearer
 * cell that is not one (lanes are only ~1.5 cells apart); otherwise the nearest cell within 1.6 radii.
 * Scenery is never a candidate: only cells are.
 */
export function pickCell(cells: Iterable<Pickable>, marked: ReadonlySet<string>, p: { x: number; y: number }, r: number): string | null {
  let best: string | null = null;
  let bestD = r * 2.1;
  let any: string | null = null;
  let anyD = r * 1.6;
  for (const c of cells) {
    const d = Math.hypot(c.x - p.x, c.y - p.y);
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
