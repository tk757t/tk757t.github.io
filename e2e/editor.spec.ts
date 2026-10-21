import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { raceReadyProblems, validateTrackDef } from '../src/data/tracks/validate';
import type { TrackDef } from '../src/data/tracks/schema';
import { expectContrast, expectNoHorizontalOverflow, expectUsableLayout, humanStep, sizes, watchConsole } from './helpers';

type Pt = { x: number; y: number };
type Editor = {
  __editor: {
    doc(): { name: string; points: Pt[]; corners: unknown[]; pit: unknown; gears: Record<string, number[]> };
    def(): TrackDef;
    checks(): { level: string; message: string }[];
    cellScreen(id: string): Pt | null;
    pointScreen(i: number): Pt | null;
    fit(): void;
    slots(): number;
  };
};
type Race = { __game: { state: { status: string; phase: string; track: { lapLength: number } } }; __screen: { isHumanTurn(): boolean } };

/** Runs fn(window.__editor) in the page. */
const ed = <T>(page: Page, fn: (e: Editor['__editor']) => T): Promise<T> =>
  page.evaluate((src) => new Function('e', `return (${src})(e)`)((window as unknown as Editor).__editor), fn.toString()) as Promise<T>;

async function check(page: Page, where: string) {
  await expectUsableLayout(page, where);
  await expectNoHorizontalOverflow(page, where);
  await expectContrast(page, where);
}

/** Taps two cells of the middle lane: the forward range between them becomes the selection. */
async function selectSlots(page: Page, from: number, to: number) {
  for (const slot of [from, to]) {
    const p = await page.evaluate((id) => (window as unknown as Editor).__editor.cellScreen(id), `L1S${slot}`);
    expect(p, `cell L1S${slot}`).not.toBeNull();
    await page.mouse.click(p!.x, p!.y);
  }
  await expect(page.getByTestId('editor-selection')).toContainText(`${((to - from + 1000) % 1000) + 1} cases`);
}

