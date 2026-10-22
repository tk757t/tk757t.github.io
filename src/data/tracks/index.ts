import type { TrackDef } from './schema';
import anneau from './anneau.json';
import col from './col.json';
import corniche from './corniche.json';
import cratere from './cratere.json';
import dunes from './dunes.json';
import epingles from './epingles.json';
import lac from './lac.json';
import oval from './oval.json';
import pins from './pins.json';
import port from './port.json';

export { THEMES, TRACK_FORMAT, toTrack, type CellDef, type Theme, type TrackDef } from './schema';
export { raceReadyProblems, validateTrackDef } from './validate';

/** The default circuit, until the game has its own circuits. */
export const DEFAULT_TRACK = 'oval';

/**
 * Our original circuits drawn with the editor (/editor), by number of laps (docs/circuits.md). All of them last about five minutes:
 * the more laps, the shorter the lap. They are the circuits the ranked and unranked queues draw from, and the ones of the setup screens.
 */
export const EDITOR_CIRCUITS = ['dunes', 'port', 'corniche', 'pins', 'col', 'cratere'];

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
  port: port as TrackDef,
  corniche: corniche as TrackDef,
  pins: pins as TrackDef,
  col: col as TrackDef,
  cratere: cratere as TrackDef,
};

export interface TrackInfo {
  id: string;
  name: string;
  cells: number;
  lapLength: number;
  /** Laps the circuit is meant to be raced over (null for the test circuits). */
  laps?: number | null;
  /** d20 thresholds of the weather: rain below `rain`, cloud up to `sun`, sun above. */
  weather: { rain: number; sun: number };
  /** True when the circuit comes with the picture of its board. */
  image: boolean;
  /** Thumbnail of the board picture, relative to the public folder. */
  thumb: string | null;
}

const info = (def: TrackDef): TrackInfo => ({ id: def.id, name: def.name, cells: def.cells.length, lapLength: def.lapLength, laps: def.laps ?? null, weather: def.weather, image: def.image !== undefined, thumb: null });

/**
 * Every circuit the game can race on, with what the setup screen needs (no circuit data loaded). The default one first.
 * The other test circuits (anneau, lac, epingles) only serve the campaign: they are in TRACKS but not offered.
 */
export const TRACK_LIST: TrackInfo[] = [TRACKS.oval, ...EDITOR_CIRCUITS.map((id) => TRACKS[id])].map(info);

/** What the screens need to know about any circuit of the game, also those that are not offered (the campaign ones). */
export const trackInfo = (id: string): TrackInfo | undefined => (TRACKS[id] ? info(TRACKS[id]) : TRACK_LIST.find((t) => t.id === id));

/** A circuit in a list: its name, the laps it is meant for and its cells per lap. */
export const trackLabel = (t: TrackInfo): string => `${t.name}${t.laps ? ` · ${t.laps} tour${t.laps > 1 ? 's' : ''}` : ''} · ${t.lapLength} cases`;

/** The name of any circuit of the game (also those that are not offered, which the campaign and the lists of games still show). */
export const trackName = (id: string): string => TRACKS[id]?.name ?? TRACK_LIST.find((t) => t.id === id)?.name ?? id;

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
