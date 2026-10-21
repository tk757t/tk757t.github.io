import { expect, test, type Page } from '@playwright/test';
import { expectContrast, expectNoHorizontalOverflow, expectUsableLayout, humanStep, sizes, watchConsole } from './helpers';

type W = { __game?: { state: { status: string } }; __screen: { isHumanTurn(): boolean } };

/** One step of the person's turn; the AIs play by themselves, so it waits when it is not the person's turn. */
async function play(page: Page): Promise<void> {
  if (await page.evaluate(() => (window as unknown as W).__screen.isHumanTurn())) await humanStep(page);
  else await page.waitForTimeout(40);
}

for (const size of sizes) {
  test.describe(`journal de course (${size.name})`, () => {
    test.use({ reducedMotion: 'reduce' });
    test.setTimeout(180_000);

    test('le journal raconte la course, se filtre, suit la course et reste lisible', async ({ page }) => {
      const errors = watchConsole(page);
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/?seed=5&aiDelay=0');
      await page.getByTestId('open-setup').click();
      await page.getByTestId('start-from-setup').click();
      await page.waitForFunction(() => '__game' in window);

      // before anything is played the journal says so
      await page.getByTestId('race-journal-open').click();
      await expect(page.getByTestId('journal-empty')).toContainText('Rien ne s’est encore passé');
      await page.getByTestId('race-journal').getByRole('button', { name: 'Fermer' }).last().click();
      await expect(page.getByTestId('race-journal')).toHaveCount(0);

      // play some turns, then read the journal
      for (let i = 0; i < 80; i++) {
        if (await page.getByTestId('ranking').isVisible()) break;
        await play(page);
      }
      await page.getByTestId('race-journal-open').click();
      const list = page.getByTestId('journal-list');
      await expect(list.locator('li.journal__line').first()).toBeVisible();
      await expect(list.locator('h3.journal__round').first()).toContainText('Manche 1');
      expect(await list.locator('li.journal__line').count()).toBeGreaterThan(5);
      await expect(list.locator('li[data-kind="move"]').first()).toContainText('Avance de');
      await expectUsableLayout(page, 'journal');
      await expectNoHorizontalOverflow(page, 'journal');
      await expectContrast(page, 'journal');
      await page.screenshot({ path: `e2e/screenshots/journal-${size.name}-all.png` });

      // the filters: mine only, then the incidents (nothing, or only incidents and wear)
      const all = await list.locator('li.journal__line').count();
      await page.locator('[data-filter="mine"]').click();
      const mine = await list.locator('li.journal__line').count();
      expect(mine).toBeGreaterThan(0);
      expect(mine).toBeLessThanOrEqual(all);
      await expect(list.locator('li.journal__line--mine')).toHaveCount(mine);
      await page.locator('[data-filter="incident"]').click();
      for (const kind of await list.locator('li.journal__line').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.kind))) expect(['incident', 'wear']).toContain(kind);
      await page.locator('[data-filter="overtake"]').click();
      for (const kind of await list.locator('li.journal__line').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.kind))) expect(kind).toBe('overtake');
      await page.locator('[data-filter="all"]').click();
      expect(await list.locator('li.journal__line').count()).toBeGreaterThanOrEqual(all);
      await page.getByTestId('race-journal').getByRole('button', { name: 'Fermer' }).last().click();

      // finish the race: the ranking has its journal button, and the journal holds the end of the race
      for (let i = 0; i < 600; i++) {
        if (await page.getByTestId('ranking').isVisible()) break;
        await play(page);
      }
      await expect(page.getByTestId('ranking')).toBeVisible();
      await page.getByTestId('ranking-journal').click();
      await expect(page.getByTestId('journal-list').locator('li[data-kind="lap"]').last()).toContainText(/ligne|Tour/);
      await page.screenshot({ path: `e2e/screenshots/journal-${size.name}-end.png` });
      expect(errors).toEqual([]);
    });
  });
}
