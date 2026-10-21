import { expect, test, type Page } from '@playwright/test';
import { expectContrast, expectNoHorizontalOverflow, expectUsableLayout, sizes } from './helpers';

type W = {
  __render: { ready: boolean; settle(): void; fitAll(): void; cellScreen(id: string): { x: number; y: number } };
  __game: {
    state: { phase: string; cars: { id: string; position: string | null }[]; turn: { carId: string } };
    dispatch(a: object): unknown[];
    destinations(): string[];
  };
};

const tracks = ['oval', 'dunes', 'pins', 'col'];

async function open(page: Page, track: string, errors: string[]) {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/demo.html?track=${track}&seed=7`);
  await page.waitForFunction(() => (window as unknown as W).__render?.ready === true);
}

/** Rolls until the car can pick a destination (a stalled start passes the turn). */
async function rollUntilAdjust(page: Page) {
  for (let i = 0; i < 10; i++) {
    if ((await page.evaluate(() => (window as unknown as W).__game.state.phase)) === 'adjust') return;
    await page.getByRole('button', { name: /Lancer les dés|Rapport . : lancer/ }).click();
  }
  throw new Error('no destination to pick');
}

const settle = (page: Page) => page.evaluate(() => (window as unknown as W).__render.settle());
const position = (page: Page) =>
  page.evaluate(() => {
    const g = (window as unknown as W).__game;
    return g.state.cars.find((c) => c.id === g.state.turn.carId)!.position;
  });

for (const size of sizes) {
  for (const track of tracks) {
    test.describe(`${track} - ${size.name}`, () => {
      test.use({ viewport: { width: size.width, height: size.height }, reducedMotion: 'reduce' });

      test('le décor ne réagit pas, une destination se choisit en un clic', async ({ page }) => {
        const errors: string[] = [];
        await open(page, track, errors);
        await rollUntilAdjust(page);
        await settle(page);
        await expectUsableLayout(page, `${track} destinations`);
        await expectNoHorizontalOverflow(page, `${track} destinations`);
        await expectContrast(page, `${track} destinations`);
        await page.screenshot({ path: `e2e/screenshots/cells-${track}-${size.name}.png` });

        // a tap far from every cell (on the decor) does nothing: same phase, same car
        const before = await page.evaluate(() => (window as unknown as W).__game.state.phase);
        const turnBefore = await page.evaluate(() => (window as unknown as W).__game.state.turn.carId);
        await page.mouse.click(size.width - 6, 120);
        await page.mouse.click(8, size.height / 2);
        expect(await page.evaluate(() => (window as unknown as W).__game.state.phase)).toBe(before);
        expect(await page.evaluate(() => (window as unknown as W).__game.state.turn.carId)).toBe(turnBefore);

        // a tap on a destination moves the car there
        const pick = await page.evaluate(() => {
          const w = window as unknown as W;
          const id = w.__game.destinations()[0];
          return { id, ...w.__render.cellScreen(id) };
        });
        await page.mouse.click(pick.x, pick.y);
        await settle(page);
        const car = await page.evaluate(
          ([id]) => (window as unknown as W).__game.state.cars.find((c) => c.id === id)!.position,
          [turnBefore],
        );
        expect(car).toBe(pick.id);
        expect(await position(page)).not.toBe(pick.id);
        await page.evaluate(() => (window as unknown as W).__render.fitAll());
        await page.screenshot({ path: `e2e/screenshots/cells-${track}-${size.name}-all.png` });
        expect(errors).toEqual([]);
      });
    });
  }
}

test.describe('légende des cases', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

  test('les réglages de course expliquent les cases, sans erreur', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?seed=5');
    await page.getByTestId('open-setup').click();
    await page.getByTestId('offline-race').click();
    await page.getByRole('button', { name: 'Démarrer la course' }).click();
    await page.getByTestId('race-settings').click();
    await expect(page.getByTestId('cell-legend')).toBeVisible();
    await expectUsableLayout(page, 'legend');
    await expectNoHorizontalOverflow(page, 'legend');
    await expectContrast(page, 'legend');
    await page.screenshot({ path: 'e2e/screenshots/cells-legend-mobile.png' });
    expect(errors).toEqual([]);
  });
});
