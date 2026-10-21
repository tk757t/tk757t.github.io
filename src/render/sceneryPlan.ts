import { nextFloat } from '../engine/rng';
import type { CellDef, Theme, TrackDef } from '../data/tracks/schema';

/**
 * Procedural background of a circuit without a board picture, until the circuits get their illustrations:
 * ground of the theme, verge, asphalt between the outer lanes, white borders, red and white kerbs on corners,
 * pit lane, simplified grandstands along it, and scattered decor (cacti, buildings, trees, palms, pines).
 * This module is pure (tested); src/render/scenery.ts draws a plan with Pixi.
 */

export interface Point {
  x: number;
  y: number;
}

export type DecorKind = 'cactus' | 'rock' | 'building' | 'tree' | 'palm' | 'pine';

export interface Decor {
  kind: DecorKind;
  x: number;
  y: number;
  size: number;
  /** 0..1, for small variations of shape and shade. */
  v: number;
}

export interface Stand {
  /** Corners of the stand, in order. */
  corners: Point[];
  /** Direction of its rows of seats (along the track). */
  along: Point;
}

export interface SceneryPlan {
  theme: Theme;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Track edges for each row of the lap (left and right of the direction of travel). */
  left: Point[];
  right: Point[];
  /** Rows of the lap that are corners (kerbs). */
  cornerRows: boolean[];
  /** The pit lane as a line, from the cell before its entry to the cell after its exit. */
  pit: Point[];
  stands: Stand[];
  decor: Decor[];
  /** Coast: the sea is below this y. */
  seaFrom: number | null;
}

export interface Palette {
  ground: number;
  patch: number;
  verge: number;
  asphalt: number;
  line: number;
  decor: Partial<Record<DecorKind, number>>;
}

export const PALETTES: Record<Theme, Palette> = {
  desert: { ground: 0xd9b26f, patch: 0xc99e58, verge: 0xc49a5c, asphalt: 0x51545c, line: 0xf4f1e8, decor: { cactus: 0x3f8a4a, rock: 0x9a6b44 } },
  city: { ground: 0x7a828c, patch: 0x6e7680, verge: 0x8d949c, asphalt: 0x45494f, line: 0xffffff, decor: { building: 0x9aa5b4, tree: 0x3f7f3a } },
  forest: { ground: 0x4f8b3d, patch: 0x447e34, verge: 0x6a9a50, asphalt: 0x4b4f56, line: 0xffffff, decor: { tree: 0x2d5e27, rock: 0x7c7f78 } },
  coast: { ground: 0x79b356, patch: 0x6ca64b, verge: 0xe3cf98, asphalt: 0x4b4f56, line: 0xffffff, decor: { palm: 0x2f7a3a, rock: 0x8d8a80 } },
  snow: { ground: 0xe8eef4, patch: 0xd8e2ec, verge: 0xc9d6e2, asphalt: 0x4f545c, line: 0xffffff, decor: { pine: 0x2b5a3a, rock: 0x7d8792 } },
};

const DECOR: Record<Theme, DecorKind[]> = {
  desert: ['cactus', 'cactus', 'rock'],
  city: ['building', 'building', 'building', 'tree'],
  forest: ['tree', 'tree', 'tree', 'rock'],
  coast: ['palm', 'palm', 'rock'],
  snow: ['pine', 'pine', 'pine', 'rock'],
};

