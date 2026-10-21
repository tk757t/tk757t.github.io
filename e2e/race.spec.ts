import { expect, test, type Page } from '@playwright/test';
import { expectContrast, expectNoHorizontalOverflow, expectUsableLayout, humanStep, sizes } from './helpers';

type Snapshot = {
  phase: string;
  status: string;
  cars: { id: string; retired: string | null }[];
};
type W = {
  __game: { state: Snapshot; destinations(): string[] };
  __render: { settle(): void; cellScreen(id: string): { x: number; y: number } };
  __screen: { isHumanTurn(): boolean };
};

const snap = (page: Page) => page.evaluate(() => (window as unknown as W).__game.state);

/** Opens "Régler la course" and sets the players (everyone human unless told otherwise) and one lap. */
async function configure(page: Page, players: number, types: string[] = []) {
  await page.getByTestId('open-setup').click();
  await page.getByTestId('offline-race').click();
  await expect(page.getByTestId('setup')).toBeVisible();
  await page.getByRole('button', { name: `${players} joueur${players > 1 ? 's' : ''}`, exact: true }).click();
  for (let i = 0; i < players; i++) {
    await page.getByLabel(`Type du joueur ${i + 1}`).selectOption({ label: types[i] ?? 'Humain' });
  }
  await page.getByRole('button', { name: 'Moins de tours' }).click();
  await expect(page.getByTestId('laps')).toHaveText('1');
}

async function shot(page: Page, size: string, label: string, players: number) {
  await expectUsableLayout(page, label);
  await expectNoHorizontalOverflow(page, label);
  await page.screenshot({ path: `e2e/screenshots/race${players}p-${size}-${label}.png` });
}

/** Clicks the UI like a player until the ranking is on screen. Returns what it saw on the way. */
async function playRace(page: Page, size: string, players: number) {
  const seen = { corner: false, choice: false, roll: false, pass: false };
  for (let i = 0; i < 600; i++) {
    if (await page.getByTestId('ranking').isVisible()) return seen;
    const ready = page.getByRole('button', { name: 'Je suis prêt' });
    if (await ready.isVisible()) {
      if (!seen.pass) {
        seen.pass = true;
        await shot(page, size, 'pass-screen', players);
      }
      await ready.click();
      continue;
    }
    const s = await snap(page);
    if (s.status === 'finished') {
      await page.getByTestId('ranking').waitFor();
      continue;
    }
    if (s.phase === 'gear') {
      // aim for gear 3 by touching the dice, one step at a time when the car has started (the UI only lets us go up by one)
      for (let g = 0; g < 6; g++) {
        const cur = Number(await page.locator('.gear').getAttribute('data-gear'));
        if (cur === 3) break;
        const die = page.getByTestId(`die-${cur < 3 ? cur + 1 : cur - 1}`);
        if (!(await die.isVisible()) || (await die.getAttribute('aria-disabled')) === 'true') break;
        await die.click();
      }
      await humanStep(page);
      if (!seen.roll) {
        seen.roll = true;
        await page.evaluate(() => (window as unknown as W).__render.settle());
        await shot(page, size, 'after-roll', players);
      }
    } else if (s.phase === 'adjust') {
      if (!seen.choice) {
        seen.choice = true;
        await shot(page, size, 'choose-destination', players);
      }
      if (!seen.corner && /Virage/.test((await page.getByTestId('message').textContent()) ?? '')) {
        seen.corner = true;
        await shot(page, size, 'corner-message', players);
      }
      await humanStep(page);
    } else {
      await humanStep(page);
    }
  }
  throw new Error('race did not finish');
}

for (const size of sizes) {
  for (const players of [2, 4]) {
    test.describe(`${players} joueurs - ${size.name}`, () => {
      test.use({ viewport: { width: size.width, height: size.height }, reducedMotion: 'reduce' });
      test.setTimeout(150_000);

      test("course complète en cliquant jusqu'au classement", async ({ page }) => {
        const errors: string[] = [];
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('pageerror', (e) => errors.push(e.message));

        await page.goto(`/?seed=${players === 2 ? 11 : 23}`);
        await configure(page, players);
        await shot(page, size.name, 'setup', players);

        await page.getByRole('button', { name: 'Démarrer la course' }).click();
        await expect(page.getByTestId('pass-screen')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Au tour de Joueur 1' })).toBeVisible();
        await page.waitForFunction(() => '__game' in window);

        const seen = await playRace(page, size.name, players);
        expect(seen.roll).toBe(true);
        expect(seen.pass).toBe(true);

        const rows = page.getByTestId('ranking').locator('li');
        await expect(rows).toHaveCount(players);
        await expect(rows.first().locator('.rank')).toHaveText('1');
        await expectContrast(page, 'ranking');
        await shot(page, size.name, 'ranking', players);
        expect(errors).toEqual([]);
      });
    });
  }
}

test.describe('1 joueur', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

  test("pas d'écran de passage en solo", async ({ page }) => {
    await page.goto('/?seed=5');
    await configure(page, 1);
    await page.getByRole('button', { name: 'Démarrer la course' }).click();
    await expect(page.getByRole('button', { name: /^(Lancer|Départ)$/ })).toBeVisible();
    await expect(page.getByTestId('pass-screen')).toHaveCount(0);
  });
});

