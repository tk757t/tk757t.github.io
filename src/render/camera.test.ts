import { describe, expect, it } from 'vitest';
import { Camera } from './camera';

function cam(): Camera {
  const c = new Camera();
  c.setViewport(400, 800);
  return c;
}

describe('Camera', () => {
  it('maps screen and world both ways', () => {
    const c = cam();
    c.cx = 100;
    c.cy = -50;
    c.zoom = 2;
    const w = c.screenToWorld(300, 300);
    expect(w).toEqual({ x: 150, y: -100 + 0 });
    expect(c.worldToScreen(w.x, w.y)).toEqual({ x: 300, y: 300 });
  });

  it('zooms around a screen point, keeping the world point under it', () => {
    const c = cam();
    const before = c.screenToWorld(100, 200);
    c.zoomAt(100, 200, 2);
    expect(c.zoom).toBe(2);
    const after = c.screenToWorld(100, 200);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('clamps zoom to its limits', () => {
    const c = cam();
    c.zoomAt(0, 0, 100);
    expect(c.zoom).toBe(c.maxZoom);
    c.zoomAt(0, 0, 0.0001);
    expect(c.zoom).toBe(c.minZoom);
  });

  it('pans opposite to the drag, scaled by zoom', () => {
    const c = cam();
    c.zoom = 2;
    c.panByScreen(40, -20);
    expect(c.cx).toBe(-20);
    expect(c.cy).toBe(10);
  });

  it('keeps the centre within the bounds plus margin', () => {
    const c = cam();
    c.bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    c.panByScreen(-100000, 100000);
    expect(c.cx).toBe(100 + c.margin);
    expect(c.cy).toBe(-c.margin);
  });

  it('fits bounds in the viewport', () => {
    const c = cam();
    c.fit({ minX: -500, maxX: 500, minY: -100, maxY: 100 }, 0);
    expect(c.zoom).toBeCloseTo(0.4);
    expect(c.cx).toBe(0);
    expect(c.cy).toBe(0);
  });
});
