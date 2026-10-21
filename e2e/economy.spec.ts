import { expect, test, type Page } from '@playwright/test';
import { expectContrast, expectNoHorizontalOverflow, expectUsableLayout, goTab, injectSave, watchConsole } from './helpers';

type SaveView = { gold: number; gems: number; xp: number; campaign: { stars: number[] }; claimed: string[]; slots: ({ readyAt: number } | null)[]; packs: unknown[] };
type W = {
  __profile: { get(): SaveView };
  __sound: { enabled(): boolean; played(): number };
  __game: { state: { phase: string; cars: unknown[]; pending: { options: string[] } }; dispatch(a: object): void };
  __screen: { isHumanTurn(): boolean };
};
const profile = (page: Page) => page.evaluate(() => (window as unknown as W).__profile.get());
const text = (page: Page, id: string) => page.getByTestId(id).locator('.kit-badge__text').textContent();

const base = (over: object = {}) => ({
  version: 3,
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

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
test.setTimeout(120_000);

async function audit(page: Page, where: string) {
  await expectUsableLayout(page, where);
  await expectNoHorizontalOverflow(page, where);
  await expectContrast(page, where);
}

test.describe('boutique', () => {
  test('acheter un paquet débite l’or et le place dans un emplacement avec son timer', async ({ page }) => {
    const errors = watchConsole(page);
    await injectSave(page, base());
    await page.goto('/?seed=5');
    await goTab(page, 'shop');
    await page.locator('[data-buy="pack-1"]').click();
    await expect(page.getByTestId('toast')).toContainText('acheté');
    expect(await text(page, 'gold')).toBe('380');
    const p = await profile(page);
    expect(p.slots.filter(Boolean)).toHaveLength(1);
    await goTab(page, 'race');
    await expect(page.locator('[data-slot-index="0"]')).toHaveAttribute('data-state', 'locked');
    await expect(page.locator('[data-slot-index="0"] .slot-card__time')).toHaveText(/^(29:5\d|30:00)$/);
    expect(errors).toEqual([]);
  });

  test('un achat trop cher est désactivé', async ({ page }) => {
    await injectSave(page, base({ gold: 119, gems: 7 }));
    await page.goto('/?seed=5');
    await goTab(page, 'shop');
    await expect(page.locator('[data-buy="pack-1"]')).toBeDisabled();
    await expect(page.locator('[data-buy="pack-instant"]')).toBeDisabled();
    await expect(page.locator('[data-buy="fragments-40"]')).toBeDisabled();
  });

  test('les gemmes achètent un paquet prêt immédiatement', async ({ page }) => {
    await injectSave(page, base());
    await page.goto('/?seed=5');
    await goTab(page, 'shop');
    await page.locator('[data-buy="pack-instant"]').click();
    expect(await text(page, 'gems')).toBe('12');
    await goTab(page, 'race');
    await expect(page.locator('[data-slot-index="0"]')).toHaveAttribute('data-state', 'ready');
    await expect(page.locator('[data-tab-button="race"] .tab-badge')).toHaveText('1');
  });
});

test.describe('quêtes', () => {
  test('une quête terminée se récupère une fois, le badge suit', async ({ page }) => {
    const errors = watchConsole(page);
    await injectSave(page, base({ races: 1, wins: 1, packsOpened: 1 }));
    await page.goto('/?seed=5');
    await expect(page.locator('[data-tab-button="quests"] .tab-badge')).toHaveText('3');
    await goTab(page, 'quests');
    await audit(page, 'quests');
    await expect(page.locator('[data-quest="races-5"] [data-claim]')).toBeDisabled();
    await page.locator('[data-claim="races-1"]').click();
    expect(await text(page, 'gold')).toBe('550');
    await expect(page.locator('[data-quest="races-1"]')).toContainText('Récupérée');
    await expect(page.locator('[data-tab-button="quests"] .tab-badge')).toHaveText('2');
    await page.locator('[data-claim="wins-1"]').click();
    expect(await text(page, 'gems')).toBe('22');
    expect((await profile(page)).claimed).toEqual(['races-1', 'wins-1']);
    expect(errors).toEqual([]);
  });

  test('une récompense d’XP peut faire monter de niveau', async ({ page }) => {
    await injectSave(page, base({ xp: 60, packsOpened: 5 }));
    await page.goto('/?seed=5');
    await expect(page.getByTestId('level-text')).toHaveText('Niv. 1');
    await goTab(page, 'quests');
    await page.locator('[data-claim="packs-5"]').click(); // +60 XP: 120 => level 2
    await expect(page.getByTestId('toast')).toContainText('Niveau 2');
    await expect(page.getByTestId('level-text')).toHaveText('Niv. 2');
    await expect(page.getByTestId('level')).toHaveAttribute('aria-label', 'Niveau 2');
    await expect(page.getByTestId('xp')).toHaveAttribute('aria-valuenow', '20');
  });
});

test.describe('paquets et timers', () => {
  const T0 = new Date('2026-03-01T10:00:00Z').getTime();

  test('les compte à rebours avancent, un paquet devient prêt, le badge suit', async ({ page }) => {
    const errors = watchConsole(page);
    await page.clock.install({ time: T0 });
    await page.clock.pauseAt(T0 + 1); // the page may load slowly on a busy machine: the countdowns only move when the test runs the clock
    await injectSave(page, base({ slots: [{ readyAt: T0 + 90_000 }, { readyAt: T0 + 20 * 60_000 }, null, null], gems: 20 }));
    await page.goto('/?seed=5');
    const slot0 = page.locator('[data-slot-index="0"]');
    await expect(slot0.locator('.slot-card__time')).toHaveText('01:30');
    await expect(page.locator('[data-slot-index="1"] .slot-card__time')).toHaveText('20:00');
    await expect(page.locator('[data-slot-index="2"]')).toHaveAttribute('data-state', 'empty');
    await expect(page.locator('[data-tab-button="race"] .tab-badge')).toBeHidden();
    await page.clock.runFor(61_000);
    await expect(slot0.locator('.slot-card__time')).toHaveText('00:29');
    await page.clock.runFor(30_000);
    await expect(slot0).toHaveAttribute('data-state', 'ready');
    await expect(slot0.locator('.slot-card__time')).toHaveText('OUVRIR');
    await expect(page.locator('[data-tab-button="race"] .tab-badge')).toHaveText('1');
    expect(errors).toEqual([]);
  });

  test('un paquet en cours s’ouvre tout de suite contre des gemmes', async ({ page }) => {
    await page.clock.install({ time: T0 });
    await page.clock.pauseAt(T0 + 1); // the page may load slowly on a busy machine: the countdowns only move when the test runs the clock
    await injectSave(page, base({ slots: [{ readyAt: T0 + 90_000 }, { readyAt: T0 + 12 * 3600_000, tier: 'legendary' }, null, null], gems: 20 }));
    await page.goto('/?seed=5');
    // 12 h cost 72 gems: too much
    await page.locator('[data-slot-index="1"]').click();
    await expect(page.getByTestId('unlock-modal')).toBeVisible();
    await expect(page.getByTestId('skip-slot')).toBeDisabled();
    await expect(page.getByTestId('skip-slot')).toContainText('72');
    await page.getByRole('button', { name: 'Plus tard' }).click();
    // 1 min 30 s cost 1 gem
    await page.locator('[data-slot-index="0"]').click();
    await expect(page.getByTestId('skip-slot')).toContainText('1');
    await page.clock.runFor(2000);
    await expect(page.getByTestId('unlock-time')).toHaveText('01:28');
    await page.getByTestId('skip-slot').click();
    await expect(page.getByTestId('pack-reveal')).toBeVisible();
    expect((await profile(page)).gems).toBe(19);
  });
});

test.describe('son', () => {
  test('les clics font du bruit tant que le son est activé, le choix est conservé', async ({ page }) => {
    await page.goto('/?seed=5');
    const played = () => page.evaluate(() => (window as unknown as W).__sound.played());
    const toggle = page.getByTestId('sound-toggle');
    await expect(toggle).toHaveAttribute('aria-label', 'Son activé');
    const before = await played();
    await page.getByTestId('open-setup').click();
    await page.getByTestId('offline-race').click();
    expect(await played()).toBeGreaterThan(before);
    await page.getByRole('button', { name: 'Fermer' }).click();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-label', 'Son coupé');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    const muted = await played();
    await page.getByTestId('open-setup').click();
    await page.getByTestId('offline-race').click();
    await page.getByRole('button', { name: 'Fermer' }).click();
    await goTab(page, 'shop');
    expect(await played()).toBe(muted);

    await page.reload();
    await expect(page.getByTestId('sound-toggle')).toHaveAttribute('aria-label', 'Son coupé');
    expect(await page.evaluate(() => (window as unknown as W).__sound.enabled())).toBe(false);
    await page.getByTestId('sound-toggle').click();
    await expect(page.getByTestId('sound-toggle')).toHaveAttribute('aria-label', 'Son activé');
  });
});
