import { expect, test, type Page } from '@playwright/test';
import { levelFromXp, raceXp } from '../src/data/xp';
import { expectContrast, expectNoHorizontalOverflow, expectUsableLayout, injectSave, sizes, watchConsole } from './helpers';

type W = {
  __profile: { get(): { xp: number; pass: { points: number } } };
  __game: { state: { cars: { id: string; wear: Record<string, number>; retired: string | null }[] }; autoplay(me?: string): void };
};

const base = (over: object = {}) => ({
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
  campaign: 0,
  claimed: [],
  ...over,
});

async function audit(page: Page, where: string) {
  await expectUsableLayout(page, where);
  await expectNoHorizontalOverflow(page, where);
  await expectContrast(page, where);
}

/** Starts the default 4-player race (human + AIs) and plays it to the end. */
async function finishRace(page: Page) {
  await page.getByTestId('open-setup').click();
  await page.getByTestId('offline-race').click();
  await page.getByRole('button', { name: 'Démarrer la course' }).click();
  await page.waitForFunction(() => '__game' in window);
  await page.evaluate(() => (window as unknown as W).__game.autoplay('hard'));
  await expect(page.getByTestId('ranking')).toBeVisible();
}

for (const size of sizes) {
  test.describe(`XP de course ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, reducedMotion: 'reduce' });
    test.setTimeout(120_000);

    test('la course rapporte l’XP de sa place, la barre de niveau suit', async ({ page }) => {
      const errors = watchConsole(page);
      await injectSave(page, base({ xp: 90 }));
      await page.goto('/?seed=3');
      await expect(page.getByTestId('level-text')).toHaveText('Niv. 1');
      await finishRace(page);
      const info = await page.evaluate(() => {
        const g = (window as unknown as W).__game;
        const rank = Number(document.querySelector('[data-testid="ranking"] [data-car="p1"] .rank')?.textContent);
        const car = g.state.cars.find((c) => c.id === 'p1')!;
        const profile = (window as unknown as W).__profile.get();
        return { rank, players: g.state.cars.length, retired: car.retired !== null, clean: Object.values(car.wear).every((w) => w > 0), xp: profile.xp, pass: profile.pass.points };
      });
      const gain = raceXp({ rank: info.rank, players: info.players, retired: info.retired, clean: info.clean, vsBots: true });
      expect(info.xp).toBe(90 + gain);
      await expect(page.getByTestId('xp-gain-text')).toHaveText(`+${gain} XP`);
      // the season pass: 30 points for a win, 10 for a finished race, nothing when retired
      const passPoints = info.retired ? 0 : info.rank === 1 ? 30 : 10;
      expect(info.pass).toBe(passPoints);
      if (passPoints > 0) await expect(page.getByTestId('rewards')).toContainText(`🏁 +${passPoints} points de passe`);
      const lv = levelFromXp(90 + gain);
      await expect(page.getByTestId('end-level')).toHaveAttribute('aria-label', `Niveau ${lv.level}`);
      await expect(page.getByTestId('end-xp')).toHaveAttribute('aria-valuenow', String(lv.into));
      await expect(page.getByTestId('end-xp')).toHaveAttribute('aria-valuemax', String(lv.needed));
      if (lv.level > 1) await expect(page.getByTestId('toast')).toContainText(`Niveau ${lv.level}`);
      await audit(page, `xp-fin-${size.name}`);
      await page.screenshot({ path: `e2e/screenshots/xp-end-${size.name}.png` });
      // back at the menu the top bar shows the new level and the profile has the bar too
      await page.getByRole('button', { name: 'Menu' }).click();
      await expect(page.getByTestId('level-text')).toHaveText(`Niv. ${lv.level}`);
      await page.getByTestId('avatar').click();
      await expect(page.getByTestId('profile-level')).toHaveAttribute('aria-label', `Niveau ${lv.level}`);
      await expect(page.getByTestId('profile-xp')).toHaveAttribute('aria-valuenow', String(lv.into));
      await audit(page, `xp-profil-${size.name}`);
      await page.screenshot({ path: `e2e/screenshots/xp-profile-${size.name}.png` });
      expect(errors).toEqual([]);
    });
  });
}
