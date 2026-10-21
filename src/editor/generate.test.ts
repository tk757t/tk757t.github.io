import { describe, expect, it } from 'vitest';
import { createGame, validateTrack } from '../engine';
import { raceReadyProblems, toTrack, validateTrackDef, type CellDef } from '../data/tracks';
import { checkCircuit, hasErrors } from './checks';
import { cloneDoc, EDITOR_VERSION, newDoc, parseDoc, type EditorDoc } from './doc';
import { adviseGears, BOX_COUNT, cellId, generate, laneOffsets, pitId } from './generate';
import { MIN_SLOTS, segmentPoint, slotOf, slotRange, smoothHandles, splitSegment, stations } from './geometry';
import { simulateSync } from './simulate';

/** The default stadium (89 cells a lane) with four corners, a chicane and a pit lane on the bottom straight. */
function fullDoc(): EditorDoc {
  const d = newDoc('essai', 'Essai');
  const n = generate(d).n;
  const f = (s: number) => s / n;
  d.corners = [
    { from: f(23), to: f(33), stops: 1, risk: 0 },
    { from: f(34), to: f(44), stops: 2, risk: 0 },
    { from: f(67), to: f(77), stops: 1, risk: 1 },
    { from: f(78), to: f(88), stops: 2, risk: 0 },
  ];
  d.pit = { from: f(6), to: f(18) };
  return d;
}

const byId = (cells: CellDef[]) => new Map(cells.map((c) => [c.id, c]));

describe('geometry', () => {
  it('a Bézier segment starts and ends on its control points', () => {
    const [a, b] = newDoc().points;
    expect(segmentPoint(a, b, 0)).toEqual({ x: a.x, y: a.y });
    const end = segmentPoint(a, b, 1);
    expect(end.x).toBeCloseTo(b.x);
    expect(end.y).toBeCloseTo(b.y);
  });

  it('cuts the centre line into evenly spaced stations of about one cell length', () => {
    const doc = newDoc();
    const { length, stations: st } = stations(doc.points, doc.cellLength);
    expect(st.length).toBe(Math.round(length / doc.cellLength));
    for (let i = 0; i < st.length; i++) {
      const a = st[i];
      const b = st[(i + 1) % st.length];
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(doc.cellLength * 0.9);
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(doc.cellLength * 1.02);
      expect(Math.hypot(a.tx, a.ty)).toBeCloseTo(1);
    }
  });

  it('never makes fewer than MIN_SLOTS cells a lane', () => {
    const tiny = newDoc();
    tiny.points = tiny.points.map((p) => ({ x: p.x / 10, y: p.y / 10, hx: p.hx / 10, hy: p.hy / 10 }));
    expect(stations(tiny.points, 40).stations).toHaveLength(MIN_SLOTS);
  });

  it('maps fractions to slots and walks ranges forward across the line', () => {
    expect(slotOf(0.5, 10)).toBe(5);
    expect(slotOf(0.999, 10)).toBe(0);
    expect(slotRange(8, 1, 10)).toEqual([8, 9, 0, 1]);
    expect(slotRange(3, 3, 10)).toEqual([3]);
  });

  it('splits a segment without moving the curve there, and smooths handles', () => {
    const doc = newDoc();
    const mid = segmentPoint(doc.points[0], doc.points[1], 0.5);
    const split = splitSegment(doc.points, 0);
    expect(split).toHaveLength(doc.points.length + 1);
    expect(split[1].x).toBeCloseTo(mid.x);
    expect(split[1].y).toBeCloseTo(mid.y);
    const smooth = smoothHandles(doc.points);
    expect(smooth[1].hx).toBeCloseTo((doc.points[2].x - doc.points[0].x) / 6);
  });
});

