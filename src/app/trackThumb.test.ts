import { describe, expect, it } from 'vitest';
import { TRACKS } from '../data/tracks';
import { THUMB_HEIGHT, THUMB_WIDTH, trackThumbUrl } from './trackThumb';

const svgOf = (url: string) => decodeURIComponent(url.replace('data:image/svg+xml,', ''));

describe('circuit thumbnail', () => {
  it('draws every cell of the circuit inside a 360 x 240 picture', () => {
    const def = TRACKS.epingles;
    const svg = svgOf(trackThumbUrl(def));
    expect(svg).toContain(`width="${THUMB_WIDTH}" height="${THUMB_HEIGHT}"`);
    const dots = [...svg.matchAll(/<circle cx="(-?\d+)" cy="(-?\d+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(dots).toHaveLength(def.cells.length);
    for (const [x, y] of dots) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(THUMB_WIDTH);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(THUMB_HEIGHT);
    }
  });

  it('gives each circuit its own picture', () => {
    expect(new Set(Object.values(TRACKS).map(trackThumbUrl)).size).toBe(Object.keys(TRACKS).length);
  });
});
