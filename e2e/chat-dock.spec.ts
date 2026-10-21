import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createGameHandler, memoryStore } from '../src/server';
import { expectContrast, expectNoHorizontalOverflow, expectUsableLayout, humanStep, sizes, watchConsole } from './helpers';

// The chat docked at the right of a large screen (menu and race, with the tabs Général / Course / Journal), the floating bubble of a narrow screen,
// the notifications and the chat of the race between the players of a race. The Supabase project is a fake; the room of the race goes through
// BroadcastChannel (?net=local) as in the other online tests.
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const tokenOf = (uid: string) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', exp: 4_102_444_800 })}.sig`;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const DOCK = 340;

interface Msg {
  id: number;
  sender: string;
  pseudo: string;
  body: string;
  created_at: string;
  trophies: number | null;
}

/** The general channel is shared by every page of a test: what one page sends, the others read. */
function fakeBackend() {
  const messages: Msg[] = [{ id: 1, sender: 'z1', pseudo: 'Zoe_12', body: 'Salut tout le monde', created_at: new Date().toISOString(), trophies: 1250 }];
  const sent: string[] = [];
  const say = (pseudo: string, body: string) => messages.push({ id: messages.length + 1, sender: 'z1', pseudo, body, created_at: new Date().toISOString(), trophies: null });
  async function attach(page: Page, uid: string) {
    const store = memoryStore(Date.now);
    const game = createGameHandler(store, { now: Date.now });
    store.sessions.set(tokenOf(uid), uid);
    let pseudo: string | null = null;
    await page.route('https://npaunxotjhkjzoxfpqgq.supabase.co/**', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (url.pathname === '/functions/v1/game') {
        const res = await game(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.method() === 'POST' ? req.postData() : undefined }));
        return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers.entries()), body: res.status === 204 ? '' : await res.text() });
      }
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const body = req.method() === 'POST' ? (req.postDataJSON() as Record<string, unknown>) : {};
      if (url.pathname === '/auth/v1/signup') {
        const user = { id: uid, aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: '2026-10-22T00:00:00Z' };
        return route.fulfill({ headers: CORS, json: { access_token: tokenOf(uid), token_type: 'bearer', expires_in: 3600, expires_at: 4_102_444_800, refresh_token: 'r', user } });
      }
      if (url.pathname === '/rest/v1/rpc/claim_pseudo') {
        pseudo = String(body.p);
        return route.fulfill({ headers: CORS, json: pseudo });
      }
      if (url.pathname === '/rest/v1/profiles') return route.fulfill({ headers: CORS, json: [{ pseudo }] });
      if (url.pathname === '/rest/v1/rpc/chat_fetch') {
        const after = body.p_after === null || body.p_after === undefined ? 0 : Number(body.p_after);
        return route.fulfill({ headers: CORS, json: messages.filter((m) => m.id > after).map((m) => ({ ...m, mine: m.sender === uid })) });
      }
      if (url.pathname === '/rest/v1/rpc/chat_send') {
        const text = String(body.p_body);
        sent.push(text);
        messages.push({ id: messages.length + 1, sender: uid, pseudo: pseudo ?? '?', body: text, created_at: new Date().toISOString(), trophies: null });
        return route.fulfill({ headers: CORS, json: messages.length });
      }
      if (url.pathname === '/rest/v1/rpc/leaderboard_me') return route.fulfill({ headers: CORS, json: [] });
      if (url.pathname === '/rest/v1/rpc/lobby_stats') return route.fulfill({ headers: CORS, json: [{ online: 5, ranked_waiting: 0, open_waiting: 0 }] });
      if (url.pathname === '/rest/v1/rpc/presence_ping') return route.fulfill({ status: 204, headers: CORS });
      return route.fulfill({ status: 404, headers: CORS, json: {} });
    });
  }
  return { messages, sent, say, attach };
}

/** Two tabs of one browser share its storage: each keeps its own sign-in (and its own chat choices) under its own keys. */
async function isolate(page: Page, tag: string) {
  await page.addInitScript((t) => {
    const own = (k: string) => (k === '4mules.auth' || k === '4mules.chat.prefs' ? `${k}.${t}` : k);
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    const del = Storage.prototype.removeItem;
    Storage.prototype.getItem = function (k: string) { return get.call(this, own(k)); };
    Storage.prototype.setItem = function (k: string, v: string) { return set.call(this, own(k), v); };
    Storage.prototype.removeItem = function (k: string) { return del.call(this, own(k)); };
  }, tag);
}

