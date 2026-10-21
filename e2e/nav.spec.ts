import { expect, test, type Page } from '@playwright/test';
import { TABS, expectContrast, expectNoHorizontalOverflow, expectUsableLayout, goTab, injectSave, settleTabs, watchConsole, widths, type Tab } from './helpers';

/** A save that fills every screen: equipment, a ready pack, a locked pack, reserve packs, progress. */
const richSave = () => ({
  version: 5,
  packs: ['legendary', 'common'],
  pity: 3,
  slots: [{ readyAt: 0, tier: 'rare' }, { readyAt: Date.now() + 95_000, tier: 'common' }, { readyAt: Date.now() + 7 * 3600_000, tier: 'epic' }, null],
  fragments: 140,
  gold: 12_345,
  gems: 678,
  xp: 340,
  owned: { 'tir-pro': 3, 'wng-drs': 1, 'brk-carbon': 1, 'eng-hybrid': 2, 'eng-stock': 1, 'gbx-dct': 1, 'chs-carbon': 2, 'paint-gold': 1, 'num-42': 1, 'hlm-red': 1 },
  loadout: { parts: { tires: 'tir-pro', wing: 'wng-drs', brakes: 'brk-carbon', engine: 'eng-hybrid', gearbox: 'gbx-dct', chassis: 'chs-carbon' }, paint: 'paint-gold', number: 'num-42', helmet: 'hlm-red' },
  rng: 99,
  races: 7,
  wins: 2,
  packsOpened: 3,
  upgrades: 1,
  campaign: 2,
  claimed: ['races-1'],
});

const HEADINGS: Record<Tab, RegExp> = {
  shop: /Boutique/,
  garage: /Garage/,
  race: /COURSE !/,
  campaign: /Campagne/,
  quests: /Quêtes/,
};

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `e2e/screenshots/nav-${name}.png` });
}

async function audit(page: Page, where: string) {
  await expectUsableLayout(page, where);
  await expectNoHorizontalOverflow(page, where);
  await expectContrast(page, where);
}

