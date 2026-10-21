import { devParam } from '../app/devParams';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

/** A message between the players of a room. `from` is the sender's client id. */
export interface NetMsg {
  t: string;
  from: string;
  [key: string]: unknown;
}

/**
 * A room's message bus: what one player sends, every other player of the room receives (never the sender).
 * Delivery is in order for a given sender; the session (session.ts) does the rest.
 */
export interface Transport {
  /** Resolves once messages can be sent and received. */
  ready: Promise<void>;
  send(msg: NetMsg): void;
  onMessage(fn: (msg: NetMsg) => void): () => void;
  close(): void;
}

function listeners() {
  const set = new Set<(m: NetMsg) => void>();
  return {
    add: (fn: (m: NetMsg) => void) => {
      set.add(fn);
      return () => set.delete(fn);
    },
    emit: (m: NetMsg) => set.forEach((fn) => fn(m)),
  };
}

let client: SupabaseClient | null = null;

/** Supabase Realtime broadcast on the channel `4mules:<code>` (no table, nothing stored). */
export function supabaseTransport(code: string): Transport {
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const subs = listeners();
  const channel: RealtimeChannel = client.channel(`4mules:${code}`, { config: { broadcast: { self: false, ack: false } } });
  channel.on('broadcast', { event: 'm' }, ({ payload }) => subs.emit(payload as NetMsg));
  const ready = new Promise<void>((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve();
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(`connexion impossible (${status})`));
    });
  });
  return {
    ready,
    send: (msg) => void channel.send({ type: 'broadcast', event: 'm', payload: msg }),
    onMessage: subs.add,
    close: () => void client?.removeChannel(channel),
  };
}

/** Between the tabs of one browser (BroadcastChannel): end-to-end tests and trying the game alone (?net=local). */
export function localTransport(code: string): Transport {
  const subs = listeners();
  const bc = new BroadcastChannel(`4mules:${code}`);
  bc.onmessage = (e) => subs.emit(e.data as NetMsg);
  return { ready: Promise.resolve(), send: (msg) => bc.postMessage(msg), onMessage: subs.add, close: () => bc.close() };
}

/** In-memory rooms for unit tests: transports created from the same hub and code talk to each other, synchronously. */
export function memoryHub() {
  const rooms = new Map<string, Set<(m: NetMsg) => void>>();
  return {
    create(code: string): Transport {
      const room = rooms.get(code) ?? new Set();
      rooms.set(code, room);
      const subs = listeners();
      const deliver = (m: NetMsg) => subs.emit(m);
      room.add(deliver);
      return {
        ready: Promise.resolve(),
        send: (msg) => room.forEach((d) => d !== deliver && d(JSON.parse(JSON.stringify(msg)) as NetMsg)),
        onMessage: subs.add,
        close: () => room.delete(deliver),
      };
    },
  };
}

/** The transport the game uses: Supabase, or the tabs of this browser with ?net=local. */
export function transportFor(code: string): Transport {
  return devParam('net') === 'local' ? localTransport(code) : supabaseTransport(code);
}
