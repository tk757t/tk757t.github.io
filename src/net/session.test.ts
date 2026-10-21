import { describe, expect, it } from 'vitest';
import { chooseAction } from '../ai';
import { TRACKS, toTrack } from '../data/tracks';
import { createGame, currentCar, nextFloat, reducer, type Action, type RaceState } from '../engine';
import { GONE_AFTER_MS, MAX_HUMANS, Session, isRoomCode, newRoomCode, seatsFor, type StartInfo } from './session';
import { memoryHub } from './transport';

const SETTINGS = { trackId: 'anneau', laps: 1, ais: 0 };

async function room(guests: string[], settings = SETTINGS, now?: () => number) {
  const hub = memoryHub();
  const host = new Session({ transport: hub.create('ABCDE'), code: 'ABCDE', id: 'h', name: 'Hôte', host: true, settings, now });
  await host.connect(false);
  const others: Session[] = [];
  for (const [i, name] of guests.entries()) {
    const s = new Session({ transport: hub.create('ABCDE'), code: 'ABCDE', id: `g${i}`, name, host: false, now });
    await s.connect(false);
    others.push(s);
  }
  return { hub, host, guests: others };
}

/** The race exactly as RaceScreen builds it for an online race (no garage equipment, weather from the seed). */
const game = (start: StartInfo): RaceState =>
  createGame({ seed: start.seed, cars: start.seats.map((_, i) => `p${i + 1}`), track: toTrack(TRACKS[start.trackId]), config: { laps: start.laps, maxRounds: 400, weather: 'random' } });

describe('room codes and seats', () => {
  it('codes are five letters without I or O', () => {
    let r = 0;
    const code = newRoomCode(() => (r = (r + 0.37) % 1));
    expect(isRoomCode(code)).toBe(true);
    expect(isRoomCode('ABCDI')).toBe(false);
    expect(isRoomCode('abcde')).toBe(false);
  });

  it('players sit in the order they joined, then the AIs, four cars at most', () => {
    const players = [
      { id: 'h', name: 'A' },
      { id: 'g', name: 'B' },
    ];
    expect(seatsFor(players, { ...SETTINGS, ais: 1 })).toEqual([{ id: 'h', name: 'A' }, { id: 'g', name: 'B' }, { id: 'ai1', name: 'IA 1', ai: 'medium' }]);
    expect(seatsFor(players, { ...SETTINGS, ais: 5 })).toHaveLength(4);
  });
});

describe('lobby', () => {
  it('a guest joins with the code: everyone sees the players and the settings', async () => {
    const { host, guests } = await room(['Bea']);
    expect(host.players.map((p) => p.name)).toEqual(['Hôte', 'Bea']);
    expect(guests[0].status).toBe('lobby');
    expect(guests[0].players.map((p) => p.name)).toEqual(['Hôte', 'Bea']);
    host.setSettings({ trackId: 'lac', laps: 2, ais: 1 });
    expect(guests[0].settings).toEqual({ trackId: 'lac', laps: 2, ais: 1 });
  });

  it('a room holds four players; the fifth is told it is full', async () => {
    const { host, guests } = await room(['B', 'C', 'D', 'E']);
    expect(host.players).toHaveLength(MAX_HUMANS);
    expect(guests[3].status).toBe('closed');
    expect(guests[3].closedReason).toMatch(/complète/);
  });

  it('a player who leaves the lobby leaves the list; a silent one too', async () => {
    let t = 0;
    const { host, guests } = await room(['B', 'C'], SETTINGS, () => t);
    guests[0].leave();
    expect(host.players.map((p) => p.name)).toEqual(['Hôte', 'C']);
    t = GONE_AFTER_MS + 1;
    host.checkPeers();
    expect(host.players.map((p) => p.name)).toEqual(['Hôte']);
  });
});

