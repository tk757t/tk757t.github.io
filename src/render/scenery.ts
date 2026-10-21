import { Container, Graphics } from 'pixi.js';
import { PALETTES, type Decor, type Palette, type Point, type SceneryPlan } from './sceneryPlan';

export { sceneryPlan } from './sceneryPlan';

const shade = (c: number, k: number): number => {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
};

/** Draws a plan (see sceneryPlan) with the cell radius `r` of the circuit. */
export function drawScenery(plan: SceneryPlan, r: number): Container {
  const pal = PALETTES[plan.theme];
  const root = new Container();
  const g = new Graphics();
  const { bounds: b } = plan;
  // the ground runs far beyond the decor, so the camera never shows the edge of the world
  const far = 4000;
  g.rect(b.minX - far, b.minY - far, b.maxX - b.minX + 2 * far, b.maxY - b.minY + 2 * far).fill(pal.ground);
  // ground patches, from the same seeded decor values
  for (const d of plan.decor) if (d.v < 0.35) g.ellipse(d.x + d.size * 3, d.y - d.size * 2, d.size * (3 + d.v * 6), d.size * (2 + d.v * 3)).fill({ color: pal.patch, alpha: 0.7 });
  if (plan.seaFrom !== null) {
    g.rect(b.minX - far, plan.seaFrom - r * 1.6, b.maxX - b.minX + 2 * far, r * 1.6).fill(0xe8d29a);
    g.rect(b.minX - far, plan.seaFrom, b.maxX - b.minX + 2 * far, b.maxY - plan.seaFrom + far).fill(0x2f7fc1);
    for (let x = b.minX + 20; x < b.maxX; x += r * 5) g.moveTo(x, plan.seaFrom + r * 2).quadraticCurveTo(x + r * 1.2, plan.seaFrom + r * 1.4, x + r * 2.4, plan.seaFrom + r * 2);
    g.stroke({ width: r * 0.18, color: 0x8cc8ef });
  }
  root.addChild(g);

  const track = new Graphics();
  const n = plan.left.length;
  // verge, then asphalt: one quad per row, so loops of any shape fill correctly
  for (const [k, color] of [
    [r * 1.1, pal.verge],
    [0, pal.asphalt],
  ] as const) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const [lx, ly, rx, ry] = widen(plan.left[i], plan.right[i], k);
      const [lx2, ly2, rx2, ry2] = widen(plan.left[j], plan.right[j], k);
      track.poly([lx, ly, rx, ry, rx2, ry2, lx2, ly2]).fill(color);
    }
  }
  if (plan.pit.length > 1) {
    track.moveTo(plan.pit[0].x, plan.pit[0].y);
    for (const p of plan.pit.slice(1)) track.lineTo(p.x, p.y);
    track.stroke({ width: r * 2.4, color: shade(pal.asphalt, 1.12), cap: 'round', join: 'round' });
  }
  // white borders
  for (const edge of [plan.left, plan.right]) {
    track.moveTo(edge[0].x, edge[0].y);
    for (let i = 1; i <= n; i++) track.lineTo(edge[i % n].x, edge[i % n].y);
    track.stroke({ width: r * 0.16, color: pal.line, alpha: 0.9 });
  }
  // kerbs: red and white blocks along both edges of the corners
  for (let i = 0; i < n; i++) {
    if (!plan.cornerRows[i]) continue;
    const j = (i + 1) % n;
    for (const edge of [plan.left, plan.right]) {
      const a = edge[i];
      const c = edge[j];
      const mx = (a.x + c.x) / 2;
      const my = (a.y + c.y) / 2;
      track.moveTo(a.x, a.y).lineTo(mx, my).stroke({ width: r * 0.42, color: 0xd93a32 });
      track.moveTo(mx, my).lineTo(c.x, c.y).stroke({ width: r * 0.42, color: 0xffffff });
    }
  }
  root.addChild(track);

  const deco = new Graphics();
  for (const s of plan.stands) {
    deco.poly(s.corners.flatMap((p) => [p.x, p.y])).fill(0x8e98a6);
    deco.poly(s.corners.flatMap((p) => [p.x, p.y])).stroke({ width: r * 0.12, color: 0x56606e });
    // rows of seats with spectators
    const [a, bb, c, d] = s.corners;
    for (let k = 1; k < 4; k++) {
      const t = k / 4;
      const p = { x: a.x + (d.x - a.x) * t, y: a.y + (d.y - a.y) * t };
      const q = { x: bb.x + (c.x - bb.x) * t, y: bb.y + (c.y - bb.y) * t };
      deco.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: r * 0.35, color: [0xd94f4f, 0x3f7fd9, 0xe6c14a][k - 1] });
    }
  }
  for (const d of plan.decor) drawDecor(deco, d, pal);
  root.addChild(deco);
  // scenery is a quiet backdrop: a dark veil lowers its contrast so it is never taken for a cell
  const veil = new Graphics();
  veil.rect(b.minX - far, b.minY - far, b.maxX - b.minX + 2 * far, b.maxY - b.minY + 2 * far).fill({ color: 0x0c1d4d, alpha: 0.5 });
  root.addChild(veil);
  // and it never reacts to a pointer
  root.eventMode = 'none';
  for (const child of root.children) child.eventMode = 'none';
  return root;
}

