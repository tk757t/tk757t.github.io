import type { AiLevel } from '../ai/types';
import type { Action } from '../engine/types';
import type { NetMsg, Transport } from './transport';

/**
 * An online race between friends (test version): one player hosts a room, the others join it with its code.
 * Everyone runs the same engine from the same seed and applies the same actions in the same order (docs/regles.md §16):
 * each player sends the actions of their own car, the host also those of the AIs and of players who left. The host keeps
 * the log and sends it to a player who comes back. Nothing is stored on a server: if the host leaves, the race stops.
 */

export const MAX_HUMANS = 4;
export const MAX_CARS = 4;
/** A player not heard from for this long is gone. */
export const GONE_AFTER_MS = 12_000;
export const PING_EVERY_MS = 3_000;

export interface Player {
  id: string;
  name: string;
}

export interface RoomSettings {
  trackId: string;
  laps: number;
  /** AI cars added after the players. */
  ais: number;
}

export interface Seat {
  id: string;
  name: string;
  /** Set for an AI car. */
  ai?: AiLevel;
}

/** What every player needs to build the same race. */
export interface StartInfo {
  /** Increases with each race of the room ("Rejouer"). */
  game: number;
  seed: number;
  trackId: string;
  laps: number;
  seats: Seat[];
}

export type RoomStatus = 'connecting' | 'lobby' | 'racing' | 'closed';

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O: codes are read aloud

const secureRand = (): number => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

export function newRoomCode(rand: () => number = secureRand): string {
  return Array.from({ length: 5 }, () => CODE_LETTERS[Math.floor(rand() * CODE_LETTERS.length)]).join('');
}

/** Network input is untrusted: these checks keep a malformed or oversized message from reaching the race. */
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const cleanName = (v: unknown): string => String(v ?? 'Pilote').replace(/[\p{Cc}\p{Cf}<>]/gu, '').trim().slice(0, 20) || 'Pilote';
const MAX_PENDING = 64;
const SYNC_EVERY_MS = 2_000;

function validPlayers(v: unknown): Player[] | null {
  if (!Array.isArray(v) || v.length > MAX_HUMANS) return null;
  const out: Player[] = [];
  for (const p of v) {
    if (!isObj(p) || typeof p.id !== 'string' || p.id.length > 40) return null;
    out.push({ id: p.id, name: cleanName(p.name) });
  }
  return out;
}

function validSettings(v: unknown): RoomSettings | null {
  if (!isObj(v) || typeof v.trackId !== 'string' || v.trackId.length > 60) return null;
  const laps = Number(v.laps);
  const ais = Number(v.ais);
  if (!Number.isInteger(laps) || laps < 1 || laps > 20 || !Number.isInteger(ais) || ais < 0 || ais > MAX_CARS) return null;
  return { trackId: v.trackId, laps, ais };
}

function validStart(v: unknown): StartInfo | null {
  if (!isObj(v) || !Number.isInteger(v.game) || !Number.isFinite(Number(v.seed)) || typeof v.trackId !== 'string' || v.trackId.length > 60) return null;
  const laps = Number(v.laps);
  if (!Number.isInteger(laps) || laps < 1 || laps > 20 || !Array.isArray(v.seats) || v.seats.length < 1 || v.seats.length > MAX_CARS) return null;
  const seats: Seat[] = [];
  for (const x of v.seats) {
    if (!isObj(x) || typeof x.id !== 'string' || x.id.length > 40) return null;
    seats.push({ id: x.id, name: cleanName(x.name), ...(typeof x.ai === 'string' ? { ai: x.ai as AiLevel } : {}) });
  }
  return { game: v.game as number, seed: Number(v.seed), trackId: v.trackId, laps, seats };
}

const validAction = (v: unknown): v is Action => isObj(v) && typeof v.type === 'string' && v.type.length < 20;

export const isRoomCode = (s: string): boolean => new RegExp(`^[${CODE_LETTERS}]{5}$`).test(s);