describe('cell generation', () => {
  it('makes one cell per lane and slot, rows counted from the start line', () => {
    const g = generate(newDoc());
    const track = g.def.cells.filter((c) => c.type < 2);
    expect(track).toHaveLength(3 * g.n);
    expect(g.def.lapLength).toBe(g.n);
    for (let lane = 0; lane < 3; lane++) {
      const rows = track.filter((c) => c.lane === lane).map((c) => c.row).sort((a, b) => a - b);
      expect(rows).toEqual(Array.from({ length: g.n }, (_, i) => i));
    }
    const line = track.filter((c) => c.startLine);
    expect(line).toHaveLength(3);
    expect(line.every((c) => c.row === 0)).toBe(true);
  });

  it('places 2 or 3 lanes symmetrically about the centre line, one lane spacing apart', () => {
    expect(laneOffsets(3, 40)).toEqual([-42, 0, 42]);
    expect(laneOffsets(2, 40)).toEqual([-21, 21]);
    const doc = newDoc();
    doc.lanes = 2;
    const g = generate(doc);
    expect(g.def.cells.filter((c) => c.type < 2)).toHaveLength(2 * g.n);
    const a = byId(g.def.cells).get(cellId(0, 10))!;
    const b = byId(g.def.cells).get(cellId(1, 10))!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(42, 0);
  });

  it('links each cell forward in its lane, with lane changes on straights only', () => {
    const g = generate(fullDoc());
    const cells = byId(g.def.cells);
    for (const c of g.def.cells.filter((x) => x.type < 2)) {
      const slot = Number(c.id.split('S')[1]);
      expect(c.next[0]).toBe(cellId(c.lane, (slot + 1) % g.n));
      expect(c.link).toBe(c.next[0]);
      const changes = c.next.filter((id) => cells.get(id)!.type < 2 && cells.get(id)!.lane !== c.lane);
      for (const id of changes) {
        expect(c.type, `${c.id} -> ${id}`).toBe(0);
        expect(cells.get(id)!.type).toBe(0);
      }
    }
    // a straight cell of the middle lane can move to both other lanes
    expect(cells.get(cellId(1, 50))!.next).toEqual([cellId(1, 51), cellId(0, 51), cellId(2, 51)]);
    // in a corner, never
    expect(cells.get(cellId(1, 25))!.next).toEqual([cellId(1, 26)]);
  });

  it('gives each cell its side neighbours (lanes beside, cells ahead and behind), symmetric', () => {
    const g = generate(newDoc());
    const cells = byId(g.def.cells);
    const mid = cells.get(cellId(1, 10))!;
    expect(mid.side).toHaveLength(8);
    expect(cells.get(cellId(0, 10))!.side).toHaveLength(5);
    for (const c of g.def.cells) for (const s of c.side) expect(cells.get(s)!.side).toContain(c.id);
  });

  it('turns zones into corners named in lap order, with chicane risk at their entry and exit', () => {
    const g = generate(fullDoc());
    const cells = byId(g.def.cells);
    const zones = new Map<string, number[]>();
    for (const c of g.def.cells) if (c.corner && c.lane === 0) zones.set(c.corner.id, [...(zones.get(c.corner.id) ?? []), c.row]);
    expect([...zones.keys()].sort()).toEqual(['V1', 'V2', 'V3', 'V4']);
    const firstRow = (id: string) => Math.min(...zones.get(id)!);
    expect(firstRow('V1')).toBeLessThan(firstRow('V2'));
    expect(firstRow('V3')).toBeLessThan(firstRow('V4'));
    expect(cells.get(cellId(1, 30))!.corner).toEqual({ id: 'V1', stops: 1 });
    expect(cells.get(cellId(1, 40))!.corner).toEqual({ id: 'V2', stops: 2 });
    expect(g.def.cells.every((c) => (c.type === 1) === (c.corner !== undefined))).toBe(true);
    // chicane V3 (slots 67 to 77): risk on its first and last slot, all lanes
    for (let lane = 0; lane < 3; lane++) {
      expect(cells.get(cellId(lane, 67))!.risk).toBe(1);
      expect(cells.get(cellId(lane, 77))!.risk).toBe(1);
      expect(cells.get(cellId(lane, 70))!.risk).toBe(0);
    }
    expect(g.def.cells.filter((c) => c.risk > 0)).toHaveLength(6);
  });

  it('puts the pit lane outside the loop, with five team boxes, one way in and one way out', () => {
    const g = generate(fullDoc());
    const cells = byId(g.def.cells);
    const pit = g.def.cells.filter((c) => c.type >= 2);
    expect(pit).toHaveLength(13);
    expect(pit.every((c) => c.lane === 3)).toBe(true);
    // the bottom straight runs at y = 280: outside is below
    expect(pit.every((c) => c.y > cells.get(cellId(2, Number(c.id.slice(1))))!.y)).toBe(true);
    expect(pit.filter((c) => c.type >= 3).map((c) => c.type)).toEqual([3, 4, 5, 6, 7].slice(0, BOX_COUNT));
    const entries = g.def.cells.filter((c) => c.type < 2 && c.next.some((id) => cells.get(id)!.type >= 2));
    expect(entries.map((c) => c.id)).toEqual([cellId(2, 5)]);
    expect(cells.get(pitId(18))!.next).toEqual([cellId(2, 19)]);
    expect(raceReadyProblems(g.def)).toEqual([]);
  });

  it('staggers the grid backwards from the pole on the two outer lanes', () => {
    const doc = fullDoc();
    const g = generate(doc);
    const pole = slotOf(doc.grid.pole, g.n);
    const grid = g.def.cells.filter((c) => c.grid !== undefined).sort((a, b) => a.grid! - b.grid!);
    expect(grid.map((c) => c.id)).toEqual([0, 1, 2, 3, 4].map((i) => cellId(i % 2 === 0 ? 0 : 2, (pole - i + g.n) % g.n)));
  });

  it('produces a circuit the validator and the engine accept, and a race can start on it', () => {
    const g = generate(fullDoc());
    expect(validateTrackDef(g.def)).toEqual([]);
    expect(checkCircuit(g)).toEqual([]);
    const track = toTrack(g.def);
    expect(validateTrack(track)).toEqual([]);
    const state = createGame({ seed: 3, cars: 4, track });
    expect(state.cars.map((c) => c.position)).toEqual(track.grid.slice(0, 4));
  });

  it('keeps the zones in place when the cell length changes (positions are fractions of the lap)', () => {
    const doc = fullDoc();
    doc.cellLength = 50;
    const g = generate(doc);
    expect(g.n).toBeLessThan(89);
    expect(new Set(g.def.cells.filter((c) => c.corner).map((c) => c.corner!.id)).size).toBe(4);
    expect(checkCircuit(g).filter((c) => c.level === 'error')).toEqual([]);
  });
});

