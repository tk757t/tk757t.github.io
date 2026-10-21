import { expect, test, type Page } from '@playwright/test';
import { expectContrast, expectNoHorizontalOverflow, expectUsableLayout, sizes, watchConsole } from './helpers';

// The Supabase project is replaced by a fake: no real account is created by the tests.
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const FAKE_TOKEN = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'me1', role: 'authenticated', exp: 4_102_444_800 })}.sig`;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

interface Row {
  rank: number;
  pseudo: string;
  trophies: number;
  wins: number;
  races: number;
  mine: boolean;
}

async function fakeSupabase(page: Page, rows: Row[]) {
  await page.route('https://npaunxotjhkjzoxfpqgq.supabase.co/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (url.pathname === '/auth/v1/signup') {
      const user = { id: 'me1', aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: '2026-10-22T00:00:00Z' };
      return route.fulfill({ headers: CORS, json: { access_token: FAKE_TOKEN, token_type: 'bearer', expires_in: 3600, expires_at: 4_102_444_800, refresh_token: 'r', user } });
    }
    if (url.pathname === '/rest/v1/rpc/claim_pseudo') return route.fulfill({ headers: CORS, json: (req.postDataJSON() as { p: string }).p });
    if (url.pathname === '/rest/v1/profiles') return route.fulfill({ headers: CORS, json: [{ pseudo: 'Max_07' }] });
    if (url.pathname === '/rest/v1/rpc/leaderboard_top') return route.fulfill({ headers: CORS, json: rows });
    if (url.pathname === '/rest/v1/rpc/leaderboard_me') {
      const me = rows.find((r) => r.mine);
      return route.fulfill({ headers: CORS, json: me ? [{ rank: me.rank, trophies: me.trophies, total: rows.length }] : [] });
    }
    if (url.pathname === '/rest/v1/rpc/presence_ping') return route.fulfill({ status: 204, headers: CORS });
    if (url.pathname === '/rest/v1/rpc/lobby_stats') return route.fulfill({ headers: CORS, json: [{ online: 3, ranked_waiting: 1, open_waiting: 2 }] });
    return route.fulfill({ status: 404, headers: CORS, json: {} });
  });
}

async function signIn(page: Page) {
  await page.goto('/?account=1');
  await page.getByTestId('account-pseudo').fill('Max_07');
  await page.getByTestId('account-guest').click();
  await expect(page.getByTestId('avatar')).toBeVisible();
}

const SEASON: Row[] = [
  { rank: 1, pseudo: 'Zoe_12', trophies: 4210, wins: 40, races: 61, mine: false },
  { rank: 2, pseudo: 'Leo_9', trophies: 1250, wins: 12, races: 30, mine: false },
  { rank: 2, pseudo: 'Ines_7', trophies: 1250, wins: 11, races: 28, mine: false },
  { rank: 4, pseudo: 'Max_07', trophies: 420, wins: 3, races: 10, mine: true },
  { rank: 5, pseudo: 'Tom_88', trophies: 30, wins: 0, races: 2, mine: false },
];

for (const size of sizes) {
  test.describe(`classement de la saison (${size.name})`, () => {
    test.use({ reducedMotion: 'reduce' });

    test('le bouton est à droite des gemmes ; le classement montre les places, la ligue, et vous', async ({ page }) => {
      const errors = watchConsole(page);
      await page.setViewportSize({ width: size.width, height: size.height });
      await fakeSupabase(page, SEASON);
      await signIn(page);

      // the ranking sits on the top bar, right of the gems and before the chat
      const gems = await page.getByTestId('gems').boundingBox();
      const board = await page.getByTestId('board-open').boundingBox();
      const chat = await page.getByTestId('chat-open').boundingBox();
      expect(gems && board && chat).toBeTruthy();
      expect(board!.x).toBeGreaterThanOrEqual(gems!.x + gems!.width - 1);
      expect(chat!.x).toBeGreaterThanOrEqual(board!.x + board!.width - 1);
      await expectUsableLayout(page, 'barre du haut');
      await expectNoHorizontalOverflow(page, 'barre du haut');

      await page.getByTestId('board-open').click();
      await expect(page.getByTestId('board-list').locator('li.board__row')).toHaveCount(5);
      await expect(page.getByTestId('board-season')).toContainText('Saison 1');
      await expect(page.getByTestId('board-mine')).toContainText('4e');
      await expect(page.getByTestId('board-mine')).toContainText('420');
      await expect(page.getByTestId('board-mine')).toContainText('ligue Bitume');
      // same trophies, same place; the league of each line; mine highlighted
      await expect(page.locator('li[data-rank="2"]')).toHaveCount(2);
      await expect(page.locator('li[data-rank="1"]')).toContainText('Légende');
      await expect(page.locator('li.board__row--me')).toContainText('Max_07');
      await expectUsableLayout(page, 'classement');
      await expectNoHorizontalOverflow(page, 'classement');
      await expectContrast(page, 'classement');
      await page.screenshot({ path: `e2e/screenshots/board-${size.name}-open.png` });
      expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
    });

    test('sans course classée cette saison : message clair ; sans compte : pas de bouton', async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await fakeSupabase(page, []);
      await signIn(page);
      await page.getByTestId('board-open').click();
      await expect(page.getByTestId('board-status')).toContainText('Personne n’a encore joué');
      await expect(page.getByTestId('board-mine')).toContainText('Jouez une course classée');
      await page.screenshot({ path: `e2e/screenshots/board-${size.name}-empty.png` });
      // a visitor without an account
      const other = await page.context().newPage();
      await other.setViewportSize({ width: size.width, height: size.height });
      await other.goto('/');
      await expect(other.getByTestId('avatar')).toBeVisible();
      await expect(other.getByTestId('board-open')).toBeHidden();
    });
  });
}
