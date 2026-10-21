import { authClient } from './supabase';

/** The open rooms of the unranked race (supabase/migrations/20261022150000_open_rooms.sql): who clicks fills the room of the one before, up to four. */
export interface OpenRoom {
  room: string;
  /** True for the player who created the room: they start the race. */
  host: boolean;
  /** Players in the room, this one included. */
  seats: number;
}

interface Row {
  room: string;
  host: boolean;
  seats: number;
}

export async function joinOpenRoom(): Promise<OpenRoom> {
  const { data, error } = await authClient().rpc('open_join');
  if (error) throw error;
  const row = ((data ?? []) as Row[])[0];
  if (!row) throw new Error('Aucune salle.');
  return { room: row.room, host: row.host === true, seats: Number(row.seats) };
}

/** The host closes the room when the race starts (best effort: a room that stays open expires by itself). */
export async function closeOpenRoom(room: string): Promise<void> {
  await authClient().rpc('open_close', { p_room: room });
}
