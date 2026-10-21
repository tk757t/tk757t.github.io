import { expect, test, type Page } from '@playwright/test';
import { createGameHandler, memoryStore, readState, type ServerState } from '../src/server';
import { expectContrast, expectNoHorizontalOverflow, expectUsableLayout, goTab, injectSave, sizes, watchConsole } from './helpers';

// The Supabase project is replaced by a fake. The game function answers with the real server logic (src/server), run
// here in the test process with an in-memory store and a clock the test moves forward.
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const FAKE_TOKEN = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp: 4_102_444_800 })}.sig`;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

type W = {
  __profile: { get(): { gold: number; gems: number; races: number }; server(): boolean };
  __game: { autoplay(me?: string): void };
};

async function fakeSupabase(page: Page) {
  let skew = 0;
  let latency = 0; // ms the fake game function takes to answer (a real one takes 400 to 1000)
  const now = () => Date.now() + skew;
  const store = memoryStore(now);
  store.sessions.set(FAKE_TOKEN, 'u1');
  const game = createGameHandler(store, { now });
  const auth = { pseudo: null as string | null };
  await page.route('https://npaunxotjhkjzoxfpqgq.supabase.co/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === '/functions/v1/game') {
      if (latency > 0) await new Promise((r) => setTimeout(r, latency));
      const res = await game(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.method() === 'POST' ? req.postData() : undefined }));
      return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers.entries()), body: res.status === 204 ? '' : await res.text() });
    }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (url.pathname === '/auth/v1/signup') {
      const user = { id: 'u1', aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: '2026-10-21T00:00:00Z' };
      return route.fulfill({ headers: CORS, json: { access_token: FAKE_TOKEN, token_type: 'bearer', expires_in: 3600, expires_at: 4_102_444_800, refresh_token: 'r', user } });
    }
    if (url.pathname === '/rest/v1/rpc/claim_pseudo') {
      auth.pseudo = (req.postDataJSON() as { p: string }).p;
      return route.fulfill({ headers: CORS, json: auth.pseudo });
    }
    if (url.pathname === '/rest/v1/profiles') return route.fulfill({ headers: CORS, json: [{ pseudo: auth.pseudo }] });
    if (url.pathname === '/rest/v1/rpc/presence_ping') return route.fulfill({ status: 204, headers: CORS });
    if (url.pathname === '/rest/v1/rpc/lobby_stats') return route.fulfill({ headers: CORS, json: [{ online: 3, ranked_waiting: 1, open_waiting: 2 }] });
    return route.fulfill({ status: 404, headers: CORS, json: {} });
  });
  return {
    store,
    advance: (ms: number) => (skew += ms),
    slow: (ms: number) => (latency = ms),
    state: (): ServerState => readState(store.rows.get('u1')!.state),
    /** Another device changed the game on the server (this screen is now out of date). */
    mutate(fn: (p: ServerState['profile']) => ServerState['profile']) {
      const row = store.rows.get('u1')!;
      const s = readState(row.state);
      store.rows.set('u1', { state: { ...s, profile: fn(s.profile) }, version: row.version + 1 });
    },
  };
}

const localSave = {
  version: 5,
  packs: [],
  slots: [null, null, null, null],
  fragments: 0,
  gold: 500,
  gems: 30,
  xp: 0,
  owned: {},
  loadout: { parts: {} },
  rng: 5,
  races: 0,
  wins: 0,
  packsOpened: 0,
  pity: 0,
  upgrades: 0,
  campaign: { stars: [] },
  claimed: [],
};

const badge = (page: Page, id: string) => page.getByTestId(id).locator('.kit-badge__text');
const onServer = (page: Page) => page.waitForFunction(() => (window as unknown as W).__profile.server());

async function audit(page: Page, where: string) {
  await expectUsableLayout(page, where);
  await expectNoHorizontalOverflow(page, where);
  await expectContrast(page, where);
}

for (const size of sizes) {
  test.describe(`serveur de jeu lent (${size.name})`, () => {
    test.use({ reducedMotion: 'reduce' });
    test.setTimeout(120_000);

    test('un achat s’affiche tout de suite, un refus remet l’écran comme avant, un coffre montre qu’il travaille', async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      const server = await fakeSupabase(page);
      await injectSave(page, { ...localSave, packs: [], slots: [{ readyAt: 0, tier: 'common' }, null, null, null] });
      await page.goto('/?account=1');
      await page.getByTestId('account-pseudo').fill('Lent_01');
      await page.getByTestId('account-guest').click();
      await onServer(page);
      await goTab(page, 'shop');
      await expect(badge(page, 'gold')).toHaveText('500');

      // the server now takes 1.5 s: the purchase shows on screen well before its answer
      server.slow(1500);
      const t0 = Date.now();
      await page.locator('[data-buy="pack-1"]').click();
      await expect(badge(page, 'gold')).toHaveText('380', { timeout: 600 });
      expect(Date.now() - t0).toBeLessThan(900);
      expect(server.state().profile.gold).toBe(500); // the server has not answered yet
      await expect(page.getByTestId('toast')).toContainText('acheté'); // after the server's answer
      expect(server.state().profile.gold).toBe(380);
      await expect(badge(page, 'gold')).toHaveText('380');

      // a refusal (the gems were spent elsewhere): the expected +400 gold shows, then goes back
      server.mutate((p) => ({ ...p, gems: 5 }));
      await page.locator('[data-buy="gold-400"]').click();
      await expect(badge(page, 'gold')).toHaveText('780', { timeout: 600 });
      await expect(page.getByTestId('toast')).toContainText('Pas assez de ressources');
      await expect(badge(page, 'gold')).toHaveText('380');
      await expect(badge(page, 'gems')).toHaveText('5');

      // a chest draws its content on the server: the screen waits for it, but the button says it is working
      await goTab(page, 'race');
      server.slow(1200);
      const slot = page.locator('[data-slot-index="0"]');
      await slot.click();
      await expect(page.locator('[aria-busy="true"]').first()).toBeVisible({ timeout: 800 });
      await page.screenshot({ path: `e2e/screenshots/lag-${size.name}-busy.png` });
      await expect(page.getByTestId('toast').or(page.locator('.kit-modal')).first()).toBeVisible({ timeout: 5000 });
    });
  });
}

for (const size of sizes) {
  test.describe(`serveur de jeu (${size.name})`, () => {
    test.use({ reducedMotion: 'reduce' });
    test.setTimeout(120_000);

    test('compte invité : import borné, achat et course payés par le serveur, écran périmé relu', async ({ page }) => {
      const errors = watchConsole(page);
      await page.setViewportSize({ width: size.width, height: size.height });
      const server = await fakeSupabase(page);
      await injectSave(page, localSave);
      await page.goto('/?account=1');

      // first connection: pseudo, guest account, then the save of this device goes to the server once
      await page.getByTestId('account-pseudo').fill('Max_07');
      await page.getByTestId('account-guest').click();
      await expect(page.getByTestId('account-modal')).toHaveCount(0);
      await onServer(page);
      await expect(page.getByTestId('toast')).toContainText('enregistrée sur le serveur');
      expect(server.store.logs.map((l) => l.action)).toEqual(['import_save']);
      expect(server.state().importedAt).not.toBeNull();
      await expect(badge(page, 'gold')).toHaveText('500');

      // the welcome pack of a new account: shown for 72 hours, collected once, paid by the server
      await goTab(page, 'shop');
      await expect(page.getByTestId('welcome-pack')).toBeVisible();
      await expect(page.getByTestId('welcome-left')).toContainText('72 h 00 min');
      await audit(page, `server-welcome-${size.name}`);
      await page.screenshot({ path: `e2e/screenshots/server-game-${size.name}-welcome.png` });
      await page.locator('[data-claim="welcome"]').click();
      await expect(page.getByTestId('toast')).toContainText('Bienvenue');
      await expect(page.getByTestId('welcome-pack')).toHaveCount(0);
      await expect(badge(page, 'gold')).toHaveText('2500');
      await expect(badge(page, 'gems')).toHaveText('330');
      expect(server.state().profile).toMatchObject({ gold: 2500, gems: 330, welcomeUntil: 0 });
      expect(server.state().profile.owned['paint-lime']).toBe(1);
      // a daily gift is paid by the server too
      await page.locator('[data-claim="gift"]').click();
      await expect(badge(page, 'gold')).toHaveText('2520');
      expect(server.state().profile.gift.streak).toBe(1);
      server.mutate((p) => ({ ...p, gold: 500, gems: 30 })); // back to the amounts the rest of the test expects

      // a purchase is decided by the server: it debits and the screen shows its answer
      await goTab(page, 'shop');
      await page.locator('[data-buy="pack-1"]').click();
      await expect(page.getByTestId('toast')).toContainText('acheté');
      await expect(badge(page, 'gold')).toHaveText('380');
      expect(server.state().profile.gold).toBe(380);
      expect(server.state().profile.slots.filter(Boolean)).toHaveLength(1);
      await audit(page, `server-shop-${size.name}`);
      await page.screenshot({ path: `e2e/screenshots/server-game-${size.name}-shop.png` });

      // another device spent the gems: the server refuses, the screen is read again
      server.mutate((p) => ({ ...p, gems: 5 }));
      await page.locator('[data-buy="gold-400"]').click();
      await expect(page.getByTestId('toast')).toContainText('Pas assez de ressources');
      await expect(badge(page, 'gems')).toHaveText('5');
      expect(server.state().profile.gold).toBe(380);

      // a race: token from the server before the start, rewards from the server at the end
      await goTab(page, 'race');
      await page.getByTestId('open-setup').click();
      await page.getByTestId('offline-race').click();
      await page.getByTestId('start-from-setup').click();
      await page.waitForFunction(() => '__game' in window);
      expect(server.state().race).not.toBeNull();
      server.advance(10 * 60_000); // the race took ten minutes on the server's clock
      await page.evaluate(() => (window as unknown as W).__game.autoplay('hard'));
      await expect(page.getByTestId('ranking')).toBeVisible();
      await expect(page.getByTestId('rewards')).toBeVisible();
      const paid = server.store.logs.find((l) => l.action === 'finish_race')!;
      expect(paid.summary).toMatchObject({ verified: false, races: 1 });
      const s = server.state();
      expect(s.race).toBeNull();
      expect(s.profile.races).toBe(1);
      await expect(page.getByTestId('rewards')).toContainText(`🪙 +${s.profile.gold - 380}`);
      expect(await page.evaluate(() => (window as unknown as W).__profile.get().races)).toBe(1);
      await audit(page, `server-race-end-${size.name}`);
      await page.screenshot({ path: `e2e/screenshots/server-game-${size.name}-race-end.png` });
      await page.getByRole('button', { name: 'Menu' }).click();
      await expect(badge(page, 'gold')).toHaveText(String(s.profile.gold));

      // the copy kept on this device is read-only: editing it changes nothing once the server answers
      await page.evaluate(() => {
        const key = '4mules.server.u1';
        const copy = JSON.parse(localStorage.getItem(key)!);
        localStorage.setItem(key, JSON.stringify({ ...copy, gems: 99_999, gold: 99_999 }));
      });
      await page.reload();
      await onServer(page);
      await expect(badge(page, 'gems')).toHaveText('5');
      await expect(badge(page, 'gold')).toHaveText(String(s.profile.gold));
      expect(server.store.logs.filter((l) => l.action === 'import_save')).toHaveLength(1);
      expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
    });

    test('course classée : le serveur donne les trophées, l’écran de fin et le profil montrent le rang', async ({ page }) => {
      const errors = watchConsole(page);
      await page.setViewportSize({ width: size.width, height: size.height });
      const server = await fakeSupabase(page);
      await injectSave(page, localSave);
      await page.goto('/?account=1&ranked=1');
      await page.getByTestId('account-pseudo').fill('Max_07');
      await page.getByTestId('account-guest').click();
      await onServer(page);
      await goTab(page, 'race');
      await page.getByTestId('open-setup').click();
      await page.getByTestId('offline-race').click();
      await page.getByTestId('start-from-setup').click();
      await page.waitForFunction(() => '__game' in window);
      expect(server.state().race).toMatchObject({ ranked: true });
      server.advance(10 * 60_000);
      await page.evaluate(() => (window as unknown as W).__game.autoplay('hard'));
      await expect(page.getByTestId('ranked-result')).toBeVisible();
      const s = server.state();
      expect(s.profile.ranked.races).toBe(1);
      await expect(page.getByTestId('ranked-total')).toContainText(`${s.profile.ranked.trophies} trophées`);
      await expect(page.getByTestId('ranked-change')).toContainText('trophées');
      await audit(page, `ranked-race-end-${size.name}`);
      await page.screenshot({ path: `e2e/screenshots/ranked-${size.name}-race-end.png` });
      await page.getByRole('button', { name: 'Menu' }).click();
      // the profile shows the league and the trophies
      await page.getByTestId('avatar').click();
      await expect(page.getByTestId('profile-modal')).toContainText('Ligue');
      await expect(page.getByTestId('profile-modal')).toContainText('Trophées');
      await page.screenshot({ path: `e2e/screenshots/ranked-${size.name}-profile.png` });
      expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
    });
  });
}
