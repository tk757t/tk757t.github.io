// CSP-safe Pixi: the production page forbids eval (see contentSecurityPolicy in vite.config.ts)
import 'pixi.js/unsafe-eval';
import { Application, Assets, Container, Graphics, Sprite, Text, Texture, UPDATE_PRIORITY } from 'pixi.js';
import type { CellDef, TrackDef } from '../data/tracks/schema';
import { currentCar } from '../engine/reducer';
import type { RaceState } from '../engine/types';
import { Camera, type Bounds } from './camera';
import { attachInput } from './input';
import { CELL_STYLE, cellKind, pickCell, roundedRectPoints } from './cells';
import { drawScenery, sceneryPlan } from './scenery';

/** Half side of a cell, in cell radii: playable cells are rounded squares. */
const CELL_HALF = 0.92;

export const CELL_RADIUS = 15;
const TOKEN_RATIO = 11 / 15; // token radius / cell radius

const COLORS = {
  background: 0x0c1d4d,
  link: 0x3a4454,
  corner: { 1: 0xf2c94c, 2: 0xf2994a, 3: 0xeb5757 } as Record<number, number>,
  // destinations: cyan when free, yellow when they cost brakes or tires (orange is kept for the wear cells)
  reach: 0x5fdcff,
  costly: 0xffe14d,
  ring: 0xffffff,
};
export const CAR_COLORS = [0xe53935, 0x1e88e5, 0x43a047, 0xab47bc, 0xfb8c00, 0x00acc1];

/** Cosmetic overrides of a car token (paint, race number, helmet ring). */
export interface CarStyle {
  color?: number;
  label?: string;
  ring?: number;
  /** Top view of the car (nose pointing right): drawn instead of the round token, turned with the road. */
  sprite?: string;
  /** Where the nose of the picture points, radians (0 = right). */
  nose?: number;
}

const isLight = (c: number) => 0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255) > 150;

interface Token {
  view: Container;
  tx: number;
  ty: number;
  /** The turning part of a sprite token, its current heading and the heading it is turning to (radians). */
  body: Container | null;
  nose: number;
  rot: number;
  trot: number;
}

/** Loads a car picture (GIF files too, which PixiJS has no loader for: the first frame is used); null when missing. */
async function loadSprite(url: string): Promise<Texture | null> {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return Texture.from(img);
  } catch {
    return null;
  }
}