for (const w of widths) {
  test.describe(`navigation - ${w.name}px`, () => {
    // the big button breathes forever (unless the user asks for less motion), which Playwright would never call stable
    test.use({ viewport: { width: w.width, height: w.height }, reducedMotion: 'reduce' });
    test.setTimeout(120_000);

    test('les 5 onglets au clic : captures, cibles tactiles, débordement, contraste', async ({ page }) => {
      const errors = watchConsole(page);
      await injectSave(page, richSave());
      await page.goto('/?seed=5');
      await expect(page.locator('.pager')).toHaveAttribute('data-tab', 'race');
      for (const tab of TABS) {
        await goTab(page, tab);
        await expect(page.locator(`#page-${tab}`)).toContainText(HEADINGS[tab]);
        await expect(page.locator(`[data-tab-button="${tab}"]`)).toHaveAttribute('aria-selected', 'true');
        await audit(page, `${tab} @${w.name}`);
        await shot(page, `${w.name}-${tab}`);
      }
      expect(errors).toEqual([]);
    });

    test('modales : réglages, profil, ouverture de paquet, déblocage, garage', async ({ page }) => {
      const errors = watchConsole(page);
      await injectSave(page, richSave());
      await page.goto('/?seed=5');

      await page.getByTestId('open-setup').click();
      await page.getByTestId('offline-race').click();
      await expect(page.getByTestId('setup')).toBeVisible();
      await audit(page, `setup @${w.name}`);
      await shot(page, `${w.name}-setup`);
      await page.getByRole('button', { name: 'Fermer' }).click();

      await page.getByTestId('avatar').click();
      await expect(page.getByTestId('profile-modal')).toBeVisible();
      await audit(page, `profile @${w.name}`);
      await shot(page, `${w.name}-profile`);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('profile-modal')).toHaveCount(0);

      // locked pack: the unlock window offers to skip the timer with gems
      await page.locator('[data-slot-index="1"]').click();
      await expect(page.getByTestId('unlock-modal')).toBeVisible();
      await audit(page, `unlock @${w.name}`);
      await shot(page, `${w.name}-unlock`);
      await page.getByRole('button', { name: 'Plus tard' }).click();

      // ready pack: reveal card by card
      await page.locator('[data-slot-index="0"]').click();
      await expect(page.getByTestId('pack-reveal')).toBeVisible();
      await audit(page, `reveal back @${w.name}`);
      await shot(page, `${w.name}-reveal-back`);
      await page.getByRole('button', { name: 'Révéler', exact: true }).click();
      await page.waitForTimeout(800);
      await audit(page, `reveal front @${w.name}`);
      await shot(page, `${w.name}-reveal-front`);
      await page.getByRole('button', { name: 'Tout révéler' }).click();
      await expect(page.getByTestId('loot')).toBeVisible();
      await audit(page, `loot @${w.name}`);
      await shot(page, `${w.name}-loot`);
      await page.getByRole('button', { name: 'Continuer' }).click();

      // garage sheet with the stat preview
      await goTab(page, 'garage');
      await page.locator('[data-slot="engine"]').click();
      await expect(page.getByTestId('sheet')).toBeVisible();
      await page.locator('[data-item="eng-stock"]').click();
      await expect(page.getByTestId('preview')).toBeVisible();
      await audit(page, `sheet @${w.name}`);
      await shot(page, `${w.name}-garage-sheet`);
      expect(errors).toEqual([]);
    });

    test('écran de course : plateau et commandes dans le cadre', async ({ page }) => {
      const errors = watchConsole(page);
      await injectSave(page, richSave());
      await page.goto('/?seed=5&aiDelay=0');
      await page.getByTestId('open-setup').click();
      await page.getByTestId('offline-race').click();
      await page.getByTestId('start-from-setup').click();
      await page.waitForFunction(() => '__game' in window);
      await expect(page.locator('canvas')).toBeVisible();
      const canvas = await page.locator('canvas').boundingBox();
      // the board is full width, whatever the screen
      expect(Math.round(canvas!.width)).toBe(w.width);
      await page.waitForTimeout(400);
      await audit(page, `race @${w.name}`);
      await shot(page, `${w.name}-race-screen`);
      expect(errors).toEqual([]);
    });
  });
}

