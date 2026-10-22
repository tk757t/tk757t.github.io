import { expect, test, type Page } from '@playwright/test';
import { createGameHandler, memoryStore } from '../src/server';
import { expectContrast, expectNoHorizontalOverflow, expectUsableLayout, sizes, watchConsole } from './helpers';

// « Course perso » (the public games), the counts of players and the public circuit editor, on a fake Supabase: no real account and no real game is created.
// The room itself goes through BroadcastChannel (?net=local); the SQL of the games is tested apart, in transactions.
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const FAKE_TOKEN = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'me1', role: 'authenticated', exp: 4_102_444_800 })}.sig`;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

interface Lobby {
  code: string;
  host_pseudo: string;
  track_id: string;
  laps: number;
  seats: number;
  max_seats: number;
}

async function fakeSupabase(page: Page) {
  // the game function answers with the real server logic (src/server), as in the ranked queue test
  const store = memoryStore(Date.now);
  const game = createGameHandler(store, { now: Date.now });
  store.sessions.set(FAKE_TOKEN, 'me1');
  const state = {
    pseudo: null as string | null,
    lobbies: [
      { code: 'ABCDE', host_pseudo: 'Zoe_12', track_id: 'anneau', laps: 2, seats: 2, max_seats: 4 },
      { code: 'FGHJK', host_pseudo: 'Leo_9', track_id: 'lac', laps: 1, seats: 1, max_seats: 3 },
    ] as Lobby[],
    calls: [] as { name: string; body: Record<string, unknown> }[],
    pings: 0,
    full: false,
    unhandled: [] as string[],
  };
  await page.route('https://npaunxotjhkjzoxfpqgq.supabase.co/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === '/functions/v1/game') {
      const res = await game(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.method() === 'POST' ? req.postData() : undefined }));
      return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers.entries()), body: res.status === 204 ? '' : await res.text() });
    }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = req.method() === 'POST' ? (req.postDataJSON() as Record<string, unknown>) : {};
    const rpc = url.pathname.startsWith('/rest/v1/rpc/') ? url.pathname.slice('/rest/v1/rpc/'.length) : '';
    if (rpc.startsWith('lobby_') && rpc !== 'lobby_stats') state.calls.push({ name: rpc, body });
    if (url.pathname === '/auth/v1/signup') {
      const user = { id: 'me1', aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: '2026-10-22T00:00:00Z' };
      return route.fulfill({ headers: CORS, json: { access_token: FAKE_TOKEN, token_type: 'bearer', expires_in: 3600, expires_at: 4_102_444_800, refresh_token: 'r', user } });
    }
    if (rpc === 'claim_pseudo') {
      state.pseudo = String(body.p);
      return route.fulfill({ headers: CORS, json: state.pseudo });
    }
    if (url.pathname === '/rest/v1/profiles') return route.fulfill({ headers: CORS, json: [{ pseudo: state.pseudo }] });
    if (rpc === 'presence_ping') {
      state.pings++;
      return route.fulfill({ status: 204, headers: CORS });
    }
    if (rpc === 'lobby_stats') return route.fulfill({ headers: CORS, json: [{ online: 12, ranked_waiting: 3, open_waiting: 1 }] });
    if (rpc === 'my_role') return route.fulfill({ headers: CORS, json: 'player' });
    if (rpc === 'chat_fetch') return route.fulfill({ headers: CORS, json: [] });
    if (rpc === 'leaderboard_me') return route.fulfill({ headers: CORS, json: [] });
    if (rpc === 'lobby_list') return route.fulfill({ headers: CORS, json: state.lobbies });
    if (rpc === 'lobby_join') {
      const l = state.lobbies.find((x) => x.code === String(body.p_code));
      if (!l || state.full) return route.fulfill({ status: 400, headers: CORS, json: { code: 'P0001', message: 'Cette partie est complète ou fermée.' } });
      return route.fulfill({ headers: CORS, json: [{ ...l, seats: l.seats + 1 }] });
    }
    if (rpc === 'lobby_create') return route.fulfill({ headers: CORS, json: 'NEWRM' });
    if (rpc === 'lobby_touch' || rpc === 'lobby_close') return route.fulfill({ status: 204, headers: CORS });
    state.unhandled.push(url.pathname);
    return route.fulfill({ status: 404, headers: CORS, json: {} });
  });
  return state;
}

async function signIn(page: Page, pseudo: string) {
  await page.goto('/?account=1&net=local&aiDelay=0');
  await page.getByTestId('account-pseudo').fill(pseudo);
  await page.getByTestId('account-guest').click();
  await expect(page.getByTestId('avatar')).toBeVisible();
}

async function audit(page: Page, where: string) {
  await expectUsableLayout(page, where);
  await expectNoHorizontalOverflow(page, where);
  await expectContrast(page, where);
}

for (const size of sizes) {
  test.describe(`parties publiques - ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, reducedMotion: 'reduce' });
    test.setTimeout(120_000);

    test('la page Course montre les joueurs en attente, Course perso liste les parties, rejoindre et créer', async ({ page }) => {
      const errors = watchConsole(page);
      const server = await fakeSupabase(page);
      await signIn(page, 'Pilote_7');

      // the players waiting in the ranked queue and the open rooms
      await expect(page.getByTestId('queue-stats')).toHaveText('En attente : 3 en classé, 1 en non classé');
      expect(server.pings, 'le serveur sait que le joueur est en ligne').toBeGreaterThan(0);
      await audit(page, 'course');
      await page.screenshot({ path: `e2e/screenshots/lobbies-${size.name}-course.png` });

      // « Course perso »: the games already created
      await page.getByTestId('open-setup').click();
      await expect(page.getByTestId('lobbies')).toBeVisible();
      await expect(page.getByTestId('lobby-join')).toHaveCount(2);
      await expect(page.getByTestId('lobby-list')).toContainText('Zoe_12');
      await expect(page.getByTestId('lobby-list')).toContainText('Petit anneau · 2 tours · 2/4 joueurs');
      await audit(page, 'liste des parties');
      await page.screenshot({ path: `e2e/screenshots/lobbies-${size.name}-list.png` });

      // a full or vanished game: the sentence of the server, the list stays
      server.full = true;
      await page.getByTestId('lobby-join').first().click();
      await expect(page.getByTestId('lobby-status')).toContainText('complète ou fermée');
      server.full = false;

      // join a game: the room of the host opens, the guest waits for the start
      await page.getByTestId('lobby-join').first().click();
      await expect(page.getByTestId('lobby-room')).toBeVisible();
      await expect(page.getByTestId('open-room-status')).toContainText('/4 joueurs');
      await expect(page.getByTestId('open-room-track')).toContainText('Petit anneau · 2 tours');
      expect(server.calls.find((c) => c.name === 'lobby_join')?.body).toEqual({ p_code: 'ABCDE' });
      await audit(page, 'salle rejointe');
      await page.getByTestId('open-room-leave').click();

      // create a game: circuit, laps, seats; the host starts it when they want
      await page.getByTestId('open-setup').click();
      await page.getByTestId('lobby-create').click();
      await page.getByLabel('Circuit').selectOption('corniche'); // starts from the 2 laps of the circuit
      await page.getByRole('button', { name: 'Tours : 3' }).click();
      await page.getByRole('button', { name: 'Places : 3' }).click();
      await audit(page, 'créer une partie');
      await page.screenshot({ path: `e2e/screenshots/lobbies-${size.name}-create.png` });
      await page.getByTestId('lobby-create-confirm').click();
      await expect(page.getByTestId('lobby-room')).toBeVisible();
      expect(server.calls.find((c) => c.name === 'lobby_create')?.body).toEqual({ p_track: 'corniche', p_laps: 3, p_max: 3 });
      await expect(page.getByTestId('open-room-status')).toContainText('1/3 joueurs');
      await expect(page.getByTestId('open-room-track')).toContainText('Corniche d’Azur · 3 tours');
      // never more AIs than seats: 3 seats, 1 human = 2 AIs at most
      for (let i = 0; i < 4; i++) if (await page.getByTestId('open-room-ai-plus').isEnabled()) await page.getByTestId('open-room-ai-plus').click();
      await expect(page.getByTestId('open-room-ai-count')).toHaveText('2 IA');
      await audit(page, 'salle créée');
      await page.screenshot({ path: `e2e/screenshots/lobbies-${size.name}-host.png` });
      await page.getByTestId('open-room-start').click();
      await page.waitForFunction(() => '__game' in window);
      expect(server.calls.some((c) => c.name === 'lobby_close' && c.body.p_code === 'NEWRM'), 'la partie quitte la liste au départ').toBe(true);
      expect(server.unhandled, 'chaque appel du serveur est connu du faux serveur').toEqual([]);
      // the only console error is the 400 of the full game, refused on purpose above
      expect(errors.filter((e) => !e.includes('400'))).toEqual([]);
    });

    test('sans compte, Course perso ne propose que la course hors ligne', async ({ page }) => {
      const errors = watchConsole(page);
      await page.goto('/');
      await page.getByTestId('open-setup').click();
      await expect(page.getByTestId('lobby-need-account')).toBeVisible();
      await expect(page.getByTestId('lobby-create')).toHaveCount(0);
      await audit(page, 'sans compte');
      await page.getByTestId('offline-race').click();
      await expect(page.getByLabel('Circuit')).toBeVisible(); // the setup window of the offline race
      expect(errors).toEqual([]);
    });

    test('un bouton de la page Course ouvre l’éditeur de circuits', async ({ page }) => {
      const errors = watchConsole(page);
      await page.goto('/');
      await page.getByTestId('open-editor').click();
      await expect(page.getByTestId('editor')).toBeVisible({ timeout: 20_000 }); // the editor is loaded on demand: slower when many tests run together
      await expect(page).toHaveURL(/\?editor=1/);
      await audit(page, 'éditeur');
      await page.screenshot({ path: `e2e/screenshots/lobbies-${size.name}-editor.png` });
      await page.getByRole('button', { name: 'Retour au jeu' }).click();
      await expect(page.getByTestId('open-editor')).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}
