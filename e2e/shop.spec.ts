import { expect, test, type Page } from '@playwright/test';
import { expectContrast, expectNoHorizontalOverflow, expectUsableLayout, goTab, injectSave, sizes, watchConsole } from './helpers';

type SaveView = { gold: number; owned: Record<string, number>; fragments: number; shop: { day: string; bought: string[]; items: string[] }; gift: { day: string; streak: number } };
type W = { __profile: { get(): SaveView } };
const profile = (page: Page) => page.evaluate(() => (window as unknown as W).__profile.get());
const badge = (page: Page, id: string) => page.getByTestId(id).locator('.kit-badge__text');

const save = (over: object = {}) => ({
  version: 5,
  packs: [],
  slots: [null, null, null, null],
  fragments: 0,
  gold: 5000,
  gems: 100,
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

// 12:00 in Paris (summer time): 12 h before the offers change
const NOON = new Date('2026-10-21T10:00:00Z');

async function audit(page: Page, where: string) {
  await expectUsableLayout(page, where);
  await expectNoHorizontalOverflow(page, where);
  await expectContrast(page, where);
}

for (const size of sizes) {
  test.describe(`boutique : offres du jour (${size.name})`, () => {
    test.use({ reducedMotion: 'reduce' });
    test.setTimeout(120_000);

    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.clock.setFixedTime(NOON);
    });

    test('trois offres, un compte à rebours, un achat par offre et par jour', async ({ page }) => {
      const errors = watchConsole(page);
      await injectSave(page, save());
      await page.goto('/?seed=5');
      await goTab(page, 'shop');

      const daily = page.getByTestId('daily-offers');
      await expect(daily.locator('[data-offer]')).toHaveCount(3);
      await expect(page.getByTestId('daily-reset')).toHaveText('Nouvelles offres dans 12 h 00 min');
      const ids = await daily.locator('[data-offer]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-offer')!));
      expect(new Set(ids).size).toBe(3);
      expect(ids.every((id) => id.startsWith('daily-'))).toBe(true);
      await audit(page, `shop-daily-${size.name}`);
      await page.screenshot({ path: `e2e/screenshots/shop-${size.name}-daily.png` });

      // buying one debits its price, grants it, and the card shows it was bought
      const first = daily.locator('[data-offer]').first();
      const price = Number((await first.locator('[data-buy]').innerText()).replace(/\D/g, ''));
      await first.locator('[data-buy]').click();
      await expect(page.getByTestId('toast')).toContainText('acheté');
      await expect(badge(page, 'gold')).toHaveText(String(5000 - price));
      await expect(first.locator('[data-buy]')).toBeDisabled();
      await expect(first.locator('[data-buy]')).toContainText('Acheté');
      await expect(daily.locator('.offer--bought')).toHaveCount(1);
      await expect(daily.locator('[data-offer]')).toHaveCount(3);
      expect((await profile(page)).shop).toMatchObject({ day: '2026-10-21', bought: [ids[0]] });
      await audit(page, `shop-bought-${size.name}`);
      await page.screenshot({ path: `e2e/screenshots/shop-${size.name}-bought.png` });

      // still bought after a reload, and the same three offers
      await page.reload();
      await goTab(page, 'shop');
      await expect(daily.locator('[data-offer]')).toHaveCount(3);
      expect(await daily.locator('[data-offer]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-offer')))).toEqual(ids);
      await expect(daily.locator('.offer--bought')).toHaveCount(1);

      // the permanent offers are still there below
      await expect(page.locator('[data-buy="pack-epic"]')).toBeVisible();
      await expect(page.locator('[data-buy="gold-400"]')).toContainText('24');
      expect(errors).toEqual([]);
    });

    test('à minuit (Paris) les offres du jour sont tirées à nouveau et rachetables', async ({ page }) => {
      await injectSave(page, save());
      await page.goto('/?seed=5');
      await goTab(page, 'shop');
      const daily = page.getByTestId('daily-offers');
      await daily.locator('[data-buy]:not([disabled])').first().click();
      await expect(daily.locator('.offer--bought')).toHaveCount(1);
      // 00:00:05 the next day in Paris
      await page.clock.setFixedTime(new Date('2026-10-21T22:00:05Z'));
      await expect(daily.locator('.offer--bought')).toHaveCount(0, { timeout: 10_000 });
      await expect(page.getByTestId('daily-reset')).toHaveText('Nouvelles offres dans 24 h 00 min');
      await expect(daily.locator('[data-buy]:not([disabled])')).toHaveCount(3);
    });

    test('le cadeau du jour : une fois par jour, la série continue le lendemain', async ({ page }) => {
      const errors = watchConsole(page);
      await injectSave(page, save({ gold: 100, fragments: 0 }));
      await page.goto('/?seed=5');
      await goTab(page, 'shop');
      const gift = page.getByTestId('daily-gift');
      await expect(gift).toContainText('20 🪙 + 8 🔷');
      await expect(gift).toContainText('Jour 1 sur 7');
      await audit(page, `shop-gift-${size.name}`);
      await page.screenshot({ path: `e2e/screenshots/shop-${size.name}-gift.png` });
      await gift.locator('[data-claim="gift"]').click();
      await expect(page.getByTestId('toast')).toContainText('Cadeau du jour');
      await expect(badge(page, 'gold')).toHaveText('120');
      await expect(gift.locator('[data-claim="gift"]')).toBeDisabled();
      await expect(gift).toContainText('Revenez demain');
      expect(await profile(page)).toMatchObject({ fragments: 8, gift: { day: '2026-10-21', streak: 1 } });
      await page.screenshot({ path: `e2e/screenshots/shop-${size.name}-gift-taken.png` });
      // the next day (Paris) the gift is back, and it is day 2 of the streak
      await page.clock.setFixedTime(new Date('2026-10-21T22:00:05Z'));
      await expect(gift.locator('[data-claim="gift"]')).toBeEnabled({ timeout: 10_000 });
      await expect(gift).toContainText('Jour 2 sur 7');
      expect(errors).toEqual([]);
    });

    test('le 7e jour de suite, le cadeau est un coffre commun', async ({ page }) => {
      await injectSave(page, save({ gift: { day: '2026-10-20', streak: 6 } }));
      await page.goto('/?seed=5');
      await goTab(page, 'shop');
      const gift = page.getByTestId('daily-gift');
      await expect(gift).toContainText('Un coffre commun');
      await expect(gift).toContainText('Jour 7 sur 7');
      await gift.locator('[data-claim="gift"]').click();
      await expect(page.getByTestId('toast')).toContainText('un coffre commun');
      const p = (await profile(page)) as unknown as { slots: ({ tier: string } | null)[]; gift: { streak: number } };
      expect(p.slots.filter(Boolean)).toHaveLength(1);
      expect(p.gift.streak).toBe(7);
    });

    test('sans compte, pas de pack de bienvenue', async ({ page }) => {
      await injectSave(page, save());
      await page.goto('/?seed=5');
      await goTab(page, 'shop');
      await expect(page.getByTestId('welcome-pack')).toHaveCount(0);
    });

    test('sans assez d’or, les offres du jour sont grisées', async ({ page }) => {
      await injectSave(page, save({ gold: 50, gems: 0 }));
      await page.goto('/?seed=5');
      await goTab(page, 'shop');
      await expect(page.getByTestId('daily-offers').locator('[data-buy]:not([disabled])')).toHaveCount(0);
      await audit(page, `shop-poor-${size.name}`);
    });
  });
}
