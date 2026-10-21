import { describe, expect, it } from 'vitest';
import { newProfile, serializeProfile } from '../data/profile/profile';
import { createGameHandler, type GameResponse, type HandlerOptions } from './handler';
import { memoryStore, type MemoryStore } from './memoryStore';
import { minRaceMs } from './race';

const T0 = Date.UTC(2026, 9, 21, 12);
const ORIGIN = 'http://localhost:5800';

function setup(opts: HandlerOptions = {}) {
  let now = T0;
  let i = 1;
  const store = memoryStore(() => now);
  store.sessions.set('tok-a', 'user-a');
  const handler = createGameHandler(store, { now: () => now, random: () => Math.imul(i++, 2654435761) >>> 0, report: () => undefined, ...opts });
  const call = async (action: unknown, params?: unknown, token = 'tok-a', raw?: string) => {
    const res = await handler(
      new Request('https://x.supabase.co/functions/v1/game', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, origin: ORIGIN, 'content-type': 'application/json' },
        body: raw ?? JSON.stringify({ action, params }),
      }),
    );
    return { status: res.status, body: (await res.json()) as GameResponse & { error?: string; code?: string }, headers: res.headers };
  };
  return { store, call, advance: (ms: number) => (now += ms), handler };
}

describe('game handler', () => {
  it('answers the CORS preflight for allowed origins only', async () => {
    const { handler } = setup();
    const pre = (origin: string) => handler(new Request('https://x/functions/v1/game', { method: 'OPTIONS', headers: { origin } }));
    expect((await pre(ORIGIN)).headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect((await pre('https://tk757t.github.io')).headers.get('access-control-allow-origin')).toBe('https://tk757t.github.io');
    expect((await pre('https://evil.example')).headers.get('access-control-allow-origin')).toBe('https://tk757t.github.io');
    expect((await pre('http://localhost:9999')).headers.get('access-control-allow-origin')).toBe('https://tk757t.github.io');
    expect((await handler(new Request('https://x/functions/v1/game', { method: 'GET' }))).status).toBe(405);
  });

  it('needs a valid session', async () => {
    const { call } = setup();
    expect((await call('sync', {}, '')).status).toBe(401);
    const r = await call('sync', {}, 'forged');
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: 'Session expirée : reconnectez-vous.', code: 'auth' });
  });

  it('sync creates a fresh game once, without the rng', async () => {
    const { call, store } = setup();
    const a = await call('sync');
    expect(a.status).toBe(200);
    expect(a.body.version).toBe(0);
    expect(a.body.state.profile.gold).toBe(200);
    expect(a.body.state.profile.rng).toBe(0);
    expect(a.body.serverTime).toBe(T0);
    expect((store.rows.get('user-a')!.state as { profile: { rng: number } }).profile.rng).not.toBe(0);
    await call('sync');
    expect(store.logs.map((l) => l.action)).toEqual(['create']);
  });

  it('imports the local save once (bounded), then refuses', async () => {
    const { call, store } = setup();
    const save = serializeProfile({ ...newProfile(3), gold: 1e7, gems: 4 });
    const a = await call('import_save', { save });
    expect(a.status).toBe(200);
    expect(a.body.state.profile.gold).toBe(10_000);
    expect(a.body.result).toEqual({ action: 'import_save', report: [{ field: 'gold', from: 1e7, to: 10_000 }] });
    expect(store.logs[0]).toMatchObject({ action: 'import_save', params: { chars: save.length }, summary: { adjusted: [{ field: 'gold' }] } });
    const b = await call('import_save', { save });
    expect(b.status).toBe(409);
    expect(b.body.code).toBe('import_refused');
    expect((await call('sync')).body.state.profile.gold).toBe(10_000);
  });

  it('an account that synced first cannot import any more', async () => {
    const { call } = setup();
    await call('sync');
    expect((await call('import_save', { save: serializeProfile(newProfile(1)) })).body.code).toBe('import_refused');
  });

  it('applies an action, bumps the version and logs it', async () => {
    const { call, store } = setup();
    await call('sync');
    const r = await call('buy_offer', { id: 'pack-1' });
    expect(r.status).toBe(200);
    expect(r.body.version).toBe(1);
    expect(r.body.state.profile.gold).toBe(80);
    expect(store.rows.get('user-a')!.version).toBe(1);
    expect(store.logs.at(-1)).toMatchObject({ uid: 'user-a', action: 'buy_offer', params: { id: 'pack-1' }, summary: { gold: 80, price: 120 } });
  });

  it('a refused action writes nothing', async () => {
    const { call, store } = setup();
    await call('sync');
    const r = await call('buy_offer', { id: 'gold-400' });
    expect(r.status).toBe(200);
    const poor = await call('skip_slot', { index: 3 });
    expect(poor.status).toBe(400);
    expect(poor.body).toEqual({ error: 'Cet emplacement est vide.', code: 'refused' });
    expect(store.rows.get('user-a')!.version).toBe(1);
  });

  it('optimistic lock: a write in between makes the rule run again on the new state', async () => {
    const { call, store } = setup();
    await call('sync');
    // another request (a quest, say) adds gold while this one is being applied
    store.beforeCommit = () => {
      const row = store.rows.get('user-a')!;
      const s = row.state as { profile: { gold: number } };
      store.rows.set('user-a', { state: { ...s, profile: { ...s.profile, gold: s.profile.gold + 1000 } }, version: row.version + 1 });
    };
    const r = await call('buy_offer', { id: 'pack-1' });
    expect(r.status).toBe(200);
    expect(r.body.version).toBe(2);
    expect(r.body.state.profile.gold).toBe(200 + 1000 - 120);
  });

  it('gives up after three lost writes', async () => {
    const { call, store } = setup();
    await call('sync');
    store.commit = async () => null;
    const r = await call('buy_offer', { id: 'pack-1' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('conflict');
  });

  it('a suspended account can only read its game', async () => {
    const { call, store } = setup();
    await call('sync');
    store.suspended.set('user-a', 'triche');
    expect((await call('sync')).status).toBe(200);
    const r = await call('buy_offer', { id: 'pack-1' });
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: 'Compte suspendu : triche', code: 'suspended' });
  });

  it('limits the requests of a player', async () => {
    const { call } = setup({ maxRequestsPer10s: 3 });
    for (let i = 0; i < 3; i++) expect((await call('sync')).status).toBe(200);
    expect((await call('sync')).status).toBe(429);
  });

  it('limits the logged actions of a player across isolates', async () => {
    const { call } = setup({ maxActionsPer10s: 2 });
    await call('sync'); // logs "create"
    await call('equip', { id: 'nope' }); // refused: not logged
    const race = { trackId: 'oval', laps: 1, players: 1, bots: 0 };
    await call('start_race', race);
    await call('start_race', race); // 3 logged now
    expect((await call('start_race', race)).status).toBe(429);
  });

  it('refuses unreadable or oversized requests, and a state sent by the browser', async () => {
    const { call } = setup();
    expect((await call(null, null, 'tok-a', '{oops')).body).toEqual({ error: 'Requête illisible.', code: 'invalid' });
    expect((await call(null, null, 'tok-a', '[1]')).status).toBe(400);
    expect((await call('sync', undefined, 'tok-a', JSON.stringify({ action: 'sync', state: { gems: 1e6 } }))).body.code).toBe('invalid');
    expect((await call('buy_offer', { id: 'x'.repeat(3000) })).body.error).toBe('Paramètres trop longs.');
    expect((await call('sync', undefined, 'tok-a', 'x'.repeat(100_000))).status).toBe(413);
    expect((await call('admin_give', {})).body).toEqual({ error: 'Action inconnue.', code: 'invalid' });
  });

  it('a stored state that cannot be read is reported, not overwritten', async () => {
    const { call, store } = setup();
    store.rows.set('user-a', { state: { v: 1, profile: { version: 42 } }, version: 3 });
    const r = await call('buy_offer', { id: 'pack-1' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('corrupt');
    expect(store.rows.get('user-a')!.version).toBe(3);
  });

  it('an unexpected failure gives a plain message without detail', async () => {
    const { call, store } = setup();
    store.load = async () => {
      throw new Error('relation "game_state" does not exist');
    };
    const r = await call('sync');
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ error: 'Erreur du serveur de jeu. Réessayez plus tard.', code: 'server' });
  });

  it('plays a whole race: token, plausible duration, rewards, no replay', async () => {
    const { call, advance } = setup();
    await call('sync');
    const started = await call('start_race', { trackId: 'lac', laps: 3, players: 3, bots: 1 });
    const race = started.body.state.race!;
    expect(started.body.result).toEqual({ action: 'start_race', race });
    advance(5_000);
    const early = await call('finish_race', { token: race.id, rank: 1, retired: false, clean: false });
    expect(early.body.code).toBe('race');
    advance(minRaceMs(race, false));
    const done = await call('finish_race', { token: race.id, rank: 1, retired: false, clean: false });
    expect(done.status).toBe(200);
    expect(done.body.result).toMatchObject({ action: 'finish_race', verified: false, rewards: { packs: 2, gold: 100 } });
    expect(done.body.state.race).toBeNull();
    expect((await call('finish_race', { token: race.id, rank: 1, retired: false, clean: false })).body.code).toBe('race');
  });

  it('keeps players apart', async () => {
    const { call, store } = setup();
    (store as MemoryStore).sessions.set('tok-b', 'user-b');
    await call('sync');
    await call('buy_offer', { id: 'pack-1' });
    const b = await call('sync', {}, 'tok-b');
    expect(b.body.state.profile.gold).toBe(200);
  });
});

describe('test tools through the handler', () => {
  it('read the role of the account: a player is refused, a tester is served, and the grant is logged', async () => {
    const { store, call } = setup();
    expect((await call('tester_grant', { gold: 500 })).status).toBe(403);
    store.roles.set('user-a', 'tester');
    const ok = await call('tester_grant', { gold: 500, chest: 'rare' });
    expect(ok.status).toBe(200);
    expect(ok.body.state.profile.gold).toBeGreaterThanOrEqual(500);
    expect(store.logs.at(-1)).toMatchObject({ uid: 'user-a', action: 'tester_grant' });
    // a player cannot lend their own role to another account by sending it
    expect((await call('tester_grant', { gold: 1, role: 'admin' })).body.code).toBe('invalid');
  });

  it('do not read the role for the other actions', async () => {
    const { store, call } = setup();
    let reads = 0;
    const roleOf = store.roleOf;
    store.roleOf = async (uid) => {
      reads++;
      return roleOf(uid);
    };
    await call('sync');
    await call('claim_gift');
    expect(reads).toBe(0);
  });
});
