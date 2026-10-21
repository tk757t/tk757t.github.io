import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_CONFIG } from '../src/engine/config';
import { getPart } from '../src/data/parts/catalogue';
import { modsForLoadout } from '../src/data/parts/effects';
import { SLOT_LABELS } from '../src/data/parts/types';
import { expectNoHorizontalOverflow, expectUsableLayout, goTab, injectSave, sizes, watchConsole, humanStep } from './helpers';

type SaveView = {
  packs: unknown[];
  slots: ({ readyAt: number } | null)[];
  fragments: number;
  owned: Record<string, number>;
  loadout: { parts: Record<string, string> };
};
type W = {
  __profile: { get(): SaveView; status(): string };
  __game: { state: { phase: string; status: string; cars: { rerolls: number; freeStops: number; maxWear: Record<string, number>; mods: unknown }[] } };
};

const profile = (page: Page) => page.evaluate(() => (window as unknown as W).__profile.get());

async function shot(page: Page, size: string, label: string) {
  await expectUsableLayout(page, label);
  await expectNoHorizontalOverflow(page, label);
  await page.screenshot({ path: `e2e/screenshots/parts-${size}-${label}.png` });
}

/** Opens the race settings and sets one human player on one lap. */
async function soloSetup(page: Page) {
  await page.getByTestId('open-setup').click();
  await page.getByRole('button', { name: '1 joueur', exact: true }).click();
}

/** Points of a car at the start of a 2-laps race (the default), before the equipment (§2). */
const BASE = DEFAULT_CONFIG.startPoints.lap2;

const STARTER = {
  version: 3,
  packs: 0,
  slots: [{ readyAt: 0 }, { readyAt: 0 }, { readyAt: 0 }, null],
  fragments: 120,
  gold: 500,
  gems: 20,
  xp: 0,
  owned: { 'tir-pro': 3, 'wng-drs': 1, 'brk-carbon': 1, 'eng-hybrid': 2, 'eng-stock': 1, 'paint-gold': 1, 'num-42': 1, 'hlm-red': 1 },
  loadout: { parts: { tires: 'tir-pro', wing: 'wng-drs', brakes: 'brk-carbon', engine: 'eng-hybrid' }, paint: 'paint-gold', number: 'num-42', helmet: 'hlm-red' },
  rng: 99,
  races: 0,
  wins: 0,
  packsOpened: 0,
  upgrades: 0,
  campaign: 0,
  claimed: [],
};