describe('race', () => {
  /** Plays a whole race on every device: each device drives its own car (with an AI brain) and the host the AI cars. */
  async function playOnline(guestNames: string[], settings = SETTINGS) {
    const { host, guests } = await room(guestNames, settings);
    const devices = [host, ...guests];
    const states = new Map<Session, RaceState>();
    for (const d of devices) {
      d.onStart((start, log) => states.set(d, log.reduce((s, a) => reducer(s, a).state, game(start))));
      d.onAction((_seq, action) => states.set(d, reducer(states.get(d)!, action).state));
    }
    host.launch(4242);
    let rng = 7;
    const rand = () => {
      const [v, n] = nextFloat(rng);
      rng = n;
      return v;
    };
    for (let i = 0; i < 5000 && states.get(host)!.status === 'racing'; i++) {
      const s = states.get(host)!;
      const seat = s.cars.findIndex((c) => c.id === currentCar(s)!.id);
      const seatInfo = host.start!.seats[seat];
      // who plays this car: its player, or the host for an AI
      const device = seatInfo.ai ? host : devices.find((d) => d.mySeat() === seat)!;
      const mine = states.get(device)!;
      const action: Action = chooseAction(seatInfo.ai ?? 'medium', mine, rand);
      const seq = device.log.length;
      states.set(device, reducer(mine, action).state);
      device.sendAction(seq, action);
    }
    return { host, guests, devices, states };
  }

  it('two players finish the same race on both devices', async () => {
    const { devices, states } = await playOnline(['Bea']);
    const [a, b] = devices.map((d) => states.get(d)!);
    expect(a.status).toBe('finished');
    expect(b).toEqual(a);
    expect(devices[0].log).toEqual(devices[1].log);
  });

  it('with AIs, played by the host, three devices stay in step', async () => {
    const { devices, states } = await playOnline(['Bea', 'Chloé'], { ...SETTINGS, ais: 1 });
    const final = devices.map((d) => states.get(d)!);
    expect(final[0].cars).toHaveLength(4);
    expect(final[1]).toEqual(final[0]);
    expect(final[2]).toEqual(final[0]);
  });

  it('actions arriving out of order are applied in order; duplicates are ignored', async () => {
    const { host, guests } = await room(['Bea']);
    const seen: number[] = [];
    guests[0].onAction((seq) => seen.push(seq));
    const start = host.launch(1)!;
    const raw = (seq: number) => ({ t: 'act', from: 'h', game: start.game, seq, action: { type: 'SKIP_PIT' } as Action });
    const receive = (guests[0] as unknown as { receive(m: unknown): void }).receive.bind(guests[0]);
    receive(raw(1));
    receive(raw(2));
    expect(seen).toEqual([]);
    receive(raw(0));
    receive(raw(1));
    expect(seen).toEqual([0, 1, 2]);
  });

  it('a player who reloads the page gets the race so far, and their seat back', async () => {
    const { hub, host, guests } = await room(['Bea']);
    host.launch(99);
    const s0 = game(host.start!);
    const a = chooseAction('medium', s0, () => 0.5);
    host.sendAction(0, a);
    guests[0].leave(); // closes the tab (the host keeps the race)
    const back = new Session({ transport: hub.create('ABCDE'), code: 'ABCDE', id: 'g0', name: 'Bea', host: false });
    let resumed: Action[] | null = null;
    back.onStart((_s, log) => (resumed = log));
    await back.connect(false);
    expect(back.status).toBe('racing');
    expect(resumed).toEqual([a]);
    expect(back.mySeat()).toBe(1);
  });

  it('a stranger cannot join a race that started', async () => {
    const { hub, host } = await room(['Bea']);
    host.launch(5);
    const late = new Session({ transport: hub.create('ABCDE'), code: 'ABCDE', id: 'x', name: 'X', host: false });
    await late.connect(false);
    expect(late.status).toBe('closed');
  });

  it('the host sees a silent player as gone (their car is then driven by the AI), and back when they talk again', async () => {
    let t = 0;
    const { host, guests } = await room(['Bea'], SETTINGS, () => t);
    host.launch(3);
    expect(host.isGone(1)).toBe(false);
    t = GONE_AFTER_MS + 1;
    expect(host.isGone(1)).toBe(true);
    expect(host.isGone(0)).toBe(false); // oneself
    (guests[0] as unknown as { send(m: unknown): void }).send({ t: 'ping' });
    expect(host.isGone(1)).toBe(false);
  });

  it('guests see the room close when the host leaves', async () => {
    const { host, guests } = await room(['Bea']);
    host.leave();
    expect(guests[0].status).toBe('closed');
    expect(guests[0].closedReason).toMatch(/hôte/);
  });
});

