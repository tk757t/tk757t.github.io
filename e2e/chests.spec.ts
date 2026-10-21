import { expect, test, type Page } from '@playwright/test';
import { expectContrast, expectNoHorizontalOverflow, expectUsableLayout, goTab, injectSave, sizes, watchConsole } from './helpers';

type SaveView = { gold: number; gems: number; pity: number; packsOpened: number; slots: ({ readyAt: number; tier: string } | null)[]; packs: string[] };
type W = { __profile: { get(): SaveView } };
const profile = (page: Page) => page.evaluate(() => (window as unknown as W).__profile.get());

const HOUR = 3_600_000;
const save = () => ({
  version: 5,
  packs: ['epic'],
  pity: 4,
  slots: [
    { readyAt: 0, tier: 'common' },
    { readyAt: Date.now() + 3 * HOUR, tier: 'rare' },
    { readyAt: Date.now() + 8 * HOUR, tier: 'epic' },
    { readyAt: Date.now() + 12 * HOUR, tier: 'legendary' },
  ],
  fragments: 0,
  gold: 500,
  gems: 100,
  xp: 0,
  owned: {},
  loadout: { parts: {} },
  rng: 5,
  races: 0,
  wins: 0,
  packsOpened: 0,
  upgrades: 0,
  campaign: { stars: [] },
  claimed: [],
});

async function audit(page: Page, size: string, label: string) {
  await expectUsableLayout(page, `${label} @${size}`);
  await expectNoHorizontalOverflow(page, `${label} @${size}`);
  await expectContrast(page, `${label} @${size}`);
  await page.screenshot({ path: `e2e/screenshots/chests-${size}-${label}.png` });
}

test.use({ reducedMotion: 'reduce' });
test.setTimeout(120_000);

for (const size of sizes) {
  test.describe(`coffres @${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test('qualités, taux, accélération, ouverture avec or et gemmes, achat', async ({ page }) => {
      const errors = watchConsole(page);
      await injectSave(page, save());
      await page.goto('/?seed=5');

      // the four slots show their quality, a countdown, and the reserve keeps its own
      const tiers = page.getByTestId('slot-tier');
      await expect(tiers).toHaveText(['Commun', 'Rare', 'Épique', 'Légendaire']);
      await expect(page.locator('[data-slot-index="1"] .slot-card__time')).toHaveText(/^(2h59|3h00)$/);
      await expect(page.locator('[data-slot-index="3"] .slot-card__time')).toHaveText(/^(11h59|12h00)$/);
      await expect(page.locator('[data-slot-index="0"]')).toHaveAttribute('data-tier', 'common');
      await expect(page.getByTestId('reserve-badge')).toHaveText('+1 en réserve');
      await expect(page.getByTestId('pity')).toContainText('4/29');
      await audit(page, size.name, 'slots');

      // the odds window
      await page.getByTestId('open-chest-info').click();
      await expect(page.getByTestId('chest-info')).toBeVisible();
      await expect(page.getByTestId('rates-legendary')).toContainText('Légendaire 10 %');
      await expect(page.getByTestId('rates-common')).toContainText('Commune 85 %');
      await expect(page.getByTestId('chest-info')).toContainText('pas de gemmes');
      await audit(page, size.name, 'rates');
      await page.getByRole('button', { name: 'Fermer' }).first().click();
      await expect(page.getByTestId('chest-info')).toHaveCount(0);

      // speed up the Rare chest: 3 h left costs 18 gems
      await page.locator('[data-slot-index="1"]').click();
      await expect(page.getByTestId('unlock-modal')).toBeVisible();
      await expect(page.getByTestId('skip-slot')).toContainText('18');
      await audit(page, size.name, 'speed-up');
      await page.getByTestId('skip-slot').click();
      await expect(page.getByTestId('pack-reveal')).toBeVisible();
      await expect(page.getByTestId('pack-reveal')).toContainText('Coffre Rare');
      await page.getByRole('button', { name: 'Tout révéler' }).click();
      await expect(page.getByTestId('loot').locator('li')).toHaveCount(4);
      await expect(page.getByTestId('loot-currency')).toContainText('🪙 +');
      await expect(page.getByTestId('loot-currency')).toContainText('💎 +'); // a Rare chest always holds 1 to 3 gems
      await audit(page, size.name, 'opened');
      const opened = await profile(page);
      expect(opened.packsOpened).toBe(1);
      expect(opened.gems).toBeGreaterThanOrEqual(100 - 18 + 1);
      expect(opened.gems).toBeLessThanOrEqual(100 - 18 + 3);
      expect(opened.gold).toBeGreaterThanOrEqual(500 + 50);
      await page.getByRole('button', { name: 'Continuer' }).click();

      // the reserve chest moved into the freed slot with its own quality
      const after = await profile(page);
      expect(after.slots[1]?.tier).toBe('epic');
      expect(after.packs).toEqual([]);

      // opening the ready Common chest gives gold and no gems
      await page.locator('[data-slot-index="0"]').click();
      await page.getByRole('button', { name: 'Tout révéler' }).click();
      await expect(page.getByTestId('loot').locator('li')).toHaveCount(3);
      await expect(page.getByTestId('loot-currency')).not.toContainText('💎');
      await page.getByRole('button', { name: 'Continuer' }).click();

      // buying a chest in the shop puts a Common chest in the free slot
      await goTab(page, 'shop');
      await page.locator('[data-buy="pack-1"]').click();
      await goTab(page, 'race');
      await expect(page.locator('[data-slot-index="0"]')).toHaveAttribute('data-tier', 'common');
      await expect(page.locator('[data-slot-index="0"]')).toHaveAttribute('data-state', 'locked');
      await audit(page, size.name, 'after');
      expect(errors).toEqual([]);
    });
  });
}
