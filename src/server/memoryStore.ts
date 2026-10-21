import type { GameStore, LogEntry, StoredRow } from './handler';
import type { ServerState } from './state';

/** An in-memory GameStore (unit tests, and the fake Supabase of the e2e tests). Same contract as the Supabase one. */
export interface MemoryStore extends GameStore {
  rows: Map<string, StoredRow>;
  logs: (LogEntry & { uid: string; at: number })[];
  suspended: Map<string, string>;
  /** Session token -> user id. */
  sessions: Map<string, string>;
  /** Runs once before the next commit (to simulate another request writing in between). */
  beforeCommit: (() => void) | null;
}

export function memoryStore(now: () => number = Date.now): MemoryStore {
  const rows = new Map<string, StoredRow>();
  const logs: MemoryStore['logs'] = [];
  const clone = (s: ServerState): unknown => JSON.parse(JSON.stringify(s));
  const store: MemoryStore = {
    rows,
    logs,
    suspended: new Map(),
    sessions: new Map(),
    beforeCommit: null,
    async userOf(token) {
      const id = store.sessions.get(token);
      return id ? { id } : null;
    },
    async suspension(uid) {
      return store.suspended.get(uid) ?? null;
    },
    async recentActions(uid, sinceMs) {
      return logs.filter((l) => l.uid === uid && l.at >= sinceMs).length;
    },
    async load(uid) {
      const row = rows.get(uid);
      return row ? { state: JSON.parse(JSON.stringify(row.state)), version: row.version } : null;
    },
    async create(uid, state, log) {
      if (rows.has(uid)) return false;
      rows.set(uid, { state: clone(state), version: 0 });
      logs.push({ ...log, uid, at: now() });
      return true;
    },
    async commit(uid, version, state, log) {
      const hook = store.beforeCommit;
      store.beforeCommit = null;
      hook?.();
      const row = rows.get(uid);
      if (!row || row.version !== version) return null;
      rows.set(uid, { state: clone(state), version: version + 1 });
      logs.push({ ...log, uid, at: now() });
      return version + 1;
    },
  };
  return store;
}
