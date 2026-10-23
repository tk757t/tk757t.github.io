import 'pixi.js/unsafe-eval';
import { Application, Container, Graphics, Text } from 'pixi.js';
import { Camera } from '../render/camera';
import { drawScenery, sceneryPlan } from '../render/scenery';
import type { CellDef } from '../data/tracks/schema';
import type { EditorDoc } from './doc';
import type { Generated } from './generate';
import { polyline } from './geometry';

export type Mode = 'trace' | 'zones' | 'gears' | 'circuit';

/** What the view draws: the document, its generated circuit and the editor's selections. */
export interface ViewModel {
  doc: EditorDoc;
  gen: Generated;
  mode: Mode;
  selectedPoint: number | null;
  /** Selected slots (zones mode). */
  selection: number[];
  selectedCell: string | null;
  /** Cells named by the selected problem. */
  highlight: Set<string>;
  /** Stops left whose advised gear is written on the cells (gears mode). */
  gearStops: number;
}

export type DragTarget = { kind: 'point' | 'handle'; index: number };

const COLORS = {
  background: 0x0c1d4d,
  cell: 0x2b3340,
  edge: 0x9aa6b8,
  pit: 0x2c4a66,
  box: 0x4d7fb8,
  corner: { 1: 0xf2c94c, 2: 0xf2994a, 3: 0xeb5757 } as Record<number, number>,
  selection: 0x4fd1c5,
  problem: 0xff3b6b,
  grid: 0xff2bd6,
  point: 0xffcc1a,
  handle: 0x5fdcff,
};

/** Screen distance (px) within which a point or handle is grabbed: a 44 px touch target. */
const GRAB = 22;
const DRAG_THRESHOLD = 6;

/**
 * The drawing area of the editor (Pixi): scenery, cells, zones, start line, grid, control points and handles.
 * It reports taps (in world units) and drags of points and handles; the screen owns the document.
 */
export class EditorView {
  readonly camera = new Camera();
  onTap: ((x: number, y: number) => void) | null = null;
  onDrag: ((target: DragTarget, x: number, y: number) => void) | null = null;
  onDragEnd: (() => void) | null = null;

  private world = new Container();
  private sceneryLayer = new Container();
  private cellsLayer = new Graphics();
  private labels = new Container();
  private handlesLayer = new Graphics();
  private vm: ViewModel | null = null;
  private observer: ResizeObserver;
  private cells = new Map<string, CellDef>();

  private constructor(
    private app: Application,
    private host: HTMLElement,
  ) {
    this.world.addChild(this.sceneryLayer, this.cellsLayer, this.labels, this.handlesLayer);
    app.stage.addChild(this.world);
    this.camera.maxZoom = 4;
    this.camera.minZoom = 0.08;
    this.camera.margin = 600;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.wireInput();
    this.resize();
  }

  static async create(host: HTMLElement): Promise<EditorView> {
    const app = new Application();
    await app.init({ resizeTo: host, background: COLORS.background, antialias: true, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2) });
    host.appendChild(app.canvas);
    app.canvas.style.display = 'block';
    app.canvas.setAttribute('aria-label', 'Dessin du circuit');
    app.canvas.setAttribute('role', 'img');
    return new EditorView(app, host);
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  /** Redraws everything; `scenery` also rebuilds the background (skipped while dragging, it is the slowest part). */
  render(vm: ViewModel, scenery = true): void {
    this.vm = vm;
    this.cells = new Map(vm.gen.def.cells.map((c) => [c.id, c]));
    if (scenery) {
      this.sceneryLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
      const plan = sceneryPlan(vm.gen.def);
      if (plan) this.sceneryLayer.addChild(drawScenery(plan, vm.gen.def.cellRadius ?? 15));
    }
    this.sceneryLayer.alpha = vm.mode === 'trace' ? 0.55 : 1;
    this.drawCells(vm);
    this.drawLabels(vm, scenery);
    this.drawHandles(vm);
    this.camera.bounds = this.bounds(vm);
  }

  /** Fits the whole drawing in view. */
  fit(): void {
    if (!this.vm) return;
    this.camera.fit(this.bounds(this.vm), 24);
    this.apply();
  }

  zoomBy(factor: number): void {
    this.camera.zoomAt(this.camera.w / 2, this.camera.h / 2, factor);
    this.apply();
  }

  /** Page coordinates of a world point (tests drive the canvas with them). */
  toPage(x: number, y: number): { x: number; y: number } {
    const p = this.camera.worldToScreen(x, y);
    const b = this.app.canvas.getBoundingClientRect();
    return { x: p.x + b.left, y: p.y + b.top };
  }

  cellScreen(id: string): { x: number; y: number } | null {
    const c = this.cells.get(id);
    return c ? this.toPage(c.x, c.y) : null;
  }

  /** Centres a cell in view at a readable zoom. */
  focus(id: string): void {
    const c = this.cells.get(id);
    if (!c) return;
    this.camera.zoom = Math.max(this.camera.zoom, 0.9);
    this.camera.centerOn(c.x, c.y);
    this.apply();
  }