describe('advised gears', () => {
  // 40 slots, one zone of 5 cells (slots 20 to 24)
  const zones = Array.from({ length: 40 }, (_, s) => (s >= 20 && s <= 24 ? 0 : -1));
  const gears = adviseGears(zones);

  it('outside a zone: the fastest gear whose best roll stops before the end of the next zone', () => {
    expect(gears[0]).toEqual([5, 5, 5, 5]); // 24 cells to the end of the zone: 5th (20) fits, 6th (30) does not
    expect(gears[15]).toEqual([3, 3, 3, 3]); // 9 cells: 3rd (8)
    expect(gears[19]).toEqual([2, 2, 2, 2]); // 5 cells: 2nd (4)
  });

  it('in a zone: slower with more stops left, free again once they are made', () => {
    expect(gears[20]).toEqual([6, 2, 1, 1]); // 4 cells left in the zone: 2nd for one stop, 1st for two or three
    expect(gears[24][1]).toBe(1);
    expect(gears[24][0]).toBe(6); // leaving the last cell: 36 cells to the end of the zone next lap
  });

  it('a lap without zone advises the top gear everywhere', () => {
    expect(adviseGears(new Array(30).fill(-1)).every((g) => g.every((x) => x === 6))).toBe(true);
  });

  it('can be corrected by hand, cell by cell', () => {
    const doc = fullDoc();
    const auto = generate(doc);
    doc.gears[cellId(1, 50)] = [1, 1, 1, 1];
    const g = generate(doc);
    expect(byId(g.def.cells).get(cellId(1, 50))!.gear).toEqual([1, 1, 1, 1]);
    expect(g.autoGears[cellId(1, 50)]).toEqual(auto.autoGears[cellId(1, 50)]);
    expect(byId(g.def.cells).get(cellId(1, 51))!.gear).toEqual(auto.autoGears[cellId(1, 51)]);
  });
});

