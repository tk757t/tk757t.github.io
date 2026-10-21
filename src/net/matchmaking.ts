import { leagueOf, type RankLeague } from '../data/ranked';
import { authClient } from './supabase';

/**
 * The ranked queue. The server (supabase/migrations/20261022140000_ranked_queue.sql) forms the groups and gives the room;
 * the room itself is the one of the friends' games (src/net/session.ts).
 */
export const QUEUE_POLL_MS = 2_000;

export interface QueuePlayer {
  /** Account id: it is also the id of the player in the room. */
  id: string;
  pseudo: string;
  trophies: number;
  league: RankLeague;
}

export type QueueState =
  | { status: 'none' }
  | { status: 'waiting'; waitedS: number; gap: number; found: number }
  | { status: 'matched'; room: string; host: boolean; ais: number; players: QueuePlayer[] };

interface PollRow {
  status: string;
  room: string | null;
  host: boolean;
  ais: number;
  waited: number;
  gap: number;
  found: number;
  players: { id: string; pseudo: string; trophies: number }[] | null;
}

/** Enters the queue with these trophies (the server keeps the lower of them and its own count). */
export async function joinQueue(trophies: number): Promise<void> {
  const { error } = await authClient().rpc('queue_join', { p_trophies: Math.max(0, Math.floor(trophies)) });
  if (error) throw error;
}

export async function leaveQueue(): Promise<void> {
  await authClient().rpc('queue_leave');
}

export async function pollQueue(): Promise<QueueState> {
  const { data, error } = await authClient().rpc('queue_poll');
  if (error) throw error;
  const row = ((data ?? []) as PollRow[])[0];
  if (!row || row.status === 'none') return { status: 'none' };
  if (row.status === 'matched' && row.room) {
    const players = (row.players ?? []).map((p) => ({ id: p.id, pseudo: p.pseudo, trophies: Number(p.trophies), league: leagueOf(Number(p.trophies)) }));
    return { status: 'matched', room: row.room, host: row.host === true, ais: Number(row.ais), players };
  }
  return { status: 'waiting', waitedS: Number(row.waited), gap: Number(row.gap), found: Number(row.found) };
}

/** The signed-in account's id (the id of the player in a ranked room), or null. */
export async function myAccountId(): Promise<string | null> {
  const { data } = await authClient().auth.getSession();
  return data.session?.user.id ?? null;
}