async function signIn(page: Page, pseudo: string, query = '') {
  await page.goto(`/?account=1&net=local&aiDelay=0${query}`);
  await page.getByTestId('account-pseudo').fill(pseudo);
  await page.getByTestId('account-guest').click();
  await expect(page.getByTestId('avatar')).toBeVisible();
}

async function audit(page: Page, where: string) {
  await expectUsableLayout(page, where);
  await expectNoHorizontalOverflow(page, where);
  await expectContrast(page, where);
}

const [mobile, desktop] = sizes;

test.describe('chat à droite sur ordinateur', () => {
  test.use({ viewport: { width: desktop.width, height: desktop.height }, reducedMotion: 'reduce' });
  test.setTimeout(120_000);

  test('toujours là dans le menu et en course, avec l’onglet Journal ; la course se loge à gauche', async ({ page }) => {
    const errors = watchConsole(page);
    const backend = fakeBackend();
    await backend.attach(page, 'me1');
    await signIn(page, 'Pilote_7');

    // the menu: the chat is docked, the button of the top bar and the bubble are not needed
    const dock = page.getByTestId('chat-dock');
    await expect(dock).toBeVisible();
    await expect(page.getByTestId('chat-list')).toContainText('Salut tout le monde');
    await expect(page.getByTestId('chat-open')).toBeHidden();
    await expect(page.getByTestId('chat-bubble')).toBeHidden();
    await expect(page.getByTestId('chat-tab-general')).toBeHidden(); // nothing to choose between yet: no tabs
    const shellRight = await page.locator('.shell').evaluate((e) => e.getBoundingClientRect().right);
    expect(Math.round(shellRight)).toBe(desktop.width - DOCK);
    await audit(page, 'menu avec le chat');
    await page.screenshot({ path: 'e2e/screenshots/dock-desktop-menu.png' });

    // writing from the dock
    await page.getByTestId('chat-input').fill('Bonjour depuis le côté');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('chat-list')).toContainText('Bonjour depuis le côté');
    expect(backend.sent).toEqual(['Bonjour depuis le côté']);

    // a race on this device: the dock stays, the race is laid out in what is left, the journal moves into a tab
    await page.getByTestId('open-setup').click();
    await page.getByTestId('offline-race').click();
    await page.getByRole('button', { name: 'Démarrer la course' }).click();
    await page.waitForFunction(() => '__game' in window);
    await expect(dock).toBeVisible();
    await expect(page.getByTestId('race-journal-open')).toBeHidden();
    const canvas = await page.locator('canvas').first().evaluate((c) => c.getBoundingClientRect().width);
    expect(Math.round(canvas)).toBe(desktop.width - DOCK);
    await expect(page.getByTestId('chat-tab-race')).toHaveCount(0); // a race alone: nobody to talk to
    await expect(page.getByTestId('chat-tab-journal')).toBeVisible();
    // the human turns of the race (the AIs play by themselves)
    for (let done = 0, tries = 0; done < 4 && tries < 400; tries++) {
      const mine = await page.evaluate(() => (window as unknown as { __game: { state: { status: string } }; __screen: { isHumanTurn(): boolean } }).__game.state.status === 'racing' && (window as unknown as { __screen: { isHumanTurn(): boolean } }).__screen.isHumanTurn());
      if (mine) {
        await humanStep(page);
        done++;
      } else await page.waitForTimeout(100);
    }
    await page.getByTestId('chat-tab-journal').click();
    await expect(page.getByTestId('journal-list')).toBeVisible();
    await expect(page.getByTestId('journal-list').locator('.journal__line').first()).toBeVisible();
    await audit(page, 'course avec le journal à droite');
    await page.screenshot({ path: 'e2e/screenshots/dock-desktop-race-journal.png' });
    await page.getByTestId('chat-tab-general').click();
    await expect(page.getByTestId('chat-list')).toContainText('Bonjour depuis le côté');
    expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  });

  test('une notification par message, sauf quand le chat est sous les yeux ; la cloche les coupe, et le choix reste', async ({ page }) => {
    const backend = fakeBackend();
    await backend.attach(page, 'me1');
    await signIn(page, 'Pilote_7');
    await page.getByTestId('open-setup').click();
    await page.getByTestId('offline-race').click();
    await page.getByRole('button', { name: 'Démarrer la course' }).click();
    await page.waitForFunction(() => '__game' in window);
    await page.getByTestId('chat-tab-journal').click(); // the general channel is not on screen

    backend.say('Leo_9', 'Tu viens ce soir ?');
    const notice = page.getByTestId('chat-notice');
    await expect(notice).toBeVisible({ timeout: 15_000 });
    await expect(notice).toContainText('Leo_9');
    await expect(notice).toContainText('Tu viens ce soir ?');
    await expect(page.getByTestId('chat-tab-general').getByTestId('chat-tab-badge')).toHaveText('1');
    await audit(page, 'notification');
    await page.screenshot({ path: 'e2e/screenshots/dock-desktop-notice.png' });
    // a tap on it brings the general chat to the front and clears the count
    await notice.getByRole('button', { name: /Ouvrir le chat/ }).click();
    await expect(page.getByTestId('chat-list')).toContainText('Tu viens ce soir ?');
    await expect(page.getByTestId('chat-tab-badge')).toHaveCount(0);
    await expect(notice).toBeHidden();

    // the chat is on screen: its messages are not notified
    backend.say('Zoe_12', 'Message sous les yeux');
    await expect(page.getByTestId('chat-list')).toContainText('Message sous les yeux', { timeout: 10_000 });
    await expect(notice).toBeHidden();

    // the bell cuts the notifications, and the choice stays after a reload
    const bell = page.getByTestId('chat-notify-toggle');
    await expect(bell).toHaveAttribute('aria-pressed', 'true');
    await bell.click();
    await expect(bell).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('chat-tab-journal').click();
    backend.say('Leo_9', 'Tu es là ?');
    await page.waitForTimeout(10_500);
    await expect(notice).toBeHidden();
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[data-testid="chat-notify-toggle"]') !== null);
    await expect(page.getByTestId('chat-notify-toggle')).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('bulle de chat sur mobile', () => {
  test.use({ viewport: { width: mobile.width, height: mobile.height }, reducedMotion: 'reduce' });
  test.setTimeout(120_000);

  test('une bulle qu’on déplace et qu’on ferme, le bouton du haut reste, les non lus et la notification', async ({ page }) => {
    const errors = watchConsole(page);
    const backend = fakeBackend();
    await backend.attach(page, 'me1');
    await signIn(page, 'Pilote_7');

    // the top bar keeps its chat button, and the bubble floats over the menu; the dock is for large screens
    await expect(page.getByTestId('chat-open')).toBeVisible();
    await expect(page.getByTestId('chat-dock')).toBeHidden();
    const bubble = page.getByTestId('chat-bubble');
    await expect(bubble).toBeVisible();
    await audit(page, 'menu avec la bulle');
    await page.screenshot({ path: 'e2e/screenshots/bubble-mobile-menu.png' });

    // drag: it follows the finger and stays where it is dropped, even after a reload; it never leaves the screen
    const before = await bubble.boundingBox();
    const main = page.getByTestId('chat-bubble-open');
    const box = (await main.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(120, 300, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByTestId('chat')).toHaveCount(0); // a drag is not a tap
    const moved = (await bubble.boundingBox())!;
    expect(Math.abs(moved.x + moved.width / 2 - 120)).toBeLessThan(4);
    expect(Math.abs(moved.y + moved.height / 2 - 300)).toBeLessThan(4);
    expect(moved.x).not.toBe(before!.x);
    await page.mouse.move(120, 300);
    await page.mouse.down();
    await page.mouse.move(-80, -80, { steps: 4 });
    await page.mouse.up();
    const edge = (await bubble.boundingBox())!;
    expect(edge.x).toBeGreaterThanOrEqual(0);
    expect(edge.y).toBeGreaterThanOrEqual(0);
    await page.reload();
    await expect(page.getByTestId('chat-bubble')).toBeVisible();
    const again = (await page.getByTestId('chat-bubble').boundingBox())!;
    expect(Math.abs(again.x - edge.x)).toBeLessThan(3);
    expect(Math.abs(again.y - edge.y)).toBeLessThan(3);

    // unread: a message arrives while the chat is closed: a notification and a count on the bubble; a tap opens the chat and clears it
    backend.say('Leo_9', 'Salut la compagnie');
    await expect(page.getByTestId('chat-notice')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('chat-bubble-badge')).toHaveText('1');
    await audit(page, 'notification mobile');
    await page.screenshot({ path: 'e2e/screenshots/bubble-mobile-notice.png' });
    await page.getByTestId('chat-bubble-open').click();
    await expect(page.getByTestId('chat')).toBeVisible();
    await expect(page.getByTestId('chat-list')).toContainText('Salut la compagnie');
    await expect(page.getByTestId('chat-bubble-badge')).toBeHidden();
    await audit(page, 'chat ouvert par la bulle');
    await page.getByTestId('chat').getByRole('button', { name: 'Fermer' }).click();

    // close the bubble: it goes, the chat button of the top bar stays, and the chat window brings the bubble back
    await page.getByTestId('chat-bubble-close').click();
    await expect(page.getByTestId('chat-bubble')).toBeHidden();
    await page.reload();
    await expect(page.getByTestId('avatar')).toBeVisible();
    await expect(page.getByTestId('chat-bubble')).toBeHidden();
    await page.getByTestId('chat-open').click();
    await page.getByTestId('chat-bubble-show').click();
    await expect(page.getByTestId('chat-bubble')).toBeVisible();
    expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  });
});

/** Two players in one friends' room, racing: Alice on a large screen (docked chat), Bob on a phone (bubble). */
async function twoPlayers(context: BrowserContext) {
  const backend = fakeBackend();
  const alice = await context.newPage();
  const bob = await context.newPage();
  await alice.setViewportSize({ width: desktop.width, height: desktop.height });
  await bob.setViewportSize({ width: mobile.width, height: mobile.height });
  await isolate(alice, 'a');
  await isolate(bob, 'b');
  await backend.attach(alice, 'ua');
  await backend.attach(bob, 'ub');
  await signIn(alice, 'Alice_01', '&seed=3');
  await signIn(bob, 'Bob_02', '&seed=4');
  await alice.getByTestId('open-online').click();
  await alice.getByTestId('online-create').click();
  const code = (await alice.getByTestId('room-code').textContent())!.trim();
  await alice.getByTestId('online-ais').selectOption('1');
  await bob.getByTestId('open-online').click();
  await bob.getByTestId('online-code').fill(code);
  await bob.getByTestId('online-join').click();
  await expect(alice.getByTestId('online-players').locator('li')).toHaveCount(2);
  await alice.getByTestId('online-start').click();
  for (const p of [alice, bob]) await p.waitForFunction(() => '__game' in window);
  return { backend, alice, bob };
}

test.describe('chat de la course', () => {
  test.use({ reducedMotion: 'reduce' });
  test.setTimeout(180_000);

  test('seuls les joueurs de la course se parlent : onglet Course à droite, bulle sur mobile, notification', async ({ context }) => {
    const { backend, alice, bob } = await twoPlayers(context);
    const errors = [...watchConsole(alice), ...watchConsole(bob)];

    // Alice: the dock has the tabs of the race; Bob: the bubble, and the same tab in the chat window
    await expect(alice.getByTestId('chat-tab-race')).toBeVisible();
    await expect(alice.getByTestId('chat-tab-journal')).toBeVisible();
    await alice.getByTestId('chat-tab-race').click();
    await expect(alice.getByTestId('race-chat-empty')).toBeVisible();
    await alice.getByTestId('race-chat-input').fill('Bonne course Bob !');
    await alice.getByTestId('race-chat-send').click();
    await expect(alice.getByTestId('race-chat-list')).toContainText('Bonne course Bob !');
    await audit(alice, 'chat de course');
    await alice.screenshot({ path: 'e2e/screenshots/racechat-desktop-tab.png' });

    // Bob is told, with the tag of the race chat; the message is in the Course tab of his chat window
    const notice = bob.getByTestId('chat-notice');
    await expect(notice).toBeVisible({ timeout: 10_000 });
    await expect(notice).toContainText('Alice_01 (course)');
    await expect(notice).toContainText('Bonne course Bob !');
    await expect(bob.getByTestId('chat-bubble-badge')).toHaveText('1');
    await notice.getByRole('button', { name: /Ouvrir le chat/ }).click();
    await expect(bob.getByTestId('chat')).toBeVisible();
    await expect(bob.getByTestId('race-chat-list')).toContainText('Bonne course Bob !');
    await audit(bob, 'chat de course mobile');
    await bob.screenshot({ path: 'e2e/screenshots/racechat-mobile-window.png' });
    await bob.getByTestId('race-chat-input').fill('Merci Alice, à toi aussi');
    await bob.getByTestId('race-chat-send').click();
    await expect(alice.getByTestId('race-chat-list')).toContainText('Merci Alice, à toi aussi');

    // a link is refused before it leaves, and nothing of the race chat reaches the general channel
    await bob.getByTestId('race-chat-input').fill('regarde http://exemple.fr');
    await bob.waitForTimeout(900);
    await bob.getByTestId('race-chat-send').click();
    await expect(bob.getByTestId('race-chat-status')).toContainText('liens');
    await expect(alice.getByTestId('race-chat-list')).not.toContainText('exemple.fr');
    expect(backend.sent).toEqual([]);
    expect(backend.messages.some((m) => m.body.includes('Bonne course'))).toBe(false);

    // a player can be hidden for the rest of the race
    await alice.getByTestId('race-chat-hide').first().click();
    await expect(alice.getByTestId('race-chat-list')).not.toContainText('Merci Alice, à toi aussi');
    expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  });
});
