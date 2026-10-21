import { expect, test, type Page } from '@playwright/test';
import { expectContrast, expectNoHorizontalOverflow, expectUsableLayout, sizes, watchConsole } from './helpers';

type Opt = { cellId: string; playable: boolean; laps: number };
type Cell = { id: string; type: number; row: number; lane: number; corner?: { id: string } };
type Car = { id: string; position: string | null; cornerId: string | null; cornerLeft: number; tires: string; stint: number; laps: number; wear: Record<string, number> };
type State = { phase: string; cars: Car[]; config: { laps: number }; track: { cells: Record<string, Cell>; lapLength: number }; turn: Record<string, unknown> };
type W = {
  __game: { state: State; options(): Opt[]; dispatch(a: unknown): void; setState(s: unknown): void };
  __render: { settle(): void };
};

async function solo(page: Page) {
  await page.goto('/?seed=5');
  await page.getByTestId('open-setup').click();
  await page.getByRole('button', { name: '1 joueur', exact: true }).click();
  await page.getByLabel('Type du joueur 1').selectOption({ label: 'Humain' });
  await page.getByRole('button', { name: 'Démarrer la course' }).click();
  await page.waitForFunction(() => '__game' in window);
}

for (const size of sizes) {
  test.describe(`usure des pneus par tour - ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, reducedMotion: 'reduce' });

    test('un tour terminé sur tendres : −1 Pneus, message et jauge', async ({ page }) => {
      const errors = watchConsole(page);
      await solo(page);
      // a 3-lap race on soft tires, the car two cells before the line with a roll that crosses it
      await page.evaluate(() => {
        const w = window as unknown as W;
        const s = structuredClone(w.__game.state);
        s.config.laps = 3;
        const car = s.cars[0];
        car.tires = 'soft';
        car.laps = 0;
        car.stint = 0;
        const cells = Object.values(s.track.cells);
        const before = cells.find((c) => c.lane === 1 && c.row === s.track.lapLength - 2)!;
        car.position = before.id;
        // in the zone of the last corner with all its stops done: leaving it costs nothing
        car.cornerId = before.corner?.id ?? null;
        car.cornerLeft = 0;
        s.phase = 'adjust';
        s.turn = { ...s.turn, carId: car.id, roll: 6, face: 6, brakes: 0, boost: false, slipstream: false, fixed: false, start: false };
        w.__game.setState(s);
        w.__render.settle();
      });
      const start = await page.evaluate(() => (window as unknown as W).__game.state.cars[0].wear.tires);
      const options = await page.evaluate(() => (window as unknown as W).__game.options());
      const across = options.find((o) => o.playable && o.laps === 1);
      expect(across, 'une destination franchit la ligne').toBeDefined();
      await expectUsableLayout(page, 'avant la ligne');
      await page.screenshot({ path: `e2e/screenshots/tire-wear-${size.name}-before.png` });
      await page.evaluate((id) => (window as unknown as W).__game.dispatch({ type: 'MOVE_TO', cellId: id }), across!.cellId);
      const after = await page.evaluate(() => (window as unknown as W).__game.state.cars[0]);
      expect(after.wear.tires).toBe(start - 1);
      expect(after.stint).toBe(1);
      await expect(page.getByTestId('message')).toContainText('Usure des pneus : −1 (tour 1 du relais)');
      await expectNoHorizontalOverflow(page, 'après la ligne');
      await expectContrast(page, 'après la ligne');
      await page.screenshot({ path: `e2e/screenshots/tire-wear-${size.name}-after.png` });
      expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
    });
  });
}
