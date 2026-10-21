import { expect, test, type Page } from '@playwright/test';
import { expectContrast, expectNoHorizontalOverflow, expectUsableLayout, sizes } from './helpers';

type Opt = { cellId: string; playable: boolean; blocked: string | null; bodyLoss: number };
type Cell = { id: string; type: number; lane: number; next: string[]; corner?: unknown };
type W = {
  __game: { state: { cars: { position: string | null }[]; track: { cells: Record<string, Cell> }; turn: Record<string, unknown>; phase: string }; options(): Opt[]; setState(s: unknown): void };
  __render: { settle(): void; cellScreen(id: string): { x: number; y: number } };
};

/** Two human players, the first one on a straight with a car 6 cells ahead in its lane and a roll of 9 to play. */
async function stageBlocked(page: Page) {
  await page.goto('/?seed=5');
  await page.getByTestId('open-setup').click();
  await page.getByRole('button', { name: '2 joueurs', exact: true }).click();
  for (let i = 1; i <= 2; i++) await page.getByLabel(`Type du joueur ${i}`).selectOption({ label: 'Humain' });
  await page.getByRole('button', { name: 'Démarrer la course' }).click();
  await page.getByRole('button', { name: 'Je suis prêt' }).click();
  await page.waitForFunction(() => '__game' in window);
  await page.evaluate(() => {
    const w = window as unknown as W;
    const s = structuredClone(w.__game.state);
    const cells = Object.values(s.track.cells);
    const plain = (c: Cell, n: number): boolean => (n === 0 ? true : c.type === 0 && !c.corner && c.next[0] !== undefined && plain(s.track.cells[c.next[0]], n - 1));
    const at = cells.find((c) => plain(c, 14))!;
    s.cars[0].position = at.id;
    let c = at;
    for (let i = 0; i < 6; i++) c = s.track.cells[c.next[0]];
    s.cars[1].position = c.id;
    s.phase = 'adjust';
    s.turn = { ...s.turn, carId: (s.cars[0] as unknown as { id: string }).id, roll: 9, face: 9, brakes: 0, boost: false, slipstream: false, fixed: false, start: false };
    w.__game.setState(s);
    w.__render.settle();
  });
}

for (const size of sizes) {
  test.describe(`plateau - ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, reducedMotion: 'reduce' });

    test('une voiture qui barre la route : arrivées vertes en doublant sur les côtés, rose derrière elle, un clic suffit', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      await stageBlocked(page);
      const options = await page.evaluate(() => (window as unknown as W).__game.options());
      const free = options.filter((o) => o.playable && o.blocked === null && o.bodyLoss === 0);
      const hit = options.filter((o) => o.blocked === 'car' && o.bodyLoss > 0);
      expect(free.length, 'on double par une autre voie').toBeGreaterThan(0);
      expect(hit.length, 'derrière la voiture, le contact coûte de la carrosserie').toBeGreaterThan(0);
      await expect(page.getByTestId('message')).toContainText('Rose (C)');
      await expectUsableLayout(page, 'plateau');
      await expectNoHorizontalOverflow(page, 'plateau');
      await expectContrast(page, 'plateau');
      await page.screenshot({ path: `e2e/screenshots/board-${size.name}-pass-side.png` });

      // a tap on a free destination, in the middle of its wide cell, plays it
      const target = free[0].cellId;
      const at = await page.evaluate((id) => (window as unknown as W).__render.cellScreen(id), target);
      await page.mouse.click(at.x, at.y);
      const car = await page.evaluate(() => (window as unknown as W).__game.state.cars[0]);
      expect(car.position).toBe(target);
      expect(errors).toEqual([]);
    });
  });
}
