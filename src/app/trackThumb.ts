import type { TrackDef } from '../data/tracks';
import { COLORS } from '../ui/kit/tokens';

export const THUMB_WIDTH = 360;
export const THUMB_HEIGHT = 240;

/** Map of a circuit drawn from its cells (for circuits without a board picture): an SVG image, 360 x 240, as a data URL. */
export function trackThumbUrl(def: TrackDef): string {
  const xs = def.cells.map((c) => c.x);
  const ys = def.cells.map((c) => c.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = 24;
  const scale = Math.min((THUMB_WIDTH - 2 * pad) / Math.max(1, maxX - minX), (THUMB_HEIGHT - 2 * pad) / Math.max(1, maxY - minY));
  const ox = (THUMB_WIDTH - (maxX - minX) * scale) / 2;
  const oy = (THUMB_HEIGHT - (maxY - minY) * scale) / 2;
  const r = Math.max(2, Math.round((def.cellRadius ?? 20) * scale * 10) / 10);
  const fill = (c: TrackDef['cells'][number]) => (c.startLine ? COLORS.text : c.corner ? COLORS.red : c.type >= 2 ? COLORS.gold : COLORS.lineLight);
  const dots = def.cells
    .map((c) => `<circle cx="${Math.round((c.x - minX) * scale + ox)}" cy="${Math.round((c.y - minY) * scale + oy)}" r="${r}" fill="${fill(c)}"/>`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${THUMB_WIDTH}" height="${THUMB_HEIGHT}" viewBox="0 0 ${THUMB_WIDTH} ${THUMB_HEIGHT}"><rect width="100%" height="100%" fill="${COLORS.green}"/>${dots}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
