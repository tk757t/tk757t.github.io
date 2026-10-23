import { expect, test, type Page } from '@playwright/test';
import { expectContrast, expectNoHorizontalOverflow, expectUsableLayout, goTab, sizes, watchConsole } from './helpers';

// The dice of the gears to touch, the tooltips of the characteristics, the guide of the game and the skin of the car on the board.
type Car = { id: string; gear: number; started: boolean; position: string | null };
type State = { phase: string; status: string; cars: Car[]; turn: Record<string, unknown> };
type W = { __game: { state: State; setState(s: unknown): void }; __render: { settle(): void } };

async function audit(page: Page, where: string) {
  await expectUsableLayout(page, where);
  await expectNoHorizontalOverflow(page, where);
  await expectContrast(page, where);
}

/** One human player alone on the grid, started in 4th gear, with the gear to choose. */
async function startRace(page: Page) {
  await page.goto('/?seed=5&aiDelay=0');
  await page.getByTestId('open-setup').click();
  await page.getByTestId('offline-race').click();
  await page.getByRole('button', { name: '1 joueur', exact: true }).click();
  await page.getByRole('button', { name: 'Démarrer la course' }).click();
  await page.waitForFunction(() => '__game' in window);
}

async function stageGear(page: Page, gear: number) {
  await page.evaluate((g) => {
    const w = window as unknown as W;
    const s = structuredClone(w.__game.state);
    const car = s.cars[0];
    car.started = true;
    car.gear = g;
    s.phase = 'gear';
    s.turn = { ...s.turn, carId: car.id, roll: null, face: null, brakes: 0, boost: false, slipstream: false, fixed: false, start: false };
    w.__game.setState(s);
    w.__render.settle();
  }, gear);
}

const phase = (page: Page) => page.evaluate(() => (window as unknown as W).__game.state.phase);

