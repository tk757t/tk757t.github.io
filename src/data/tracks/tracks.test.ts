import { describe, expect, it } from 'vitest';
import { validateTrack } from '../../engine';
import { TEST_CIRCUITS } from './generators/circuits';
import { buildOval } from './generators/oval';
import { generate } from '../../editor/generate';
import { parseDoc } from '../../editor/doc';
import { simulateSync } from '../../editor/simulate';
import { DEFAULT_TRACK, EDITOR_CIRCUITS, TRACKS, TRACK_LIST, raceReadyProblems, toTrack, validateTrackDef, type TrackDef } from './index';

const clone = (d: TrackDef): TrackDef => JSON.parse(JSON.stringify(d));
const cell = (d: TrackDef, id: string) => d.cells.find((c) => c.id === id)!;

describe.each(Object.entries(TRACKS))('track %s', (_name, def) => {
  it('passes the circuit validator', () => {
    expect(validateTrackDef(def)).toEqual([]);
  });

  it('converts to a valid engine track', () => {
    const track = toTrack(def);
    expect(validateTrack(track)).toEqual([]);
    expect(Object.keys(track.cells)).toHaveLength(def.cells.length);
    expect(track.grid.length).toBeGreaterThanOrEqual(4);
    expect(track.weather).toEqual(def.weather);
  });
});

describe.each(Object.entries(TRACKS))('track %s, for a race', (_name, def) => {
  it('has a grid for four cars and a box for each of the five teams', () => {
    expect(raceReadyProblems(def)).toEqual([]);
  });
});

describe('circuits drawn with the editor', () => {
  it.each(EDITOR_CIRCUITS)('%s is in sync with its editor document (run npm run gen:tracks), with a theme and format 1', (id) => {
    const def = TRACKS[id];
    expect(def.version).toBe(1);
    expect(def.theme).toBeDefined();
    expect(generate(parseDoc(def.editor)).def).toEqual(def);
  });

  it('have their own names, none of the test circuits', () => {
    expect(EDITOR_CIRCUITS.map((id) => TRACKS[id].name)).toEqual(['Dunes d’Ocre', 'Rues du Port', 'Corniche d’Azur', 'Boucle des Pins', 'Col des Neiges', 'Tour du Cratère']);
  });

  it('come two by number of laps: two of 1 lap, two of 2 laps, two of 3 laps', () => {
    expect(EDITOR_CIRCUITS.map((id) => TRACKS[id].laps)).toEqual([1, 1, 2, 2, 3, 3]);
  });

  // every lap is 46 to 55 cells and lasts about five minutes: a race lasts about five minutes per lap
  it.each(EDITOR_CIRCUITS)('%s has 46 to 55 cells per lap and lasts 9 to 15 rounds of four cars per lap', (id) => {
    const def = TRACKS[id];
    const report = simulateSync(def, { races: 40, laps: def.laps });
    expect(report.unfinished).toBe(0);
    expect(def.lapLength).toBeGreaterThanOrEqual(46);
    expect(def.lapLength).toBeLessThanOrEqual(55);
    expect(report.avgRounds / (def.laps ?? 1)).toBeGreaterThan(9);
    expect(report.avgRounds / (def.laps ?? 1)).toBeLessThan(15);
  });
});

describe('test circuits', () => {
  it('are in sync with their generator (run npm run gen:tracks), the test oval first and by default', () => {
    expect(TEST_CIRCUITS.map((o) => buildOval(o))).toEqual(TEST_CIRCUITS.map((o) => TRACKS[buildOval(o).id]));
    // only the test oval is offered next to our circuits: the other test circuits are for the campaign
    expect(TRACK_LIST.map((t) => t.id)).toEqual([DEFAULT_TRACK, ...EDITOR_CIRCUITS]);
    expect(DEFAULT_TRACK).toBe('oval');
    expect(TRACK_LIST[0].id).toBe(DEFAULT_TRACK);
  });
});

