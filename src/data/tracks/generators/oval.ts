import type { CellDef, TrackDef } from '../schema';

export interface OvalOptions {
  id: string;
  name: string;
  lanes: number;
  straight: number; // cells per straight
  turn: number; // cells per half-turn
  halfStraight: number; // half length of a straight (world units)
  innerRadius: number;
  laneWidth: number;
  /** Stops of the four corners in the order of the lap (two per half-turn). */
  stops: [number, number, number, number];
  weather: { rain: number; sun: number };
}

export const OVAL_DEFAULTS: OvalOptions = {
  id: 'oval',
  name: 'Ovale de test',
  lanes: 3,
  straight: 14,
  turn: 10,
  halfStraight: 280,
  innerRadius: 120,
  laneWidth: 46,
  stops: [1, 2, 3, 1],
  weather: { rain: 7, sun: 13 },
};

/** Highest face of the die of each gear (§1), used to choose the advised gears. */
const MAX_FACE = [2, 4, 8, 12, 20, 30];

/**
 * Oval with three lanes and a pit lane. Slot s is laid out radially: lane l, slot s share the same row.
 * Order of travel on screen: bottom straight (the stands straight, start line at slot 0) left to right,
 * right turn upwards, top straight right to left, left turn downwards. The pit lane runs beside the stands
 * straight (slots 2 to 12): entry from the outer lane at slot 1, exit to it at slot 13, one box per team
 * (types 3 to 7). Lane changes are only possible at gates on straights.
 */
