import { expect, test } from '@playwright/test';
import { expectContrast, expectNoHorizontalOverflow, expectUsableLayout, sizes, watchConsole } from './helpers';

// "Course perso" offline: the six circuits of the game and the test oval are offered, each starts from its own laps, and the player may still change them.
for (const size of sizes) {
  test.describe(`choix du circuit - ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, reducedMotion: 'reduce' });

    test('les six circuits et l’ovale de test, les tours du circuit au départ, réglables ensuite', async ({ page }) => {
      const errors = watchConsole(page);
      await page.goto('/?seed=5');
      await page.getByTestId('open-setup').click();
      await page.getByTestId('offline-race').click();
      await expect(page.getByTestId('setup')).toBeVisible();

      const track = page.getByLabel('Circuit');
      await expect(track.locator('option')).toHaveText([
        /^Ovale de test · 48 cases$/,
        /^Dunes d’Ocre · 1 tour · 51 cases$/,
        /^Rues du Port · 1 tour · 36 cases$/,
        /^Corniche d’Azur · 2 tours · 24 cases$/,
        /^Boucle des Pins · 2 tours · 24 cases$/,
        /^Col des Neiges · 3 tours · 17 cases$/,
        /^Tour du Cratère · 3 tours · 18 cases$/,
      ]);

      await track.selectOption('cratere');
      await expect(page.getByTestId('laps')).toHaveText('3');
      await track.selectOption('dunes');
      await expect(page.getByTestId('laps')).toHaveText('1');
      await page.getByRole('button', { name: 'Plus de tours' }).click(); // the player chooses the laps
      await expect(page.getByTestId('laps')).toHaveText('2');
      await track.selectOption('pins');
      await expect(page.getByTestId('laps')).toHaveText('2');
      await expectUsableLayout(page, 'réglage du circuit');
      await expectNoHorizontalOverflow(page, 'réglage du circuit');
      await expectContrast(page, 'réglage du circuit');
      await page.screenshot({ path: `e2e/screenshots/circuits-${size.name}-setup.png` });

      // a race on a 3-lap circuit starts
      await track.selectOption('col');
      await page.getByRole('button', { name: 'Démarrer la course' }).click();
      await expect(page.getByRole('button', { name: /^(Lancer|Départ)$/ })).toBeVisible();
      expect(errors).toEqual([]);
    });

    // the real race screen on each circuit (what the player sees at the start)
    for (const id of ['dunes', 'port', 'corniche', 'pins', 'col', 'cratere']) {
      test(`${id} : la course hors ligne démarre, le circuit est visible`, async ({ page }) => {
        const errors = watchConsole(page);
        await page.goto('/?seed=5&aiDelay=0');
        await page.getByTestId('open-setup').click();
        await page.getByTestId('offline-race').click();
        await page.getByLabel('Circuit').selectOption(id);
        await page.getByRole('button', { name: 'Démarrer la course' }).click();
        await expect(page.getByRole('button', { name: /^(Lancer|Départ)$/ })).toBeVisible();
        await page.waitForTimeout(400);
        await expectUsableLayout(page, `course ${id}`);
        await expectNoHorizontalOverflow(page, `course ${id}`);
        await expectContrast(page, `course ${id}`);
        await page.screenshot({ path: `e2e/screenshots/circuits-${id}-${size.name}-offline.png` });
        expect(errors).toEqual([]);
      });
    }
  });
}
