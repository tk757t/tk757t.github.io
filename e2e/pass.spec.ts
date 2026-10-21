import { expect, test, type Page } from '@playwright/test';
import { expectContrast, expectNoHorizontalOverflow, expectUsableLayout, goTab, injectSave, sizes, watchConsole } from './helpers';

type SaveView = { gold: number; gems: number; fragments: number; owned: Record<string, number>; slots: ({ tier: string } | null)[]; pass: { season: number; points: number; claimed: number[] } };
type W = { __profile: { get(): SaveView } };
const profile = (page: Page) => page.evaluate(() => (window as unknown as W).__profile.get());

const save = (over: object = {}) => ({
  version: 5,
  packs: [],
  slots: [null, null, null, null],
  fragments: 0,
  gold: 100,
  gems: 20,
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
  ...over,
});

// Wednesday 21 October 2026, 12:00 in Paris: season 1 started on the 19th and ends on 2 November at midnight (the clock goes back on the 25th: 11 days and 13 hours left)
const NOON = new Date('2026-10-21T10:00:00Z');

async function audit(page: Page, where: string) {
  await expectUsableLayout(page, where);
  await expectNoHorizontalOverflow(page, where);
  await expectContrast(page, where);
}

for (const size of sizes) {
  test.describe(`passe de saison (${size.name})`, () => {
    test.use({ reducedMotion: 'reduce' });
    test.setTimeout(120_000);

    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.clock.setFixedTime(NOON);
    });

    test('la carte du passe, la fenêtre des 30 paliers, la récupération d’une récompense', async ({ page }) => {
      const errors = watchConsole(page);
      await injectSave(page, save({ pass: { season: 0, points: 130, claimed: [] } }));
      await page.goto('/?seed=5');

      // two tiers are reached: the Quests tab says so
      await expect(page.locator('[data-tab-button="quests"] .tab-badge')).toHaveText('2');
      await goTab(page, 'quests');
      const card = page.getByTestId('pass-card');
      await expect(card).toContainText('Passe de saison');
      await expect(page.getByTestId('pass-card-tier')).toHaveText('Palier 2 / 30');
      await expect(card.locator('.kit-progress')).toHaveAttribute('aria-valuenow', '30');
      await expect(card.locator('.kit-progress')).toHaveAttribute('aria-valuemax', '50');
      await audit(page, `pass-card-${size.name}`);
      await page.screenshot({ path: `e2e/screenshots/pass-${size.name}-card.png` });

      await card.locator('[data-open-pass]').click();
      const modal = page.getByTestId('pass-modal');
      await expect(modal).toBeVisible();
      await expect(page.getByTestId('pass-season')).toHaveText('Saison 1 · se termine dans 11 j 13 h');
      await expect(page.getByTestId('pass-tier')).toHaveText('Palier 2 / 30 · 130 points');
      await expect(page.getByTestId('pass-premium')).toContainText('bientôt');
      await expect(page.locator('.pass-tier')).toHaveCount(30);
      await expect(page.locator('.pass-tier[data-tier="1"]')).toHaveAttribute('data-state', 'ready');
      await expect(page.locator('.pass-tier[data-tier="2"]')).toHaveAttribute('data-state', 'ready');
      await expect(page.locator('.pass-tier[data-tier="3"]')).toHaveAttribute('data-state', 'locked');
      await expect(page.locator('[data-claim-tier="3"]')).toBeDisabled();
      await expect(page.locator('[data-claim-tier="3"]')).toContainText('150');
      await audit(page, `pass-modal-${size.name}`);
      await page.screenshot({ path: `e2e/screenshots/pass-${size.name}-modal.png` });

      // tier 1 pays 150 gold, tier 2 gives a common chest
      await page.locator('[data-claim-tier="1"]').click();
      await expect(page.getByTestId('toast')).toContainText('Palier 1');
      await expect(page.locator('.pass-tier[data-tier="1"]')).toHaveAttribute('data-state', 'claimed');
      expect((await profile(page)).gold).toBe(250);
      await page.locator('[data-claim-tier="2"]').click();
      await expect(page.locator('.pass-tier[data-tier="2"]')).toHaveAttribute('data-state', 'claimed');
      const p = await profile(page);
      expect(p.slots.filter(Boolean)).toHaveLength(1);
      expect(p.pass.claimed).toEqual([1, 2]);
      await expect(page.locator('[data-claim-tier]:not([disabled])')).toHaveCount(0);
      await page.screenshot({ path: `e2e/screenshots/pass-${size.name}-claimed.png` });

      // the last tier is further down the list
      await page.locator('.pass-tier[data-tier="30"]').scrollIntoViewIfNeeded();
      await expect(page.locator('.pass-tier[data-tier="30"]')).toContainText('Casque doré');
      await page.screenshot({ path: `e2e/screenshots/pass-${size.name}-end.png` });
      await page.getByRole('button', { name: 'Fermer' }).click();
      await expect(modal).toHaveCount(0);

      // nothing left to collect: no badge; the card keeps the tier
      await expect(page.locator('[data-tab-button="quests"] .tab-badge')).toBeHidden();
      await expect(card.locator('[data-open-pass]')).toContainText('Voir les récompenses');
      expect(errors).toEqual([]);
    });

    test('un cosmétique déjà possédé devient des fragments ; la nouvelle saison repart de zéro', async ({ page }) => {
      await injectSave(page, save({ owned: { 'hlm-red': 1 }, pass: { season: 0, points: 250, claimed: [] } }));
      await page.goto('/?seed=5');
      await goTab(page, 'quests');
      await page.getByTestId('pass-card').locator('[data-open-pass]').click();
      await page.locator('[data-claim-tier="5"]').click();
      await expect(page.getByTestId('toast')).toContainText('déjà possédé');
      expect((await profile(page)).fragments).toBe(5);
      await page.getByRole('button', { name: 'Fermer' }).click();
      // the season ends at Paris midnight on 2 November: the next one starts from zero
      await page.clock.setFixedTime(new Date('2026-11-01T23:00:05Z'));
      await page.reload();
      await goTab(page, 'quests');
      await expect(page.getByTestId('pass-card-tier')).toHaveText('Palier 0 / 30');
      await page.getByTestId('pass-card').locator('[data-open-pass]').click();
      await expect(page.getByTestId('pass-season')).toContainText('Saison 2');
      await expect(page.locator('.pass-tier[data-state="ready"]')).toHaveCount(0);
      await expect(page.locator('.pass-tier[data-state="claimed"]')).toHaveCount(0);
    });

    test('la progression pleine : passe terminé', async ({ page }) => {
      await injectSave(page, save({ pass: { season: 0, points: 1500, claimed: [] } }));
      await page.goto('/?seed=5');
      await goTab(page, 'quests');
      await expect(page.getByTestId('pass-card-tier')).toHaveText('Palier 30 / 30');
      await expect(page.locator('[data-tab-button="quests"] .tab-badge')).toHaveText('30');
      await page.getByTestId('pass-card').locator('[data-open-pass]').click();
      await expect(page.locator('.pass-tier[data-state="ready"]')).toHaveCount(30);
      await expect(page.getByTestId('pass-progress')).toContainText('Passe terminé');
      await audit(page, `pass-complete-${size.name}`);
    });
  });
}