for (const size of sizes) {
  test.describe(`pièces - ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });
    test.setTimeout(120_000);

    test('ouvrir un paquet, équiper une pièce, recharger, courir avec les stats modifiées', async ({ page }) => {
      const errors = watchConsole(page);
      await page.goto('/?seed=77');
      await expect(page.locator('[data-slot-index][data-state="ready"]')).toHaveCount(3);
      await shot(page, size.name, 'home');

      // ---- open a pack, card by card
      await page.locator('[data-slot-index="0"]').click();
      await expect(page.getByTestId('pack-reveal')).toBeVisible();
      for (let i = 0; i < 3; i++) {
        await expect(page.getByTestId('reveal-progress')).toHaveText(`Carte ${i + 1}/3`);
        if (i === 0) await shot(page, size.name, 'reveal-facedown');
        await page.getByRole('button', { name: 'Révéler', exact: true }).click();
        await expect(page.getByTestId('reveal-card')).toHaveClass(/flipped/);
        if (i === 0) {
          await page.waitForTimeout(280); // mid-flip frame
          await page.screenshot({ path: `e2e/screenshots/parts-${size.name}-reveal-flipping.png` });
        }
        await page.waitForTimeout(700);
        if (i === 0 || i === 2) await shot(page, size.name, `reveal-card${i + 1}`);
        await page.getByRole('button', { name: i === 2 ? 'Terminer' : 'Suivant' }).click();
      }
      await expect(page.getByTestId('loot').locator('li')).toHaveCount(3);
      await shot(page, size.name, 'reveal-summary');

      const afterPack = await profile(page);
      expect(afterPack.slots.filter(Boolean)).toHaveLength(2);
      const ownedParts = Object.keys(afterPack.owned).filter((id) => getPart(id));
      expect(ownedParts.length, 'the seeded pack contains at least one part').toBeGreaterThan(0);
      const partId = ownedParts[0];
      const part = getPart(partId)!;

      await page.getByRole('button', { name: 'Continuer' }).click();
      await expect(page.locator('[data-slot-index][data-state="ready"]')).toHaveCount(2);

      // ---- equip it in the garage
      await goTab(page, 'garage');
      await shot(page, size.name, 'garage-empty');
      const slot = page.locator(`[data-slot="${part.slot}"]`);
      await expect(slot).toContainText('Vide');
      await slot.click();
      await expect(page.getByTestId('sheet')).toBeVisible();
      await page.locator(`[data-item="${partId}"]`).click();
      await expect(page.getByTestId('preview')).toBeVisible();
      // the preview shows the bars before and after, and the power that comes out of it
      await expect(page.getByTestId('preview-sheet').locator('[data-stat-bar]')).toHaveCount(6);
      await expect(page.getByTestId('preview-sheet').locator('.stat-row__note').filter({ hasText: '→' }).first()).toBeVisible();
      await shot(page, size.name, 'garage-sheet-preview');
      await page.getByTestId('sheet').getByRole('button', { name: 'Équiper', exact: true }).click();
      await expect(page.getByTestId('sheet')).toHaveCount(0);
      await expect(slot).toContainText(part.name);
      await shot(page, size.name, 'garage-equipped');
      expect((await profile(page)).loadout.parts[part.slot]).toBe(partId);

      // ---- reload: the equipment is still there
      await page.reload();
      await page.waitForFunction(() => '__profile' in window);
      expect(await page.evaluate(() => (window as unknown as W).__profile.status())).toBe('loaded');
      await goTab(page, 'garage');
      await expect(page.locator(`[data-slot="${part.slot}"]`)).toContainText(part.name);
      await expect(page.locator(`[data-slot="${part.slot}"]`)).toHaveAttribute('aria-label', `${SLOT_LABELS[part.slot]} : ${part.name}`);
      const reloaded = await profile(page);
      expect(reloaded.loadout.parts[part.slot]).toBe(partId);
      expect(reloaded.slots.filter(Boolean)).toHaveLength(2);
      expect(reloaded.owned).toEqual(afterPack.owned);
      await shot(page, size.name, 'garage-after-reload');

      // ---- the race uses the modified stats
      await goTab(page, 'race');
      await soloSetup(page);
      await expect(page.getByTestId('use-gear')).toContainText('activé · 1 pièce');
      await page.getByRole('button', { name: 'Démarrer la course' }).click();
      await page.waitForFunction(() => '__game' in window);
      const car = await page.evaluate(() => (window as unknown as W).__game.state.cars[0]);
      const expected = modsForLoadout(reloaded.loadout, reloaded.owned);
      expect(car.mods).toEqual(expect.objectContaining(JSON.parse(JSON.stringify(expected))));
      for (const [cat, bonus] of Object.entries(expected.wearBonus)) {
        const max = BASE[cat as keyof typeof BASE] + (bonus ?? 0);
        expect(car.maxWear[cat]).toBe(max);
        await expect(page.locator(`[data-cat="${cat}"]`)).toContainText(`${max}/${max}`);
      }
      expect(car.rerolls).toBe(expected.rerolls);
      expect(car.freeStops).toBe(expected.freeStops);
      expect(errors).toEqual([]);
    });

    test('équipement connu : jauges, bonus de dé, relance, et option désactivable', async ({ page }) => {
      const errors = watchConsole(page);
      await injectSave(page, STARTER);
      await page.goto('/?seed=5');
      await goTab(page, 'garage');
      await expect(page.locator('[data-slot="wing"]')).toContainText('Aileron mobile');
      // the sheet of the car: six bars, the power, the series of families and the league sheet
      await expect(page.getByTestId('stat-sheet').locator('[data-stat-bar]')).toHaveCount(6);
      expect(Number(await page.getByTestId('stat-sheet').getByTestId('power').textContent())).toBeGreaterThan(0);
      await expect(page.locator('[data-family="precision"]')).toHaveAttribute('data-count', '2'); // Aileron mobile, Carbone-céramique
      await page.getByTestId('league-select').selectOption('paddock');
      await expect(page.getByTestId('league-sheet')).toBeVisible();
      await expect(page.getByTestId('league-note')).toContainText('plafonds');
      const paddockPower = Number(await page.getByTestId('league-sheet').getByTestId('power').textContent());
      await page.getByTestId('league-select').selectOption('legende');
      // a higher league cuts less: the power can only go up
      await expect.poll(async () => Number(await page.getByTestId('league-sheet').getByTestId('power').textContent())).toBeGreaterThanOrEqual(paddockPower);
      await expect(page.locator('[data-stat="wear-tires"]')).toHaveText(String(BASE.tires + 4)); // slicks pro level 3: +3 +1 (slot, level 2) +1 (family, level 3), minus 1 (drawback of Carbone-céramique)
      await shot(page, size.name, 'garage-loaded');
      await goTab(page, 'race');

      await soloSetup(page);
      await page.getByRole('button', { name: 'Démarrer la course' }).click();
      await expect(page.locator('[data-cat="tires"]')).toContainText(`${BASE.tires + 4}/${BASE.tires + 4}`);
      await expect(page.locator('[data-cat="engine"]')).toContainText(`${BASE.engine + 3}/${BASE.engine + 3}`); // hybrid engine level 2: base + 2 + 1
      await expect(page.getByRole('button', { name: /Relancer le dé/ })).toBeHidden();
      // the standing start (d20) cannot be rerolled: play it, then roll the first real turn
      await page.getByRole('button', { name: /^(Lancer|Départ)$/ }).click();
      await expect(page.getByTestId('die')).not.toHaveClass(/rolling/);
      await humanStep(page);
      await page.getByRole('button', { name: /^(Lancer|Départ)$/ }).click();
      // the hybrid engine gives its cell at gears 4 to 6 only: nothing on the opening turns, the chip of the relance is there
      await expect(page.getByTestId('message')).toContainText('Dé :');
      await expect(page.locator('[data-chip="rerolls"]')).toContainText('1 relance');
      const reroll = page.getByRole('button', { name: 'Relancer le dé (1 restante)' });
      await expect(reroll).toBeVisible();
      await shot(page, size.name, 'race-reroll');
      await reroll.click();
      await expect(page.getByTestId('message')).toContainText('Relance utilisée');
      await expect(page.getByRole('button', { name: /Relancer le dé/ })).toBeHidden();
      expect(await page.evaluate(() => (window as unknown as W).__game.state.cars[0].rerolls)).toBe(0);
      expect(errors).toEqual([]);
    });

    test('à la fin de la course, le bilan dit ce que les pièces ont rapporté', async ({ page }) => {
      const errors = watchConsole(page);
      await injectSave(page, STARTER);
      await page.goto('/?seed=5');
      await soloSetup(page);
      await page.getByRole('button', { name: 'Moins de tours' }).click();
      await page.getByRole('button', { name: 'Démarrer la course' }).click();
      await page.waitForFunction(() => '__game' in window);
      await expect(page.getByTestId('part-chips')).toBeVisible();
      await expect(page.locator('[data-chip="rerolls"]')).toContainText('1 relance');
      await page.evaluate(() => (window as unknown as { __game: { autoplay(me?: string): void } }).__game.autoplay('hard'));
      await expect(page.getByTestId('ranking')).toBeVisible();
      await expect(page.getByTestId('parts-summary')).toContainText('Vos pièces ont servi');
      await expect(page.getByTestId('parts-summary')).toContainText('case');
      await expectUsableLayout(page, 'bilan des pièces');
      await page.screenshot({ path: `e2e/screenshots/parts-${size.name}-parts-summary.png` });
      expect(errors).toEqual([]);
    });

    test('« Équiper le meilleur » choisit les pièces qui donnent le plus de Puissance, et ne change rien quand c’est déjà fait', async ({ page }) => {
      const errors = watchConsole(page);
      // two engines and two tyres owned, one of each worn: the better ones are not
      await injectSave(page, {
        ...STARTER,
        owned: { ...STARTER.owned, 'eng-stock': 1, 'eng-hybrid': 4, 'tir-pro': 1 },
        loadout: { ...STARTER.loadout, parts: { engine: 'eng-stock', tires: 'tir-pro' } },
      });
      await page.goto('/');
      await goTab(page, 'garage');
      const power = async () => Number(await page.getByTestId('power').first().textContent());
      const before = await power();
      await expect(page.getByTestId('equip-best')).toBeVisible();
      await shot(page, size.name, 'garage-equip-best-before');
      await page.getByTestId('equip-best').click();
      await expect(page.getByTestId('toast')).toContainText('Puissance');
      const after = await power();
      expect(after).toBeGreaterThan(before);
      expect((await profile(page)).loadout.parts.engine).toBe('eng-hybrid');
      // the cosmetics are not touched
      expect(await page.evaluate(() => (window as unknown as W).__profile.get().loadout)).toMatchObject({ paint: 'paint-gold', number: 'num-42', helmet: 'hlm-red' });
      await shot(page, size.name, 'garage-equip-best-after');
      // again: nothing to change
      await page.getByTestId('equip-best').click();
      await expect(page.getByTestId('toast')).toContainText('déjà le meilleur');
      expect(await power()).toBe(after);
      expect(errors).toEqual([]);
    });

    test("l'équipement du garage peut être désactivé pour une course", async ({ page }) => {
      await injectSave(page, STARTER);
      await page.goto('/?seed=5');
      await soloSetup(page);
      await page.getByTestId('use-gear').click();
      await expect(page.getByTestId('use-gear')).toContainText('désactivé');
      await page.getByRole('button', { name: 'Démarrer la course' }).click();
      await expect(page.locator('[data-cat="tires"]')).toContainText(`${BASE.tires}/${BASE.tires}`);
      await page.getByRole('button', { name: /^(Lancer|Départ)$/ }).click();
      await expect(page.getByTestId('message')).not.toContainText("d'équipement");
      await expect(page.getByRole('button', { name: /Relancer le dé/ })).toBeHidden();
    });
  });
}

test.describe('sauvegarde', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  test.setTimeout(120_000);

  test('une course terminée rapporte récompenses et paquets, conservés après rechargement', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/?seed=9&unlockMs=120000');
    await soloSetup(page);
    await page.getByRole('button', { name: 'Moins de tours' }).click();
    await page.getByRole('button', { name: 'Démarrer la course' }).click();
    await page.waitForFunction(() => '__game' in window);
    for (let i = 0; i < 400; i++) {
      if (await page.getByTestId('ranking').isVisible()) break;
      await humanStep(page);
    }
    await expect(page.getByTestId('reward')).toContainText('+2 coffres gagnés');
    await expect(page.getByTestId('rewards')).toContainText('🪙 +100');
    await expect(page.getByTestId('xp-gain-text')).toContainText(/\+1[01]0 XP/);
    const won = await profile(page);
    // three starter packs were waiting: the first reward goes to the free slot, the other one to the reserve
    expect(won.slots.filter(Boolean)).toHaveLength(4);
    expect(won.packs).toHaveLength(1);
    await page.reload();
    await page.waitForFunction(() => '__profile' in window);
    const back = await profile(page);
    expect(back.slots.filter(Boolean)).toHaveLength(4);
    expect(back.packs).toHaveLength(1);
    await expect(page.getByTestId('reserve-badge')).toHaveText('+1 en réserve');
    expect(errors).toEqual([]);
  });

  test('une ancienne sauvegarde (version 1) est migrée sans rien perdre', async ({ page }) => {
    const errors = watchConsole(page);
    await injectSave(page, { version: 1, packs: 4, seed: 321, inventory: ['eng-turbo', 'eng-turbo', 'paint-gold'], equipped: { engine: 'eng-turbo' } });
    await page.goto('/');
    expect(await page.evaluate(() => (window as unknown as W).__profile.status())).toBe('migrated');
    const p = await profile(page);
    expect(p.slots.filter(Boolean)).toHaveLength(4);
    expect(p.owned).toEqual({ 'eng-turbo': 1, 'paint-gold': 1 });
    expect(p.fragments).toBe(12); // the duplicate rare part
    expect(p.loadout.parts).toEqual({ engine: 'eng-turbo' });
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('4mules.save') as string)).version).toBe(5);
    await goTab(page, 'garage');
    await expect(page.locator('[data-slot="engine"]')).toContainText('Turbo calibré');
    expect(errors).toEqual([]);
  });

  test("une sauvegarde illisible n'empêche pas de jouer et est conservée à part", async ({ page }) => {
    const errors = watchConsole(page);
    await injectSave(page, '{ceci n’est pas du json');
    await page.goto('/');
    await expect(page.locator('[data-testid="start-ranked"]')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as W).__profile.status())).toBe('recovered');
    expect(await page.evaluate(() => localStorage.getItem('4mules.save.backup'))).toBe('{ceci n’est pas du json');
    await expect(page.locator('[data-slot-index][data-state="ready"]')).toHaveCount(3);
    expect(errors).toEqual([]);
  });
});
