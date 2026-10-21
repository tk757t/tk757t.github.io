import { expect, test, type Page } from '@playwright/test';
import { expectContrast, expectNoHorizontalOverflow, expectUsableLayout, goTab, injectSave, sizes, watchConsole } from './helpers';

type Save = { gold: number; gems: number; xp: number; owned: Record<string, number>; campaign: { stars: number[] }; packsOpened: number; version: number };
type W = {
  __profile: { get(): Save };
  __game: { state: { status: string; cars: { id: string; retired: string | null; position: string | null }[]; turn: { carId: string } | null }; autoplay(me?: string): void; setState(s: unknown): void; stats(): { tireLoss: number } };
};
const profile = (page: Page) => page.evaluate(() => (window as unknown as W).__profile.get());

const freshSave = (over: object = {}) => ({
  version: 4,
  packs: 0,
  slots: [null, null, null, null],
  fragments: 0,
  gold: 500,
  gems: 20,
  xp: 0,
  owned: {},
  loadout: { parts: {} },
  rng: 5,
  races: 0,
  wins: 0,
  packsOpened: 0,
  upgrades: 0,
  campaign: { stars: [] },
  claimed: [],
  ...over,
});

async function audit(page: Page, where: string) {
  await expectUsableLayout(page, where);
  await expectNoHorizontalOverflow(page, where);
  await expectContrast(page, where);
}

/** Every thumbnail of the map is on screen and really loaded (not a broken picture). */
async function expectThumbnails(page: Page, count: number) {
  const imgs = page.locator('[data-testid="road"] .thumb__img');
  await expect(imgs).toHaveCount(count);
  for (let i = 0; i < count; i++) {
    await expect.poll(() => imgs.nth(i).evaluate((e) => (e as HTMLImageElement).naturalWidth), { message: `thumbnail ${i}` }).toBeGreaterThan(100);
  }
}

