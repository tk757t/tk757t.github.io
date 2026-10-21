import type { CellDef, TrackDef } from './schema';

/** Two cells closer than this are the same cell drawn twice (circuits drawn on a board pack cells of 3 lanes tightly). */
const MIN_CELL_SPACING = 3;

function reach(starts: string[], edges: Map<string, string[]>): Set<string> {
  const seen = new Set<string>(starts);
  const queue = [...starts];
  while (queue.length) {
    const id = queue.pop() as string;
    for (const n of edges.get(id) ?? []) {
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen;
}

/** Returns every structural problem found in a circuit definition (empty = valid). */
export function validateTrackDef(def: TrackDef): string[] {
  const p: string[] = [];
  if (def.cells.length === 0) return ['track has no cells'];

  const byId = new Map<string, CellDef>();
  for (const c of def.cells) {
    if (byId.has(c.id)) p.push(`duplicate cell id ${c.id}`);
    byId.set(c.id, c);
  }

  const out = new Map<string, string[]>();
  const inn = new Map<string, string[]>();
  const undirected = new Map<string, string[]>();
  const link = (m: Map<string, string[]>, a: string, b: string) => m.set(a, [...(m.get(a) ?? []), b]);

  if (!(def.weather.rain >= 1 && def.weather.rain < def.weather.sun && def.weather.sun <= 20)) p.push('weather thresholds must satisfy 1 <= rain < sun <= 20');
  if (!Number.isInteger(def.lapLength) || def.lapLength <= 0) p.push('lapLength must be a positive integer');

  for (const c of def.cells) {
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) p.push(`cell ${c.id} has invalid coordinates`);
    if (!Number.isInteger(c.row) || c.row < 0 || c.row >= def.lapLength) p.push(`cell ${c.id} row ${c.row} outside 0..${def.lapLength - 1}`);
    if (!Number.isInteger(c.type) || c.type < 0 || c.type > 7) p.push(`cell ${c.id} has invalid type ${c.type}`);
    if ((c.type === 1) !== (c.corner !== undefined)) p.push(`cell ${c.id}: type ${c.type} does not match its corner data`);
    if (!(c.lane >= 0 && c.lane <= 3) || (c.type >= 2 && c.lane !== 3)) p.push(`cell ${c.id}: lane ${c.lane} does not fit type ${c.type}`);
    if (c.gear.length !== 4 || c.gear.some((g) => !Number.isInteger(g) || g < 1 || g > 6)) p.push(`cell ${c.id} has invalid advised gears`);
    if (!Number.isInteger(c.risk) || c.risk < 0) p.push(`cell ${c.id} has invalid risk`);
    if (new Set(c.next).size !== c.next.length) p.push(`cell ${c.id} lists a successor twice`);
    if (c.link && !byId.has(c.link)) p.push(`cell ${c.id} links to unknown cell ${c.link}`);
    for (const n of c.next) {
      const target = byId.get(n);
      if (!target) {
        p.push(`cell ${c.id} points to unknown cell ${n}`);
        continue;
      }
      if (n === c.id) p.push(`cell ${c.id} points to itself`);
      // Rows only have to run forward along an edge. Circuits drawn on a board may number the pit straight apart from the track
      // (the track rows jump over it) and the box alcoves step one row back, so the jump is bounded, not fixed.
      const forward = (target.row - c.row + def.lapLength) % def.lapLength;
      const alcove = (c.type >= 2 || target.type >= 2) && forward === def.lapLength - 1;
      const sidestep = forward === 0 && c.lane !== target.lane; // changing lane costs a step without going forward
      if (!alcove && !sidestep && (forward < 1 || forward > def.lapLength / 4)) p.push(`edge ${c.id}->${n} goes from row ${c.row} to row ${target.row}`);
      link(out, c.id, n);
      link(inn, n, c.id);
      link(undirected, c.id, n);
      link(undirected, n, c.id);
    }
    for (const s of c.side) {
      const other = byId.get(s);
      if (!other) p.push(`cell ${c.id} has unknown neighbour ${s}`);
      else if (!other.side.includes(c.id)) p.push(`neighbour ${c.id}->${s} is not symmetric`);
    }
  }

  // Overlapping cells would be unplayable and unreadable.
  for (let i = 0; i < def.cells.length; i++) {
    for (let j = i + 1; j < def.cells.length; j++) {
      const a = def.cells[i];
      const b = def.cells[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < MIN_CELL_SPACING) p.push(`cells ${a.id} and ${b.id} overlap`);
    }
  }

  // Orphans: no connection at all, or nothing leading to / out of the cell.
  for (const c of def.cells) {
    const hasIn = (inn.get(c.id) ?? []).length > 0;
    const hasOut = (out.get(c.id) ?? []).length > 0;
    if (!hasIn && !hasOut) p.push(`cell ${c.id} is orphaned`);
    else if (!hasIn) p.push(`cell ${c.id} has no predecessor`);
    else if (!hasOut) p.push(`cell ${c.id} is a dead end`);
  }

  const all = def.cells.map((c) => c.id);
  const weak = reach([def.cells[0].id], undirected);
  for (const id of all) if (!weak.has(id)) p.push(`cell ${id} is not connected to the rest of the track`);

  // Grid: indices 0..n-1, each once.
  const gridCells = def.cells.filter((c) => c.grid !== undefined).sort((a, b) => (a.grid as number) - (b.grid as number));
  if (gridCells.length === 0) p.push('grid is empty');
  gridCells.forEach((c, i) => {
    if (c.grid !== i) p.push(`grid positions must be 0..${gridCells.length - 1} without gaps or repeats (cell ${c.id} has ${c.grid})`);
  });

  // Finish line.
  const lines = def.cells.filter((c) => c.startLine).map((c) => c.id);
  if (lines.length === 0) p.push('no start/finish line');
  if (lines.length > 0) {
    if (lines.some((id) => (byId.get(id) as CellDef).row !== 0)) p.push('start line cells must have row 0');
    const fromGrid = reach(gridCells.map((c) => c.id), out);
    for (const id of all) if (!fromGrid.has(id)) p.push(`cell ${id} cannot be reached from the grid`);
    if (!lines.some((id) => fromGrid.has(id))) p.push('finish line is not reachable from the grid');
    const toLine = reach(lines, inn);
    for (const id of all) if (!toLine.has(id)) p.push(`finish line is not reachable from cell ${id}`);
  }

  // Pit lane: boxes are types 3-7 (one cell per team), with a way in and a way out.
  const pit = def.cells.filter((c) => c.type >= 2);
  if (pit.length > 0) {
    const boxes = pit.filter((c) => c.type >= 3);
    const types = boxes.map((c) => c.type);
    // a box may be two cells of the same team type (the oval has one)
    if ([...new Set(types)].some((ty) => types.filter((x) => x === ty).length > 2)) p.push('more than two box cells share the same team type');
    if (boxes.length === 0) p.push('the pit lane has no box');
    const enters = def.cells.some((c) => c.type < 2 && c.next.some((n) => (byId.get(n)?.type ?? 0) >= 2));
    const exits = pit.some((c) => c.next.some((n) => (byId.get(n)?.type ?? 2) < 2));
    if (!enters) p.push('no way into the pit lane');
    if (!exits) p.push('no way out of the pit lane');
  }

  // Corners.
  const zones = new Map<string, CellDef[]>();
  for (const c of def.cells) {
    if (!c.corner) continue;
    if (!Number.isInteger(c.corner.stops) || c.corner.stops < 1 || c.corner.stops > 3) {
      p.push(`cell ${c.id} corner needs ${c.corner.stops} stops (1 to 3 allowed)`);
    }
    zones.set(c.corner.id, [...(zones.get(c.corner.id) ?? []), c]);
  }
  for (const [id, cells] of zones) {
    const stops = (cells[0].corner as { stops: number }).stops;
    if (cells.some((c) => (c.corner as { stops: number }).stops !== stops)) p.push(`corner ${id} has inconsistent stop counts`);
    const members = new Set(cells.map((c) => c.id));
    const inside = new Map<string, string[]>();
    for (const c of cells) for (const n of c.next) if (members.has(n)) link(inside, c.id, n);
    // One zone: its cells are all linked together by forward edges inside it (several lanes, forks and merges allowed).
    const together = new Map<string, string[]>();
    for (const [from, tos] of inside) {
      for (const to of tos) {
        link(together, from, to);
        link(together, to, from);
      }
    }
    for (const c of cells) for (const s of c.side) if (members.has(s)) link(together, c.id, s); // lane neighbours
    const seen = reach([cells[0].id], together);
    if (seen.size !== members.size) p.push(`corner ${id} is not one contiguous zone`);
    // Every way through the zone must be long enough to make the stops: fewest cells from an entry to an exit.
    const entries = cells.filter((c) => (inn.get(c.id) ?? []).some((q) => !members.has(q)) || (inn.get(c.id) ?? []).length === 0);
    const isExit = (c: CellDef) => c.next.some((q) => !members.has(q));
    let shortest = Infinity;
    let frontier = entries.map((c) => c.id);
    const visited = new Set(frontier);
    for (let len = 1; frontier.length && shortest === Infinity; len++) {
      if (frontier.some((q) => isExit(byId.get(q) as CellDef))) shortest = len;
      const nextFrontier: string[] = [];
      for (const q of frontier) {
        for (const n of inside.get(q) ?? []) {
          if (visited.has(n)) continue;
          visited.add(n);
          nextFrontier.push(n);
        }
      }
      frontier = nextFrontier;
    }
    if (shortest === Infinity) p.push(`corner ${id} has no entry or no exit`);
    else if (shortest < stops) p.push(`corner ${id} can be crossed in ${shortest} cells but needs ${stops} stops`);
  }
  return p;
}

/** Teams that have a box in the pit lane (cell types 3 to 7). */
export const TEAM_COUNT = 5;

/**
 * What a circuit needs to host a race of `cars` cars, on top of a valid structure: enough grid slots, and a box
 * for every team (cars race for teams 0 to 4 in turn, §10).
 */
export function raceReadyProblems(def: TrackDef, cars = 4): string[] {
  const p: string[] = [];
  const grid = def.cells.filter((c) => c.grid !== undefined).length;
  if (grid < cars) p.push(`grid has ${grid} slots, ${cars} needed`);
  const teams = new Set(def.cells.filter((c) => c.type >= 3 && c.type <= 7).map((c) => c.type - 3));
  for (let t = 0; t < TEAM_COUNT; t++) if (!teams.has(t)) p.push(`team ${t + 1} has no box`);
  return p;
}
