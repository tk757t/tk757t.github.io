import { expect, test, type Page } from '@playwright/test';
import { createGameHandler, memoryStore, readState } from '../src/server';
import { expectContrast, expectNoHorizontalOverflow, expectUsableLayout, sizes, watchConsole } from './helpers';

// The staff tools (admin and tester) on a fake Supabase: no real account, no real moderation. The game function answers with the real server logic
// (src/server) so that the test tools really change the account; the SQL of the admin functions is tested apart, in transactions that are rolled back.
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const tokenOf = (uid: string) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', exp: 4_102_444_800 })}.sig`;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const NOW = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

type Role = 'player' | 'tester' | 'vip' | 'admin';

interface FakePlayer {
  id: string;
  pseudo: string;
  role: Role;
  created_at: string;
  last_action: string | null;
  suspension: string | null;
  muted_until: string | null;
  reports: number;
}

function fakeBackend(role: Role) {
  const store = memoryStore(Date.now);
  const game = createGameHandler(store, { now: Date.now });
  store.sessions.set(tokenOf('me1'), 'me1');
  store.roles.set('me1', role);
  const players: FakePlayer[] = [
    { id: 'p1', pseudo: 'Zoe_12', role: 'player', created_at: iso(NOW - 86_400_000), last_action: iso(NOW - 300_000), suspension: null, muted_until: null, reports: 2 },
    { id: 'p2', pseudo: 'Leo_9', role: 'tester', created_at: iso(NOW - 3_600_000), last_action: null, suspension: null, muted_until: null, reports: 0 },
    { id: 'p3', pseudo: 'Max_07', role: 'player', created_at: iso(NOW - 7_200_000), last_action: iso(NOW - 60_000), suspension: 'triche avérée', muted_until: null, reports: 0 },
  ];
  const reports = [
    { message_id: 11, body: 'un message vraiment déplacé', author: 'p1', author_pseudo: 'Zoe_12', reports: 2, reasons: 'insulte, spam', hidden: false, last_at: iso(NOW - 120_000) },
    { message_id: 12, body: 'déjà masqué', author: 'p2', author_pseudo: 'Leo_9', reports: 1, reasons: 'autre', hidden: true, last_at: iso(NOW - 3_600_000) },
  ];
  const words = ['truc', 'machin'];
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  const state = { players, reports, words, calls, store, roleAnswer: role as Role | 'error' };
  async function attach(page: Page) {
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
      const rpc = url.pathname.startsWith('/rest/v1/rpc/') ? url.pathname.slice('/rest/v1/rpc/'.length) : '';
      if (url.pathname === '/auth/v1/signup') {
        const user = { id: 'me1', aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: '2026-10-22T00:00:00Z' };
        return route.fulfill({ headers: CORS, json: { access_token: tokenOf('me1'), token_type: 'bearer', expires_in: 3600, expires_at: 4_102_444_800, refresh_token: 'r', user } });
      }
      if (rpc === 'claim_pseudo') {
        pseudo = String(body.p);
        return route.fulfill({ headers: CORS, json: pseudo });
      }
      if (url.pathname === '/rest/v1/profiles') return route.fulfill({ headers: CORS, json: [{ pseudo }] });
      for (const quiet of ['chat_fetch', 'leaderboard_me']) if (rpc === quiet) return route.fulfill({ headers: CORS, json: [] });
      if (rpc === 'lobby_stats') return route.fulfill({ headers: CORS, json: [{ online: 3, ranked_waiting: 0, open_waiting: 0 }] });
      if (rpc === 'presence_ping') return route.fulfill({ status: 204, headers: CORS });
      if (rpc === 'my_role') {
        if (state.roleAnswer === 'error') return route.fulfill({ status: 500, headers: CORS, json: { message: 'boom' } });
        return route.fulfill({ headers: CORS, json: state.roleAnswer });
      }
      if (rpc.startsWith('admin_')) {
        calls.push({ name: rpc, body });
        if (role !== 'admin') return route.fulfill({ status: 400, headers: CORS, json: { code: 'P0001', message: 'Réservé aux administrateurs.' } });
        if (rpc === 'admin_stats') return route.fulfill({ headers: CORS, json: [{ accounts: 120, with_pseudo: 90, new_24h: 7, online: 12, suspended: 1, muted: 0, reports_pending: reports.filter((r) => !r.hidden).length, messages_hour: 34, actions_hour: 560 }] });
        if (rpc === 'admin_players') {
          const q = String(body.p_query ?? '').toLowerCase();
          return route.fulfill({ headers: CORS, json: players.filter((p) => p.pseudo.toLowerCase().startsWith(q)) });
        }
        if (rpc === 'admin_set_role') {
          const p = players.find((x) => x.id === body.p_user)!;
          p.role = body.p_role as Role;
          return route.fulfill({ status: 204, headers: CORS });
        }
        if (rpc === 'admin_suspend') {
          if (!String(body.p_reason).trim()) return route.fulfill({ status: 400, headers: CORS, json: { code: 'P0001', message: 'Écrivez la raison de la suspension.' } });
          players.find((x) => x.id === body.p_user)!.suspension = String(body.p_reason);
          return route.fulfill({ status: 204, headers: CORS });
        }
        if (rpc === 'admin_unsuspend') {
          players.find((x) => x.id === body.p_user)!.suspension = null;
          return route.fulfill({ status: 204, headers: CORS });
        }
        if (rpc === 'admin_mute') {
          players.find((x) => x.id === body.p_user)!.muted_until = iso(NOW + Number(body.p_minutes) * 60_000);
          return route.fulfill({ status: 204, headers: CORS });
        }
        if (rpc === 'admin_unmute') {
          players.find((x) => x.id === body.p_user)!.muted_until = null;
          return route.fulfill({ status: 204, headers: CORS });
        }
        if (rpc === 'admin_reports') return route.fulfill({ headers: CORS, json: reports });
        if (rpc === 'admin_hide') {
          reports.find((r) => r.message_id === body.p_message)!.hidden = body.p_hidden === true;
          return route.fulfill({ status: 204, headers: CORS });
        }
        if (rpc === 'admin_dismiss') {
          reports.splice(reports.findIndex((r) => r.message_id === body.p_message), 1);
          return route.fulfill({ status: 204, headers: CORS });
        }
        if (rpc === 'admin_actions') return route.fulfill({ headers: CORS, json: [{ at: iso(NOW - 1000), action: 'finish_race', summary: '{"gold":123}' }, { at: iso(NOW - 90_000), action: 'open_slot', summary: '{"tier":"rare"}' }] });
        if (rpc === 'admin_audit') return route.fulfill({ headers: CORS, json: [{ at: iso(NOW - 5000), actor_pseudo: 'Boss_01', action: 'suspend', target_pseudo: 'Max_07', payload: '{"reason":"triche avérée"}' }] });
        if (rpc === 'admin_words') return route.fulfill({ headers: CORS, json: words.map((word) => ({ word })) });
        if (rpc === 'admin_word_add') {
          const w = String(body.p_word);
          if (!/^[a-z0-9]{2,30}$/.test(w)) return route.fulfill({ status: 400, headers: CORS, json: { code: 'P0001', message: 'Mot invalide : 2 à 30 lettres ou chiffres, sans accent ni espace.' } });
          words.push(w);
          return route.fulfill({ status: 204, headers: CORS });
        }
        if (rpc === 'admin_word_remove') {
          words.splice(words.indexOf(String(body.p_word)), 1);
          return route.fulfill({ status: 204, headers: CORS });
        }
      }
      return route.fulfill({ status: 404, headers: CORS, json: {} });
    });
  }
  return Object.assign(state, { attach });
}