  destroy(): void {
    this.observer.disconnect();
    this.app.destroy(true, { children: true });
  }

  private bounds(vm: ViewModel) {
    const xs = [...vm.gen.def.cells.map((c) => c.x), ...vm.doc.points.map((p) => p.x)];
    const ys = [...vm.gen.def.cells.map((c) => c.y), ...vm.doc.points.map((p) => p.y)];
    const pad = (vm.gen.def.cellRadius ?? 15) * 3;
    return { minX: Math.min(...xs) - pad, minY: Math.min(...ys) - pad, maxX: Math.max(...xs) + pad, maxY: Math.max(...ys) + pad };
  }

  private drawCells(vm: ViewModel): void {
    const g = this.cellsLayer.clear();
    const def = vm.gen.def;
    const r = def.cellRadius ?? 15;
    const sel = new Set(vm.selection);
    const slotOfCell = (c: CellDef) => (c.lane === 3 ? Number(c.id.slice(1)) : Number(c.id.split('S')[1]));
    // links along each lane and the pit lane (lane changes, allowed on every straight cell, would hatch the road)
    for (const c of def.cells) for (const n of c.next) {
      const t = this.cells.get(n);
      if (t && (t.lane === c.lane || t.type >= 2 || c.type >= 2)) g.moveTo(c.x, c.y).lineTo(t.x, t.y);
    }
    g.stroke({ width: r * 0.2, color: 0x10151c, alpha: 0.5 });
    for (const c of def.cells) {
      const stops = c.corner?.stops;
      const fill = stops ? COLORS.corner[stops] : c.type >= 3 ? COLORS.box : c.type === 2 ? COLORS.pit : COLORS.cell;
      g.circle(c.x, c.y, r).fill(fill);
      g.circle(c.x, c.y, r).stroke({ width: r * 0.1, color: COLORS.edge });
      if (c.risk > 0) g.circle(c.x, c.y, r * 0.45).stroke({ width: r * 0.16, color: 0xd93a32 });
      if (c.startLine) {
        const s = r * 0.4;
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) g.rect(c.x - s + i * s, c.y - s + j * s, s, s).fill((i + j) % 2 === 0 ? 0xffffff : 0x111111);
      }
      if (c.grid !== undefined) g.circle(c.x, c.y, r * 1.22).stroke({ width: r * 0.16, color: COLORS.grid });
      if (vm.mode === 'zones' && sel.has(slotOfCell(c))) g.circle(c.x, c.y, r * 1.3).stroke({ width: r * 0.22, color: COLORS.selection });
      if (vm.mode === 'gears' && vm.doc.gears[c.id]) g.circle(c.x, c.y, r * 1.18).stroke({ width: r * 0.14, color: 0xffffff });
      if (vm.mode === 'gears' && vm.selectedCell === c.id) g.circle(c.x, c.y, r * 1.35).stroke({ width: r * 0.22, color: COLORS.selection });
      if (vm.highlight.has(c.id)) g.circle(c.x, c.y, r * 1.45).stroke({ width: r * 0.24, color: COLORS.problem });
    }
  }

  private drawLabels(vm: ViewModel, full: boolean): void {
    if (!full && vm.mode === 'trace') {
      this.labels.visible = false;
      return;
    }
    this.labels.visible = true;
    this.labels.removeChildren().forEach((c) => c.destroy());
    const def = vm.gen.def;
    const r = def.cellRadius ?? 15;
    const text = (s: string, x: number, y: number, size: number, fill: number, stroke = 0x0b1020) => {
      const t = new Text({ text: s, style: { fontFamily: 'Nunito, system-ui, sans-serif', fontSize: size, fontWeight: '800', fill, stroke: { color: stroke, width: size * 0.22 } } });
      t.anchor.set(0.5);
      t.position.set(x, y);
      this.labels.addChild(t);
    };
    // corner captions beside the outer lane
    const zones = new Map<string, CellDef[]>();
    for (const c of def.cells) if (c.corner) zones.set(c.corner.id, [...(zones.get(c.corner.id) ?? []), c]);
    const cx = def.cells.reduce((a, c) => a + c.x, 0) / def.cells.length;
    const cy = def.cells.reduce((a, c) => a + c.y, 0) / def.cells.length;
    for (const [id, cells] of zones) {
      const mid = cells[Math.floor(cells.length / 2)];
      const dx = mid.x - cx;
      const dy = mid.y - cy;
      const len = Math.hypot(dx, dy) || 1;
      const chicane = cells.some((c) => c.risk > 0);
      const stops = cells[0].corner!.stops;
      text(`${id} · ${stops} arrêt${stops > 1 ? 's' : ''}${chicane ? ' · chicane' : ''}`, mid.x + (dx / len) * r * 4.5, mid.y + (dy / len) * r * 4.5, r * 1.1, COLORS.corner[stops]);
    }
    for (const c of def.cells) {
      if (c.type >= 3) text(String(c.type - 2), c.x, c.y, r * 1.05, 0xffffff);
      if (c.grid !== undefined) text(String(c.grid + 1), c.x, c.y, r * 0.95, 0xffffff, 0x5a0a4a);
      if (vm.mode === 'gears' && c.type < 2) text(String(c.gear[vm.gearStops]), c.x, c.y, r * 0.95, c.corner ? 0x1a1305 : 0xffffff, c.corner ? 0xffffff : 0x0b1020);
    }
  }

  private drawHandles(vm: ViewModel): void {
    const g = this.handlesLayer.clear();
    if (vm.mode !== 'trace') return;
    const z = this.camera.zoom;
    const line = polyline(vm.doc.points, 24);
    g.moveTo(line[0].x, line[0].y);
    for (const p of line.slice(1)) g.lineTo(p.x, p.y);
    g.closePath().stroke({ width: 2.5 / z, color: 0xffffff, alpha: 0.85 });
    vm.doc.points.forEach((p, i) => {
      if (i === vm.selectedPoint) {
        const hs = 8 / z;
        for (const sign of [1, -1]) {
          const hx = p.x + sign * p.hx;
          const hy = p.y + sign * p.hy;
          g.moveTo(p.x, p.y).lineTo(hx, hy).stroke({ width: 2 / z, color: COLORS.handle });
          g.rect(hx - hs, hy - hs, hs * 2, hs * 2).fill(COLORS.handle).stroke({ width: 2 / z, color: 0x0b1020 });
        }
      }
      g.circle(p.x, p.y, (i === vm.selectedPoint ? 13 : 10) / z).fill(i === 0 ? 0xffffff : COLORS.point).stroke({ width: 2.5 / z, color: 0x0b1020 });
    });
  }

  /** The point or handle under a screen position, if any. */
  private hit(sx: number, sy: number): DragTarget | null {
    const vm = this.vm;
    if (!vm || vm.mode !== 'trace') return null;
    const near = (x: number, y: number) => {
      const p = this.camera.worldToScreen(x, y);
      return Math.hypot(p.x - sx, p.y - sy) <= GRAB;
    };
    if (vm.selectedPoint !== null) {
      const p = vm.doc.points[vm.selectedPoint];
      if (p && near(p.x + p.hx, p.y + p.hy)) return { kind: 'handle', index: vm.selectedPoint };
      if (p && near(p.x - p.hx, p.y - p.hy)) return { kind: 'handle', index: -1 - vm.selectedPoint };
    }
    for (let i = vm.doc.points.length - 1; i >= 0; i--) if (near(vm.doc.points[i].x, vm.doc.points[i].y)) return { kind: 'point', index: i };
    return null;
  }

  private wireInput(): void {
    const canvas = this.app.canvas;
    const pointers = new Map<number, { x: number; y: number }>();
    let start = { x: 0, y: 0 };
    let moved = false;
    let target: DragTarget | null = null;
    const local = (e: PointerEvent | WheelEvent) => {
      const b = canvas.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => {
      const p = local(e);
      pointers.set(e.pointerId, p);
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic pointers cannot be captured */
      }
      if (pointers.size === 1) {
        start = p;
        moved = false;
        target = this.hit(p.x, p.y);
      } else target = null;
    });
    canvas.addEventListener('pointermove', (e) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const p = local(e);
      if (pointers.size === 1) {
        if (!moved && Math.hypot(p.x - start.x, p.y - start.y) > DRAG_THRESHOLD) moved = true;
        pointers.set(e.pointerId, p);
        if (!moved) return;
        if (target) {
          const w = this.camera.screenToWorld(p.x, p.y);
          this.onDrag?.(target, w.x, w.y);
        } else {
          this.camera.panByScreen(p.x - prev.x, p.y - prev.y);
          this.apply();
        }
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const before = Math.hypot(a.x - b.x, a.y - b.y);
        pointers.set(e.pointerId, p);
        const [c, d] = [...pointers.values()];
        const after = Math.hypot(c.x - d.x, c.y - d.y);
        if (before > 0) this.camera.zoomAt((c.x + d.x) / 2, (c.y + d.y) / 2, after / before);
        this.apply();
      }
    });
    const up = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const p = local(e);
      const single = pointers.size === 1;
      pointers.delete(e.pointerId);
      if (single && moved && target) this.onDragEnd?.();
      else if (single && !moved && e.type === 'pointerup') {
        const w = this.camera.screenToWorld(p.x, p.y);
        this.onTap?.(w.x, w.y);
      }
      target = null;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const p = local(e);
        this.camera.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
        this.apply();
      },
      { passive: false },
    );
    this.app.ticker.add(() => this.apply());
  }

  private resize(): void {
    this.camera.setViewport(this.host.clientWidth, this.host.clientHeight);
    this.apply();
  }

  private lastZoom = 0;

  private apply(): void {
    const c = this.camera;
    this.world.scale.set(c.zoom);
    this.world.position.set(c.w / 2 - c.cx * c.zoom, c.h / 2 - c.cy * c.zoom);
    // points and handles keep their screen size
    if (this.vm && c.zoom !== this.lastZoom) {
      this.lastZoom = c.zoom;
      this.drawHandles(this.vm);
    }
  }
}
