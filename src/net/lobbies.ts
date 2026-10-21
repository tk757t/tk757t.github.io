import { authClient } from './supabase';

/** The public games of « Course perso » (supabase/migrations/20261022170000_lobbies.sql): a host creates one, the others see the list and join. */
export const LOBBIES_POLL_MS = 3_000;
/** The host tells the server it is still there, and how many players are in the room. */
export const LOBBY_TOUCH_MS = 8_000;

export interface Lobby {
  code: string;
  host: string;
  trackId: string;
  laps: number;
  seats: number;
  maxSeats: number;
}

interface Row {
  code: string;
  host_pseudo: string;
  track_id: string;
  laps: number;
  seats: number;
  max_seats: number;
}

const toLobby = (r: Row): Lobby => ({ code: r.code, host: r.host_pseudo, trackId: r.track_id, laps: Number(r.laps), seats: Number(r.seats), maxSeats: Number(r.max_seats) });

export async function listLobbies(): Promise<Lobby[]> {
  const { data, error } = await authClient().rpc('lobby_list');
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toLobby);
}

/** Creates the host's game and resolves its room code. */
export async function createLobby(trackId: string, laps: number, maxSeats: number): Promise<string> {
  const { data, error } = await authClient().rpc('lobby_create', { p_track: trackId, p_laps: laps, p_max: maxSeats });
  if (error) throw error;
  return String(data);
}

/** Takes a seat in a game of the list. */
export async function joinLobby(code: string): Promise<Lobby> {
  const { data, error } = await authClient().rpc('lobby_join', { p_code: code });
  if (error) throw error;
  const row = ((data ?? []) as Row[])[0];
  if (!row) throw new Error('Cette partie est complète ou fermée.');
  return toLobby(row);
}

export async function touchLobby(code: string, seats: number): Promise<void> {
  await authClient().rpc('lobby_touch', { p_code: code, p_seats: seats });
}

export async function closeLobby(code: string): Promise<void> {
  await authClient().rpc('lobby_close', { p_code: code });
}