async function signIn(page: Page) {
  await page.goto('/?account=1&aiDelay=0');
  await page.getByTestId('account-pseudo').fill('Boss_01');
  await page.getByTestId('account-guest').click();
  await expect(page.getByTestId('avatar')).toBeVisible();
  await page.waitForFunction(() => (window as unknown as { __profile: { server(): boolean } }).__profile.server());
}

async function audit(page: Page, where: string) {
  await expectUsableLayout(page, where);
  await expectNoHorizontalOverflow(page, where);
  await expectContrast(page, where);
}

const openProfile = (page: Page) => page.getByTestId('avatar').click();

for (const size of sizes) {
  test.describe(`outils du personnel - ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, reducedMotion: 'reduce' });
    test.setTimeout(120_000);

    test('un joueur ne voit ni le menu Admin ni le menu Testeur, à côté de la version', async ({ page }) => {
      const errors = watchConsole(page);
      const backend = fakeBackend('player');
      await backend.attach(page);
      await signIn(page);
      await openProfile(page);
      await expect(page.getByTestId('app-version')).toBeVisible();
      await expect(page.getByTestId('open-changelog')).toBeVisible();
      await page.waitForTimeout(600); // the role answer
      await expect(page.getByTestId('open-admin')).toHaveCount(0);
      await expect(page.getByTestId('open-tester')).toHaveCount(0);
      expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
    });

    test('si le serveur ne répond pas sur le rôle, aucun menu ne s’affiche', async ({ page }) => {
      const backend = fakeBackend('admin');
      backend.roleAnswer = 'error';
      await backend.attach(page);
      await signIn(page);
      await openProfile(page);
      await page.waitForTimeout(600);
      await expect(page.getByTestId('open-admin')).toHaveCount(0);
      await expect(page.getByTestId('open-tester')).toHaveCount(0);
    });

    test('testeur : ressources, coffre, pièce, cases numérotées, remise à zéro ; pas de menu Admin', async ({ page }) => {
      const errors = watchConsole(page);
      const backend = fakeBackend('tester');
      await backend.attach(page);
      await signIn(page);
      await openProfile(page);
      await expect(page.getByTestId('open-tester')).toBeVisible();
      await expect(page.getByTestId('open-admin')).toHaveCount(0);
      await audit(page, 'profil testeur');
      await page.screenshot({ path: `e2e/screenshots/staff-${size.name}-profile-tester.png` });
      await page.getByTestId('open-tester').click();
      const modal = page.getByTestId('tester');
      await expect(modal.getByTestId('tester-info')).toContainText('Testeur');
      await audit(page, 'outils de test');
      await page.screenshot({ path: `e2e/screenshots/staff-${size.name}-tester.png` });

      const gold = () => readState(backend.store.rows.get('me1')!.state).profile.gold;
      const before = gold();
      await modal.locator('[data-give="gold-10000"]').click();
      await expect(page.getByTestId('toast')).toContainText('10 000 or');
      expect(gold()).toBe(before + 10_000);
      await modal.locator('[data-give="chest-epic"]').click();
      await expect(page.getByTestId('toast')).toContainText('coffre épique prêt à ouvrir');
      const state = readState(backend.store.rows.get('me1')!.state);
      expect(state.profile.slots.some((s) => s?.tier === 'epic')).toBe(true);

      // a part at level 3
      const option = await modal.getByTestId('tester-item').locator('option').nth(2).getAttribute('value');
      await modal.getByTestId('tester-item').selectOption(option!);
      await modal.getByTestId('tester-item-level').selectOption('3');
      await modal.getByTestId('tester-item-give').click();
      await expect.poll(() => readState(backend.store.rows.get('me1')!.state).profile.owned[option!]).toBeGreaterThanOrEqual(1);

      // the numbered cells of the circuit, kept for the next races
      await modal.getByTestId('tester-debug').click();
      await expect(modal.getByTestId('tester-debug')).toHaveAttribute('aria-pressed', 'true');

      // the restart asks first, and refusing changes nothing
      await modal.getByTestId('tester-reset').click();
      await expect(page.getByTestId('staff-confirm')).toBeVisible();
      await page.getByTestId('staff-confirm-no').click();
      expect(gold()).toBeGreaterThan(before);
      await modal.getByTestId('tester-reset').click();
      await page.getByTestId('staff-confirm-yes').click();
      await expect(page.getByTestId('toast')).toContainText('remis à zéro');
      expect(readState(backend.store.rows.get('me1')!.state).profile.owned[option!]).toBeUndefined();
      expect(backend.store.logs.some((l) => l.action === 'tester_grant')).toBe(true);
      expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
    });

    test('un joueur qui envoie l’action de test à la main est refusé par le serveur', async ({ page }) => {
      const backend = fakeBackend('player');
      await backend.attach(page);
      await signIn(page);
      const answer = await page.evaluate(async () => {
        // the session of the account, as the app keeps it
        const token = (JSON.parse(localStorage.getItem('4mules.auth') ?? '{}') as { access_token?: string }).access_token;
        const res = await fetch('https://npaunxotjhkjzoxfpqgq.supabase.co/functions/v1/game', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'tester_grant', params: { gold: 100000 } }),
        });
        return { status: res.status, body: await res.json() };
      });
      expect(answer.status).toBe(403);
      expect(answer.body.error).toContain('testeurs');
    });

    test('admin : les deux menus, les chiffres, la recherche, le joueur, les signalements, les mots et le journal', async ({ page }) => {
      const errors = watchConsole(page);
      const backend = fakeBackend('admin');
      await backend.attach(page);
      await signIn(page);
      await openProfile(page);
      await expect(page.getByTestId('open-admin')).toBeVisible();
      await expect(page.getByTestId('open-tester')).toBeVisible();
      await audit(page, 'profil admin');
      await page.screenshot({ path: `e2e/screenshots/staff-${size.name}-profile-admin.png` });
      await page.getByTestId('open-admin').click();
      const admin = page.getByTestId('admin');

      // the figures
      await expect(admin.locator('[data-stat="accounts"] b')).toHaveText('120');
      await expect(admin.locator('[data-stat="reports_pending"]')).toHaveClass(/is-alert/);
      await expect(admin.getByTestId('staff-tab-reports')).toContainText('1'); // the count of what waits
      await audit(page, 'admin chiffres');
      await page.screenshot({ path: `e2e/screenshots/staff-${size.name}-admin-stats.png` });

      // the players: the start of a pseudo is enough
      await admin.getByTestId('staff-tab-players').click();
      await expect(admin.locator('[data-player]')).toHaveCount(3);
      await expect(admin.locator('[data-player="Max_07"] [data-flag="suspended"]')).toBeVisible();
      await expect(admin.locator('[data-player="Zoe_12"] [data-flag="reports"]')).toContainText('2 signalements');
      await admin.getByTestId('staff-search').fill('le');
      await expect(admin.locator('[data-player]')).toHaveCount(1);
      await expect(admin.locator('[data-player="Leo_9"]')).toBeVisible();
      await admin.getByTestId('staff-search').fill('');
      await expect(admin.locator('[data-player]')).toHaveCount(3);
      await audit(page, 'admin joueurs');
      await page.screenshot({ path: `e2e/screenshots/staff-${size.name}-admin-players.png` });

      // one player: change the role (asks first), silence, suspension and the last actions
      await admin.locator('[data-player="Zoe_12"]').getByTestId('staff-manage').click();
      const player = page.getByTestId('staff-player');
      await expect(player).toContainText('Zoe_12');
      await player.locator('[data-role-pick="vip"]').click();
      await expect(page.getByTestId('staff-confirm')).toContainText('VIP');
      await page.getByTestId('staff-confirm-no').click();
      expect(backend.calls.some((c) => c.name === 'admin_set_role')).toBe(false);
      await player.locator('[data-role-pick="vip"]').click();
      await page.getByTestId('staff-confirm-yes').click();
      await expect(player.locator('[data-role="vip"]')).toBeVisible();
      expect(backend.calls.find((c) => c.name === 'admin_set_role')?.body).toEqual({ p_user: 'p1', p_role: 'vip' });
      await player.locator('[data-mute="60"]').click();
      await expect(player.getByTestId('staff-unmute')).toBeVisible();
      await expect(player.locator('[data-flag="muted"]')).toBeVisible();
      await player.getByTestId('staff-unmute').click();
      await expect(player.locator('[data-mute="60"]')).toBeVisible();
      // a suspension needs its reason
      await player.getByTestId('staff-suspend').click();
      await expect(page.getByTestId('toast')).toContainText('raison');
      expect(backend.calls.some((c) => c.name === 'admin_suspend')).toBe(false);
      await player.getByTestId('staff-suspend-reason').fill('insultes répétées');
      await player.getByTestId('staff-suspend').click();
      await page.getByTestId('staff-confirm-yes').click();
      await expect(player.getByTestId('staff-suspension')).toContainText('insultes répétées');
      await player.getByTestId('staff-load-actions').click();
      await expect(player.getByTestId('staff-player-actions')).toContainText('finish_race');
      await audit(page, 'admin joueur');
      await page.screenshot({ path: `e2e/screenshots/staff-${size.name}-admin-player.png` });
      await player.getByTestId('staff-unsuspend').click();
      await expect(player.getByTestId('staff-suspend')).toBeVisible();
      await player.getByRole('button', { name: 'Fermer' }).click();

      // the reported messages: hide, show again, dismiss
      await admin.getByTestId('staff-tab-reports').click();
      await expect(admin.locator('[data-message]')).toHaveCount(2);
      await expect(admin.locator('[data-message="11"]')).toContainText('un message vraiment déplacé');
      await audit(page, 'admin signalements');
      await page.screenshot({ path: `e2e/screenshots/staff-${size.name}-admin-reports.png` });
      await admin.locator('[data-message="11"]').getByTestId('staff-hide').click();
      await expect(admin.locator('[data-message="11"]')).toContainText('Masqué');
      await admin.locator('[data-message="11"]').getByTestId('staff-hide').click(); // shown again
      await expect(admin.locator('[data-message="11"] .kit-badge')).toHaveCount(0);
      await admin.locator('[data-message="12"]').getByTestId('staff-dismiss').click();
      await expect(admin.locator('[data-message]')).toHaveCount(1);
      expect(backend.calls.filter((c) => c.name === 'admin_hide').map((c) => c.body.p_hidden)).toEqual([true, false]);

      // the refused words
      await admin.getByTestId('staff-tab-words').click();
      await expect(admin.locator('[data-word]')).toHaveCount(2);
      await admin.getByTestId('staff-word').fill('Avec Espace');
      await admin.getByTestId('staff-word-add').click();
      await expect(page.getByTestId('toast')).toContainText('invalide');
      await admin.getByTestId('staff-word').fill('nouveau');
      await admin.getByTestId('staff-word-add').click();
      await expect(admin.locator('[data-word="nouveau"]')).toBeVisible();
      await audit(page, 'admin mots');
      await admin.locator('[data-word="truc"]').getByTestId('staff-word-remove').click();
      await page.getByTestId('staff-confirm-yes').click();
      await expect(admin.locator('[data-word="truc"]')).toHaveCount(0);

      // what the admins did
      await admin.getByTestId('staff-tab-audit').click();
      await expect(admin.getByTestId('staff-audit')).toContainText('Boss_01');
      await expect(admin.getByTestId('staff-audit')).toContainText('a suspendu');
      await expect(admin.getByTestId('staff-audit')).toContainText('Max_07');
      await audit(page, 'admin journal');
      expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
    });
  });
}