/** Seats of a race: the players in the order they joined (the host first), then the AIs. */
export function seatsFor(players: Player[], settings: RoomSettings): Seat[] {
  const humans = players.slice(0, MAX_CARS).map((p) => ({ id: p.id, name: p.name }));
  const room = Math.max(0, Math.min(settings.ais, MAX_CARS - humans.length));
  const levels: AiLevel[] = ['medium', 'easy', 'hard'];
  return [...humans, ...Array.from({ length: room }, (_, i) => ({ id: `ai${i + 1}`, name: `IA ${i + 1}`, ai: levels[i % levels.length] }))];
}

export interface SessionOptions {
  transport: Transport;
  code: string;
  /** This client's id (keep it across reloads to get one's seat back). */
  id: string;
  name: string;
  host: boolean;
  settings?: RoomSettings;
  now?: () => number;
}

type Fn<T extends unknown[]> = (...args: T) => void;

export class Session {
  readonly code: string;
  readonly id: string;
  readonly host: boolean;
  name: string;
  status: RoomStatus = 'connecting';
  players: Player[] = [];
  settings: RoomSettings;
  start: StartInfo | null = null;
  /** Every action of the current race, in order (its index is its sequence number). */
  log: Action[] = [];
  /** Why the room closed, for the screen. */
  closedReason: string | null = null;

  private transport: Transport;
  private now: () => number;
  private seen = new Map<string, number>();
  private pending = new Map<number, Action>();
  private off: () => void;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lobbyFns = new Set<Fn<[]>>();
  private startFns = new Set<Fn<[StartInfo, Action[]]>>();
  private actionFns = new Set<Fn<[number, Action]>>();
  private peerFns = new Set<Fn<[]>>();
  private forfeitFns = new Set<Fn<[number]>>();
  /** Ids of the players who gave up the current race. */
  readonly forfeited = new Set<string>();

  constructor(o: SessionOptions) {
    this.transport = o.transport;
    this.code = o.code;
    this.id = o.id;
    this.name = o.name;
    this.host = o.host;
    this.now = o.now ?? Date.now;
    this.settings = o.settings ?? { trackId: 'oval', laps: 1, ais: 0 };
    if (this.host) this.players = [{ id: this.id, name: this.name }];
    this.off = this.transport.onMessage((m) => this.receive(m));
  }

  /** Connects, introduces itself, and keeps telling the room it is there. */
  async connect(timers = true): Promise<void> {
    await this.transport.ready;
    this.status = this.host ? 'lobby' : 'connecting';
    if (this.host) this.publishLobby();
    else this.send({ t: 'hello', name: this.name });
    if (timers) {
      this.timer = setInterval(() => {
        this.send({ t: 'ping' });
        this.checkPeers();
      }, PING_EVERY_MS);
    }
    this.emitLobby();
  }

  // -------------------------------------------------------------- listeners

  onLobby(fn: Fn<[]>): () => void {
    this.lobbyFns.add(fn);
    return () => this.lobbyFns.delete(fn);
  }

  /** A race starts (or restarts, or is resumed with the actions already played). */
  onStart(fn: Fn<[StartInfo, Action[]]>): () => void {
    this.startFns.add(fn);
    return () => this.startFns.delete(fn);
  }

  /** An action of another player, in order. */
  onAction(fn: Fn<[number, Action]>): () => void {
    this.actionFns.add(fn);
    return () => this.actionFns.delete(fn);
  }

  /** Someone left or came back. */
  onPeers(fn: Fn<[]>): () => void {
    this.peerFns.add(fn);
    return () => this.peerFns.delete(fn);
  }

  /** A player gave up the race (their seat number). */
  onForfeit(fn: Fn<[number]>): () => void {
    this.forfeitFns.add(fn);
    return () => this.forfeitFns.delete(fn);
  }

  // ---------------------------------------------------------------- actions

  /** Host: changes the race settings (lobby only). */
  setSettings(settings: RoomSettings): void {
    if (!this.host || this.status !== 'lobby') return;
    this.settings = { ...settings };
    this.publishLobby();
    this.emitLobby();
  }

