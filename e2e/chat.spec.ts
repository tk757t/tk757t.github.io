import { expect, test, type Page } from '@playwright/test';
import { expectContrast, expectNoHorizontalOverflow, expectUsableLayout, sizes, watchConsole } from './helpers';

// The Supabase project is replaced by a fake: no real account and no real message is created by the tests.
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const FAKE_TOKEN = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'me1', role: 'authenticated', exp: 4_102_444_800 })}.sig`;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

interface Msg {
  id: number;
  sender: string;
  pseudo: string;
  body: string;
  created_at: string;
  trophies: number | null;
}

async function fakeSupabase(page: Page) {
  const now = Date.now();
  const state = {
    pseudo: null as string | null,
    messages: [
      { id: 1, sender: 'z1', pseudo: 'Zoe_12', body: 'Salut tout le monde', created_at: new Date(now - 120_000).toISOString(), trophies: 1250 },
      { id: 2, sender: 'l1', pseudo: 'Leo_9', body: '<img src=x onerror=window.__pwned=1> ça roule ?', created_at: new Date(now - 90_000).toISOString(), trophies: null },
      { id: 3, sender: 'z1', pseudo: 'Zoe_12', body: 'Prête pour la course', created_at: new Date(now - 30_000).toISOString(), trophies: 1250 },
    ] as Msg[],
    blocked: new Set<string>(),
    reports: [] as { id: number; reason: string }[],
    sent: [] as string[],
    fetches: 0,
  };
  await page.route('https://npaunxotjhkjzoxfpqgq.supabase.co/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = req.method() === 'POST' ? (req.postDataJSON() as Record<string, unknown>) : {};
    if (url.pathname === '/auth/v1/signup') {
      const user = { id: 'me1', aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: '2026-10-22T00:00:00Z' };
      return route.fulfill({ headers: CORS, json: { access_token: FAKE_TOKEN, token_type: 'bearer', expires_in: 3600, expires_at: 4_102_444_800, refresh_token: 'r', user } });
    }
    if (url.pathname === '/rest/v1/rpc/claim_pseudo') {
      state.pseudo = String(body.p);
      return route.fulfill({ headers: CORS, json: state.pseudo });
    }
    if (url.pathname === '/rest/v1/profiles') return route.fulfill({ headers: CORS, json: [{ pseudo: state.pseudo }] });
    if (url.pathname === '/rest/v1/rpc/chat_fetch') {
      state.fetches++;
      const after = body.p_after === null || body.p_after === undefined ? 0 : Number(body.p_after);
      const rows = state.messages.filter((m) => m.id > after && !state.blocked.has(m.sender)).map((m) => ({ ...m, mine: m.sender === 'me1' }));
      return route.fulfill({ headers: CORS, json: rows });
    }
    if (url.pathname === '/rest/v1/rpc/leaderboard_me') return route.fulfill({ headers: CORS, json: [{ rank: 12, trophies: 420, total: 40 }] });
    if (url.pathname === '/rest/v1/rpc/chat_send') {
      const text = String(body.p_body);
      if (/boom/i.test(text)) return route.fulfill({ status: 400, headers: CORS, json: { code: 'P0001', message: 'Message refusé : langage inapproprié.' } });
      const id = state.messages.length + 1;
      state.messages.push({ id, sender: 'me1', pseudo: state.pseudo ?? 'Moi', body: text, created_at: new Date().toISOString(), trophies: 420 });
      state.sent.push(text);
      return route.fulfill({ headers: CORS, json: id });
    }
    if (url.pathname === '/rest/v1/rpc/chat_report') {
      state.reports.push({ id: Number(body.p_message), reason: String(body.p_reason) });
      return route.fulfill({ status: 204, headers: CORS });
    }
    if (url.pathname === '/rest/v1/rpc/chat_block') {
      state.blocked.add(String(body.p_user));
      return route.fulfill({ status: 204, headers: CORS });
    }
    if (url.pathname === '/rest/v1/rpc/chat_unblock') {
      state.blocked.delete(String(body.p_user));
      return route.fulfill({ status: 204, headers: CORS });
    }
    if (url.pathname === '/rest/v1/rpc/chat_blocked') {
      const names: Record<string, string> = { l1: 'Leo_9', z1: 'Zoe_12' };
      return route.fulfill({ headers: CORS, json: [...state.blocked].map((id) => ({ user_id: id, pseudo: names[id] ?? '?' })) });
    }
    return route.fulfill({ status: 404, headers: CORS, json: {} });
  });
  return state;
}

/** Plays as a guest with a pseudo, on the fake server. */
async function signIn(page: Page) {
  await page.goto('/?account=1');
  await page.getByTestId('account-pseudo').fill('Max_07');
  await page.getByTestId('account-guest').click();
  await expect(page.getByTestId('avatar')).toBeVisible();
}

for (const size of sizes) {
  test.describe(`chat du canal général (${size.name})`, () => {
    test.use({ reducedMotion: 'reduce' });

    test('lire, écrire, signaler, bloquer, débloquer ; le texte des autres reste du texte', async ({ page }) => {
      const errors = watchConsole(page);
      await page.setViewportSize({ width: size.width, height: size.height });
      const fake = await fakeSupabase(page);
      await signIn(page);

      await page.getByTestId('chat-open').click();
      const list = page.getByTestId('chat-list');
      await expect(list.locator('li.chat__msg')).toHaveCount(3);
      // a message that looks like markup stays text: no element is created from it, nothing runs
      await expect(list.getByText('<img src=x onerror=window.__pwned=1>', { exact: false })).toBeVisible();
      await expect(list.locator('img')).toHaveCount(0);
      expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
      // the rank is in view: the league of each author (none for who has not raced ranked yet) and my own place
      await expect(list.locator('li[data-msg="1"] [data-league="chicane"]')).toHaveText('Chicane');
      await expect(list.locator('li[data-msg="2"] .kit-badge')).toHaveCount(0);
      await expect(page.getByTestId('chat-place')).toContainText('12e sur 40 · ligue Bitume');
      await expectUsableLayout(page, 'chat');
      await expectNoHorizontalOverflow(page, 'chat');
      await expectContrast(page, 'chat');
      await page.screenshot({ path: `e2e/screenshots/chat-${size.name}-open.png` });

      // writing: the message appears, marked as mine; the counter follows
      await page.getByTestId('chat-input').fill('Bonjour à tous');
      await expect(page.locator('.chat__count')).toHaveText('14/200');
      await page.getByTestId('chat-send').click();
      await expect(list.locator('li.chat__msg--mine')).toContainText('Bonjour à tous');
      expect(fake.sent).toEqual(['Bonjour à tous']);
      await expect(page.getByTestId('chat-input')).toHaveValue('');

      // a link is refused before anything is sent, a refusal of the server is worded for the player
      await page.getByTestId('chat-input').fill('va sur http://exemple.fr');
      await page.getByTestId('chat-send').click();
      await expect(page.getByTestId('chat-status')).toContainText('liens');
      expect(fake.sent).toHaveLength(1);
      await page.getByTestId('chat-input').fill('boom');
      await page.getByTestId('chat-send').click();
      await expect(page.getByTestId('chat-status')).toContainText('langage inapproprié');
      await expect(page.getByTestId('chat-status')).not.toContainText('P0001');
      await page.screenshot({ path: `e2e/screenshots/chat-${size.name}-refused.png` });

      // report the message of Leo: four reasons, one tap
      await list.locator('li[data-msg="2"]').getByTestId('chat-options').click();
      const options = page.getByTestId('chat-options-modal');
      await expect(options).toContainText('Message de Leo_9');
      await expectUsableLayout(page, 'options du message');
      await page.screenshot({ path: `e2e/screenshots/chat-${size.name}-options.png` });
      await options.locator('[data-reason="spam"]').click();
      await expect(page.getByTestId('toast')).toContainText('signalement');
      expect(fake.reports).toEqual([{ id: 2, reason: 'spam' }]);
      await expect(options).toHaveCount(0);

      // block Leo: his messages disappear at once
      await list.locator('li[data-msg="2"]').getByTestId('chat-options').click();
      await page.getByTestId('chat-block').click();
      await expect(list.locator('li[data-msg="2"]')).toHaveCount(0);
      expect(fake.blocked.has('l1')).toBe(true);
      await expect(list.locator('li[data-msg="1"]')).toBeVisible(); // the others stay

      // the list of the blocked players, and the unblocking
      await page.getByTestId('chat-blocked-open').click();
      const blocked = page.getByTestId('chat-blocked-list');
      await expect(blocked).toContainText('Leo_9');
      await page.screenshot({ path: `e2e/screenshots/chat-${size.name}-blocked.png` });
      await blocked.locator('[data-unblock="l1"]').click();
      await expect(blocked).toContainText('Vous n’avez bloqué personne.');
      await page.getByTestId('chat-blocked').getByRole('button', { name: 'Fermer' }).click();
      await expect(list.locator('li[data-msg="2"]')).toHaveCount(1);

      expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
    });

    test('le chat lit les nouveaux messages tout seul, et se ferme proprement', async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      const fake = await fakeSupabase(page);
      await signIn(page);
      await page.getByTestId('chat-open').click();
      await expect(page.getByTestId('chat-list').locator('li.chat__msg')).toHaveCount(3);
      fake.messages.push({ id: 4, sender: 'z1', pseudo: 'Zoe_12', body: 'Un nouveau message', created_at: new Date().toISOString(), trophies: 1250 });
      await expect(page.getByTestId('chat-list')).toContainText('Un nouveau message', { timeout: 10_000 });
      // closed, the window stops asking
      await page.getByTestId('chat').getByRole('button', { name: 'Fermer' }).click();
      const after = fake.fetches;
      await page.waitForTimeout(3600);
      expect(fake.fetches).toBe(after);
    });

    test('sans compte, pas de bouton de chat', async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/');
      await expect(page.getByTestId('avatar')).toBeVisible();
      await expect(page.getByTestId('chat-open')).toBeHidden();
    });
  });
}
