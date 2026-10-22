import { DEFAULT_CONFIG } from '../engine/config';
import { TRACK_FORMAT, type CellDef, type TrackDef } from '../data/tracks/schema';
import { cloneDoc, type EditorDoc } from './doc';
import { polyline, signedArea2, slotOf, slotRange, stations, turnRadius, type Station } from './geometry';

/** Highest face of the die of each gear (§1): the advised gear is the fastest whose best roll cannot overshoot. */
const MAX_FACE = DEFAULT_CONFIG.dice.map((faces) => Math.max(...faces));

/** Fewest pit lane cells: a cell in, five boxes, a cell out. */
export const MIN_PIT = 7;
export const BOX_COUNT = 5;

/** Space between two lanes, in cell lengths. */
const LANE_SPACING = 1.05;

export type Gears = [number, number, number, number];

/** Something the generator noticed about the drawing (not a rule of the circuit format). */
export interface Warning {
  code: 'tight-turn' | 'too-close' | 'short-pit' | 'no-corner';
  message: string;
  /** Cells to highlight. */
  cells: string[];
}

export interface Generated {
  def: TrackDef;
  /** Cells per lane in a lap. */
  n: number;
  stations: Station[];
  /** Corner zone index of each slot (-1 outside), in the order of `doc.corners`. */
  zoneOfSlot: number[];
  pitSlots: number[];
  /** The advised gears computed for each cell, before the corrections made by hand. */
  autoGears: Record<string, Gears>;
  warnings: Warning[];
}

export const cellId = (lane: number, slot: number) => `L${lane}S${slot}`;
export const pitId = (slot: number) => `P${slot}`;

/** Lateral offsets of the lanes from the centre line, lane 0 on the left of the direction of travel. */
export function laneOffsets(lanes: number, cellLength: number): number[] {
  const w = cellLength * LANE_SPACING;
  return Array.from({ length: lanes }, (_, l) => (l - (lanes - 1) / 2) * w);
}

const fastestWithin = (room: number): number => {
  let g = 1;
  MAX_FACE.forEach((max, i) => {
    if (max <= room) g = i + 1;
  });
  return g;
};

/**
 * Advised gear of each slot by stops left 0..3 (§6, §14), from the distance to the next corner zone:
 * - outside a zone (or with no stop left), the fastest gear whose highest roll still stops before the end of the next zone;
 * - with T stops left in a zone, the fastest gear whose highest roll covers at most 1/T of the cells left in it.
 */
export function adviseGears(zoneOfSlot: number[]): Gears[] {
  const n = zoneOfSlot.length;
  const zoneLength = new Map<number, number>();
  for (const z of zoneOfSlot) if (z >= 0) zoneLength.set(z, (zoneLength.get(z) ?? 0) + 1);
  /** Index of slot s inside its zone's run (0 = first cell of the zone). */
  const indexInZone = zoneOfSlot.map((z, s) => {
    if (z < 0) return -1;
    let i = 0;
    while (i < n && zoneOfSlot[(s - i - 1 + n) % n] === z) i++;
    return i;
  });
  const free = (s: number): number => {
    let d = 1;
    // leave the current zone first: its stops are done
    while (d < n && zoneOfSlot[s] >= 0 && zoneOfSlot[(s + d) % n] === zoneOfSlot[s]) d++;
    for (; d <= n; d++) {
      const t = (s + d) % n;
      const z = zoneOfSlot[t];
      if (z >= 0) return fastestWithin(d + ((zoneLength.get(z) ?? 1) - 1 - indexInZone[t]));
    }
    return MAX_FACE.length;
  };
  return zoneOfSlot.map((z, s) => {
    if (z < 0) {
      const g = free(s);
      return [g, g, g, g];
    }
    const left = (zoneLength.get(z) ?? 1) - 1 - indexInZone[s];
    return [free(s), fastestWithin(left), fastestWithin(Math.floor(left / 2)), fastestWithin(Math.floor(left / 3))];
  });
}

/**
 * Turns an editor document into a circuit of the engine format: cells of each lane along the centre line,
 * forward successors (lane changes on straights only, never in a corner), side neighbours for contacts,
 * slipstream links, corner zones, chicane risk, pit lane and boxes, grid, start line and advised gears.
 */
