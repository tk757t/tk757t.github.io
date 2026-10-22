import type { ControlPoint } from './doc';

export interface Point {
  x: number;
  y: number;
}

/** A point of the centre line with its unit tangent (direction of travel). */
export interface Station extends Point {
  tx: number;
  ty: number;
}

/** Fewest cells in a lap: below this a circuit is too short to race. */
export const MIN_SLOTS = 14;

/** Cubic Bézier between control points a and b (a's handle out, b's handle in). */
export function segmentPoint(a: ControlPoint, b: ControlPoint, t: number): Point {
  const u = 1 - t;
  const p1 = { x: a.x + a.hx, y: a.y + a.hy };
  const p2 = { x: b.x - b.hx, y: b.y - b.hy };
  const k0 = u * u * u;
  const k1 = 3 * u * u * t;
  const k2 = 3 * u * t * t;
  const k3 = t * t * t;
  return { x: k0 * a.x + k1 * p1.x + k2 * p2.x + k3 * b.x, y: k0 * a.y + k1 * p1.y + k2 * p2.y + k3 * b.y };
}

/** The closed centre line as a dense polyline (first point not repeated at the end). */
export function polyline(points: ControlPoint[], perSegment = 48): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    for (let k = 0; k < perSegment; k++) out.push(segmentPoint(a, b, k / perSegment));
  }
  return out;
}

/** Cumulative length at each vertex of a closed polyline; the last entry is the full loop length. */
export function cumulative(poly: Point[]): number[] {
  const acc = [0];
  for (let i = 1; i <= poly.length; i++) {
    const a = poly[i - 1];
    const b = poly[i % poly.length];
    acc.push(acc[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return acc;
}

/** Point at arc length `s` along the closed polyline. */
function pointAt(poly: Point[], acc: number[], s: number): Point {
  const total = acc[acc.length - 1];
  const d = ((s % total) + total) % total;
  let lo = 0;
  let hi = acc.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (acc[mid] <= d) lo = mid;
    else hi = mid;
  }
  const a = poly[lo];
  const b = poly[(lo + 1) % poly.length];
  const span = acc[lo + 1] - acc[lo] || 1;
  const t = (d - acc[lo]) / span;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Cuts the centre line into `n` evenly spaced stations, n = loop length / cell length (at least MIN_SLOTS).
 * Station s sits at arc length s x length / n, station 0 on the first control point.
 */
export function stations(points: ControlPoint[], cellLength: number): { length: number; stations: Station[] } {
  const poly = polyline(points);
  const acc = cumulative(poly);
  const length = acc[acc.length - 1];
  const n = Math.max(MIN_SLOTS, Math.round(length / cellLength));
  const step = length / n;
  const out: Station[] = [];
  for (let s = 0; s < n; s++) {
    const p = pointAt(poly, acc, s * step);
    const a = pointAt(poly, acc, s * step - step / 4);
    const b = pointAt(poly, acc, s * step + step / 4);
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    out.push({ x: p.x, y: p.y, tx: (b.x - a.x) / len, ty: (b.y - a.y) / len });
  }
  return { length, stations: out };
}

/** Twice the signed area; positive when the loop turns clockwise on screen (y down). */
export function signedArea2(poly: Point[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a;
}

/** Signed radius of the circle through three points (positive = turning right on screen), Infinity on a straight. */
export function turnRadius(a: Point, b: Point, c: Point): number {
  const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  if (Math.abs(cross) < 1e-9) return Infinity;
  const ab = Math.hypot(b.x - a.x, b.y - a.y);
  const bc = Math.hypot(c.x - b.x, c.y - b.y);
  const ca = Math.hypot(a.x - c.x, a.y - c.y);
  return (ab * bc * ca) / (2 * cross);
}

/** Smooth handles through the points (Catmull-Rom): each handle follows the line between its two neighbours. */
export function smoothHandles(points: ControlPoint[], tension = 1 / 6): ControlPoint[] {
  return points.map((p, i) => {
    const prev = points[(i - 1 + points.length) % points.length];
    const next = points[(i + 1) % points.length];
    return { ...p, hx: (next.x - prev.x) * tension, hy: (next.y - prev.y) * tension };
  });
}

/** Inserts a control point in the middle of the segment that starts at `index`, keeping the curve's shape there. */
export function splitSegment(points: ControlPoint[], index: number): ControlPoint[] {
  const a = points[index];
  const b = points[(index + 1) % points.length];
  const mid = segmentPoint(a, b, 0.5);
  const before = segmentPoint(a, b, 0.45);
  const after = segmentPoint(a, b, 0.55);
  const tx = after.x - before.x;
  const ty = after.y - before.y;
  const len = Math.hypot(tx, ty) || 1;
  const reach = Math.hypot(b.x - a.x, b.y - a.y) / 6;
  const halve = (p: ControlPoint): ControlPoint => ({ ...p, hx: p.hx / 2, hy: p.hy / 2 });
  const out = points.map((p, i) => (i === index || i === (index + 1) % points.length ? halve(p) : p));
  out.splice(index + 1, 0, { x: mid.x, y: mid.y, hx: (tx / len) * reach, hy: (ty / len) * reach });
  return out;
}

/** Slot index of a fraction of the lap with `n` slots. */
export const slotOf = (f: number, n: number): number => ((Math.round(f * n) % n) + n) % n;

/** Slots of the forward range from slot a to slot b (inclusive, wrapping past the end of the lap). */
export function slotRange(a: number, b: number, n: number): number[] {
  const out: number[] = [];
  for (let s = a; ; s = (s + 1) % n) {
    out.push(s);
    if (s === b || out.length >= n) break;
  }
  return out;
}