function widen(l: Point, r: Point, k: number): [number, number, number, number] {
  const dx = r.x - l.x;
  const dy = r.y - l.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = (dx / len) * k;
  const uy = (dy / len) * k;
  return [l.x - ux, l.y - uy, r.x + ux, r.y + uy];
}

function drawDecor(g: Graphics, d: Decor, pal: Palette): void {
  const color = pal.decor[d.kind] ?? 0x666666;
  const s = d.size;
  switch (d.kind) {
    case 'tree':
      g.circle(d.x + s * 0.2, d.y + s * 0.25, s).fill({ color: 0x000000, alpha: 0.18 });
      g.circle(d.x, d.y, s).fill(shade(color, 0.9 + d.v * 0.3));
      g.circle(d.x - s * 0.3, d.y - s * 0.3, s * 0.45).fill({ color: 0xffffff, alpha: 0.12 });
      break;
    case 'pine': {
      g.poly([d.x, d.y - s * 1.3, d.x + s, d.y + s * 0.7, d.x - s, d.y + s * 0.7]).fill(shade(color, 0.9 + d.v * 0.3));
      g.poly([d.x, d.y - s * 1.3, d.x + s * 0.4, d.y - s * 0.5, d.x - s * 0.4, d.y - s * 0.5]).fill(0xf4f8fb);
      break;
    }
    case 'palm':
      g.circle(d.x, d.y, s * 0.25).fill(0x7a5a35);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + d.v * 3;
        g.ellipse(d.x + Math.cos(a) * s * 0.6, d.y + Math.sin(a) * s * 0.6, s * 0.55, s * 0.22).fill(shade(color, 0.95 + d.v * 0.25));
      }
      break;
    case 'cactus':
      g.roundRect(d.x - s * 0.2, d.y - s, s * 0.4, s * 2, s * 0.2).fill(color);
      g.roundRect(d.x - s * 0.7, d.y - s * 0.5, s * 0.5, s * 0.25, s * 0.12).fill(color);
      g.roundRect(d.x + s * 0.2, d.y - s * 0.2, s * 0.5, s * 0.25, s * 0.12).fill(color);
      break;
    case 'rock':
      g.ellipse(d.x, d.y, s * 0.8, s * 0.55).fill(shade(color, 0.85 + d.v * 0.3));
      g.ellipse(d.x - s * 0.2, d.y - s * 0.15, s * 0.35, s * 0.2).fill({ color: 0xffffff, alpha: 0.15 });
      break;
    case 'building': {
      const w = s * (1 + d.v * 0.6);
      const h = s * (1.6 - d.v * 0.5);
      g.rect(d.x - w / 2 + s * 0.15, d.y - h / 2 + s * 0.15, w, h).fill({ color: 0x000000, alpha: 0.22 });
      g.rect(d.x - w / 2, d.y - h / 2, w, h).fill(shade(color, 0.8 + d.v * 0.35));
      g.rect(d.x - w / 2, d.y - h / 2, w, h).stroke({ width: s * 0.06, color: shade(color, 0.6) });
      for (let i = 1; i < 3; i++) for (let j = 1; j < 3; j++) g.rect(d.x - w / 2 + (w * i) / 3 - s * 0.08, d.y - h / 2 + (h * j) / 3 - s * 0.08, s * 0.16, s * 0.16).fill(0xf7e8a0);
      break;
    }
  }
}