const SPRITE_WIDTH = 3.3; // width of a car sprite in cell radii
const angleDiff = (a: number, b: number) => ((((b - a) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;

/**
 * Draws a race. It only ever reads RaceState (via update); input is reported through callbacks,
 * the owner decides which action to dispatch.
 */
export class RaceRenderer {
  readonly camera = new Camera();
  onCellTap: ((cellId: string) => void) | null = null;
  /** True while the camera tracks the active car. Any manual pan/zoom pauses it until the next turn. */
  following = true;
  /** Height in px of a panel covering the bottom of the view: the followed car is centred above it. */
  bottomInset = 0;
  followZoom = 1;

  private world = new Container();
  private debugLayer = new Container();
  private debugOn = false;
  private textures = new Map<string, Texture>();
  /** Drawn radius of a cell: bigger circuits are drawn on a picture of several thousand pixels, so cells scale. */
  private r: number;
  /** Cells the tap should favour (the highlighted destinations). */
  private marked = new Set<string>();
  private reachLayer = new Graphics();
  /** Darkens the cells that cannot be chosen while destinations are shown. */
  private dimLayer = new Graphics();
  private cellPoly = new Map<string, number[]>();
  private carsLayer = new Container();
  private ring = new Graphics();
  private tokens = new Map<string, Token>();
  /** Per car id cosmetics, set before the first update(). */
  carStyles: Record<string, CarStyle> = {};
  private cellById = new Map<string, CellDef>();
  private bounds: Bounds;
  private lastActive: string | null = null;
  private disposeInput: () => void;
  private observer: ResizeObserver;
  /** A frame must be drawn: set by anything that changes what is on screen. */
  private dirty = true;
  private drawn = { zoom: NaN, cx: NaN, cy: NaN };
  private drawnSize = { w: 0, h: 0 };

  private constructor(
    private app: Application,
    private host: HTMLElement,
    private def: TrackDef,
    background: Texture | null,
    textures: Map<string, Texture>,
  ) {
    this.textures = textures;
    this.r = def.cellRadius ?? CELL_RADIUS;
    for (const c of def.cells) this.cellById.set(c.id, c);
    const xs = def.cells.map((c) => c.x);
    const ys = def.cells.map((c) => c.y);
    const u = this.r / CELL_RADIUS;
    this.bounds = {
      minX: Math.min(...xs) - this.r,
      maxX: Math.max(...xs) + this.r,
      minY: Math.min(...ys) - this.r,
      maxY: Math.max(...ys) + this.r,
    };
    if (def.image) {
      // the board picture is the playing field: the camera can show all of it
      this.bounds = { minX: Math.min(this.bounds.minX, 0), minY: Math.min(this.bounds.minY, 0), maxX: Math.max(this.bounds.maxX, def.image.width), maxY: Math.max(this.bounds.maxY, def.image.height) };
    } else {
      // room for the zone captions drawn outside the circuit
      this.bounds.minX -= 130 * u;
      this.bounds.maxX += 130 * u;
      this.bounds.maxY += 40 * u;
    }
    this.camera.bounds = this.bounds;
    if (background) {
      const board = new Sprite(background);
      board.width = def.image!.width;
      board.height = def.image!.height;
      this.world.addChild(board);
    }
    // circuits without a picture but with a theme get a procedural background
    const plan = sceneryPlan(def);
    if (plan) this.world.addChild(drawScenery(plan, this.r));
    // nothing but the cells (and the cars) ever receives a pointer: the decor is a picture
    this.world.eventMode = 'none';
    this.drawTrack();
    this.world.addChild(this.reachLayer, this.carsLayer, this.debugLayer);
    this.carsLayer.addChild(this.ring);
    this.app.stage.addChild(this.world);

    this.disposeInput = attachInput(app.canvas, this.camera, {
      onUserMove: () => {
        this.following = false;
      },
      onTap: (sx, sy) => this.tap(sx, sy),
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    // the board is static: draw a frame only when a token, the camera or the state changed (saves battery and CPU)
    this.app.ticker.remove(this.app.render, this.app);
    this.app.ticker.add(
      (t) => {
        this.tick(t.deltaMS);
        const { width, height } = this.app.screen;
        if (width !== this.drawnSize.w || height !== this.drawnSize.h) {
          this.drawnSize = { w: width, h: height };
          this.dirty = true;
        }
        if (this.dirty) {
          this.dirty = false;
          this.app.render();
        }
      },
      undefined,
      UPDATE_PRIORITY.LOW,
    );
  }

  /** `sprites`: urls of the car pictures to load before the first frame (see CarStyle.sprite). */
  static async create(host: HTMLElement, def: TrackDef, sprites: string[] = []): Promise<RaceRenderer> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      background: COLORS.background,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });
    host.appendChild(app.canvas);
    app.canvas.style.display = 'block';
    // the board picture, when the circuit has one (a missing file leaves the plain background)
    let background: Texture | null = null;
    if (def.image) background = await Assets.load<Texture>(`${import.meta.env.BASE_URL}${def.image.src}`).catch(() => null);
    const textures = new Map<string, Texture>();
    for (const url of new Set(sprites)) {
      const tex = await loadSprite(url);
      if (tex) textures.set(url, tex);
    }
    return new RaceRenderer(app, host, def, background, textures);
  }

  /** Redraws everything that depends on the race state. Does not modify it. */
  /**
   * Redraws what depends on the race state. `marks` are the cells to highlight: 'free' destinations in cyan,
   * 'costly' ones (they lose brakes or tires) in orange.
   */
  update(state: RaceState, marks: Map<string, 'free' | 'costly'> = new Map()): void {
    this.dirty = true;
    this.reachLayer.clear();
    this.dimLayer.clear();
    this.marked = new Set(marks.keys());
    const u = this.r / CELL_RADIUS;
    if (marks.size > 0) {
      // the cells that cannot be chosen fade, the destinations get a bright halo and a white edge
      for (const [id, pts] of this.cellPoly) if (!marks.has(id)) this.dimLayer.poly(pts).fill({ color: 0x0c1d4d, alpha: 0.38 });
    }
    for (const [id, kind] of marks) {
      const c = this.cellById.get(id);
      const pts = this.cellPoly.get(id);
      if (!c || !pts) continue;
      const color = kind === 'free' ? COLORS.reach : COLORS.costly;
      const grow = (k: number) => pts.map((v, i) => (i % 2 === 0 ? c.x + (v - c.x) * k : c.y + (v - c.y) * k));
      this.reachLayer.poly(grow(1.3)).fill({ color, alpha: 0.4 });
      this.reachLayer.poly(grow(1.3)).stroke({ width: 3 * u, color });
      this.reachLayer.poly(pts).stroke({ width: 3 * u, color: 0xffffff });
    }

    state.cars.forEach((car, i) => {
      let token = this.tokens.get(car.id);
      if (!token) {
        token = this.makeToken(i, car.id);
        this.tokens.set(car.id, token);
        this.carsLayer.addChild(token.view);
      }
      const cell = car.position ? this.cellById.get(car.position) : undefined;
      token.view.visible = cell !== undefined;
      if (cell) {
        if (token.tx === 0 && token.ty === 0 && token.view.x === 0 && token.view.y === 0) token.view.position.set(cell.x, cell.y);
        token.tx = cell.x;
        token.ty = cell.y;
        token.trot = this.headingAt(cell);
        if (token.body && token.view.x === 0 && token.view.y === 0) token.rot = token.trot;
      }
    });

    const active = state.status === 'racing' ? currentCar(state) : undefined;
    const activeCell = active?.position ? this.cellById.get(active.position) : undefined;
    this.ring.visible = activeCell !== undefined;
    if (active && activeCell) {
      const token = this.tokens.get(active.id)!;
      this.ring.position.set(token.tx, token.ty);
      this.carsLayer.addChild(this.ring); // keep the ring above tokens drawn earlier
      this.carsLayer.addChild(token.view);
      if (active.id !== this.lastActive) {
        this.following = true;
        this.lastActive = active.id;
      }
    }
  }

  /**
   * Frames the active car and the given cells in the part of the view above the bottom panel (zoom is kept
   * readable: never above the follow zoom). Stops following until the next turn or "Suivre".
   */
  frame(cellIds: string[]): void {
    const view = this.activeToken();
    const pts = cellIds.map((id) => this.cellById.get(id)).filter((c): c is NonNullable<typeof c> => c !== undefined);
    if (view) pts.push({ x: view.tx, y: view.ty } as (typeof pts)[number]);
    if (pts.length === 0) return;
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    const cam = this.camera;
    const pad = 70;
    const fit = Math.min((cam.w - pad) / Math.max(1, maxX - minX), (cam.h - this.bottomInset - pad * 1.6) / Math.max(1, maxY - minY));
    cam.zoom = Math.max(cam.minZoom, Math.min(this.followZoom, fit));
    cam.centerOn((minX + maxX) / 2, (minY + maxY) / 2 + this.bottomInset / 2 / cam.zoom);
    this.following = false;
    this.applyCamera();
  }

  /** Fits the whole circuit in view and stops following. */
  fitAll(): void {
    this.following = false;
    this.camera.fit(this.bounds, 16);
  }

  follow(): void {
    this.following = true;
  }

  /** Snaps animations to their targets (used by tests and screenshots). */
  settle(): void {
    this.dirty = true;
    for (const t of this.tokens.values()) t.view.position.set(t.tx, t.ty);
    const at = this.activeToken();
    if (at) this.ring.position.set(at.tx, at.ty);
    if (this.following) {
      const target = this.followTarget();
      if (target) this.camera.centerOn(target.x, target.y);
    }
    this.applyCamera();
  }

  destroy(): void {
    this.disposeInput();
    this.observer.disconnect();
    this.app.destroy(true, { children: true });
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  private followTarget(): { x: number; y: number } | null {
    const view = this.activeToken();
    return view ? { x: view.tx, y: view.ty + this.bottomInset / 2 / this.camera.zoom } : null;
  }

  private activeToken(): Token | null {
    if (!this.lastActive) return null;
    return this.tokens.get(this.lastActive) ?? null;
  }

  private resize(): void {
    const first = this.camera.w === 1 && this.camera.h === 1;
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.camera.setViewport(w, h);
    // Cells and numbers must stay readable on small screens: never go below a zoom where a
    // cell is smaller than ~16px, and fit the whole circuit as the lower zoom bound.
    const fitZoom = Math.min((w - 32) / (this.bounds.maxX - this.bounds.minX), (h - 32) / (this.bounds.maxY - this.bounds.minY));
    this.camera.minZoom = Math.max(0.05, fitZoom * 0.9);
    this.camera.maxZoom = Math.max(3, this.followZoom * 2.2);
    this.followZoom = (w < 600 ? 1.1 : 1) * (CELL_RADIUS / this.r);
    if (first) this.camera.zoom = this.followZoom;
    this.camera.zoom = Math.max(this.camera.zoom, this.camera.minZoom);
    this.applyCamera();
  }

  private tap(sx: number, sy: number): void {
    if (!this.onCellTap) return;
    const best = pickCell(this.def.cells, this.marked, this.camera.screenToWorld(sx, sy), this.r);
    if (best) this.onCellTap(best);
  }

  private tick(deltaMS: number): void {
    const k = 1 - Math.exp(-deltaMS / 90);
    for (const t of this.tokens.values()) {
      const dx = t.tx - t.view.x;
      const dy = t.ty - t.view.y;
      const dr = t.body ? angleDiff(t.rot, t.trot) : 0;
      if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01 && Math.abs(dr) < 0.001) continue;
      this.dirty = true;
      t.view.x += dx * k;
      t.view.y += dy * k;
      if (t.body) {
        t.rot += dr * k;
        t.body.rotation = t.rot - t.nose;
      }
    }
    const at = this.activeToken();
    if (at) this.ring.position.set(at.view.x, at.view.y);
    if (this.following) {
      const target = this.followTarget();
      if (target) {
        const kc = 1 - Math.exp(-deltaMS / 180);
        this.camera.centerOn(this.camera.cx + (target.x - this.camera.cx) * kc, this.camera.cy + (target.y - this.camera.cy) * kc);
      }
    }
    this.applyCamera();
  }

  private applyCamera(): void {
    const c = this.camera;
    const d = this.drawn;
    if (d.zoom === c.zoom && d.cx === c.cx && d.cy === c.cy) return;
    d.zoom = c.zoom;
    d.cx = c.cx;
    d.cy = c.cy;
    this.dirty = true;
    this.world.scale.set(c.zoom);
    this.world.position.set(c.w / 2 - c.cx * c.zoom, c.h / 2 - c.cy * c.zoom);
  }

  /** Direction of travel on a cell: its recorded angle, else towards its first successor. */
  private headingAt(c: CellDef): number {
    if (c.angle !== undefined) return c.angle;
    const n = this.cellById.get(c.next[0]);
    return n ? Math.atan2(n.y - c.y, n.x - c.x) : 0;
  }

  private makeToken(index: number, carId: string): Token {
    const view = new Container();
    const style = this.carStyles[carId] ?? {};
    const color = style.color ?? CAR_COLORS[index % CAR_COLORS.length];
    const tr = this.r * TOKEN_RATIO;
    const tex = style.sprite ? this.textures.get(style.sprite) : undefined;
    const label = new Text({
      text: style.label ?? (carId.replace(/D+/g, '') || String(index + 1)),
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: ((style.label?.length ?? 1) > 1 ? 11 : 13) * (this.r / CELL_RADIUS) * (tex ? 0.8 : 1),
        fontWeight: '700',
        fill: isLight(color) ? 0x10151c : 0xffffff,
      },
    });
    label.anchor.set(0.5);
    let body: Container | null = null;
    if (tex) {
      // the car itself, turned along the road; its number sits on a small disc in the car's colour above it
      body = new Container();
      const car = new Sprite(tex);
      car.anchor.set(0.5);
      const w = this.r * SPRITE_WIDTH;
      car.scale.set(w / tex.width);
      body.addChild(car);
      view.addChild(body);
      const disc = new Graphics();
      const dr = tr * 0.62;
      disc.circle(0, 0, dr).fill(color);
      disc.circle(0, 0, dr).stroke({ width: dr * 0.2, color: style.ring ?? 0xffffff });
      disc.position.set(0, -this.r * 1.05);
      label.position.set(0, -this.r * 1.05);
      view.addChild(disc);
    } else {
      const g = new Graphics();
      g.circle(0, 0, tr).fill(color);
      g.circle(0, 0, tr).stroke({ width: tr * 0.23, color: style.ring ?? 0xffffff });
      view.addChild(g);
    }
    view.addChild(label);
    return { view, tx: 0, ty: 0, body, nose: style.nose ?? 0, rot: 0, trot: 0 };
  }

  /** Screen position (in the page) of the centre of a cell, for effects drawn in HTML over the canvas. */
  screenOf(cellId: string): { x: number; y: number } | null {
    const c = this.cellById.get(cellId);
    if (!c) return null;
    const p = this.camera.worldToScreen(c.x, c.y);
    const b = this.app.canvas.getBoundingClientRect();
    return { x: p.x + b.left, y: p.y + b.top };
  }

  /** Size in screen pixels of one cell radius, for effects scaled with the zoom. */
  get cellPixels(): number {
    return this.r * this.camera.zoom;
  }

  private drawTrack(): void {
    const links = new Graphics();
    const cells = new Graphics();
    const labels = new Container();
    const u = this.r / CELL_RADIUS;
    const onBoard = this.def.image !== undefined;
    // on a procedural background the asphalt already shows the road: no links
    const onAsphalt = sceneryPlan(this.def) !== null;
    for (const c of onAsphalt ? [] : this.def.cells) {
      for (const n of c.next) {
        const t = this.cellById.get(n);
        if (t) links.moveTo(c.x, c.y).lineTo(t.x, t.y);
      }
    }
    links.stroke({ width: 5 * u, color: onBoard ? 0x10151c : COLORS.link, cap: 'round', alpha: onBoard ? 0.55 : 1 });

    const symbols = new Graphics();
    for (const c of this.def.cells) {
      const stops = c.corner?.stops;
      const kind = cellKind(c);
      const st = CELL_STYLE[kind];
      // on a board picture the cells stay a little see-through, so the road below can still be read
      const alpha = onBoard ? 0.88 : 1;
      const rot = this.headingAt(c);
      const pts = roundedRectPoints(c.x, c.y, this.r * CELL_HALF, this.r * CELL_HALF, rot, this.r * 0.28);
      this.cellPoly.set(c.id, pts);
      cells.poly(pts).fill({ color: st.fill, alpha });
      cells.poly(pts).stroke({ width: 2 * u, color: st.edge });
      // shapes that say the effect without colour: stripes = wear, cross = break
      const h = this.r * CELL_HALF * 0.62;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const p = (x: number, y: number): [number, number] => [c.x + x * cos - y * sin, c.y + x * sin + y * cos];
      if (kind === 'wear') {
        // three diagonal stripes in the cell's own frame
        for (const k of [-0.9, 0, 0.9]) {
          const a = p(k * h - h * 0.5, h);
          const b = p(k * h + h * 0.5, -h);
          symbols.moveTo(a[0], a[1]).lineTo(b[0], b[1]);
        }
        symbols.stroke({ width: 2.2 * u, color: st.ink, alpha: 0.4 });
      } else if (kind === 'break') {
        for (const [a, b] of [
          [p(-h, -h), p(h, h)],
          [p(-h, h), p(h, -h)],
        ]) symbols.moveTo(a[0], a[1]).lineTo(b[0], b[1]);
        symbols.stroke({ width: 2.6 * u, color: st.ink, alpha: 0.55 });
      }
      if (c.startLine) {
        // chequered flag: 2x2 squares
        const s = 6 * u;
        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 2; j++) {
            cells.rect(c.x - s + i * s, c.y - s + j * s, s, s).fill((i + j) % 2 === 0 ? 0xffffff : 0x111111);
          }
        }
      }
      const text = stops ? String(stops) : c.type >= 3 ? String(c.type - 2) : null; // corner stops, or the number of the team of a box
      if (text) {
        const t = new Text({
          text,
          style: { fontFamily: 'system-ui, sans-serif', fontSize: (stops ? 16 : 15) * u, fontWeight: '800', fill: st.ink, stroke: stops ? { color: st.fill, width: 3 * u } : undefined },
        });
        t.anchor.set(0.5);
        t.position.set(c.x, c.y);
        labels.addChild(t);
      }
    }

    // Zone captions: corner names and the pit straight.
    const zones = new Map<string, CellDef[]>();
    for (const c of this.def.cells) if (c.corner) zones.set(c.corner.id, [...(zones.get(c.corner.id) ?? []), c]);
    const centre = this.centre();
    // on a board picture the corners are already named by the picture and their cells carry the number of stops
    for (const [id, zc] of onBoard ? [] : zones) {
      const mx = zc.reduce((a, c) => a + c.x, 0) / zc.length;
      const my = zc.reduce((a, c) => a + c.y, 0) / zc.length;
      const stops = zc[0].corner!.stops;
      this.caption(labels, `${id} · ${stops} arrêt${stops > 1 ? 's' : ''}`, mx, my, centre, 115 * u, COLORS.corner[stops], onBoard || onAsphalt);
    }
    // on a procedural background the grandstands already show the pit straight
    const pit = onAsphalt ? [] : this.def.cells.filter((c) => c.tags?.includes('stands'));
    if (pit.length) {
      const mx = pit.reduce((a, c) => a + c.x, 0) / pit.length;
      const my = pit.reduce((a, c) => a + c.y, 0) / pit.length;
      this.caption(labels, 'LIGNE DROITE DES STANDS', mx, my, centre, 140 * u, 0x8fb8de, false);
    }
    this.world.addChild(links, cells, symbols, labels, this.dimLayer);
  }

  /**
   * "Debug cases" mode: writes on every cell its id, its row and, when it has them, grid slot (G), cells before the
   * next corner (>) and advised gear; used to check a circuit against its board picture.
   */
  setDebug(on: boolean): void {
    this.dirty = true;
    this.debugLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.debugOn = on;
    if (!on) return;
    const u = this.r / CELL_RADIUS;
    const g = new Graphics();
    for (const c of this.def.cells) {
      for (const n of c.next) {
        const t = this.cellById.get(n);
        if (!t) continue;
        const a = Math.atan2(t.y - c.y, t.x - c.x);
        const mx = (c.x + t.x) / 2;
        const my = (c.y + t.y) / 2;
        const s = 3.2 * u;
        g.moveTo(mx + Math.cos(a) * s, my + Math.sin(a) * s)
          .lineTo(mx + Math.cos(a + 2.5) * s, my + Math.sin(a + 2.5) * s)
          .lineTo(mx + Math.cos(a - 2.5) * s, my + Math.sin(a - 2.5) * s)
          .closePath()
          .fill(0xffffff);
      }
      if (c.grid !== undefined) g.circle(c.x, c.y, this.r * 1.25).stroke({ width: 2.5 * u, color: 0xff2bd6 });
    }
    this.debugLayer.addChild(g);
    for (const c of this.def.cells) {
      const parts = [String(c.row)];
      if (c.grid !== undefined) parts.push(`G${c.grid}`);
      const t = new Text({
        text: parts.join(' '),
        style: { fontFamily: 'system-ui, sans-serif', fontSize: 7.5 * u, fontWeight: '700', fill: c.grid !== undefined ? 0xff2bd6 : 0xffffff, stroke: { color: 0x000000, width: 2 * u } },
      });
      t.anchor.set(0.5);
      t.position.set(c.x, c.y - this.r * 0.15);
      this.debugLayer.addChild(t);
      const low = new Text({
        text: `${c.id.slice(1)}${c.toCorner !== undefined ? ` >${c.toCorner}` : ''}`,
        style: { fontFamily: 'system-ui, sans-serif', fontSize: 6 * u, fontWeight: '600', fill: 0x9fe8ff, stroke: { color: 0x000000, width: 1.6 * u } },
      });
      low.anchor.set(0.5);
      low.position.set(c.x, c.y + this.r * 0.45);
      this.debugLayer.addChild(low);
    }
  }

  get debug(): boolean {
    return this.debugOn;
  }

  private centre(): { x: number; y: number } {
    return { x: (this.bounds.minX + this.bounds.maxX) / 2, y: (this.bounds.minY + this.bounds.maxY) / 2 };
  }

  /** Puts a caption `dist` units away from (x, y), on the side away from the circuit centre. */
  private caption(parent: Container, text: string, x: number, y: number, c: { x: number; y: number }, dist: number, color: number, boxed: boolean): void {
    const dx = x - c.x;
    const dy = y - c.y;
    const len = Math.hypot(dx, dy) || 1;
    const t = new Text({
      text,
      style: { fontFamily: 'system-ui, sans-serif', fontSize: 15 * (this.r / CELL_RADIUS), fontWeight: '700', fill: color, letterSpacing: 1 },
    });
    // captions on the sides grow away from the circuit instead of over it
    const side = Math.abs(dx) / len > 0.5 ? (dx > 0 ? 0 : 1) : 0.5;
    t.anchor.set(side, 0.5);
    t.position.set(x + (dx / len) * dist, y + (dy / len) * dist);
    if (boxed) {
      // on a picture the caption needs a plate to be readable
      const plate = new Graphics();
      plate.roundRect(-4, -2, t.width + 8, t.height + 4, 4).fill({ color: 0x0c1d4d, alpha: 0.85 });
      t.position.set(t.position.x, t.position.y);
      const holder = new Container();
      holder.position.set(t.x - t.anchor.x * t.width, t.y - t.anchor.y * t.height);
      t.position.set(0, 0);
      t.anchor.set(0, 0);
      holder.addChild(plate, t);
      parent.addChild(holder);
      return;
    }
    parent.addChild(t);
  }
}
