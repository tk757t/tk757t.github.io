import { expect, test, type Page } from '@playwright/test';
import { expectContrast, expectNoHorizontalOverflow, expectUsableLayout, sizes, watchConsole } from './helpers';

// The Supabase project is replaced by a fake: no real account is created by the tests.
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const FAKE_TOKEN = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp: 4_102_444_800 })}.sig`;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

async function fakeSupabase(page: Page) {
  const state = { pseudo: null as string | null, signups: 0 };
  await page.route('https://npaunxotjhkjzoxfpqgq.supabase.co/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (url.pathname === '/auth/v1/signup') {
      state.signups++;
      const user = { id: 'u1', aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: '2026-10-21T00:00:00Z' };
      return route.fulfill({ headers: CORS, json: { access_token: FAKE_TOKEN, token_type: 'bearer', expires_in: 3600, expires_at: 4_102_444_800, refresh_token: 'r', user } });
    }
    if (url.pathname === '/auth/v1/token') {
      // the refresh: the guest has been linked to Discord since the session was stored
      const user = { id: 'u1', aud: 'authenticated', role: 'authenticated', is_anonymous: false, app_metadata: { provider: 'discord' }, user_metadata: {}, created_at: '2026-10-21T00:00:00Z' };
      return route.fulfill({ headers: CORS, json: { access_token: FAKE_TOKEN, token_type: 'bearer', expires_in: 3600, expires_at: 4_102_444_800, refresh_token: 'r2', user } });
    }
    if (url.pathname === '/rest/v1/rpc/claim_pseudo') {
      const p = (req.postDataJSON() as { p: string }).p;
      if (p === 'Pris') return route.fulfill({ status: 400, headers: CORS, json: { code: 'P0001', message: 'Ce pseudo est déjà pris.' } });
      state.pseudo = p;
      return route.fulfill({ headers: CORS, json: p });
    }
    if (url.pathname === '/rest/v1/profiles') return route.fulfill({ headers: CORS, json: state.pseudo ? [{ pseudo: state.pseudo }] : [{ pseudo: null }] });
    return route.fulfill({ status: 404, headers: CORS, json: {} });
  });
  return state;
}

for (const size of sizes) {
  test.describe(`premier lancement (${size.name})`, () => {
    test.use({ reducedMotion: 'reduce' });

    test('pseudo d’abord, puis invité : règles, pseudo pris, compte créé, profil', async ({ page }) => {
      const errors = watchConsole(page);
      await page.setViewportSize({ width: size.width, height: size.height });
      const state = await fakeSupabase(page);
      await page.goto('/?account=1');

      const modal = page.getByTestId('account-modal');
      await expect(modal).toBeVisible();
      await expect(modal).toContainText('Bienvenue sur 4 Mules');
      await expectUsableLayout(page, 'account');
      await expectNoHorizontalOverflow(page, 'account');
      await expectContrast(page, 'account');
      await page.screenshot({ path: `e2e/screenshots/account-${size.name}-welcome.png` });

      // rules are checked before anything is sent
      await page.getByTestId('account-pseudo').fill('ab');
      await page.getByTestId('account-guest').click();
      await expect(page.getByTestId('account-message')).toContainText('3 à 16');
      await page.getByTestId('account-pseudo').fill('Admin1');
      await page.getByTestId('account-guest').click();
      await expect(page.getByTestId('account-message')).toContainText('pas disponible');
      expect(state.signups).toBe(0);

      // a pseudo taken on the server: the message shows and the player can try another
      await page.getByTestId('account-pseudo').fill('Pris');
      await page.getByTestId('account-guest').click();
      await expect(page.getByTestId('account-message')).toContainText('déjà pris');
      await expectContrast(page, 'account error');
      await page.screenshot({ path: `e2e/screenshots/account-${size.name}-taken.png` });

      await page.getByTestId('account-pseudo').fill('Max_07');
      await page.getByTestId('account-guest').click();
      await expect(modal).toHaveCount(0);
      await expect(page.getByTestId('avatar')).toBeVisible();

      // the profile shows the pseudo and offers to link the guest account to Discord
      await page.getByTestId('avatar').click();
      await expect(page.getByTestId('profile-modal')).toContainText('Max_07');
      await expect(page.getByTestId('link-discord')).toBeVisible();
      await page.waitForFunction(() => !document.getAnimations().some((a) => a.playState === 'running' && (a.effect as KeyframeEffect).target?.closest('.kit-modal-wrap')));
      await expectUsableLayout(page, 'profile with account');
      await expectContrast(page, 'profile with account');
      await page.screenshot({ path: `e2e/screenshots/account-${size.name}-profile.png` });
      expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
    });

    test('un invité lié à Discord ailleurs : le profil ne propose plus de lier le compte', async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      const state = await fakeSupabase(page);
      state.pseudo = 'Max_07';
      // a session stored by an earlier visit, when the account was still a guest
      await page.addInitScript((token) => {
        const user = { id: 'u1', aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: '2026-10-21T00:00:00Z' };
        localStorage.setItem('4mules.auth', JSON.stringify({ access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: 4_102_444_800, refresh_token: 'r', user }));
      }, FAKE_TOKEN);
      await page.goto('/?account=1');
      await expect(page.getByTestId('avatar')).toBeVisible();
      await expect(async () => {
        await page.getByTestId('avatar').click();
        await expect(page.getByTestId('profile-modal')).toContainText('Max_07');
        await expect(page.getByTestId('link-discord')).toHaveCount(0);
      }).toPass({ timeout: 8000 });
    });

    test('hors ligne : le jeu reste jouable sans compte', async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.route('https://npaunxotjhkjzoxfpqgq.supabase.co/**', (route) => route.abort());
      await page.goto('/?account=1');
      await page.getByTestId('account-pseudo').fill('Max_07');
      await page.getByTestId('account-guest').click();
      await expect(page.getByTestId('account-message')).toContainText('Connexion impossible');
      await page.getByTestId('account-offline').click();
      await expect(page.getByTestId('account-modal')).toHaveCount(0);
      await expect(page.getByTestId('avatar')).toBeVisible();
    });

    test('retour de Discord en erreur : le vrai motif s’affiche, l’adresse est nettoyée, le jeu reste jouable', async ({ page }) => {
      const errors = watchConsole(page);
      await page.setViewportSize({ width: size.width, height: size.height });
      await fakeSupabase(page);
      // the player pressed "Retour" on the Discord page: access_denied, in the query (and the same in the # part)
      for (const where of ['?account=1&join=ABCD&error=access_denied&error_code=bad_oauth_callback&error_description=The+resource+owner+denied+the+request', '?account=1#error=access_denied&error_description=denied']) {
        await page.goto(`/${where}`);
        const message = page.getByTestId('account-message');
        await expect(message).toContainText('Connexion Discord annulée.');
        await expect(message).not.toContainText('Une erreur est survenue');
        expect(page.url()).not.toMatch(/error/);
        if (where.includes('join=')) expect(page.url()).toContain('join=ABCD');
        await expectContrast(page, 'discord return error');
        await page.screenshot({ path: `e2e/screenshots/account-${size.name}-discord-denied.png` });
      }
      // another failure of the return: a sentence about the cause, never the raw text
      await page.goto('/?account=1&error=server_error&error_description=Unable+to+exchange+external+code');
      await expect(page.getByTestId('account-message')).toContainText('La connexion avec Discord a échoué');
      // the game stays playable as a guest after the error
      await page.getByTestId('account-pseudo').fill('Max_07');
      await page.getByTestId('account-guest').click();
      await expect(page.getByTestId('account-modal')).toHaveCount(0);
      expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
    });
  });
}
