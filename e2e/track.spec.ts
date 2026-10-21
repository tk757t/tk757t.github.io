import { expect, test, type Page } from '@playwright/test';

interface Cam { cx: number; cy: number; zoom: number; w: number; h: number }
type W = {
  __render: { ready: boolean; camera(): Cam; following(): boolean; settle(): void; fitAll(): void; cellScreen(id: string): { x: number; y: number } };
  __game: { state: { phase: string; round: number; played: string[]; turn: { carId: string }; cars: { id: string; position: string | null; finishRank: number | null }[] }; dispatch(a: object): unknown[]; destinations(): string[] };
};

const sizes = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

const cam = (page: Page) => page.evaluate(() => (window as unknown as W).__render.camera());
const settle = (page: Page) => page.evaluate(() => (window as unknown as W).__render.settle());

/** Plays like a user: taps the first highlighted destination. */
async function tapDestination(page: Page) {
  const pick = await page.evaluate(() => {
    const w = window as unknown as W;
    w.__render.settle();
    return w.__render.cellScreen(w.__game.destinations()[0]);
  });
  await page.mouse.click(pick.x, pick.y);
}

/** Rolls the gear die; a stalled start (d20 = 1) passes the turn, so roll again until a destination can be picked. */
async function rollUntilAdjust(page: Page) {
  for (let i = 0; i < 8; i++) {
    if ((await page.evaluate(() => (window as unknown as W).__game.state.phase)) === 'adjust') return;
    await page.getByRole('button', { name: /Lancer les dés|Rapport . : lancer/ }).click();
  }
}

async function open(page: Page, errors: string[]) {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/demo.html');
  await page.waitForFunction(() => (window as unknown as W).__render?.ready === true);
  await settle(page);
}

for (const size of sizes) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test('affiche le circuit, suit la voiture active et se laisse piloter', async ({ page }) => {
      const errors: string[] = [];
      await open(page, errors);
      await page.screenshot({ path: `e2e/screenshots/track-${size.name}-follow.png` });

      await page.getByRole('button', { name: "Vue d'ensemble" }).click();
      await settle(page);
      await page.screenshot({ path: `e2e/screenshots/track-${size.name}-overview.png` });

      // play a few turns: the camera must follow whoever is active
      await page.getByRole('button', { name: 'Suivre' }).click();
      for (let i = 0; i < 3; i++) {
        await rollUntilAdjust(page);
        await tapDestination(page);
      }
      await settle(page);
      const state = await page.evaluate(() => {
        const w = window as unknown as W;
        const car = w.__game.state.cars.find((c) => c.id === w.__game.state.turn.carId)!;
        return { pos: w.__render.cellScreen(car.position!), box: { w: innerWidth, h: innerHeight } };
      });
      expect(Math.abs(state.pos.x - state.box.w / 2)).toBeLessThan(4);
      expect(Math.abs(state.pos.y - state.box.h / 2)).toBeLessThan(4);
      await page.screenshot({ path: `e2e/screenshots/track-${size.name}-turn4.png` });
      expect(errors).toEqual([]);
    });

    test('zoom molette et pan souris', async ({ page }) => {
      const errors: string[] = [];
      await open(page, errors);
      const a = await cam(page);
      expect(await page.evaluate(() => (window as unknown as W).__render.following())).toBe(true);

      await page.mouse.move(size.width / 2, size.height / 2);
      await page.mouse.wheel(0, -400);
      await expect.poll(async () => (await cam(page)).zoom).toBeGreaterThan(a.zoom * 1.3);
      const zoomed = await cam(page);
      await page.mouse.wheel(0, 800);
      await expect.poll(async () => (await cam(page)).zoom).toBeLessThan(zoomed.zoom);

      await page.getByRole('button', { name: "Vue d'ensemble" }).click();
      const b = await cam(page);
      await page.mouse.move(size.width / 2, size.height / 3);
      await page.mouse.down();
      await page.mouse.move(size.width / 2 + 60, size.height / 3 + 40, { steps: 6 });
      await page.mouse.up();
      const c = await cam(page);
      expect(c.cx).toBeLessThan(b.cx - 5); // dragging right moves the camera left
      expect(c.cy).toBeLessThan(b.cy - 3);
      expect(await page.evaluate(() => (window as unknown as W).__render.following())).toBe(false);
      await page.screenshot({ path: `e2e/screenshots/track-${size.name}-zoom-pan.png` });
      expect(errors).toEqual([]);
    });

    test('pinch à deux doigts', async ({ page }) => {
      const errors: string[] = [];
      await open(page, errors);
      const before = await cam(page);
      await page.evaluate(({ w, h }) => {
        const canvas = document.querySelector('canvas')!;
        const fire = (type: string, id: number, x: number, y: number) =>
          canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: id === 1 }));
        const cx = w / 2;
        const cy = h / 2;
        fire('pointerdown', 1, cx - 40, cy);
        fire('pointerdown', 2, cx + 40, cy);
        for (let i = 1; i <= 5; i++) {
          fire('pointermove', 1, cx - 40 - i * 15, cy);
          fire('pointermove', 2, cx + 40 + i * 15, cy);
        }
        fire('pointerup', 1, cx - 115, cy);
        fire('pointerup', 2, cx + 115, cy);
      }, { w: size.width, h: size.height });
      const after = await cam(page);
      expect(after.zoom).toBeGreaterThan(before.zoom * 2);
      expect(errors).toEqual([]);
    });

    test("un tap sur une case en surbrillance joue le déplacement", async ({ page }) => {
      const errors: string[] = [];
      await open(page, errors);
      const phase = async () => page.evaluate(() => (window as unknown as W).__game.state.phase);
      await rollUntilAdjust(page);
      expect(await phase()).toBe('adjust');
      await settle(page);
      await page.screenshot({ path: `e2e/screenshots/track-${size.name}-choose.png` });
      const before = await page.evaluate(() => (window as unknown as W).__game.state.round);
      await tapDestination(page);
      expect(await phase()).toBe('gear');
      expect(await page.evaluate(() => (window as unknown as W).__game.state.cars.some((c) => c.position !== null))).toBe(true);
      expect(await page.evaluate(() => (window as unknown as W).__game.state.round)).toBeGreaterThanOrEqual(before);
      expect(errors).toEqual([]);
    });
  });
}
