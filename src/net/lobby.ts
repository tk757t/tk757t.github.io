import { authClient } from './supabase';

/** Who is online and who is waiting (supabase/migrations/20261022160000_lobby_stats.sql). */
export const PRESENCE_PING_MS = 45_000;
export const LOBBY_STATS_MS = 8_000;

export interface LobbyStats {
  online: number;
  rankedWaiting: number;
  openWaiting: number;
}

/** Says "I am here": the server counts the devices seen in the last 90 seconds. Never throws: a missed signal only counts one player less. */
export async function pingPresence(): Promise<void> {
  try {
    await authClient().rpc('presence_ping');
  } catch {
    /* offline */
  }
}

/** The counts, or null when the server cannot be reached (the screens then show nothing rather than a wrong number). */
export async function fetchLobbyStats(): Promise<LobbyStats | null> {
  try {
    const { data, error } = await authClient().rpc('lobby_stats');
    if (error) return null;
    const row = ((data ?? []) as { online: number; ranked_waiting: number; open_waiting: number }[])[0];
    if (!row) return null;
    return { online: Number(row.online), rankedWaiting: Number(row.ranked_waiting), openWaiting: Number(row.open_waiting) };
  } catch {
    return null;
  }
}

const plural = (n: number, one: string, many: string): string => `${n} ${n > 1 ? many : one}`;

/** "3 joueurs en ligne". */
export const onlineLabel = (n: number): string => `${plural(n, 'joueur', 'joueurs')} en ligne`;

/** "En attente : 2 en classé, 0 en non classé". */
export const waitingLabel = (s: LobbyStats): string => `En attente : ${s.rankedWaiting} en classé, ${s.openWaiting} en non classé`;