test.describe('cadre et navigation', () => {
  test.describe('desktop', () => {
    test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

    test('le menu est un cadre mobile centré de 520 px sur fond décoratif', async ({ page }) => {
      await page.goto('/');
      const frame = (await page.locator('.frame').boundingBox())!;
      expect(frame.width).toBeLessThanOrEqual(520);
      expect(frame.width).toBeGreaterThanOrEqual(480);
      expect(Math.abs(frame.x + frame.width / 2 - 720)).toBeLessThan(2);
      const bg = await page.locator('.shell__bg').evaluate((e) => getComputedStyle(e).backgroundImage);
      expect(bg).toContain('gradient');
    });
  });

  test.describe('tablette', () => {
    test.use({ viewport: { width: 768, height: 1024 }, reducedMotion: 'reduce' });
    test('à 768 px le cadre reste à 520 px', async ({ page }) => {
      await page.goto('/');
      expect((await page.locator('.frame').boundingBox())!.width).toBe(520);
    });
  });

  test.describe('mobile', () => {
    test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

    test('le menu occupe tout l’écran du téléphone, avec zones de sécurité', async ({ page }) => {
      await page.goto('/');
      const frame = (await page.locator('.frame').boundingBox())!;
      expect(frame.width).toBe(390);
      expect(frame.height).toBe(844);
      const css = await page.evaluate(() => {
        const bar = getComputedStyle(document.querySelector('.tabbar') as Element);
        const top = getComputedStyle(document.querySelector('.topbar-ui') as Element);
        return { bottom: bar.paddingBottom, top: top.paddingTop, viewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content') };
      });
      expect(css.viewport).toContain('viewport-fit=cover');
      expect(parseFloat(css.bottom)).toBeGreaterThanOrEqual(8);
      expect(parseFloat(css.top)).toBeGreaterThanOrEqual(8);
    });

    test('swipe horizontal à la souris et au doigt (événements simulés)', async ({ page }) => {
      const errors = watchConsole(page);
      await page.goto('/?seed=5');
      const tab = () => page.locator('.pager').getAttribute('data-tab');
      const drag = async (fromX: number, toX: number, y = 520) => {
        await page.mouse.move(fromX, y);
        await page.mouse.down();
        await page.mouse.move((fromX + toX) / 2, y + 4, { steps: 4 });
        await page.mouse.move(toX, y + 6, { steps: 4 });
        await page.mouse.up();
        await settleTabs(page);
      };
      expect(await tab()).toBe('race');
      await drag(330, 60); // left: next tab
      expect(await tab()).toBe('campaign');
      await drag(330, 60);
      expect(await tab()).toBe('quests');
      await drag(330, 40); // no page after the last one
      expect(await tab()).toBe('quests');
      await drag(60, 330); // right: previous tab
      expect(await tab()).toBe('campaign');
      await drag(200, 170); // too short: stays
      expect(await tab()).toBe('campaign');
      await expect(page.locator('#page-campaign')).not.toHaveAttribute('inert', '');

      // vertical scroll is not a swipe
      await page.mouse.move(200, 600);
      await page.mouse.down();
      await page.mouse.move(206, 300, { steps: 6 });
      await page.mouse.up();
      expect(await tab()).toBe('campaign');

      // touch pointer events, as a finger would send them
      const touch = (type: string, x: number, y: number) =>
        page.evaluate(([t, px, py]) => {
          const pages = document.querySelector('.pages') as HTMLElement;
          pages.dispatchEvent(new PointerEvent(t as string, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: px as number, clientY: py as number, bubbles: true, button: 0 }));
        }, [type, x, y] as const);
      await touch('pointerdown', 320, 500);
      for (let i = 1; i <= 6; i++) await touch('pointermove', 320 - i * 40, 505);
      await touch('pointerup', 80, 505);
      await settleTabs(page);
      expect(await tab()).toBe('quests');
      await touch('pointerdown', 60, 500);
      for (let i = 1; i <= 6; i++) await touch('pointermove', 60 + i * 45, 500);
      await touch('pointerup', 330, 500);
      await settleTabs(page);
      expect(await tab()).toBe('campaign');
      // swiping all the way back to the first tab
      for (let i = 0; i < 4; i++) await drag(60, 330);
      expect(await tab()).toBe('shop');
      await expect(page.locator('#page-shop')).toContainText('Boutique');
      expect(errors).toEqual([]);
    });

    test('un glissement qui démarre sur un bouton ne l’active pas', async ({ page }) => {
      await page.goto('/?seed=5');
      const goldBefore = await page.getByTestId('gold').textContent();
      await goTab(page, 'shop');
      const buy = page.locator('[data-buy="pack-1"]');
      await buy.scrollIntoViewIfNeeded(); // the offers of the day and the gift come first now
      const box = (await buy.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x - 150, box.y + box.height / 2 + 5, { steps: 8 });
      await page.mouse.up();
      await settleTabs(page);
      expect(await page.locator('.pager').getAttribute('data-tab')).toBe('garage');
      expect(await page.getByTestId('gold').textContent()).toBe(goldBefore);
    });

    test('flèches du clavier sur la barre d’onglets', async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-tab-button="race"]').focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('.pager')).toHaveAttribute('data-tab', 'campaign');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      await expect(page.locator('.pager')).toHaveAttribute('data-tab', 'garage');
    });

    test('seul l’onglet affiché est accessible (les autres sont inertes)', async ({ page }) => {
      await page.goto('/');
      for (const t of TABS) {
        const inert = await page.locator(`#page-${t}`).getAttribute('inert');
        expect(inert !== null).toBe(t !== 'race');
      }
    });
  });
});