for (const size of sizes) {
  test.describe(`campagne - ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, reducedMotion: 'reduce' });
    test.setTimeout(240_000);

    test('la carte : trois niveaux, miniatures lisibles, déblocage dans l’ordre, étoiles', async ({ page }) => {
      const errors = watchConsole(page);
      await injectSave(page, freshSave());
      await page.goto('/?seed=5');
      await goTab(page, 'campaign');
      const card = (i: number) => page.locator(`[data-stage-card="${i}"]`);
      await expect(card(0)).toHaveAttribute('data-status', 'next');
      await expect(card(1)).toHaveAttribute('data-status', 'locked');
      await expect(card(2)).toHaveAttribute('data-status', 'locked');
      await expect(page.locator('[data-stage="1"]')).toHaveCount(0); // a locked level has no play button
      await expect(page.getByTestId('campaign-progress')).toContainText('0 / 9');
      await expectThumbnails(page, 3);
      await audit(page, 'campaign map new');
      await page.screenshot({ path: `e2e/screenshots/campaign-${size.name}-map-new.png`, fullPage: false });

      // a save with progress: stars shown, the next level open
      await page.evaluate((s) => localStorage.setItem('4mules.save', s), JSON.stringify(freshSave({ campaign: { stars: [3, 1] } })));
      await page.reload();
      await goTab(page, 'campaign');
      await expect(card(0)).toHaveAttribute('data-status', 'cleared');
      await expect(card(1)).toHaveAttribute('data-status', 'cleared');
      await expect(card(2)).toHaveAttribute('data-status', 'next');
      await expect(page.getByTestId('level-stars-0')).toHaveAttribute('data-stars', '3');
      await expect(page.getByTestId('level-stars-1')).toHaveAttribute('data-stars', '1');
      await expect(page.getByTestId('level-stars-2')).toHaveAttribute('data-stars', '0');
      await expect(page.getByTestId('campaign-progress')).toContainText('4 / 9');
      await expectThumbnails(page, 3);
      await audit(page, 'campaign map progress');
      await page.screenshot({ path: `e2e/screenshots/campaign-${size.name}-map-progress.png` });

      // the briefing of a level: circuit, rivals, the three objectives, the reward
      await page.locator('[data-stage="2"]').click();
      const modal = page.getByTestId('level-briefing');
      await expect(modal).toBeVisible();
      await expect(modal.getByTestId('rival')).toHaveCount(3);
      await expect(modal.getByTestId('level-goals').locator('li')).toHaveCount(3);
      await expect(modal).toContainText('Ovale des épingles');
      await expect(modal).toContainText('pièce garantie');
      await audit(page, 'level briefing');
      await page.screenshot({ path: `e2e/screenshots/campaign-${size.name}-briefing.png` });
      expect(errors).toEqual([]);
    });

    test('les trois niveaux à la suite : déblocage, étoiles, récompenses, persistance après rechargement', async ({ page }) => {
      const errors = watchConsole(page);
      await injectSave(page, freshSave());
      await page.goto('/?seed=7&aiDelay=0');
      const before = await profile(page);
      const names = ['Débutant', 'Challenger', 'Champion'];
      const expectedOpponents = [1, 2, 3];
      const shown: number[] = [];
      for (let level = 0; level < 3; level++) {
        await goTab(page, 'campaign');
        await expect(page.locator(`[data-stage-card="${level}"]`)).toHaveAttribute('data-status', 'next');
        if (level + 1 < 3) await expect(page.locator(`[data-stage-card="${level + 1}"]`)).toHaveAttribute('data-status', 'locked');
        await page.locator(`[data-stage="${level}"]`).click();
        await expect(page.getByTestId('level-briefing')).toContainText(names[level]);
        await page.getByTestId('play-level').click();
        // (the debug object of the previous race is still there until the new one replaces it)
        await page.waitForFunction((n) => (window as unknown as W).__game?.state.cars.length === n && (window as unknown as W).__game.state.status === 'racing', 1 + expectedOpponents[level]);
        // the opponents carry the names of their drivers, not "Joueur n"
        await expect(page.getByTestId('turn-chip')).not.toContainText('Joueur');
        await page.screenshot({ path: `e2e/screenshots/campaign-${size.name}-race-level${level + 1}.png` });

        // debug mode: the whole race is played at once (the human seat by the hard AI)
        await page.evaluate(() => (window as unknown as W).__game.autoplay('hard'));
        await expect(page.getByTestId('stars')).toBeVisible({ timeout: 30_000 });
        const stars = Number(await page.getByTestId('stars').getAttribute('data-stars'));
        shown.push(stars);
        // what the three objective lines say adds up to the stars shown
        await expect(page.getByTestId('goals').locator('li')).toHaveCount(3);
        expect(await page.getByTestId('goals').locator('li[data-met="true"]').count()).toBe(stars);
        expect(stars, `level ${level + 1} must at least be finished`).toBeGreaterThanOrEqual(1);
        await expect(page.getByTestId('rewards')).toContainText('Niveau terminé');
        await audit(page, `victory level ${level + 1}`);
        await page.screenshot({ path: `e2e/screenshots/campaign-${size.name}-victory-level${level + 1}.png` });

        // the saved progress has the stars; the reward pack opens with the reveal animation
        expect((await profile(page)).campaign.stars[level]).toBe(stars);
        const packsBefore = (await profile(page)).packsOpened;
        await page.getByTestId('open-reward').click();
        await expect(page.getByTestId('pack-reveal')).toBeVisible();
        for (let c = 0; c < 5; c++) {
          await page.getByRole('button', { name: 'Révéler', exact: true }).click();
          await page.getByRole('button', { name: c < 4 ? 'Suivant' : 'Terminer' }).click();
        }
        await expect(page.getByTestId('loot').locator('li')).toHaveCount(5);
        if (level === 0) await page.screenshot({ path: `e2e/screenshots/campaign-${size.name}-reward-level1.png` });
        await page.getByRole('button', { name: 'Continuer' }).click();
        await expect(page.getByTestId('open-reward')).toContainText('Récompense ouverte');
        expect((await profile(page)).packsOpened).toBe(packsBefore); // already counted when the reward was earned
        await page.getByRole('button', { name: 'Carte' }).click();
        await expect(page.locator('.pager')).toHaveAttribute('data-tab', 'campaign');
        await expect(page.locator(`[data-stage-card="${level}"]`)).toHaveAttribute('data-status', 'cleared');
        await expect(page.getByTestId(`level-stars-${level}`)).toHaveAttribute('data-stars', String(stars));
        if (level + 1 < 3) await expect(page.locator(`[data-stage-card="${level + 1}"]`)).toHaveAttribute('data-status', 'next');
      }

      // rewards: gold, gems and XP of the three levels, plus the guaranteed part of the last pack
      const after = await profile(page);
      expect(after.gold).toBeGreaterThan(before.gold + 150 + 300 + 600);
      expect(after.gems).toBeGreaterThanOrEqual(before.gems + 5 + 10 + 20);
      expect(after.xp).toBeGreaterThan(before.xp + 60 + 120 + 240);
      expect(after.packsOpened).toBe(before.packsOpened + 3);
      expect(after.owned['eng-v8']).toBeGreaterThanOrEqual(1);
      expect(after.campaign.stars).toEqual(shown);
      await audit(page, 'campaign map done');
      await page.screenshot({ path: `e2e/screenshots/campaign-${size.name}-map-done.png` });

      // persistence: after a reload the stars, the unlocks and the collection are still there
      await page.reload();
      await goTab(page, 'campaign');
      for (let level = 0; level < 3; level++) {
        await expect(page.locator(`[data-stage-card="${level}"]`)).toHaveAttribute('data-status', 'cleared');
        await expect(page.getByTestId(`level-stars-${level}`)).toHaveAttribute('data-stars', String(shown[level]));
      }
      const reloaded = await profile(page);
      expect(reloaded.campaign.stars).toEqual(shown);
      expect(reloaded.version).toBe(5);
      expect(reloaded.owned['eng-v8']).toBeGreaterThanOrEqual(1);
      expect(errors).toEqual([]);
    });

    test('une course abandonnée ne rapporte aucune étoile et ne débloque pas la suite', async ({ page }) => {
      const errors = watchConsole(page);
      await injectSave(page, freshSave());
      await page.goto('/?seed=9&aiDelay=0');
      const before = await profile(page);
      await goTab(page, 'campaign');
      await page.locator('[data-stage="0"]').click();
      await page.getByTestId('play-level').click();
      await page.waitForFunction(() => '__game' in window);
      // the player's car is out before the first turn: the other car finishes alone
      await page.evaluate(() => {
        const g = (window as unknown as W).__game;
        const s = JSON.parse(JSON.stringify(g.state));
        s.cars[0].retired = 'engine';
        s.cars[0].position = null;
        s.cars[0].retiredRound = 0;
        s.cars[0].retiredProgress = 0;
        s.turn.carId = 'p2';
        g.setState(s);
        g.autoplay('hard');
      });
      await expect(page.getByTestId('stars')).toHaveAttribute('data-stars', '0', { timeout: 30_000 });
      await expect(page.getByTestId('open-reward')).toHaveCount(0);
      await audit(page, 'defeat');
      await page.screenshot({ path: `e2e/screenshots/campaign-${size.name}-defeat.png` });
      const after = await profile(page);
      expect(after.campaign.stars.every((s) => s === 0)).toBe(true);
      expect(after.packsOpened).toBe(before.packsOpened);
      await page.getByRole('button', { name: 'Carte' }).click();
      await expect(page.locator('[data-stage-card="0"]')).toHaveAttribute('data-status', 'next');
      await expect(page.locator('[data-stage-card="1"]')).toHaveAttribute('data-status', 'locked');
      expect(errors).toEqual([]);
    });
  });
}