describe('forfeit', () => {
  it('a player who gives up is announced to the others, once, and leaves the room', async () => {
    const { host, guests } = await room(['Bea']);
    host.launch(7);
    const seats: number[] = [];
    host.onForfeit((seat) => seats.push(seat));
    guests[0].forfeit();
    expect(seats).toEqual([1]);
    expect(host.forfeited.has('g0')).toBe(true);
    expect(guests[0].status).toBe('closed');
    expect(host.status).toBe('racing');
  });

  it('forfeits are per race', async () => {
    const { host, guests } = await room(['Bea'], { ...SETTINGS, ais: 1 });
    host.launch(7);
    guests[0].forfeit();
    expect(host.forfeited.size).toBe(1);
    host.launch(8);
    expect(host.forfeited.size).toBe(0);
  });

  it('forfeiting in the lobby just leaves', async () => {
    const { host, guests } = await room(['Bea']);
    const seats: number[] = [];
    host.onForfeit((seat) => seats.push(seat));
    guests[0].forfeit();
    expect(seats).toEqual([]);
    expect(host.players.map((p) => p.name)).toEqual(['Hôte']);
  });

  it('when the host gives up, the guests are told they win by forfeit', async () => {
    const { host, guests } = await room(['Bea']);
    host.launch(7);
    host.forfeit();
    expect(guests[0].status).toBe('closed');
    expect(guests[0].closedReason).toMatch(/abandonné/);
  });
});

describe('untrusted messages', () => {
  const feed = (s: Session, m: unknown) => (s as unknown as { receive(m: unknown): void }).receive(m);

  it('a stranger cannot take over the lobby or the start once the host is known', async () => {
    const { host, guests } = await room(['Bea']);
    feed(guests[0], { t: 'lobby', from: 'evil', players: [{ id: 'evil', name: 'X' }], settings: SETTINGS });
    expect(guests[0].players.map((p) => p.id)).toEqual(['h', 'g0']);
    const start = host.launch(1)!;
    feed(guests[0], { t: 'start', from: 'evil', start: { ...start, seed: 999 } });
    expect(guests[0].start!.seed).toBe(1);
  });

  it('actions from someone who is not seated in the race are ignored', async () => {
    const { host, guests } = await room(['Bea']);
    const seen: number[] = [];
    guests[0].onAction((seq) => seen.push(seq));
    const start = host.launch(1)!;
    feed(guests[0], { t: 'act', from: 'evil', game: start.game, seq: 0, action: { type: 'SKIP_PIT' } });
    expect(seen).toEqual([]);
    feed(guests[0], { t: 'act', from: 'h', game: start.game, seq: 0, action: { type: 'SKIP_PIT' } });
    expect(seen).toEqual([0]);
  });

  it('malformed or far-away sequence numbers and the pending queue are bounded', async () => {
    const { host, guests } = await room(['Bea']);
    const start = host.launch(1)!;
    const act = (seq: unknown, action: unknown = { type: 'SKIP_PIT' }) => feed(guests[0], { t: 'act', from: 'h', game: start.game, seq, action });
    act('0');
    act(-1);
    act(1.5);
    act(1_000_000);
    act(0, 'not an action');
    act(0, { type: 42 });
    const pending = (guests[0] as unknown as { pending: Map<number, unknown> }).pending;
    expect(pending.size).toBe(0);
    for (let i = 1; i < 200; i++) act(i);
    expect(pending.size).toBeLessThanOrEqual(64);
  });

  it('a malformed lobby, start or sync is dropped and names are cleaned', async () => {
    const { host, guests } = await room(['Bea']);
    feed(guests[0], { t: 'lobby', from: 'h', players: 'nope', settings: SETTINGS });
    feed(guests[0], { t: 'lobby', from: 'h', players: [], settings: { trackId: 'x', laps: 9999, ais: 0 } });
    expect(guests[0].players.map((p) => p.name)).toEqual(['Hôte', 'Bea']);
    feed(guests[0], { t: 'lobby', from: 'h', players: [{ id: 'h', name: 'A‮B<script>' }], settings: SETTINGS });
    expect(guests[0].players[0].name).toBe('ABscript');
    const start = host.launch(1)!;
    feed(guests[0], { t: 'sync', from: 'h', to: 'g0', start: { ...start, seats: 'x' }, log: [], players: [], settings: SETTINGS });
    expect(guests[0].start!.seats).toHaveLength(1 + 1);
  });

  it('the host sends the whole race to a returning player at most once every few seconds', async () => {
    let t = 0;
    const { host } = await room(['Bea'], SETTINGS, () => t);
    host.launch(1);
    const syncs: unknown[] = [];
    const hub = (host as unknown as { transport: { send(m: unknown): void } }).transport;
    const send = hub.send.bind(hub);
    hub.send = (m: unknown) => {
      if ((m as { t: string }).t === 'sync') syncs.push(m);
      send(m);
    };
    for (let i = 0; i < 5; i++) feed(host, { t: 'hello', from: 'g0', name: 'Bea' });
    expect(syncs).toHaveLength(1);
    t += 3000;
    feed(host, { t: 'hello', from: 'g0', name: 'Bea' });
    expect(syncs).toHaveLength(2);
  });
});