describe('oval', () => {
  const oval = TRACKS.oval;

  it('is in sync with its generator (run npm run gen:tracks)', () => {
    expect(oval).toEqual(buildOval());
  });

  it('has 3 lanes, 4 corners of 1 to 3 stops and a start line on the stands straight', () => {
    const lanes = new Set(oval.cells.filter((c) => c.type < 2).map((c) => c.lane));
    expect([...lanes].sort()).toEqual([0, 1, 2]);
    const corners = new Map(oval.cells.filter((c) => c.corner).map((c) => [c.corner!.id, c.corner!.stops]));
    expect(corners.size).toBe(4);
    expect([...corners.values()].sort()).toEqual([1, 1, 2, 3]);
    const line = oval.cells.filter((c) => c.startLine);
    expect(line).toHaveLength(3);
    expect(line.every((c) => c.tags?.includes('stands'))).toBe(true);
  });

  it('uses the cell types of our format: 0 track, 1 corner, 2 pit lane, 3-7 team boxes', () => {
    const count = (t: number) => oval.cells.filter((c) => c.type === t).length;
    expect(count(1)).toBe(3 * (5 + 5 + 5 + 5));
    expect(count(2)).toBe(6); // pit lane cells that are not boxes
    for (const t of [3, 4, 5, 6, 7]) expect(count(t), `box ${t}`).toBe(1);
    expect(oval.cells.filter((c) => c.type === 0).length).toBe(oval.cells.length - count(1) - count(2) - 5);
    // every corner cell is of type 1 and only them
    expect(oval.cells.every((c) => (c.type === 1) === !!c.corner)).toBe(true);
  });

  it('has a pit lane beside the stands straight with one way in and one way out', () => {
    const pit = oval.cells.filter((c) => c.type >= 2);
    expect(pit.every((c) => c.lane === 3)).toBe(true);
    const entries = oval.cells.filter((c) => c.type < 2 && c.next.some((n) => cell(oval, n).type >= 2));
    const exits = pit.filter((c) => c.next.some((n) => cell(oval, n).type < 2));
    expect(entries.map((c) => c.id)).toEqual(['L2S1']);
    expect(exits.map((c) => c.id)).toEqual(['P12']);
  });

  it('has advised gears that are lower inside corners with several stops left', () => {
    const t3 = oval.cells.filter((c) => c.corner?.id === 'T3' && c.lane === 1);
    for (const c of t3) expect(c.gear[3]).toBeLessThanOrEqual(c.gear[1]);
    expect(oval.cells.every((c) => c.gear.every((g) => g >= 1 && g <= 6))).toBe(true);
    // far from any corner the car can go fast, just before a corner it must be slower
    expect(cell(oval, 'L1S28').gear[0]).toBeGreaterThanOrEqual(3);
    expect(cell(oval, 'L1S13').gear[0]).toBeLessThanOrEqual(2);
  });

  it('lets cars change lane on straights only', () => {
    const forks = oval.cells.filter((c) => c.type < 2 && c.next.some((n) => cell(oval, n).lane !== c.lane && cell(oval, n).type < 2));
    expect(forks.length).toBeGreaterThan(0);
    expect(forks.every((c) => c.type === 0)).toBe(true);
  });

  it('lets cars pass on the side at every step of a straight, towards both neighbouring lanes', () => {
    for (const def of [oval, TRACKS.anneau, TRACKS.lac, TRACKS.epingles]) {
      const plain = (c: (typeof oval.cells)[number]) => c.type === 0 && !c.corner && c.lane < 3;
      const steps = def.cells.filter((c) => plain(c) && c.link && plain(cell(def, c.link)));
      expect(steps.length, def.id).toBeGreaterThan(0);
      for (const c of steps) {
        const lanes = new Set(c.next.map((n) => cell(def, n).lane));
        for (const l of [c.lane - 1, c.lane + 1]) if (l >= 0 && l <= 2) expect(lanes.has(l), `${def.id} ${c.id} -> lane ${l}`).toBe(true);
      }
    }
  });

  it('has symmetric neighbours and a link straight ahead in the same lane', () => {
    for (const c of oval.cells) {
      for (const s of c.side) expect(cell(oval, s).side).toContain(c.id);
      if (c.link) expect(cell(oval, c.link).lane).toBe(c.lane);
    }
  });

  it('starts four cars on the grid, pole first, with the weather thresholds of the default circuit', () => {
    expect(toTrack(oval).grid).toEqual(['L1S7', 'L0S7', 'L1S5', 'L0S5']);
    expect(oval.weather).toEqual({ rain: 7, sun: 13 });
  });
});

