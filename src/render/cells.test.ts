import { describe, expect, it } from 'vitest';
import { TRACKS } from '../data/tracks';
import { contrast } from '../ui/kit/tokens';
import { CELL_STYLE, cellKind, pickCell, roundedRectPoints } from './cells';
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