const MARGIN = 360;

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** What to draw under the cells of a circuit (null for circuits drawn on a board picture or without a theme). */
export function sceneryPlan(def: TrackDef): SceneryPlan | null {
  if (def.image || !def.theme) return null;
  const theme = def.theme;
  const r = def.cellRadius ?? 15;
  const racing = def.cells.filter((c) => c.type < 2);
  const byRow: CellDef[][] = Array.from({ length: def.lapLength }, () => []);
  for (const c of racing) byRow[c.row]?.push(c);
  const left: Point[] = [];
  const right: Point[] = [];
  const cornerRows: boolean[] = [];
  for (const cells of byRow) {
    const sorted = [...cells].sort((a, b) => a.lane - b.lane);
    const a = sorted[0];
    const b = sorted[sorted.length - 1];
    if (!a) {
      left.push(left[left.length - 1] ?? { x: 0, y: 0 });
      right.push(right[right.length - 1] ?? { x: 0, y: 0 });
      cornerRows.push(false);
      continue;
    }
    // across the track: from the first lane to the last, else perpendicular to the direction of travel
    let nx = b.x - a.x;
    let ny = b.y - a.y;
    let len = Math.hypot(nx, ny);
    if (len < 1) {
      const ang = a.angle ?? 0;
      nx = -Math.sin(ang);
      ny = Math.cos(ang);
      len = 1;
    }
    nx /= len;
    ny /= len;
    const h = r * 1.45;
    left.push({ x: a.x - nx * h, y: a.y - ny * h });
    right.push({ x: b.x + nx * h, y: b.y + ny * h });
    cornerRows.push(cells.some((c) => c.corner));
  }

  const byId = new Map(def.cells.map((c) => [c.id, c]));
  const pitCells = def.cells.filter((c) => c.type >= 2);
  const pit: Point[] = [];
  const stands: Stand[] = [];
  if (pitCells.length) {
    const entry = racing.find((c) => c.next.some((id) => (byId.get(id)?.type ?? 0) >= 2));
    let cur = entry ? byId.get(entry.next.find((id) => (byId.get(id)?.type ?? 0) >= 2) as string) : undefined;
    if (entry) pit.push({ x: entry.x, y: entry.y });
    const chain: CellDef[] = [];
    while (cur && cur.type >= 2 && chain.length <= pitCells.length) {
      chain.push(cur);
      pit.push({ x: cur.x, y: cur.y });
      cur = byId.get(cur.next[0]);
    }
    if (cur) pit.push({ x: cur.x, y: cur.y });
    // grandstands beyond the pit lane, facing it, one block every four pit cells
    for (let i = 1; i + 2 < chain.length; i += 4) {
      const a = chain[i];
      const b = chain[i + 2];
      const near = nearest(racing, a);
      let ox = a.x - near.x;
      let oy = a.y - near.y;
      const ol = Math.hypot(ox, oy) || 1;
      ox /= ol;
      oy /= ol;
      const d0 = r * 2.2;
      const d1 = r * 5;
      stands.push({
        corners: [
          { x: a.x + ox * d0, y: a.y + oy * d0 },
          { x: b.x + ox * d0, y: b.y + oy * d0 },
          { x: b.x + ox * d1, y: b.y + oy * d1 },
          { x: a.x + ox * d1, y: a.y + oy * d1 },
        ],
        along: { x: b.x - a.x, y: b.y - a.y },
      });
    }
  }

  const xs = def.cells.map((c) => c.x);
  const ys = def.cells.map((c) => c.y);
  const bounds = { minX: Math.min(...xs) - MARGIN, minY: Math.min(...ys) - MARGIN, maxX: Math.max(...xs) + MARGIN, maxY: Math.max(...ys) + MARGIN };
  const seaFrom = theme === 'coast' ? Math.max(...ys) + r * 9 : null;

  // decor: seeded scatter, kept away from the track, the pit lane and the stands
  let rng = hash(def.id + theme);
  const rand = () => {
    const [v, n] = nextFloat(rng);
    rng = n;
    return v;
  };
  const kinds = DECOR[theme];
  const decor: Decor[] = [];
  const keepOut = r * 4.2;
  const area = (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY);
  const tries = Math.min(1600, Math.round(area / (r * r * 22)));
  const obstacles: Point[] = [...def.cells, ...stands.flatMap((s) => s.corners)];
  for (let i = 0; i < tries && decor.length < 260; i++) {
    const x = bounds.minX + rand() * (bounds.maxX - bounds.minX);
    const y = bounds.minY + rand() * (bounds.maxY - bounds.minY);
    const kind = kinds[Math.floor(rand() * kinds.length)];
    const size = r * (kind === 'building' ? 2.2 + rand() * 1.6 : 0.9 + rand() * 0.9);
    const v = rand();
    if (seaFrom !== null && y > seaFrom - size) continue;
    if (obstacles.some((o) => Math.hypot(o.x - x, o.y - y) < keepOut + size)) continue;
    if (decor.some((d) => Math.hypot(d.x - x, d.y - y) < (d.size + size) * 0.9)) continue;
    decor.push({ kind, x: Math.round(x), y: Math.round(y), size: Math.round(size * 10) / 10, v: Math.round(v * 100) / 100 });
  }
  return { theme, bounds, left, right, cornerRows, pit, stands, decor, seaFrom };
}

function nearest(cells: CellDef[], p: Point): CellDef {
  let best = cells[0];
  let d = Infinity;
  for (const c of cells) {
    const e = Math.hypot(c.x - p.x, c.y - p.y);
    if (e < d) {
      d = e;
      best = c;
    }
  }
  return best;
}
