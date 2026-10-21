import type { Camera } from './camera';

export interface InputCallbacks {
  /** The user moved the camera (drag, pinch or wheel). */
  onUserMove(): void;
  /** A tap/click without dragging, in canvas pixels. */
  onTap(sx: number, sy: number): void;
}

const DRAG_THRESHOLD = 6;

/** Wires mouse drag, wheel and two-finger pinch to a Camera. Returns a disposer. */
export function attachInput(canvas: HTMLCanvasElement, camera: Camera, cb: InputCallbacks): () => void {
  const pointers = new Map<number, { x: number; y: number }>();
  let dragging = false;
  let start = { x: 0, y: 0 };

  const local = (e: PointerEvent | WheelEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const pinch = () => {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  const down = (e: PointerEvent) => {
    const p = local(e);
    pointers.set(e.pointerId, p);
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointers cannot be captured */
    }
    if (pointers.size === 1) {
      dragging = false;
      start = p;
    } else dragging = true;
  };

  const move = (e: PointerEvent) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    if (pointers.size === 1) {
      if (!dragging && Math.hypot(p.x - start.x, p.y - start.y) > DRAG_THRESHOLD) dragging = true;
      pointers.set(e.pointerId, p);
      if (dragging) {
        camera.panByScreen(p.x - prev.x, p.y - prev.y);
        cb.onUserMove();
      }
    } else if (pointers.size === 2) {
      const before = pinch();
      pointers.set(e.pointerId, p);
      const after = pinch();
      if (before.dist > 0) camera.zoomAt(after.mx, after.my, after.dist / before.dist);
      camera.panByScreen(after.mx - before.mx, after.my - before.my);
      cb.onUserMove();
    }
  };

  const up = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e);
    const wasTap = pointers.size === 1 && !dragging && e.type === 'pointerup';
    pointers.delete(e.pointerId);
    if (wasTap) cb.onTap(p.x, p.y);
  };

  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = local(e);
    camera.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
    cb.onUserMove();
  };

  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
  return () => {
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', up);
    canvas.removeEventListener('wheel', wheel);
  };
}