describe('track validator rejects broken circuits', () => {
  const base = TRACKS.oval;
  const problems = (d: TrackDef) => validateTrackDef(d).join('|');

  it('unknown successor', () => {
    const d = clone(base);
    cell(d, 'L0S3').next = ['nope'];
    expect(problems(d)).toMatch(/unknown cell nope/);
  });

  it('orphan cell', () => {
    const d = clone(base);
    d.cells.push({ id: 'lonely', x: 900, y: 900, row: 5, next: [], type: 0, lane: 0, gear: [6, 6, 6, 6], risk: 0, side: [] });
    expect(problems(d)).toMatch(/lonely is orphaned/);
    expect(problems(d)).toMatch(/lonely is not connected/);
  });

  it('disconnected island', () => {
    const d = clone(base);
    const mk = (id: string, x: number, row: number, next: string[]) => ({ id, x, y: 900, row, next, type: 0, lane: 0, gear: [6, 6, 6, 6] as [number, number, number, number], risk: 0, side: [] });
    d.cells.push(mk('i1', 900, 1, ['i2']), mk('i2', 960, 2, ['i1']));
    expect(problems(d)).toMatch(/i1 is not connected/);
  });

  it('dead end', () => {
    const d = clone(base);
    cell(d, 'L1S20').next = [];
    expect(problems(d)).toMatch(/L1S20 is a dead end/);
    expect(problems(d)).toMatch(/finish line is not reachable from cell L1S20/);
  });

  it('no start line', () => {
    const d = clone(base);
    for (const c of d.cells) delete c.startLine;
    expect(problems(d)).toMatch(/no start\/finish line/);
  });

  it('finish line cut off from the grid', () => {
    const d = clone(base);
    for (const c of d.cells) if (c.row === 47) c.next = c.next.filter((n) => !n.endsWith('S0'));
    expect(problems(d)).toMatch(/finish line is not reachable from the grid/);
  });

  it('edge that goes backwards along the lap', () => {
    const d = clone(base);
    cell(d, 'L0S3').next = ['L0S1'];
    expect(problems(d)).toMatch(/edge L0S3->L0S1 goes from row 3 to row 1/);
  });

  it('overlapping cells', () => {
    const d = clone(base);
    cell(d, 'L1S3').x = cell(d, 'L0S3').x;
    cell(d, 'L1S3').y = cell(d, 'L0S3').y + 1; // the same cell drawn twice
    expect(problems(d)).toMatch(/L0S3 and L1S3 overlap/);
  });

  it('corner stop counts and zone shape', () => {
    let d = clone(base);
    cell(d, 'L0S14').corner = { id: 'T1', stops: 4 };
    expect(problems(d)).toMatch(/needs 4 stops/);
    d = clone(base);
    cell(d, 'L0S14').corner = { id: 'T1', stops: 2 };
    expect(problems(d)).toMatch(/corner T1 has inconsistent stop counts/);
    d = clone(base);
    for (const c of d.cells) if (c.corner?.id === 'T1') c.corner.stops = 3;
    for (const c of d.cells) if (c.corner?.id === 'T1' && c.row > 15) {
      delete c.corner;
      c.type = 0;
    }
    expect(problems(d)).toMatch(/corner T1 can be crossed in 2 cells but needs 3 stops/);
    d = clone(base);
    cell(d, 'L0S30').corner = { id: 'T1', stops: 1 };
    cell(d, 'L0S30').type = 1;
    expect(problems(d)).toMatch(/corner T1 is not one contiguous zone/);
  });

  it('cell type and corner data must agree', () => {
    const d = clone(base);
    cell(d, 'L0S26').type = 1;
    expect(problems(d)).toMatch(/L0S26: type 1 does not match its corner data/);
    cell(d, 'L0S26').type = 9;
    expect(problems(d)).toMatch(/invalid type 9/);
  });

  it('lanes must fit the type', () => {
    const d = clone(base);
    cell(d, 'P5').lane = 1;
    expect(problems(d)).toMatch(/P5: lane 1 does not fit type/);
  });

  it('advised gears and risk must be sensible', () => {
    const d = clone(base);
    cell(d, 'L0S2').gear = [7, 1, 1, 1];
    cell(d, 'L0S3').risk = -1;
    expect(problems(d)).toMatch(/L0S2 has invalid advised gears/);
    expect(problems(d)).toMatch(/L0S3 has invalid risk/);
  });

  it('neighbours must be symmetric and exist', () => {
    const d = clone(base);
    cell(d, 'L0S3').side.push('L2S9');
    expect(problems(d)).toMatch(/neighbour L0S3->L2S9 is not symmetric/);
    cell(d, 'L0S4').side.push('ghost');
    expect(problems(d)).toMatch(/unknown neighbour ghost/);
  });

  it('pit lane: team boxes are unique, with a way in and out', () => {
    let d = clone(base);
    cell(d, 'P5').type = 3;
    expect(problems(d)).not.toMatch(/box cells share/); // a box may be two cells of one team
    cell(d, 'P7').type = 3;
    expect(problems(d)).toMatch(/more than two box cells share the same team type/);
    d = clone(base);
    cell(d, 'L2S1').next = ['L2S2'];
    expect(problems(d)).toMatch(/no way into the pit lane/);
    d = clone(base);
    cell(d, 'P12').next = [];
    expect(problems(d)).toMatch(/no way out of the pit lane/);
  });

  it('grid positions must be 0..n-1', () => {
    const d = clone(base);
    cell(d, 'L0S5').grid = 7;
    expect(problems(d)).toMatch(/grid positions must be/);
    for (const c of d.cells) delete c.grid;
    expect(problems(d)).toMatch(/grid is empty/);
  });

  it('weather thresholds', () => {
    const d = clone(base);
    d.weather = { rain: 12, sun: 5 };
    expect(problems(d)).toMatch(/weather thresholds/);
    d.weather = { rain: 5, sun: 9 };
    expect(problems(d)).not.toMatch(/weather/);
  });

  it('empty track', () => {
    expect(validateTrackDef({ ...clone(base), cells: [] })).toEqual(['track has no cells']);
  });
});