export function buildOval(options: Partial<OvalOptions> = {}): TrackDef {
  const o: OvalOptions = { ...OVAL_DEFAULTS, ...options };
  const total = 2 * o.straight + 2 * o.turn;
  const point = (lane: number, slot: number): { x: number; y: number } => {
    const r = o.innerRadius + lane * o.laneWidth;
    const S = o.halfStraight;
    const a = o.straight;
    const b = o.turn;
    if (slot < a) return { x: -S + ((slot + 0.5) / a) * 2 * S, y: r };
    if (slot < a + b) {
      const phi = Math.PI / 2 - (Math.PI * (slot - a + 0.5)) / b;
      return { x: S + r * Math.cos(phi), y: r * Math.sin(phi) };
    }
    if (slot < 2 * a + b) return { x: S - ((slot - a - b + 0.5) / a) * 2 * S, y: -r };
    const phi = -Math.PI / 2 - (Math.PI * (slot - 2 * a - b + 0.5)) / b;
    return { x: -S + r * Math.cos(phi), y: r * Math.sin(phi) };
  };

  // Four corners: two per half-turn (1, 2, 3 and 1 stops on the test oval).
  const h = o.turn / 2;
  const zones: { id: string; from: number; to: number; stops: number }[] = [
    { id: 'T1', from: o.straight, to: o.straight + h - 1, stops: o.stops[0] },
    { id: 'T2', from: o.straight + h, to: o.straight + o.turn - 1, stops: o.stops[1] },
    { id: 'T3', from: 2 * o.straight + o.turn, to: 2 * o.straight + o.turn + h - 1, stops: o.stops[2] },
    { id: 'T4', from: 2 * o.straight + o.turn + h, to: total - 1, stops: o.stops[3] },
  ];
  const zoneOf = (slot: number) => zones.find((z) => slot >= z.from && slot <= z.to);
  const straightSlot = (slot: number) => slot < o.straight || (slot >= o.straight + o.turn && slot < 2 * o.straight + o.turn);
  const isGate = (slot: number) => slot % 4 === 1 && !zoneOf(slot) && !zoneOf((slot + 1) % total) && straightSlot(slot);

  // pit lane: slots PIT_FROM..PIT_TO, boxes of teams 0..4 on the odd slots
  const PIT_FROM = 2;
  const PIT_TO = 12;
  const boxSlots = [3, 5, 7, 9, 11];
  const pitLaneY = o.innerRadius + (o.lanes - 1) * o.laneWidth + 52;

  const id = (lane: number, slot: number) => `L${lane}S${slot}`;
  const pid = (slot: number) => `P${slot}`;

  /** Advised gear for a track cell, by remaining stops T (§6, §14). */
  const advised = (slot: number): [number, number, number, number] => {
    const z = zoneOf(slot);
    const find = (from: number) => {
      for (let d = 1; d <= 40; d++) {
        const zz = zoneOf((from + d) % total);
        if (zz) return { d, zone: zz };
      }
      return null;
    };
    const free = (from: number): number => {
      // outside a zone (or with its stops done): the fastest gear that cannot carry the car through the next zone
      const next = find(from);
      if (!next) return 6;
      const room = next.d + (next.zone.to - next.zone.from); // cells before the end of the zone
      let g = 1;
      for (let k = 1; k <= 6; k++) if (MAX_FACE[k - 1] <= room) g = k;
      return g;
    };
    if (!z) {
      const g = free(slot);
      return [g, g, g, g];
    }
    const left = z.to - slot; // cells still inside the zone after this one
    const gears = [0, 1, 2, 3].map((t) => {
      if (t === 0) return free(slot);
      let g = 1;
      for (let k = 1; k <= 6; k++) if (MAX_FACE[k - 1] <= Math.floor(left / t)) g = k;
      return g;
    });
    return gears as [number, number, number, number];
  };

  const sideOf = (lane: number, slot: number): string[] => {
    const out: string[] = [];
    for (let dl = -1; dl <= 1; dl++) {
      for (let ds = -1; ds <= 1; ds++) {
        if (dl === 0 && ds === 0) continue;
        const l = lane + dl;
        const s = (slot + ds + total) % total;
        if (l >= 0 && l < o.lanes) out.push(id(l, s));
      }
    }
    return out;
  };

  const cells: CellDef[] = [];
  for (let slot = 0; slot < total; slot++) {
    for (let lane = 0; lane < o.lanes; lane++) {
      const { x, y } = point(lane, slot);
      const nextSlot = (slot + 1) % total;
      const next = [id(lane, nextSlot)];
      if (isGate(slot)) {
        if (lane > 0) next.push(id(lane - 1, nextSlot));
        if (lane < o.lanes - 1) next.push(id(lane + 1, nextSlot));
      }
      if (slot === PIT_FROM - 1 && lane === o.lanes - 1) next.push(pid(PIT_FROM)); // pit entry
      const z = zoneOf(slot);
      const cell: CellDef = {
        id: id(lane, slot),
        x: Math.round(x),
        y: Math.round(y),
        row: slot,
        next,
        type: z ? 1 : 0,
        lane,
        gear: advised(slot),
        risk: 0,
        side: sideOf(lane, slot),
        link: id(lane, nextSlot),
      };
      if (z) cell.corner = { id: z.id, stops: z.stops };
      if (slot === 0) cell.startLine = true;
      if (slot < o.straight) cell.tags = ['stands'];
      cells.push(cell);
    }
  }
  for (let slot = PIT_FROM; slot <= PIT_TO; slot++) {
    const team = boxSlots.indexOf(slot);
    const { x } = point(0, slot);
    const gear = advised(slot);
    cells.push({
      id: pid(slot),
      x: Math.round(x),
      y: Math.round(pitLaneY),
      row: slot,
      next: [slot < PIT_TO ? pid(slot + 1) : id(o.lanes - 1, PIT_TO + 1)], // the exit rejoins the outer lane
      type: team >= 0 ? 3 + team : 2,
      lane: 3,
      gear,
      risk: 0,
      side: [slot > PIT_FROM ? pid(slot - 1) : null, slot < PIT_TO ? pid(slot + 1) : null].filter((s): s is string => s !== null),
      ...(slot < PIT_TO ? { link: pid(slot + 1) } : {}),
      tags: team >= 0 ? ['pitlane', 'box'] : ['pitlane'],
    });
  }
  // starting grid, pole first: furthest slot, outer lane of each pair first
  const grid = [id(1, 7), id(0, 7), id(1, 5), id(0, 5)];
  grid.forEach((g, i) => {
    (cells.find((c) => c.id === g) as CellDef).grid = i;
  });
  return { id: o.id, name: o.name, lapLength: total, weather: { ...o.weather }, cells };
}