describe('checks', () => {
  it('a new circuit needs a pit lane and its boxes, and has no corner yet', () => {
    const checks = checkCircuit(generate(newDoc()));
    expect(checks.map((c) => c.level)).toEqual(['error', 'warning']);
    expect(checks[0].message).toMatch(/voie des stands/);
    expect(hasErrors(checks)).toBe(true);
  });

  it('reports a corner shorter than its stops, in French', () => {
    const doc = fullDoc();
    const n = generate(doc).n;
    doc.corners[0] = { from: 23 / n, to: 24 / n, stops: 3, risk: 0 };
    const checks = checkCircuit(generate(doc));
    expect(checks.some((c) => /Le virage V1 se traverse en 2 case\(s\) mais demande 3 arrêts/.test(c.message))).toBe(true);
  });

  it('reports a pit lane too short and turns too tight for the lanes', () => {
    const doc = fullDoc();
    const n = generate(doc).n;
    doc.pit = { from: 6 / n, to: 9 / n };
    expect(checkCircuit(generate(doc)).some((c) => /voie des stands doit compter/.test(c.message))).toBe(true);
    const tight = newDoc();
    tight.points = tight.points.map((p) => ({ ...p, x: p.x / 5, y: p.y / 5, hx: p.hx / 5, hy: p.hy / 5 }));
    expect(generate(tight).warnings.map((w) => w.code)).toContain('tight-turn');
  });

  it('reports a line that crosses itself', () => {
    const doc = newDoc();
    // a figure of eight
    doc.points = smoothHandles([
      { x: -400, y: -200, hx: 0, hy: 0 },
      { x: 400, y: 200, hx: 0, hy: 0 },
      { x: 600, y: 0, hx: 0, hy: 0 },
      { x: 400, y: -200, hx: 0, hy: 0 },
      { x: -400, y: 200, hx: 0, hy: 0 },
      { x: -600, y: 0, hx: 0, hy: 0 },
    ]);
    expect(generate(doc).warnings.map((w) => w.code)).toContain('too-close');
  });
});

describe('export and import', () => {
  it('the circuit file carries its format version and its editor document, and regenerates identically', () => {
    const g = generate(fullDoc());
    const file = JSON.parse(JSON.stringify(g.def));
    expect(file.version).toBe(1);
    expect(file.editor.version).toBe(EDITOR_VERSION);
    expect(generate(parseDoc(file.editor)).def).toEqual(g.def);
    expect(file).toEqual(g.def); // nothing lost in JSON (no negative zero, no undefined)
  });

  it('refuses documents it cannot read, or from a newer editor', () => {
    expect(() => parseDoc(null)).toThrow(/illisible/);
    expect(() => parseDoc({ ...newDoc(), points: [] })).toThrow(/3 points/);
    expect(() => parseDoc({ ...newDoc(), version: EDITOR_VERSION + 1 })).toThrow(/plus récente/);
  });

  it('cleans what it reads: lanes, cell length and stops within their bounds', () => {
    const raw = { ...cloneDoc(fullDoc()), lanes: 5, cellLength: 500, corners: [{ from: 1.2, to: -0.1, stops: 9, risk: -1 }] };
    const d = parseDoc(raw);
    expect(d.lanes).toBe(3);
    expect(d.cellLength).toBe(60);
    expect(d.corners[0]).toEqual({ from: expect.closeTo(0.2), to: expect.closeTo(0.9), stops: 3, risk: 0 });
  });
});

describe('simulation', () => {
  it('races AIs on a drawn circuit and ranks its corners by cost', () => {
    const r = simulateSync(generate(fullDoc()).def, { races: 4, laps: 1 });
    expect(r.races).toBe(4);
    expect(r.avgRounds).toBeGreaterThan(5);
    expect(r.minutes).toBeCloseTo((r.avgRounds * 4 * 6) / 60);
    expect(r.unfinished).toBe(0);
    expect(r.corners.map((c) => c.id).sort()).toEqual(['V1', 'V2', 'V3', 'V4']);
    for (let i = 1; i < r.corners.length; i++) expect(r.corners[i - 1].cost).toBeGreaterThanOrEqual(r.corners[i].cost);
    // deterministic: same seeds, same report
    expect(simulateSync(generate(fullDoc()).def, { races: 4, laps: 1 })).toEqual(r);
  });
});
