export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Pure 2D camera: (cx, cy) is the world point at the centre of a w x h viewport. */
export class Camera {
  cx = 0;
  cy = 0;
  zoom = 1;
  w = 1;
  h = 1;
  minZoom = 0.1;
  maxZoom = 3;
  bounds: Bounds | null = null;
  margin = 80;

  setViewport(w: number, h: number): void {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.clamp();
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: this.cx + (sx - this.w / 2) / this.zoom, y: this.cy + (sy - this.h / 2) / this.zoom };
  }

  worldToScreen(x: number, y: number): { x: number; y: number } {
    return { x: (x - this.cx) * this.zoom + this.w / 2, y: (y - this.cy) * this.zoom + this.h / 2 };
  }

  panByScreen(dx: number, dy: number): void {
    this.cx -= dx / this.zoom;
    this.cy -= dy / this.zoom;
    this.clamp();
  }

  /** Zooms by `factor` keeping the world point under screen point (sx, sy) fixed. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.screenToWorld(sx, sy);
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    this.cx = before.x - (sx - this.w / 2) / this.zoom;
    this.cy = before.y - (sy - this.h / 2) / this.zoom;
    this.clamp();
  }

  centerOn(x: number, y: number): void {
    this.cx = x;
    this.cy = y;
    this.clamp();
  }

  /** Zooms and centres so that `b` fits the viewport with `padding` screen pixels around it. */
  fit(b: Bounds, padding = 24): void {
    const bw = Math.max(1, b.maxX - b.minX);
    const bh = Math.max(1, b.maxY - b.minY);
    const z = Math.min((this.w - 2 * padding) / bw, (this.h - 2 * padding) / bh);
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, z));
    this.cx = (b.minX + b.maxX) / 2;
    this.cy = (b.minY + b.maxY) / 2;
    this.clamp();
  }

  clamp(): void {
    if (!this.bounds) return;
    const { minX, minY, maxX, maxY } = this.bounds;
    this.cx = Math.min(maxX + this.margin, Math.max(minX - this.margin, this.cx));
    this.cy = Math.min(maxY + this.margin, Math.max(minY - this.margin, this.cy));
  }
}
