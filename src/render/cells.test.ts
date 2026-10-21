import { describe, expect, it } from 'vitest';
import { TRACKS } from '../data/tracks';
import { contrast } from '../ui/kit/tokens';
import { CELL_STYLE, MARK_STYLE, cellKind, cellSizes, markOf, pickCell, roundedRectPoints } from './cells';
import { drawScenery, sceneryPlan } from './scenery';

describe('cellKind', () => {
  it('classifies the cells by what they do to the car', () => {
    expect(cellKind({ type: 0, risk: 0 })).toBe('neutral');
    expect(cellKind({ type: 1, risk: 0, corner: { id: 'A', stops: 2 } })).toBe('wear');
    expect(cellKind({ type: 0, risk: 1 })).toBe('break');
    expect(cellKind({ type: 1, risk: 2, corner: { id: 'A', stops: 1 } })).toBe('break');
    expect(cellKind({ type: 2, risk: 0 })).toBe('pit');
    expect(cellKind({ type: 5, risk: 0 })).toBe('box');
  });

  it('finds wear and break cells on our circuits, and no break on the oval', () => {
    const kinds = (id: string) => new Set(TRACKS[id].cells.map(cellKind));
    expect(kinds('oval').has('break')).toBe(false);
    expect(kinds('pins').has('break')).toBe(true);
    expect(kinds('col').has('break')).toBe(true);
    expect(kinds('dunes').has('wear')).toBe(true);
  });

  it('keeps the ink readable on every kind (AA)', () => {
    const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
    for (const k of ['neutral', 'wear', 'break', 'pit', 'box'] as const) expect(contrast(hex(CELL_STYLE[k].ink), hex(CELL_STYLE[k].fill))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('pickCell', () => {
  const cells = [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 22, y: 0 },
  ];
  it('picks the nearest cell, and nothing in the void', () => {
    expect(pickCell(cells, new Set(), { x: 3, y: 0 }, 15)).toBe('a');
    expect(pickCell(cells, new Set(), { x: 200, y: 0 }, 15)).toBeNull();
  });
  it('prefers a destination to a nearer cell that is not one', () => {
    expect(pickCell(cells, new Set(['b']), { x: 8, y: 0 }, 15)).toBe('b');
    expect(pickCell(cells, new Set(['b']), { x: -20, y: 0 }, 15)).toBe('a');
  });
});

describe('roundedRectPoints', () => {
  it('stays inside the circle through its corners', () => {
    const pts = roundedRectPoints(10, 20, 8, 8, Math.PI / 4, 3);
    for (let i = 0; i < pts.length; i += 2) expect(Math.hypot(pts[i] - 10, pts[i + 1] - 20)).toBeLessThanOrEqual(Math.hypot(8, 8) + 1e-6);
    expect(pts.length).toBe(32);
  });
});

describe('scenery', () => {
  it('never receives pointer events', () => {
    const plan = sceneryPlan(TRACKS.dunes);
    expect(plan).not.toBeNull();
    const root = drawScenery(plan!, 15);
    expect(root.eventMode).toBe('none');
    for (const c of root.children) expect(c.eventMode).toBe('none');
  });
});

describe('markOf', () => {
  const none = { crash: false, bodyLoss: 0, brakesLoss: 0, tiresLoss: 0 };
  it('names what landing on a destination costs, the worst first', () => {
    expect(markOf(none)).toEqual({ kind: 'free' });
    expect(markOf({ ...none, tiresLoss: 2 })).toEqual({ kind: 'tires', label: '-2 P' });
    expect(markOf({ ...none, tiresLoss: 2, brakesLoss: 1 })).toEqual({ kind: 'brakes', label: '-1 F' });
    expect(markOf({ ...none, brakesLoss: 1, bodyLoss: 1 })).toEqual({ kind: 'body', label: '-1 C' });
    expect(markOf({ ...none, bodyLoss: 1, crash: true })).toEqual({ kind: 'crash', label: 'MUR' });
  });
  it('gives every kind its own colour, and the ones that cost something a legend', () => {
    const kinds = Object.keys(MARK_STYLE) as (keyof typeof MARK_STYLE)[];
    expect(new Set(kinds.map((k) => MARK_STYLE[k].color)).size).toBe(kinds.length);
    for (const k of kinds.filter((k) => k !== 'reach')) expect(MARK_STYLE[k].legend.length).toBeGreaterThan(0);
  });
});

describe('cellSizes', () => {
  it('fills the room between neighbours on every circuit, within bounds, so the cells of a lane touch', () => {
    for (const [id, def] of Object.entries(TRACKS)) {
      const r = def.cellRadius ?? 15;
      const sizes = cellSizes(def.cells, r);
      expect(sizes.size, id).toBe(def.cells.length);
      for (const s of sizes.values()) {
        expect(s.hl).toBeGreaterThanOrEqual(0.7 * r - 1e-9);
        expect(s.hl).toBeLessThanOrEqual(1.3 * r + 1e-9);
        expect(s.hw).toBeGreaterThanOrEqual(0.7 * r - 1e-9);
        expect(s.hw).toBeLessThanOrEqual(1.3 * r + 1e-9);
      }
    }
  });
  it('makes a straight cell of the oval wider than the old square of 0.92 radii', () => {
    const def = TRACKS.anneau;
    const s = cellSizes(def.cells, 15).get('L1S5')!;
    expect(s.hl).toBeGreaterThan(0.92 * 15);
    expect(s.hw).toBeGreaterThan(0.92 * 15);
  });
});

describe('pickCell in the frame of a wide cell', () => {
  const wide = [
    { id: 'a', x: 0, y: 0, rot: 0, hl: 20, hw: 20 },
    { id: 'b', x: 41, y: 0, rot: 0, hl: 20, hw: 20 },
  ];
  it('selects the cell under the finger up to its edge, and nothing far outside', () => {
    expect(pickCell(wide, new Set(), { x: 19, y: 18 }, 15)).toBe('a');
    expect(pickCell(wide, new Set(), { x: 200, y: 0 }, 15)).toBeNull();
  });
});
