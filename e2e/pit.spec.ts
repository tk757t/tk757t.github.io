import { expect, test, type Page } from '@playwright/test';
import { expectContrast, expectNoHorizontalOverflow, expectUsableLayout, sizes, watchConsole } from './helpers';

type Car = { id: string; position: string | null; tires: string; repairLeft: number; wear: Record<string, number>; maxWear: Record<string, number>; pitLap: number; stint: number };
type State = { phase: string; status: string; cars: Car[]; turn: { carId: string } | null };
type W = { __game: { state: State; setState(s: unknown): void; dispatch(a: object): unknown[] } };

const state = (page: Page) => page.evaluate(() => (window as unknown as W).__game.state);

/** Puts the human car on its own pit box with a damaged car, in the "pit" phase. */
async function parkAtBox(page: Page) {
  await page.evaluate(() => {
    const g = (window as unknown as W).__game;
    const s = JSON.parse(JSON.stringify(g.state)) as State;
    const car = s.cars[0];
    car.position = 'P3'; // team 1 box of the oval
    car.wear = { ...car.wear, engine: 1, body: 1, tires: 1 };
    s.phase = 'pit';
    g.setState(s);
  });
}

for (const size of sizes) {
  test.describe(`stand - ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, reducedMotion: 'reduce' });
    // it plays a race up to the pit lane: about 25 s when the whole suite runs in parallel
    test.setTimeout(60_000);

    test('la fenêtre du stand propose pneus et réparations, et un arrêt long les applique', async ({ page }) => {
      const errors = watchConsole(page);
      await page.goto('/?seed=5');
      await page.getByTestId('open-setup').click();
      await page.getByTestId('offline-race').click();
      await page.getByRole('button', { name: '1 joueur', exact: true }).click();
      await page.getByRole('button', { name: 'Démarrer la course' }).click();
      await page.waitForFunction(() => '__game' in window);
      // the weather and the tires are always visible
      await expect(page.getByTestId('status-line')).toContainText('Pneus durs');

      await parkAtBox(page);
      const modal = page.getByTestId('pit-modal');
      await expect(modal).toBeVisible();
      await expect(modal.getByRole('button', { name: 'Arrêt rapide' })).toBeVisible();
      await expectUsableLayout(page, 'pit');
      await expectNoHorizontalOverflow(page, 'pit');
      await expectContrast(page, 'pit');
      await page.screenshot({ path: `e2e/screenshots/pit-${size.name}-quick.png` });

      // choose soft tires and one repair on the engine: the stop becomes a long one
      await modal.locator('[data-tires="soft"]').click();
      await modal.getByRole('button', { name: 'Plus de réparation : Moteur' }).click();
      await expect(modal.getByRole('button', { name: 'Arrêt long' })).toBeVisible();
      await page.screenshot({ path: `e2e/screenshots/pit-${size.name}-long.png` });
      await modal.getByTestId('pit-go').click();
      await expect(modal).toHaveCount(0);

      const after = (await state(page)).cars[0];
      expect(after.tires).toBe('soft');
      expect(after.wear.engine).toBe(2);
      expect(after.wear.tires).toBe(after.maxWear.tires);
      expect(after.repairLeft).toBe(1);
      expect(errors).toEqual([]);
    });

    test('on peut ne pas s’arrêter', async ({ page }) => {
      await page.goto('/?seed=5');
      await page.getByTestId('open-setup').click();
      await page.getByTestId('offline-race').click();
      await page.getByRole('button', { name: '1 joueur', exact: true }).click();
      await page.getByRole('button', { name: 'Démarrer la course' }).click();
      await page.waitForFunction(() => '__game' in window);
      await parkAtBox(page);
      await page.getByTestId('pit-skip').click();
      await expect(page.getByTestId('pit-modal')).toHaveCount(0);
      const s = await state(page);
      expect(s.phase).toBe('gear');
      expect(s.cars[0].repairLeft).toBe(2);
    });
  });
}