  /** Host: starts a race with everyone in the room (also used by "Rejouer"). */
  launch(seed: number): StartInfo | null {
    if (!this.host || this.players.length < 1) return null;
    const start: StartInfo = { game: (this.start?.game ?? 0) + 1, seed, trackId: this.settings.trackId, laps: this.settings.laps, seats: seatsFor(this.players, this.settings) };
    this.begin(start, []);
    this.send({ t: 'start', start });
    return start;
  }

  /** Sends an action played on this device (own car, or on the host the AIs and the cars of absent players). */
  sendAction(seq: number, action: Action): void {
    if (!this.start || seq !== this.log.length) return;
    this.log.push(action);
    this.send({ t: 'act', game: this.start.game, seq, action });
  }

  /** The seat of this client in the current race (-1 if it has none). */
  mySeat(): number {
    return this.start ? this.start.seats.findIndex((s) => s.id === this.id) : -1;
  }

  /** True when the player of a seat has not been heard from for a while (always false for AIs and oneself). */
  isGone(seat: number): boolean {
    const s = this.start?.seats[seat];
    if (!s || s.ai || s.id === this.id) return false;
    const last = this.seen.get(s.id);
    return last === undefined || this.now() - last > GONE_AFTER_MS;
  }

  /** Gives up the current race: tells the room, then leaves it. The others go on; the last one left wins by forfeit. */
  forfeit(): void {
    if (this.start && this.status === 'racing') this.send({ t: 'forfeit', game: this.start.game });
    this.leave();
  }

  leave(): void {
    this.send({ t: 'bye' });
    this.close(null);
  }

  /** Looks for silent players: in the lobby they leave the room; a silent host closes it. */
  checkPeers(): void {
    const now = this.now();
    if (this.host && this.status === 'lobby') {
      const before = this.players.length;
      this.players = this.players.filter((p) => p.id === this.id || now - (this.seen.get(p.id) ?? now) <= GONE_AFTER_MS);
      if (this.players.length !== before) {
        this.publishLobby();
        this.emitLobby();
      }
    }
    if (!this.host && this.hostId && now - (this.seen.get(this.hostId) ?? now) > GONE_AFTER_MS) this.close('L’hôte a quitté la partie.');
    this.peerFns.forEach((f) => f());
  }

  // --------------------------------------------------------------- internal

  private hostId: string | null = null;
  private lastHello = 0;
  private lastSync = new Map<string, number>();

  private send(m: Omit<NetMsg, 'from'>): void {
    if (this.status === 'closed') return;
    this.transport.send({ ...m, from: this.id } as NetMsg);
  }

  private close(reason: string | null): void {
    if (this.status === 'closed') return;
    this.status = 'closed';
    this.closedReason = reason;
    if (this.timer) clearInterval(this.timer);
    this.off();
    this.transport.close();
    this.emitLobby();
  }

  /** The host sends the whole race to a returning player: at most once every few seconds per player. */
  private sendSync(to: string, send: () => void): void {
    const t = this.now();
    if (t - (this.lastSync.get(to) ?? -Infinity) < SYNC_EVERY_MS) return;
    this.lastSync.set(to, t);
    send();
  }

  private publishLobby(): void {
    this.send({ t: 'lobby', players: this.players, settings: this.settings });
  }

  private begin(start: StartInfo, log: Action[]): void {
    this.start = start;
    this.log = [...log];
    this.pending.clear();
    this.forfeited.clear();
    this.status = 'racing';
    this.startFns.forEach((f) => f(start, [...log]));
    this.emitLobby();
  }

  private emitLobby(): void {
    this.lobbyFns.forEach((f) => f());
  }

