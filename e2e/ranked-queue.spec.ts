import { expect, test, type Page } from '@playwright/test';
import { createGameHandler, memoryStore, readState } from '../src/server';
import { expectContrast, expectNoHorizontalOverflow, expectUsableLayout, humanStep, sizes, watchConsole } from './helpers';

// Two tabs of one browser are two players: each has its own account on a fake Supabase, the fake queue forms the group, the room goes through
// BroadcastChannel (?net=local) and the game function answers with the real server logic (src/server). The SQL of the queue is tested apart, in transactions.
type W = { __game: { state: { status: string; round: number } }; __screen: { isHumanTurn(): boolean } };

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const tokenOf = (uid: string) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', exp: 4_102_444_800 })}.sig`;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

interface Row {
  uid: string;
  pseudo: string;
  trophies: number;
  joined: number;
  room: string | null;
  host: boolean;
  ais: number;
  group: { id: string; pseudo: string; trophies: number }[] | null;
}

function fakeServer() {
  let skew = 0;
  const now = () => Date.now() + skew;
  const store = memoryStore(now);
  const game = createGameHandler(store, { now });
  const queue = new Map<string, Row>();
  const pseudos = new Map<string, string>();
  const calls = { join: 0, poll: 0, leave: 0 };
  /** The open rooms: the same rule as the SQL (fill the oldest room with a seat, up to 4, then make a new one). */
  const rooms: { code: string; host: string; seats: number; closed: boolean }[] = [];
  /** The same rule as the SQL: a group of 2 to 4 as soon as the first has waited 5 s; here the test makes them wait 0 s, so it forms at once with 2. */
  function poll(uid: string) {
    const me = queue.get(uid);
    if (!me) return [{ status: 'none', room: null, host: false, ais: 0, waited: 0, gap: 0, found: 0, players: null }];
    if (!me.room) {
      const waiting = [...queue.values()].filter((r) => !r.room).sort((a, b) => a.joined - b.joined);
      if (waiting.length >= 2) {
        const group = waiting.slice(0, 4).map((r) => ({ id: r.uid, pseudo: r.pseudo, trophies: r.trophies }));
        for (const r of waiting.slice(0, 4)) Object.assign(r, { room: 'QRANK', host: r === waiting[0], ais: 0, group });
      }
    }
    const row = queue.get(uid)!;
    if (row.room) return [{ status: 'matched', room: row.room, host: row.host, ais: row.ais, waited: 1, gap: 0, found: row.group!.length, players: row.group }];
    return [{ status: 'waiting', waited: 3, gap: 100, found: 1, room: null, host: false, ais: 0, players: null }];
  }
  async function attach(page: Page, uid: string) {
    store.sessions.set(tokenOf(uid), uid);
    await page.route('https://npaunxotjhkjzoxfpqgq.supabase.co/**', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (url.pathname === '/functions/v1/game') {
        const res = await game(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.method() === 'POST' ? req.postData() : undefined }));
        return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers.entries()), body: res.status === 204 ? '' : await res.text() });
      }
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      if (url.pathname === '/auth/v1/signup') {
        const user = { id: uid, aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: '2026-10-22T00:00:00Z' };
        return route.fulfill({ headers: CORS, json: { access_token: tokenOf(uid), token_type: 'bearer', expires_in: 3600, expires_at: 4_102_444_800, refresh_token: 'r', user } });
      }
      if (url.pathname === '/rest/v1/rpc/claim_pseudo') {
        pseudos.set(uid, (req.postDataJSON() as { p: string }).p);
        return route.fulfill({ headers: CORS, json: pseudos.get(uid) });
      }
      if (url.pathname === '/rest/v1/profiles') return route.fulfill({ headers: CORS, json: [{ pseudo: pseudos.get(uid) ?? null }] });
      if (url.pathname === '/rest/v1/rpc/queue_join') {
        calls.join++;
        const { p_trophies } = req.postDataJSON() as { p_trophies: number };
        queue.set(uid, { uid, pseudo: pseudos.get(uid) ?? '?', trophies: p_trophies, joined: Date.now() + calls.join, room: null, host: false, ais: 0, group: null });
        return route.fulfill({ status: 204, headers: CORS });
      }
      if (url.pathname === '/rest/v1/rpc/queue_poll') {
        calls.poll++;
        return route.fulfill({ headers: CORS, json: poll(uid) });
      }
      if (url.pathname === '/rest/v1/rpc/open_join') {
        const open = rooms.find((r) => !r.closed && r.seats < 4 && r.host !== uid);
        if (open) {
          open.seats++;
          open.closed = open.seats >= 4;
          return route.fulfill({ headers: CORS, json: [{ room: open.code, host: false, seats: open.seats }] });
        }
        const made = { code: `ROOM${String.fromCharCode(65 + rooms.length)}`, host: uid, seats: 1, closed: false };
        rooms.push(made);
        return route.fulfill({ headers: CORS, json: [{ room: made.code, host: true, seats: 1 }] });
      }
      if (url.pathname === '/rest/v1/rpc/open_close') {
        const code = (req.postDataJSON() as { p_room: string }).p_room;
        const room = rooms.find((r) => r.code === code && r.host === uid);
        if (room) room.closed = true;
        return route.fulfill({ status: 204, headers: CORS });
      }
      if (url.pathname === '/rest/v1/rpc/queue_leave') {
        calls.leave++;
        const row = queue.get(uid);
        if (row && !row.room) queue.delete(uid);
        return route.fulfill({ status: 204, headers: CORS });
      }
      return route.fulfill({ status: 404, headers: CORS, json: {} });
    });
  }
  return { store, advance: (ms: number) => (skew += ms), attach, calls, queue, rooms, state: (uid: string) => readState(store.rows.get(uid)!.state) };
}

