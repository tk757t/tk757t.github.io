import { expect, test, type Page } from '@playwright/test';
import { expectContrast, expectNoHorizontalOverflow, expectUsableLayout, sizes } from './helpers';

type Opt = { cellId: string; playable: boolean; blocked: string | null; bodyLoss: number; brakesLoss: number; tiresLoss: number; crash: boolean };
type Cell = { id: string; type: number; next: string[]; corner?: { id: string; stops: number } };
type Car = { id: string; position: string | null; retired: string | null; cornerId: string | null; cornerLeft: number; wear: Record<string, number> };
type State = { phase: string; status: string; cars: Car[]; track: { cells: Record<string, Cell> }; turn: Record<string, unknown> };
type W = {
  __game: { state: State; options(): Opt[]; dispatch(a: unknown): void; setState(s: unknown): void };
  __render: { settle(): void };
};

/** Opens the race setup with `players` human players and one lap, and starts the race. */
async function start(page: Page, players: number) {
  await page.goto('/?seed=5');
  await page.getByTestId('open-setup').click();
  await page.getByTestId('offline-race').click();
  await page.getByRole('button', { name: `${players} joueur${players > 1 ? 's' : ''}`, exact: true }).click();
  for (let i = 1; i <= players; i++) await page.getByLabel(`Type du joueur ${i}`).selectOption({ label: 'Humain' });
  await page.getByRole('button', { name: 'Moins de tours' }).click();
  await page.getByRole('button', { name: 'Démarrer la course' }).click();
  if (players > 1) await page.getByRole('button', { name: 'Je suis prêt' }).click();
  await page.waitForFunction(() => '__game' in window);
}

/** Replaces the state: the first car on a corner cell (2 stops or more) or on a straight, with `roll` to play. */
async function stage(page: Page, plan: { corner?: boolean; blockerAhead?: number; roll: number }) {
  await page.evaluate((p) => {
    const w = window as unknown as W;
    const s = structuredClone(w.__game.state);
    const cells = Object.values(s.track.cells);
    const car = s.cars[0];
    let at: Cell;
    if (p.corner) {
      at = cells.find((c) => c.corner && c.corner.stops >= 2)!;
      car.cornerId = at.corner!.id;
      car.cornerLeft = at.corner!.stops;
    } else {
      // a plain straight with at least 12 plain cells after it
      const plain = (c: Cell, n: number): boolean => (n === 0 ? true : c.type === 0 && !c.corner && c.next[0] !== undefined && plain(s.track.cells[c.next[0]], n - 1));
      at = cells.find((c) => plain(c, 12))!;
      car.cornerId = null;
      car.cornerLeft = 0;
    }
    car.position = at.id;
    if (p.blockerAhead) {
      let c = at;
      for (let i = 0; i < p.blockerAhead; i++) c = s.track.cells[c.next[0]];
      s.cars[1].position = c.id;
    }
    s.phase = 'adjust';
    s.turn = { ...s.turn, carId: car.id, roll: p.roll, face: p.roll, brakes: 0, boost: false, slipstream: false, fixed: false, start: false };
    w.__game.setState(s);
    w.__render.settle();
  }, plan);
}

const errorsOf = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
};

for (const size of sizes) {
  test.describe(`mur et contact - ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, reducedMotion: 'reduce' });

    test('un virage raté de 2 arrêts ou plus : case rouge, puis abandon contre le mur', async ({ page }) => {
      const errors = errorsOf(page);
      await start(page, 1);
      await stage(page, { corner: true, roll: 14 });
      const options = await page.evaluate(() => (window as unknown as W).__game.options());
      const wall = options.find((o) => o.crash && o.playable);
      expect(wall, 'une destination mène au mur').toBeDefined();
      await expect(page.getByTestId('message')).toContainText('Rouge : le mur, la voiture abandonne.');
      await expectUsableLayout(page, 'mur');
      await expectNoHorizontalOverflow(page, 'mur');
      await page.screenshot({ path: `e2e/screenshots/crash-${size.name}-wall-choice.png` });
      await page.evaluate((id) => (window as unknown as W).__game.dispatch({ type: 'MOVE_TO', cellId: id }), wall!.cellId);
      const after = await page.evaluate(() => (window as unknown as W).__game.state.cars[0]);
      expect(after.retired).toBe('crash');
      expect(after.position).toBeNull();
      await page.screenshot({ path: `e2e/screenshots/crash-${size.name}-wall-out.png` });
      expect(errors).toEqual([]);
    });

    test('une voiture barre la route : case rose, la carrosserie baisse de 1, ni freins ni pneus', async ({ page }) => {
      const errors = errorsOf(page);
      await start(page, 2);
      await stage(page, { blockerAhead: 4, roll: 7 });
      const before = await page.evaluate(() => (window as unknown as W).__game.state.cars[0].wear);
      const options = await page.evaluate(() => (window as unknown as W).__game.options());
      const hit = options.find((o) => o.blocked === 'car' && o.playable);
      expect(hit, 'une destination derrière la voiture').toBeDefined();
      expect(hit).toMatchObject({ bodyLoss: 1, brakesLoss: 0, tiresLoss: 0, crash: false });
      await expect(page.getByTestId('message')).toContainText('Rose (C) : une voiture barre la route');
      await expectUsableLayout(page, 'contact');
      await expectNoHorizontalOverflow(page, 'contact');
      await page.screenshot({ path: `e2e/screenshots/crash-${size.name}-car-choice.png` });
      await page.evaluate((id) => (window as unknown as W).__game.dispatch({ type: 'MOVE_TO', cellId: id }), hit!.cellId);
      const after = await page.evaluate(() => (window as unknown as W).__game.state.cars[0].wear);
      expect(after.body).toBe(before.body - 1);
      expect(after.brakes).toBe(before.brakes);
      expect(after.tires).toBe(before.tires);
      await expectContrast(page, 'contact');
      await page.screenshot({ path: `e2e/screenshots/crash-${size.name}-car-after.png` });
      expect(errors).toEqual([]);
    });
  });
}
