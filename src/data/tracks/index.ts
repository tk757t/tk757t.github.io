import type { TrackDef } from './schema';
import anneau from './anneau.json';
import col from './col.json';
import dunes from './dunes.json';
import epingles from './epingles.json';
import lac from './lac.json';
import oval from './oval.json';
import pins from './pins.json';

export { THEMES, TRACK_FORMAT, toTrack, type CellDef, type Theme, type TrackDef } from './schema';
export { raceReadyProblems, validateTrackDef } from './validate';

/** The default circuit, until the game has its own circuits. */
export const DEFAULT_TRACK = 'oval';

/** Our original circuits drawn with the editor (/editor), from the easiest to the hardest (docs/circuits.md). */
export const EDITOR_CIRCUITS = ['dunes', 'pins', 'col'];

/**
 * The circuits loaded up front: our test circuits (src/data/tracks/generators) and the circuits drawn with the editor.
 * Others are loaded on demand (see `loadTrack`).
 */
export const TRACKS: Record<string, TrackDef> = {
  oval: oval as TrackDef,
  anneau: anneau as TrackDef,
  lac: lac as TrackDef,
  epingles: epingles as TrackDef,
  dunes: dunes as TrackDef,
  pins: pins as TrackDef,
  col: col as TrackDef,
};

export interface TrackInfo {
  id: string;
  name: string;
  cells: number;
  lapLength: number;
  /** d20 thresholds of the weather: rain below `rain`, cloud up to `sun`, sun above. */
  weather: { rain: number; sun: number };
  /** True when the circuit comes with the picture of its board. */
  image: boolean;
  /** Thumbnail of the board picture, relative to the public folder. */
  thumb: string | null;
}

const info = (def: TrackDef): TrackInfo => ({ id: def.id, name: def.name, cells: def.cells.length, lapLength: def.lapLength, weather: def.weather, image: def.image !== undefined, thumb: null });

/** Every circuit the game can race on, with what the setup screen needs (no circuit data loaded). The default one first. */
export const TRACK_LIST: TrackInfo[] = [TRACKS.oval, TRACKS.anneau, TRACKS.lac, TRACKS.epingles, ...EDITOR_CIRCUITS.map((id) => TRACKS[id])].map(info);

export const trackName = (id: string): string => TRACK_LIST.find((t) => t.id === id)?.name ?? id;

const loaders = new Map<string, () => Promise<TrackDef>>();

/** Adds circuits that are loaded on demand (development resources, later downloadable circuits). */
export function registerTracks(list: TrackInfo[], load: (id: string) => Promise<TrackDef>): void {
  for (const t of list) {
    if (TRACK_LIST.some((k) => k.id === t.id)) continue;
    TRACK_LIST.push(t);
    loaders.set(t.id, () => load(t.id));
  }
}

/** Loads a circuit by id (the registered ones are fetched when first used). */
export async function loadTrack(id: string): Promise<TrackDef> {
  const known = TRACKS[id];
  if (known) return known;
  const load = loaders.get(id);
  if (!load) throw new Error(`unknown circuit ${id}`);
  const def = await load();
  TRACKS[id] = def;
  return def;
}