/** Two tabs of one browser share its storage: each keeps its own sign-in under its own key. */
async function isolateAuth(page: Page, tag: string) {
  await page.addInitScript((t) => {
    const own = (k: string) => (k === '4mules.auth' ? `4mules.auth.${t}` : k);
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    const del = Storage.prototype.removeItem;
    Storage.prototype.getItem = function (k: string) { return get.call(this, own(k)); };
    Storage.prototype.setItem = function (k: string, v: string) { return set.call(this, own(k), v); };
    Storage.prototype.removeItem = function (k: string) { return del.call(this, own(k)); };
  }, tag);
}

async function signIn(page: Page, pseudo: string) {
  await page.goto('/?account=1&net=local&aiDelay=0');
  await page.getByTestId('account-pseudo').fill(pseudo);
  await page.getByTestId('account-guest').click();
  await expect(page.getByTestId('avatar')).toBeVisible();
  await page.waitForFunction(() => (window as unknown as { __profile: { server(): boolean } }).__profile.server());
}

async function audit(page: Page, where: string) {
  await expectUsableLayout(page, where);
  await expectNoHorizontalOverflow(page, where);
  await expectContrast(page, where);
}

test.describe('course classée : mise en relation', () => {
  test.use({ reducedMotion: 'reduce' });
  test.setTimeout(240_000);

  test('deux joueurs entrent dans la file, le groupe se forme, ils courent et les trophées sont payés par le serveur', async ({ context }) => {
    const [mobile, desktop] = sizes;
    const server = fakeServer();
    const a = await context.newPage();
    const b = await context.newPage();
    await a.setViewportSize({ width: desktop.width, height: desktop.height });
    await b.setViewportSize({ width: mobile.width, height: mobile.height });
    const errors = [...watchConsole(a), ...watchConsole(b)];
    for (const [p, tag] of [[a, 'a'], [b, 'b']] as const) await isolateAuth(p, tag);
    await server.attach(a, 'ua');
    await server.attach(b, 'ub');
    await signIn(a, 'Alice_01');
    await signIn(b, 'Bob_02');

    // the first player waits alone
    await a.getByTestId('start-ranked').click();
    await expect(a.getByTestId('ranked-status')).toContainText('Recherche', { timeout: 10_000 });
    await expect(a.getByTestId('ranked-me')).toContainText('0 trophées');
    await expect(a.getByTestId('ranked-detail')).toContainText('±100');
    await audit(a, 'file d’attente');
    await a.screenshot({ path: 'e2e/screenshots/ranked-desktop-queue.png' });
    // cancelling leaves the queue
    await a.getByTestId('ranked-cancel').click();
    await expect.poll(() => server.calls.leave).toBeGreaterThan(0);
    expect(server.queue.has('ua')).toBe(false);

    // both come in: the server forms the group, the room opens, the race starts by itself
    await a.getByTestId('start-ranked').click();
    await expect(a.getByTestId('ranked-status')).toContainText('Recherche', { timeout: 10_000 });
    await b.getByTestId('start-ranked').click();
    await expect(b.getByTestId('ranked-found')).toBeVisible({ timeout: 15_000 });
    await expect(b.getByTestId('ranked-players')).toContainText('Alice_01');
    await expect(b.getByTestId('ranked-players')).toContainText('Bob_02');
    await b.screenshot({ path: 'e2e/screenshots/ranked-mobile-found.png' });
    for (const p of [a, b]) await p.waitForFunction(() => '__game' in window, undefined, { timeout: 20_000 });
    for (const p of [a, b]) await expect(p.getByTestId('turn-chip')).toBeVisible();
    // each player has a ranked token from the server
    expect(server.state('ua').race).toMatchObject({ ranked: true, players: 2, bots: 0, laps: 1 });
    expect(server.state('ub').race).toMatchObject({ ranked: true });
    server.advance(10 * 60_000);

    for (let i = 0; i < 1500; i++) {
      const done = await Promise.all([a, b].map((p) => p.getByTestId('ranking').isVisible()));
      if (done.every(Boolean)) break;
      let acted = false;
      for (const p of [a, b]) {
        const mine = await p.evaluate(() => (window as unknown as W).__game?.state.status === 'racing' && (window as unknown as W).__screen.isHumanTurn()).catch(() => false);
        if (!mine) continue;
        await humanStep(p);
        acted = true;
      }
      if (!acted) await a.waitForTimeout(60);
    }
    for (const p of [a, b]) await expect(p.getByTestId('ranked-result')).toBeVisible({ timeout: 20_000 });
    // 2 cars: +30 for the winner, −20 (floor 0 here) for the other
    const ta = server.state('ua').profile.ranked;
    const tb = server.state('ub').profile.ranked;
    expect([ta.trophies, tb.trophies].sort((x, y) => x - y)).toEqual([0, 30]);
    expect(ta.races).toBe(1);
    expect(tb.races).toBe(1);
    await audit(a, 'résultat classé');
    await a.screenshot({ path: 'e2e/screenshots/ranked-desktop-online-end.png' });
    await b.screenshot({ path: 'e2e/screenshots/ranked-mobile-online-end.png' });
    // "Rejouer" is for everyone (another opponent): it goes back to the matchmaking
    await expect(b.getByRole('button', { name: 'Rejouer' })).toBeVisible();
    await b.getByRole('button', { name: 'Rejouer' }).click();
    await expect(b.getByTestId('ranked-queue')).toBeVisible();
    await expect(b.getByTestId('ranked-status')).toContainText('Recherche', { timeout: 10_000 });
    expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  });

  test('sans compte avec pseudo : un message clair, et « Course perso » reste là', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByTestId('avatar')).toBeVisible();
    // the ranked race and the open rooms need an account: the button says so instead of doing nothing
    await page.getByTestId('start-ranked').click();
    await expect(page.getByTestId('toast')).toContainText('compte');
    await expect(page.getByTestId('ranked-queue')).toHaveCount(0);
    await expect(page.getByTestId('open-setup')).toBeVisible();
  });
});

