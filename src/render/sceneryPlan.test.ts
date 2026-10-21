import { describe, expect, it } from 'vitest';
import { TRACKS, THEMES } from '../data/tracks';
import { newDoc } from '../editor/doc';
import { generate } from '../editor/generate';
import { sceneryPlan } from './sceneryPlan';

function drawn(theme: (typeof THEMES)[number]) {
  const doc = newDoc('decor', 'Décor');
  const n = generate(doc).n;
  doc.theme = theme;
  doc.corners = [{ from: 23 / n, to: 44 / n, stops: 1, risk: 0 }];
  doc.pit = { from: 6 / n, to: 18 / n };
  return generate(doc).def;
}

describe('procedural scenery', () => {
  it('is only drawn for circuits with a theme and without a board picture', () => {
    expect(sceneryPlan(TRACKS.oval)).toBeNull();
    expect(sceneryPlan({ ...drawn('forest'), image: { src: 'x.jpg', width: 10, height: 10 } })).toBeNull();
    expect(sceneryPlan(drawn('forest'))).not.toBeNull();
  });

  it.each(THEMES)('%s: track edges for every row, kerbs on corners, stands along the pit lane, decor off the track', (theme) => {
    const def = drawn(theme);
    const plan = sceneryPlan(def)!;
    expect(plan.theme).toBe(theme);
    expect(plan.left).toHaveLength(def.lapLength);
    expect(plan.right).toHaveLength(def.lapLength);
    expect(plan.cornerRows.filter(Boolean).length).toBe(22);
    expect(plan.stands.length).toBeGreaterThan(0);
    expect(plan.pit.length).toBe(13 + 2);
    expect(plan.decor.length).toBeGreaterThan(20);
    const r = def.cellRadius!;
    for (const d of plan.decor) {
      for (const c of def.cells) expect(Math.hypot(c.x - d.x, c.y - d.y)).toBeGreaterThan(r * 4);
    }
    // the edges are on both sides of the lanes
    const row0 = def.cells.filter((c) => c.row === 0 && c.type < 2);
    for (const c of row0) {
      expect(Math.hypot(plan.left[0].x - c.x, plan.left[0].y - c.y)).toBeGreaterThan(r);
      expect(Math.hypot(plan.right[0].x - c.x, plan.right[0].y - c.y)).toBeGreaterThan(r);
    }
  });

  it('is the same every time for a circuit (seeded by its id and theme)', () => {
    expect(sceneryPlan(drawn('desert'))).toEqual(sceneryPlan(drawn('desert')));
    expect(sceneryPlan(drawn('desert'))!.decor).not.toEqual(sceneryPlan(drawn('snow'))!.decor);
  });

  it('puts the sea of the coast below the circuit, with no decor in it', () => {
    const def = drawn('coast');
    const plan = sceneryPlan(def)!;
    expect(plan.seaFrom).toBeGreaterThan(Math.max(...def.cells.map((c) => c.y)));
    expect(plan.decor.every((d) => d.y < plan.seaFrom!)).toBe(true);
    expect(sceneryPlan(drawn('city'))!.seaFrom).toBeNull();
  });
});