for (const size of sizes) {
  test.describe(`éditeur de circuits - ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, reducedMotion: 'reduce', acceptDownloads: true });
    test.setTimeout(180_000);

    test('dessiner un petit circuit, le tester, l’exporter, le réimporter et courir dessus', async ({ page }, info) => {
      const errors = watchConsole(page);
      const shot = (label: string) => page.screenshot({ path: `e2e/screenshots/editor-${size.name}-${label}.png` });
      await page.goto('/editor?new=1&aiDelay=0&seed=7');
      await expect(page.getByTestId('editor')).toBeVisible();
      await page.waitForFunction(() => '__editor' in window);

      // 1. the line: a new stadium, made smaller by dragging two points towards the middle
      await expect(page.getByTestId('editor-status')).toHaveText('1 erreur');
      await check(page, 'tracé');
      await shot('trace');
      const before = await ed(page, (e) => e.slots());
      for (const i of [2, 5]) {
        const p = (await page.evaluate((k) => (window as unknown as Editor).__editor.pointScreen(k), i))!;
        const inward = i === 2 ? -1 : 1;
        await page.mouse.move(p.x, p.y);
        await page.mouse.down();
        await page.mouse.move(p.x + inward * 10, p.y, { steps: 2 });
        await page.mouse.move(p.x + inward * (size.width < 600 ? 12 : 40), p.y, { steps: 4 });
        await page.mouse.up();
      }
      const n = await ed(page, (e) => e.slots());
      expect(n).toBeLessThan(before);
      await ed(page, (e) => e.fit());
      // two lanes
      await page.getByTestId('editor-lanes-2').click();
      expect((await ed(page, (e) => e.def())).cells.filter((c) => c.type < 2)).toHaveLength(2 * n);

      // 2. zones: two corners, a chicane, a 2-stop corner, the pit lane; start line and grid stay where they are
      await page.getByTestId('editor-tab-zones').click();
      const at = (f: number) => Math.round(f * n) % n;
      await selectSlots(page, at(0.27), at(0.37));
      await page.getByTestId('editor-stops').selectOption('1');
      await page.getByTestId('editor-make-corner').click();
      await selectSlots(page, at(0.39), at(0.48));
      await page.getByTestId('editor-stops').selectOption('2');
      await page.getByTestId('editor-make-corner').click();
      await selectSlots(page, at(0.77), at(0.86));
      await page.getByTestId('editor-stops').selectOption('1');
      await page.getByTestId('editor-make-chicane').click();
      await selectSlots(page, at(0.88), at(0.97));
      await page.getByTestId('editor-make-corner').click();
      await expect(page.getByTestId('editor-status')).toHaveText('1 erreur'); // still no pit lane
      await selectSlots(page, at(0.07), at(0.2));
      await page.getByTestId('editor-make-pit').click();
      await expect(page.getByTestId('editor-status')).toHaveText('Circuit valide');
      await expect(page.getByTestId('editor-zones').locator('li')).toHaveCount(5);
      const def = await ed(page, (e) => e.def());
      expect(validateTrackDef(def)).toEqual([]);
      expect(raceReadyProblems(def)).toEqual([]);
      expect(def.cells.filter((c) => c.risk > 0).length).toBe(4); // chicane: entry and exit, two lanes
      await check(page, 'zones');
      await shot('zones');

      // 3. advised gears: correct one cell by hand
      await page.getByTestId('editor-tab-gears').click();
      const cell = (await page.evaluate((id) => (window as unknown as Editor).__editor.cellScreen(id), `L0S${at(0.6)}`))!;
      await page.mouse.click(cell.x, cell.y);
      await page.getByTestId('editor-gear-0').selectOption('2');
      await expect(page.getByTestId('editor-overrides')).toContainText('1 case corrigée');
      expect(await ed(page, (e) => Object.values(e.doc().gears))).toEqual([[2, expect.any(Number), expect.any(Number), expect.any(Number)]]);
      await check(page, 'rapports');
      await shot('gears');

      // 4. name, scenery, weather
      await page.getByTestId('editor-tab-circuit').click();
      await page.getByTestId('editor-name').fill('Petit essai');
      await page.getByTestId('editor-name').press('Enter');
      await page.getByTestId('editor-id').fill('petit-essai');
      await page.getByTestId('editor-id').press('Enter');
      await page.getByTestId('editor-theme').selectOption('desert');
      await page.getByTestId('editor-rain').selectOption('5');
      await expect(page.getByTestId('editor-weather')).toHaveText('d20 : 1 à 4 pluie, 5 à 13 nuageux, 14 à 20 soleil.');
      await expect(page.locator('.editor__title')).toHaveText('Petit essai');
      await check(page, 'circuit');
      await shot('circuit');

      // 5. simulation: 100 AI races
      await page.getByTestId('editor-laps').selectOption('1');
      await page.getByTestId('editor-test').click();
      await expect(page.getByTestId('sim-rounds')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId('sim-corners').locator('tbody tr')).toHaveCount(4);
      await check(page, 'simulation');
      await shot('simulation');
      await page.getByRole('button', { name: 'Fermer' }).click();

      // 6. export, start a new circuit, import the file back
      const download = page.waitForEvent('download');
      await page.getByTestId('editor-export').click();
      const file = await download;
      expect(file.suggestedFilename()).toBe('petit-essai.json');
      const path = info.outputPath('petit-essai.json');
      await file.saveAs(path);
      const exported = JSON.parse(readFileSync(path, 'utf8')) as TrackDef & { editor: { name: string } };
      expect(exported.version).toBe(1);
      expect(exported.theme).toBe('desert');
      expect(exported.weather).toEqual({ rain: 5, sun: 13 });
      expect(exported.editor.name).toBe('Petit essai');
      expect(validateTrackDef(exported)).toEqual([]);
      await page.getByTestId('editor-new').click();
      await page.getByTestId('editor-new-confirm').click();
      await expect(page.locator('.editor__title')).toHaveText('Nouveau circuit');
      await page.getByTestId('editor-import').click();
      await page.getByTestId('editor-import-text').fill('{"cells": []}');
      await page.getByRole('button', { name: 'Importer le texte' }).click();
      await expect(page.getByTestId('editor-import-error')).toContainText('pas été dessiné avec l’éditeur');
      await check(page, 'import');
      await shot('import');
      await page.getByTestId('editor-import-file').setInputFiles(path);
      await expect(page.locator('.editor__title')).toHaveText('Petit essai');
      await expect(page.getByTestId('editor-status')).toHaveText('Circuit valide');
      expect(await ed(page, (e) => e.def())).toEqual(exported);

      // 7. race on it: one lap against one AI, then back to the editor
      await page.getByTestId('editor-race').click();
      await page.waitForFunction(() => '__game' in window);
      expect(await page.evaluate(() => (window as unknown as Race).__game.state.track.lapLength)).toBe(n);
      let shotRace = false;
      for (let i = 0; i < 400 && !(await page.getByTestId('ranking').isVisible()); i++) {
        const s = await page.evaluate(() => (window as unknown as Race).__game.state);
        if (s.status === 'finished') {
          await page.getByTestId('ranking').waitFor();
          break;
        }
        if (!(await page.evaluate(() => (window as unknown as Race).__screen.isHumanTurn()))) {
          await page.waitForTimeout(50); // the AI is playing
          continue;
        }
        if (!shotRace && s.phase === 'adjust') {
          shotRace = true;
          await shot('race');
        }
        await humanStep(page);
      }
      await expect(page.getByTestId('ranking').locator('li')).toHaveCount(2);
      await shot('ranking');
      await page.getByRole('button', { name: 'Menu' }).click();
      await expect(page.getByTestId('editor')).toBeVisible();
      await expect(page.locator('.editor__title')).toHaveText('Petit essai');
      expect(errors).toEqual([]);
    });
  });
}

for (const size of sizes) {
  test.describe(`circuits originaux - ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, reducedMotion: 'reduce' });
    test.setTimeout(90_000);

    for (const id of ['dunes', 'pins', 'col']) {
      test(`${id} : valide dans l’éditeur, et une course démarre dessus avec son décor`, async ({ page }) => {
        const errors = watchConsole(page);
        await page.goto(`/editor?load=${id}&aiDelay=0&seed=3`);
        await page.waitForFunction(() => '__editor' in window);
        await page.getByTestId('editor-tab-zones').click();
        await expect(page.getByTestId('editor-status')).toHaveText('Circuit valide');
        await check(page, `éditeur ${id}`);
        await page.screenshot({ path: `e2e/screenshots/circuit-${id}-${size.name}-editor.png` });
        await page.getByTestId('editor-ais').selectOption('3');
        await page.getByTestId('editor-race').click();
        await page.waitForFunction(() => '__game' in window);
        await expect(page.getByRole('button', { name: /^(Lancer|Départ)$/ })).toBeVisible();
        await page.getByRole('button', { name: 'Tout voir' }).click();
        await page.waitForTimeout(200);
        await check(page, `course ${id}`);
        await page.screenshot({ path: `e2e/screenshots/circuit-${id}-${size.name}-race.png` });
        expect(errors).toEqual([]);
      });
    }
  });
}