test.describe('course non classée : salles ouvertes', () => {
  test.use({ reducedMotion: 'reduce' });
  test.setTimeout(240_000);

  test('trois joueurs cliquent : la première crée la salle, les suivants la remplissent, la course part sans récompense', async ({ context }) => {
    const server = fakeServer();
    const pages = [await context.newPage(), await context.newPage(), await context.newPage()];
    const ids = ['ua', 'ub', 'uc'];
    const names = ['Alice_01', 'Bob_02', 'Cleo_03'];
    await pages[0].setViewportSize({ width: 1440, height: 900 });
    await pages[1].setViewportSize({ width: 390, height: 844 });
    await pages[2].setViewportSize({ width: 390, height: 844 });
    const errors = pages.flatMap((p) => watchConsole(p));
    for (const [i, p] of pages.entries()) {
      await isolateAuth(p, String(i));
      await server.attach(p, ids[i]);
      await signIn(p, names[i]);
    }
    // the first one creates the room and waits
    await pages[0].getByTestId('open-room').click();
    await expect(pages[0].getByTestId('open-room-status')).toContainText('1/4', { timeout: 10_000 });
    await audit(pages[0], 'salle ouverte');
    await pages[0].screenshot({ path: 'e2e/screenshots/open-room-desktop-waiting.png' });
    // the next ones fill it
    await pages[1].getByTestId('open-room').click();
    await expect(pages[0].getByTestId('open-room-status')).toContainText('2/4', { timeout: 15_000 });
    await pages[2].getByTestId('open-room').click();
    await expect(pages[0].getByTestId('open-room-status')).toContainText('3/4', { timeout: 15_000 });
    expect(server.rooms).toHaveLength(1);
    await expect(pages[2].getByTestId('open-room-players')).toContainText('Alice_01');
    await expect(pages[2].getByTestId('open-room-players')).toContainText('Cleo_03');
    await pages[2].screenshot({ path: 'e2e/screenshots/open-room-mobile-waiting.png' });
    // the host leaves the waiting to the timer: the empty seat is an AI; everyone races, nothing is paid
    for (const p of pages) await p.waitForFunction(() => '__game' in window, undefined, { timeout: 40_000 });
    for (const p of pages) await expect(p.getByTestId('turn-chip')).toBeVisible();
    expect(server.rooms[0].closed).toBe(true);
    expect(server.state('ua').race).toBeNull(); // no token: an unranked room pays nothing
    expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  });
});
