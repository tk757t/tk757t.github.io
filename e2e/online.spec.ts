import { expect, test, type Page } from '@playwright/test';
import { expectContrast, expectNoHorizontalOverflow, expectUsableLayout, humanStep, sizes, watchConsole } from './helpers';

// Two tabs of one browser talk through BroadcastChannel (?net=local): the same session code as on line, without the network.
type W = { __game: { state: { status: string; round: number } }; __screen: { isHumanTurn(): boolean } };

async function check(page: Page, where: string) {
  await expectUsableLayout(page, where);
  await expectNoHorizontalOverflow(page, where);
  await expectContrast(page, where);
}

const ranking = (page: Page) => page.getByTestId('ranking').locator('li').allTextContents();

test.describe('jouer en ligne', () => {
  test.use({ reducedMotion: 'reduce' });
  test.setTimeout(180_000);

  test('deux joueurs sur deux appareils : salon, course complète, retour après rechargement', async ({ context }) => {
    const [mobile, desktop] = sizes;
    const host = await context.newPage();
    const guest = await context.newPage();
    await host.setViewportSize({ width: desktop.width, height: desktop.height });
    await guest.setViewportSize({ width: mobile.width, height: mobile.height });
    const hostErrors = watchConsole(host);
    const guestErrors = watchConsole(guest);

    // the host creates a room
    await host.goto('/?net=local&aiDelay=0&seed=3');
    await host.getByTestId('open-online').click();
    await host.getByTestId('online-name').fill('Alice');
    await check(host, 'salon (choix)');
    await host.screenshot({ path: 'e2e/screenshots/online-desktop-choice.png' });
    await host.getByTestId('online-create').click();
    const code = (await host.getByTestId('room-code').textContent())!.trim();
    expect(code).toMatch(/^[A-HJ-NP-Z]{5}$/);
    await expect(host.getByTestId('online-link')).toContainText(`join=${code}`);
    await expect(host.getByTestId('online-start')).toBeDisabled();
    await host.getByTestId('online-track').selectOption('anneau');
    await host.getByTestId('online-laps').selectOption('1');
    await host.getByTestId('online-ais').selectOption('1');

    // the guest joins with the code
    await guest.goto('/?net=local&aiDelay=0&seed=4');
    await guest.getByTestId('open-online').click();
    await guest.getByTestId('online-name').fill('Bob');
    await guest.getByTestId('online-code').fill(code.toLowerCase());
    await guest.getByTestId('online-join').click();
    await expect(guest.getByTestId('online-players').locator('li')).toHaveCount(2);
    await expect(host.getByTestId('online-players').locator('li')).toHaveCount(2);
    await expect(guest.getByTestId('online-summary')).toContainText('Petit anneau · 1 tour · 1 IA');
    await expect(guest).toHaveURL(new RegExp(`join=${code}`));
    await check(host, 'salon hôte');
    await check(guest, 'salon invité');
    await host.screenshot({ path: 'e2e/screenshots/online-desktop-lobby-host.png' });
    await guest.screenshot({ path: 'e2e/screenshots/online-mobile-lobby-guest.png' });

    // the host starts: both tabs race, three cars (Alice, Bob, an AI driven by the host)
    await expect(host.getByTestId('online-start')).toBeEnabled();
    await host.getByTestId('online-start').click();
    for (const p of [host, guest]) await p.waitForFunction(() => '__game' in window);
    for (const p of [host, guest]) await expect(p.getByTestId('turn-chip')).toBeVisible();

    let reloaded = false;
    let shots = 0;
    for (let i = 0; i < 1500; i++) {
      const done = await Promise.all([host, guest].map((p) => p.getByTestId('ranking').isVisible()));
      if (done.every(Boolean)) break;
      let acted = false;
      for (const [p, label] of [
        [host, 'desktop'],
        [guest, 'mobile'],
      ] as const) {
        const mine = await p.evaluate(() => (window as unknown as W).__game?.state.status === 'racing' && (window as unknown as W).__screen.isHumanTurn()).catch(() => false);
        if (!mine) continue;
        if (shots < 2 && (await p.evaluate(() => (window as unknown as W).__game.state.round)) >= 3) {
          shots++;
          await check(p, `course ${label}`);
          await p.screenshot({ path: `e2e/screenshots/online-${label}-race.png` });
        }
        await humanStep(p);
        acted = true;
      }
      // the guest reloads in the middle of the race: back into the room and the race, same seat
      if (!reloaded && (await host.evaluate(() => (window as unknown as W).__game.state.round)) >= 4) {
        reloaded = true;
        await guest.reload();
        await guest.waitForFunction(() => '__game' in window);
        await expect(guest.getByTestId('turn-chip')).toBeVisible();
      }
      if (!acted) await host.waitForTimeout(60); // the AI, or a message on its way
    }
    expect(reloaded).toBe(true);
    for (const p of [host, guest]) await expect(p.getByTestId('ranking').locator('li')).toHaveCount(3);
    expect(await ranking(guest)).toEqual(await ranking(host));
    await expect(host.getByRole('button', { name: 'Rejouer' })).toBeVisible();
    await expect(guest.getByRole('button', { name: 'Rejouer' })).toHaveCount(0);
    await host.screenshot({ path: 'e2e/screenshots/online-desktop-ranking.png' });
    await guest.screenshot({ path: 'e2e/screenshots/online-mobile-ranking.png' });

    // "Rejouer": the host starts the next race for both
    await host.getByRole('button', { name: 'Rejouer' }).click();
    for (const p of [host, guest]) await expect(p.getByTestId('ranking')).toHaveCount(0);
    for (const p of [host, guest]) await expect(p.getByTestId('turn-chip')).toBeVisible();

    // the host leaves: the guest is told and goes back to the menu
    await host.close();
    await expect(guest.getByTestId('toast')).toContainText('hôte', { timeout: 20_000 });
    await expect(guest.getByTestId('open-online')).toBeVisible();
    expect([...hostErrors, ...guestErrors]).toEqual([]);
  });

  test('un code invalide est refusé, et le lien d’invitation pré-remplit le code', async ({ page }) => {
    const errors = watchConsole(page);
    await page.addInitScript(() => localStorage.removeItem('4mules.name'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?net=local&join=ABCDE');
    await expect(page.getByTestId('online-code')).toHaveValue('ABCDE');
    await page.getByTestId('online-join').click();
    await expect(page.getByTestId('online-error')).toHaveText('Choisissez un pseudo.');
    await page.getByTestId('online-name').fill('Zoé');
    await page.getByTestId('online-code').fill('AB1');
    await page.getByTestId('online-join').click();
    await expect(page.getByTestId('online-error')).toContainText('5 lettres');
    await check(page, 'salon erreur');
    await page.screenshot({ path: 'e2e/screenshots/online-mobile-choice-error.png' });
    expect(errors).toEqual([]);
  });
});