for (const size of sizes) {
  test.describe(`dés, infobulles, guide et voiture - ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, reducedMotion: 'reduce', hasTouch: size.name === 'mobile' });
    test.setTimeout(120_000);

    test('six dés alignés, chacun sa forme et sa couleur : on touche le dé voulu, une deuxième fois il se lance', async ({ page }) => {
      const errors = watchConsole(page);
      await startRace(page);
      // the start: one round d20 to touch
      await expect(page.getByTestId('die-start')).toBeVisible();
      await stageGear(page, 4);

      const row = page.locator('.dice-row:not(.dice-row--start)');
      await expect(row.locator('.gdie')).toHaveCount(6);
      // no more + and - to change the gear
      await expect(page.getByRole('button', { name: 'Rapport supérieur' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Rapport inférieur' })).toHaveCount(0);
      // one shape and one colour per die
      const faces = await row.locator('.gdie').evaluateAll((els) =>
        els.map((b) => ({ corners: b.querySelector('polygon')!.getAttribute('points')!.split(' ').length, fill: getComputedStyle(b.querySelector('.gdie__fill')!).fill })),
      );
      expect(faces.map((f) => f.corners)).toEqual([3, 4, 5, 6, 8, 10]);
      expect(new Set(faces.map((f) => f.fill)).size).toBe(6);
      // the cells each die gives, and the chosen one
      await expect(row.locator('.gdie__range')).toHaveText(['1-2', '2-4', '4-8', '7-12', '11-20', '21-30']);
      await expect(page.getByTestId('die-4')).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator('.gear')).toHaveAttribute('data-gear', '4');
      // 6th gear is too far from the 4th: greyed, with the reason
      await expect(page.getByTestId('die-6')).toHaveAttribute('aria-disabled', 'true');
      await expect(page.getByTestId('die-6')).toHaveAttribute('title', 'On ne monte que d’un rapport à la fois.');
      await expect(page.getByTestId('die-1')).toHaveAttribute('title', /Rétrograder de 3 rapports coûte/);
      await expect(page.getByTestId('gear-hint')).toContainText('touchez-le encore pour lancer');
      await audit(page, 'dés de la course');
      await page.screenshot({ path: `e2e/screenshots/dice-${size.name}-row.png` });

      // touching a die that is not chosen chooses it (the cells it reaches light up), nothing is rolled yet
      await page.getByTestId('die-5').click();
      await expect(page.getByTestId('die-5')).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('die-4')).toHaveAttribute('aria-checked', 'false');
      await expect(page.locator('.gear')).toHaveAttribute('data-gear', '5');
      expect(await phase(page)).toBe('gear');
      // a die that cannot be chosen does nothing
      await page.getByTestId('die-6').click({ force: true });
      await expect(page.locator('.gear')).toHaveAttribute('data-gear', '5');
      // the same die again rolls it
      await page.getByTestId('die-5').click();
      await expect.poll(() => phase(page)).toBe('adjust');
      expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
    });

    test('après un mur (rapport 0), le dé choisi revient sur un rapport proposé', async ({ page }) => {
      await startRace(page);
      await stageGear(page, 3);
      await page.getByTestId('die-4').click();
      await expect(page.locator('.gear')).toHaveAttribute('data-gear', '4');
      await page.evaluate(() => {
        const w = window as unknown as W;
        const s = structuredClone(w.__game.state);
        s.cars[0].gear = 0;
        w.__game.setState(s);
      });
      await expect(page.locator('.gear')).toHaveAttribute('data-gear', '1');
      await expect(page.getByTestId('die-1')).toHaveAttribute('aria-checked', 'true');
    });

    test('au clavier : les flèches passent d’un dé à l’autre', async ({ page }) => {
      test.skip(size.name === 'mobile', 'clavier : testé sur grand écran');
      await startRace(page);
      await stageGear(page, 3);
      await page.getByTestId('die-3').focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByTestId('die-4')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('die-4')).toHaveAttribute('aria-checked', 'true');
    });

    test('les jauges de la voiture expliquent leur effet, en course (survol ou toucher)', async ({ page }) => {
      await startRace(page);
      await stageGear(page, 3);
      const tires = page.locator('.gauge[data-cat="tires"]');
      const tip = page.getByTestId('tooltip');
      if (size.name === 'mobile') await tires.tap();
      else await tires.hover();
      await expect(tip).toBeVisible();
      await expect(tip).toContainText('Pneus');
      await expect(tip).toContainText('Chaque tour terminé en use un point');
      await expect(tip).toContainText('abandon');
      await audit(page, 'infobulle des pneus');
      await page.screenshot({ path: `e2e/screenshots/tooltip-${size.name}-gauge.png` });
      // another gauge, another text; away from it the tooltip goes
      if (size.name === 'mobile') await page.locator('.gauge[data-cat="engine"]').tap();
      else await page.locator('.gauge[data-cat="engine"]').hover();
      await expect(tip).toContainText('en 5e ou 6e');
      if (size.name === 'mobile') await page.getByTestId('message').tap();
      else await page.mouse.move(5, 5);
      await expect(tip).toBeHidden();
    });

    test('les caractéristiques de la voiture expliquent leur effet dans le garage', async ({ page }) => {
      await page.goto('/?seed=5');
      await goTab(page, 'garage');
      const speed = page.locator('[data-stat="speed"]').first();
      await expect(speed).toBeVisible();
      const tip = page.getByTestId('tooltip');
      if (size.name === 'mobile') await speed.tap();
      else await speed.hover();
      await expect(tip).toBeVisible();
      await expect(tip).toContainText('Vitesse');
      await expect(tip).toContainText('Les cases en plus');
      await expect(tip).toContainText('Pour la monter');
      await page.screenshot({ path: `e2e/screenshots/tooltip-${size.name}-garage.png` });
      // another stat
      if (size.name === 'mobile') await page.locator('[data-stat="tactics"]').first().tap();
      else await page.locator('[data-stat="tactics"]').first().hover();
      await expect(tip).toContainText('relances');
    });

    test('le guide du jeu depuis le menu, et le guide court pendant la course', async ({ page }) => {
      const errors = watchConsole(page);
      await page.goto('/?seed=5');
      await page.getByTestId('open-guide').click();
      const guide = page.getByTestId('guide');
      await expect(guide).toBeVisible();
      await expect(guide).toContainText('Guide du jeu');
      // the whole of it, page by page
      await expect(guide.getByTestId('guide-select')).toHaveValue('goal');
      await expect(guide.getByTestId('guide-prev')).toBeEnabled();
      await guide.getByTestId('guide-select').selectOption('dice');
      await expect(page.getByTestId('guide-page')).toContainText('Rapport 6 : 21 à 30 cases');
      await expect(page.getByTestId('guide-page')).toContainText('un rapport à la fois');
      await guide.getByTestId('guide-select').selectOption('gauges');
      for (const name of ['Pneus', 'Freins', 'Boîte', 'Carrosserie', 'Moteur', 'Tenue de route']) await expect(page.getByTestId('guide-page')).toContainText(name);
      await guide.getByTestId('guide-select').selectOption('colors');
      await expect(page.getByTestId('guide-page')).toContainText('Rouge « MUR »');
      // the buttons go from page to page
      await guide.getByTestId('guide-next').click();
      await expect(guide.getByTestId('guide-select')).toHaveValue('tires');
      await guide.getByTestId('guide-prev').click();
      await expect(guide.getByTestId('guide-select')).toHaveValue('colors');
      await audit(page, 'guide du jeu');
      await page.screenshot({ path: `e2e/screenshots/guide-${size.name}-menu.png` });
      await guide.getByRole('button', { name: 'Fermer' }).last().click();
      await expect(guide).toHaveCount(0);

      // during a race: the short version first, and what to do right now
      await startRace(page);
      await stageGear(page, 3);
      await page.getByTestId('race-guide-open').click();
      await expect(page.getByTestId('guide')).toContainText('Aide de course');
      await expect(page.getByTestId('guide-now')).toContainText('touchez un dé pour choisir le rapport');
      await expect(page.getByTestId('guide-quick').locator('li')).toHaveCount(7);
      await audit(page, 'aide de course');
      await page.screenshot({ path: `e2e/screenshots/guide-${size.name}-race.png` });
      expect(await phase(page)).toBe('gear'); // the race is not touched
      // the whole guide is one tap away
      await page.getByTestId('guide-more').click();
      await expect(page.getByTestId('guide-page')).toContainText('Le but');
      await page.getByTestId('guide').getByRole('button', { name: 'Fermer' }).last().click();
      // the tip follows the turn: after the roll, it talks about the destination
      await page.getByTestId('die-3').click(); // already the chosen die: one touch rolls it
      await expect.poll(() => phase(page)).toBe('adjust');
      await page.getByTestId('race-guide-open').click();
      await expect(page.getByTestId('guide-now')).toContainText('touchez votre case d’arrivée');
      expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
    });

    test('la voiture a son skin sur la piste et dans la puce du pilote', async ({ page }) => {
      await startRace(page);
      await stageGear(page, 3);
      const car = page.getByTestId('chip-car');
      await expect(car).toBeVisible();
      const src = (await car.getAttribute('src'))!;
      expect(src.startsWith('data:image/svg+xml')).toBe(true);
      // the colour of the car (the paint of the garage, here the default one) is in the picture
      expect(decodeURIComponent(src)).toContain('#e53935');
      await page.evaluate(() => (window as unknown as W).__render.settle());
      await audit(page, 'voiture sur la piste');
      await page.screenshot({ path: `e2e/screenshots/skin-${size.name}-race.png` });
    });
  });
}