export function generate(doc: EditorDoc): Generated {
  const { stations: st } = stations(doc.points, doc.cellLength);
  const n = st.length;
  const lanes = doc.lanes;
  const offsets = laneOffsets(lanes, doc.cellLength);
  const w = doc.cellLength * LANE_SPACING;
  // the pit lane goes on the outside of the loop
  const clockwise = signedArea2(polyline(doc.points, 12)) > 0;
  const outerSide = clockwise ? -1 : 1;
  const outerLane = clockwise ? 0 : lanes - 1;
  const warnings: Warning[] = [];

  // corner zones: later zones replace earlier ones where they overlap
  const zoneOfSlot = new Array<number>(n).fill(-1);
  doc.corners.forEach((z, k) => {
    for (const s of slotRange(slotOf(z.from, n), slotOf(z.to, n), n)) zoneOfSlot[s] = k;
  });
  const start = slotOf(doc.start, n);
  const row = (s: number) => (s - start + n) % n;
  // corners are named V1, V2... in the order of the lap from the start line
  const firstRow = new Map<number, number>();
  zoneOfSlot.forEach((z, s) => {
    if (z >= 0) firstRow.set(z, Math.min(firstRow.get(z) ?? Infinity, row(s)));
  });
  const order = [...firstRow.entries()].sort((a, b) => a[1] - b[1]).map(([z]) => z);
  const cornerName = (z: number) => `V${order.indexOf(z) + 1}`;
  if (order.length === 0) warnings.push({ code: 'no-corner', message: 'Le circuit n’a aucun virage.', cells: [] });

  const slotGears = adviseGears(zoneOfSlot);
  // rounded, without negative zeros (a circuit file must read back exactly as it was written)
  const round = (v: number) => Math.round(v) || 0;
  const at = (s: number, offset: number) => ({ x: round(st[s].x - st[s].ty * offset), y: round(st[s].y + st[s].tx * offset) });
  const angle = (s: number) => round(Math.atan2(st[s].ty, st[s].tx) * 1000) / 1000;
  const straight = (s: number) => zoneOfSlot[s] < 0;

  // pit lane
  let pitSlots: number[] = [];
  if (doc.pit) {
    pitSlots = slotRange(slotOf(doc.pit.from, n), slotOf(doc.pit.to, n), n);
    if (pitSlots.length < MIN_PIT || pitSlots.length > n - 4) {
      warnings.push({ code: 'short-pit', message: `La voie des stands doit compter de ${MIN_PIT} à ${n - 4} cases (${pitSlots.length} sélectionnées).`, cells: pitSlots.map(pitId) });
      pitSlots = [];
    }
  }
  const pitSet = new Set(pitSlots);
  let boxSlots: number[] = [];
  if (pitSlots.length) {
    const inner = pitSlots.length - 2;
    const even = Array.from({ length: BOX_COUNT }, (_, k) => pitSlots[1 + Math.floor(((k + 0.5) * inner) / BOX_COUNT)]);
    const chosen = doc.boxes?.map((f) => slotOf(f, n));
    boxSlots = chosen && new Set(chosen).size === BOX_COUNT && chosen.every((s) => pitSet.has(s)) ? chosen : even;
    boxSlots = [...boxSlots].sort((a, b) => pitSlots.indexOf(a) - pitSlots.indexOf(b));
  }

  const cells: CellDef[] = [];
  const autoGears: Record<string, Gears> = {};
  for (let s = 0; s < n; s++) {
    const next = (s + 1) % n;
    for (let lane = 0; lane < lanes; lane++) {
      const nexts = [cellId(lane, next)];
      // lane changes between two straight cells only (§5)
      if (straight(s) && straight(next)) {
        if (lane > 0) nexts.push(cellId(lane - 1, next));
        if (lane < lanes - 1) nexts.push(cellId(lane + 1, next));
      }
      if (pitSlots.length && lane === outerLane && next === pitSlots[0]) nexts.push(pitId(next));
      const side: string[] = [];
      for (let dl = -1; dl <= 1; dl++) {
        for (let ds = -1; ds <= 1; ds++) {
          const l = lane + dl;
          if ((dl || ds) && l >= 0 && l < lanes) side.push(cellId(l, (s + ds + n) % n));
        }
      }
      const z = zoneOfSlot[s];
      const id = cellId(lane, s);
      const cell: CellDef = {
        id,
        ...at(s, offsets[lane]),
        row: row(s),
        next: nexts,
        type: z >= 0 ? 1 : 0,
        lane,
        gear: [...slotGears[s]] as Gears,
        // a chicane has its risk cells (kerbs) at the entry and the exit of the zone
        risk: z >= 0 && (zoneOfSlot[(s - 1 + n) % n] !== z || zoneOfSlot[next] !== z) ? doc.corners[z].risk : 0,
        side,
        link: cellId(lane, next),
        angle: angle(s),
      };
      if (z >= 0) cell.corner = { id: cornerName(z), stops: doc.corners[z].stops };
      if (s === start) cell.startLine = true;
      if (pitSet.has(s)) cell.tags = ['stands'];
      autoGears[id] = [...slotGears[s]] as Gears;
      cells.push(cell);
    }
  }
  pitSlots.forEach((s, i) => {
    const last = i === pitSlots.length - 1;
    const box = boxSlots.indexOf(s);
    const offset = outerSide * (Math.abs(offsets[outerLane]) + w * 1.25);
    const id = pitId(s);
    cells.push({
      id,
      ...at(s, offset),
      row: row(s),
      next: [last ? cellId(outerLane, (s + 1) % n) : pitId(pitSlots[i + 1])],
      type: box >= 0 ? 3 + box : 2,
      lane: 3,
      gear: [...slotGears[s]] as Gears,
      risk: 0,
      side: [i > 0 ? pitId(pitSlots[i - 1]) : null, last ? null : pitId(pitSlots[i + 1])].filter((x): x is string => x !== null),
      ...(last ? {} : { link: pitId(pitSlots[i + 1]) }),
      angle: angle(s),
      tags: box >= 0 ? ['pitlane', 'box'] : ['pitlane'],
    });
    autoGears[id] = [...slotGears[s]] as Gears;
  });

  // grid: staggered backwards from the pole, alternating the two outer lanes
  const pole = slotOf(doc.grid.pole, n);
  const byId = new Map(cells.map((c) => [c.id, c]));
  for (let i = 0; i < doc.grid.size; i++) {
    const c = byId.get(cellId(i % 2 === 0 ? 0 : lanes - 1, (pole - i + n) % n));
    if (c) c.grid = i;
  }
  // corrections made by hand
  for (const [id, g] of Object.entries(doc.gears)) {
    const c = byId.get(id);
    if (c) c.gear = [...g] as Gears;
  }

  warnings.push(...geometryWarnings(st, offsets, cells, doc.cellLength));
  const def: TrackDef = {
    version: TRACK_FORMAT,
    id: doc.id,
    name: doc.name,
    theme: doc.theme,
    lapLength: n,
    ...(doc.laps !== undefined ? { laps: doc.laps } : {}),
    weather: { ...doc.weather },
    cellRadius: Math.round(doc.cellLength * 0.375 * 10) / 10,
    cells,
    editor: cloneDoc(doc),
  };
  return { def, n, stations: st, zoneOfSlot, pitSlots, autoGears, warnings };
}