  private receive(m: NetMsg): void {
    if (this.status === 'closed' || m.from === this.id) return;
    const wasGone = this.start?.seats.some((s, i) => s.id === m.from && this.isGone(i));
    this.seen.set(m.from, this.now());
    if (wasGone) this.peerFns.forEach((f) => f());
    switch (m.t) {
      case 'hello':
        if (!this.host) return;
        if (this.status === 'racing' && this.start) {
          // a player of the race came back (reload): give them the race so far
          if (this.start.seats.some((s) => s.id === m.from)) this.sendSync(m.from, () => this.send({ t: 'sync', to: m.from, start: this.start, log: this.log, players: this.players, settings: this.settings }));
          else this.send({ t: 'full', to: m.from });
          return;
        }
        if (!this.players.some((p) => p.id === m.from)) {
          if (this.players.length >= MAX_HUMANS) return void this.send({ t: 'full', to: m.from });
          this.players.push({ id: m.from, name: cleanName(m.name) });
        }
        this.publishLobby();
        this.emitLobby();
        return;
      case 'lobby':
        if (this.host || (this.hostId && this.hostId !== m.from)) return;
        {
          const players = validPlayers(m.players);
          const settings = validSettings(m.settings);
          if (!players || !settings) return;
          this.hostId = m.from;
          this.players = players;
          this.settings = settings;
        }
        if (this.status === 'connecting') this.status = 'lobby';
        this.emitLobby();
        return;
      case 'start':
        if (this.host || (this.hostId && this.hostId !== m.from)) return;
        {
          const start = validStart(m.start);
          if (!start) return;
          this.hostId = m.from;
          this.begin(start, []);
        }
        return;
      case 'sync':
        if (this.host || m.to !== this.id || (this.hostId && this.hostId !== m.from)) return;
        {
          const players = validPlayers(m.players);
          const settings = validSettings(m.settings);
          const start = validStart(m.start);
          if (!players || !settings || !start || !Array.isArray(m.log) || m.log.length > 5000 || !m.log.every(validAction)) return;
          this.hostId = m.from;
          this.players = players;
          this.settings = settings;
          this.begin(start, m.log as Action[]);
        }
        return;
      case 'full':
        if (m.to === this.id) this.close('Cette partie est complète ou déjà commencée.');
        return;
      case 'act': {
        if (!this.start || m.game !== this.start.game) return;
        // only the players of the race (and the host, who plays the AIs and the absent) send actions
        if (m.from !== this.hostId && !this.start.seats.some((x) => x.id === m.from && !x.ai)) return;
        const seq = m.seq;
        if (!Number.isInteger(seq) || (seq as number) < this.log.length) return; // malformed or already applied
        if ((seq as number) > this.log.length + MAX_PENDING || this.pending.size >= MAX_PENDING || !validAction(m.action)) return;
        this.pending.set(seq as number, m.action);
        while (this.pending.has(this.log.length)) {
          const at = this.log.length;
          const action = this.pending.get(at) as Action;
          this.pending.delete(at);
          this.log.push(action);
          this.actionFns.forEach((f) => f(at, action));
        }
        // a hole that does not fill: ask the host for the whole race again
        if (this.pending.size > 8 && !this.host && this.now() - this.lastHello > SYNC_EVERY_MS) {
          this.lastHello = this.now();
          this.send({ t: 'hello', name: this.name });
        }
        return;
      }
      case 'forfeit': {
        if (!this.start || this.status !== 'racing' || m.game !== this.start.game || this.forfeited.has(m.from)) return;
        const seat = this.start.seats.findIndex((x) => x.id === m.from && !x.ai);
        if (seat < 0) return;
        this.forfeited.add(m.from);
        this.forfeitFns.forEach((f) => f(seat));
        return;
      }
      case 'bye':
        if (this.host && this.status === 'lobby') {
          this.players = this.players.filter((p) => p.id !== m.from);
          this.publishLobby();
          this.emitLobby();
        } else if (!this.host && m.from === this.hostId) this.close(this.forfeited.has(m.from) ? 'L’hôte a abandonné : vous gagnez la course par forfait.' : 'L’hôte a quitté la partie.');
        this.seen.delete(m.from);
        this.peerFns.forEach((f) => f());
        return;
      case 'ping':
        if (!this.host && !this.hostId && this.status === 'connecting') this.send({ t: 'hello', name: this.name });
        return;
    }
  }
}