test.describe('animation du dé', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });

  test('le dé tourne puis affiche le résultat, sans erreur console', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?seed=5');
    await configure(page, 1);
    await page.getByRole('button', { name: 'Démarrer la course' }).click();
    await page.getByRole('button', { name: /^(Lancer|Départ)$/ }).click();
    await expect(page.getByTestId('die')).toHaveClass(/rolling/);
    await expect(page.getByRole('button', { name: /^(Lancer|Départ)$/ })).toBeDisabled();
    await expect(page.getByTestId('die')).not.toHaveClass(/rolling/, { timeout: 3000 });
    await expect(page.getByTestId('message')).toContainText(/Départ|Super départ|Calage/);
    expect(errors).toEqual([]);
  });
});

const ais = ['IA Facile', 'IA Moyen', 'IA Difficile'];

test.describe('humain + 3 IA', () => {
  for (const size of sizes) {
    test.describe(size.name, () => {
      test.use({ viewport: { width: size.width, height: size.height }, reducedMotion: 'reduce' });
      test.setTimeout(150_000);

      test('la course se termine, les IA jouent seules', async ({ page }) => {
        const errors: string[] = [];
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('pageerror', (e) => errors.push(e.message));

        await page.goto('/?seed=31&aiDelay=0');
        await configure(page, 4, ['Humain', ...ais]);
        await shot(page, size.name, 'setup-ai', 4);
        await page.getByRole('button', { name: 'Démarrer la course' }).click();
        await page.waitForFunction(() => '__screen' in window);
        // one human only: no hot-seat pass screen
        await expect(page.getByTestId('pass-screen')).toHaveCount(0);

        let humanTurns = 0;
        let sawAiTurn = false;
        for (let i = 0; i < 4000; i++) {
          if (await page.getByTestId('ranking').isVisible()) break;
          const human = await page.evaluate(() => (window as unknown as W).__screen.isHumanTurn());
          if (!human) {
            if (!sawAiTurn && /IA/.test((await page.getByTestId('turn-chip').textContent()) ?? '')) {
              sawAiTurn = true;
              await shot(page, size.name, 'ai-turn', 4);
            }
            await page.waitForTimeout(20);
            continue;
          }
          if ((await humanStep(page)) === 'gear') humanTurns++;
        }
        const rows = page.getByTestId('ranking').locator('li');
        await expect(rows).toHaveCount(4);
        await expect(page.getByTestId('ranking')).toContainText('IA Difficile');
        expect(humanTurns).toBeGreaterThan(0);
        expect(sawAiTurn).toBe(true);
        await shot(page, size.name, 'ranking-ai', 4);
        expect(errors).toEqual([]);
      });
    });
  }
});

test.describe('délai des IA', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

  test('chaque action IA attend le délai configuré et le HUD est verrouillé pendant ce temps', async ({ page }) => {
    await page.goto('/?seed=3&aiDelay=400');
    await configure(page, 2, ['Humain', 'IA Moyen']);
    await expect(page.getByLabel('Vitesse des IA')).toHaveValue('400');
    await page.getByRole('button', { name: 'Démarrer la course' }).click();
    await page.waitForFunction(() => '__screen' in window);
    const isHuman = () => page.evaluate(() => (window as unknown as W).__screen.isHumanTurn());
    // play the human turn(s) until the AI is up (a stalled start or the grid order can change who goes first)
    for (let i = 0; i < 20 && (await isHuman()); i++) await humanStep(page);
    // now it is the AI's turn: controls locked, the first AI action only comes after the delay
    const t0 = Date.now();
    await expect(page.getByRole('button', { name: /IA : / })).toBeDisabled();
    await expect.poll(isHuman, { timeout: 10_000 }).toBe(true);
    expect(Date.now() - t0).toBeGreaterThan(400);
    await expect(page.getByRole('button', { name: /^(Lancer|Départ)$/ })).toBeVisible();
  });
});