/** Turns too tight for the inner lane, and parts of the circuit drawn on top of each other. */
function geometryWarnings(st: Station[], offsets: number[], cells: CellDef[], cellLength: number): Warning[] {
  const out: Warning[] = [];
  const n = st.length;
  const half = Math.max(...offsets.map(Math.abs)) + cellLength * 0.5;
  const tight: number[] = [];
  for (let s = 0; s < n; s++) {
    const r = Math.abs(turnRadius(st[(s - 1 + n) % n], st[s], st[(s + 1) % n]));
    if (r < half + cellLength * 0.25) tight.push(s);
  }
  if (tight.length) {
    out.push({
      code: 'tight-turn',
      message: `Virage trop serré pour ${offsets.length} voies (${tight.length} case${tight.length > 1 ? 's' : ''}) : les cases intérieures se chevauchent. Écartez les points.`,
      cells: tight.map((s) => cellId(0, s)),
    });
  }
  // cells of distant parts of the lap closer than a cell: the line crosses or touches itself
  const minGap = cellLength * 0.8;
  const slot = (c: CellDef) => (c.lane === 3 ? Number(c.id.slice(1)) : Number(c.id.split('S')[1]));
  const close = new Set<string>();
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const a = cells[i];
      const b = cells[j];
      const ds = Math.abs(slot(a) - slot(b));
      if (Math.min(ds, n - ds) <= 3) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) < minGap) {
        close.add(a.id);
        close.add(b.id);
      }
    }
  }
  if (close.size) out.push({ code: 'too-close', message: 'Le tracé se croise ou passe trop près de lui-même.', cells: [...close] });
  return out;
}
