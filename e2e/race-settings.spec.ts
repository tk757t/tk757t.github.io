import { expect, test, type Page } from '@playwright/test';
import { expectContrast, expectNoHorizontalOverflow, expectUsableLayout, goTab, injectSave, sizes, watchConsole } from './helpers';

type Save = { gold: number; xp: number; campaign: { stars: number[] } };
type W = { __profile: { get(): Save }; __game: { state: { status: string; cars: unknown[] } } };

const freshSave = {
  version: 4,
  packs: 0,
  slots: [null, null, null, null],
  fragments: 0,
  gold: 500,
  gems: 20,
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
};

async function check(page: Page, where: string) {
  await expectUsableLayout(page, where);
  await expectNoHorizontalOverflow(page, where);
  await expectContrast(page, where);
}

for (const size of sizes) {
  test.describe(`réglages et abandon (${size.name})`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, reducedMotion: 'reduce' });

    test('campagne : réglages, reprendre, abandonner avec confirmation, sans récompense', async ({ page }) => {
      const errors = watchConsole(page);
      await injectSave(page, freshSave);
      await page.goto('/?seed=7&aiDelay=0');
      await goTab(page, 'campaign');
      await page.locator('[data-stage="0"]').click();
      await page.getByTestId('play-level').click();
      await page.waitForFunction(() => (window as unknown as W).__game?.state.status === 'racing');
      await expect(page.getByTestId('turn-chip')).toBeVisible();
      await check(page, 'course avec bouton réglages');

      // settings: sound switch, resume
      await page.getByTestId('race-settings').click();
      const modal = page.getByTestId('race-settings-modal');
      await expect(modal).toBeVisible();
      await expect(modal).toContainText('Son : activé');
      await check(page, 'réglages');
      await page.screenshot({ path: `e2e/screenshots/race-settings-${size.name}-settings.png` });
      await page.getByTestId('settings-sound').click();
      await expect(modal).toContainText('Son : coupé');
      await page.getByTestId('settings-sound').click();
      await page.getByTestId('settings-resume').click();
      await expect(modal).toHaveCount(0);
      await expect(page.getByTestId('turn-chip')).toBeVisible();

      // abandon: first cancel, then confirm
      await page.getByTestId('race-settings').click();
      await page.getByTestId('settings-abandon').click();
      const confirm = page.getByTestId('abandon-modal');
      await expect(confirm).toContainText('Abandonner la course ?');
      await check(page, 'confirmation');
      await page.screenshot({ path: `e2e/screenshots/race-settings-${size.name}-confirm.png` });
      await page.getByTestId('abandon-cancel').click();
      await expect(confirm).toHaveCount(0);
      await page.getByTestId('settings-resume').click();
      await expect(page.getByTestId('turn-chip')).toBeVisible();

      await page.getByTestId('race-settings').click();
      await page.getByTestId('settings-abandon').click();
      await page.getByTestId('abandon-confirm').click();
      await expect(page.getByTestId('turn-chip')).toHaveCount(0);
      await expect(page.locator('[data-stage-card="0"]')).toHaveAttribute('data-status', 'next'); // level not cleared
      const save = await page.evaluate(() => (window as unknown as W).__profile.get());
      expect(save.campaign.stars).toEqual([]);
      expect(save.gold).toBe(500);
      expect(save.xp).toBe(0);
      expect(errors).toEqual([]);
    });
  });
}

test.describe('abandon en ligne', () => {
  test.use({ reducedMotion: 'reduce' });
  test.setTimeout(90_000);

  test('l’adversaire est averti et gagne par forfait', async ({ context }) => {
    const host = await context.newPage();
    const guest = await context.newPage();
    await host.setViewportSize({ width: 1440, height: 900 });
    await guest.setViewportSize({ width: 390, height: 844 });
    const errors = [...watchConsole(host), ...watchConsole(guest)];

    await host.goto('/?net=local&aiDelay=0&seed=3');
    await host.getByTestId('open-online').click();
    await host.getByTestId('online-name').fill('Alice');
    await host.getByTestId('online-create').click();
    const code = (await host.getByTestId('room-code').textContent())!.trim();
    await guest.goto('/?net=local&aiDelay=0&seed=4');
    await guest.getByTestId('open-online').click();
    await guest.getByTestId('online-name').fill('Bob');
    await guest.getByTestId('online-code').fill(code);
    await guest.getByTestId('online-join').click();
    await expect(host.getByTestId('online-players').locator('li')).toHaveCount(2);
    await host.getByTestId('online-start').click();
    for (const p of [host, guest]) await expect(p.getByTestId('turn-chip')).toBeVisible();

    // the guest opens the settings: the race is not paused for the host (its state is still live)
    await guest.getByTestId('race-settings').click();
    await guest.getByTestId('settings-abandon').click();
    await check(guest, 'confirmation en ligne');
    await expect(guest.getByTestId('abandon-modal')).toContainText('forfait');
    await guest.screenshot({ path: 'e2e/screenshots/race-settings-mobile-online-confirm.png' });
    await expect(host.getByTestId('turn-chip')).toBeVisible();
    await guest.getByTestId('abandon-confirm').click();

    await expect(guest.getByTestId('open-online')).toBeVisible();
    await expect(host.getByTestId('forfeit-win')).toContainText('Bob a abandonné');
    await check(host, 'victoire par forfait');
    await host.screenshot({ path: 'e2e/screenshots/race-settings-desktop-forfeit-win.png' });
    await host.getByTestId('forfeit-menu').click();
    await expect(host.getByTestId('open-online')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
