import { describe, expect, it } from 'vitest';
import { CHESTS } from '../data/chests';
import { ITEMS, PARTS } from '../data/parts/catalogue';
import { newProfile, serializeProfile } from '../data/profile/profile';
import { xpForLevel } from '../data/xp';
import { GameError } from './errors';
import { IMPORT_CAPS, importSave } from './importSave';

const T0 = Date.UTC(2026, 9, 21, 12);
const random = () => 0xdeadbeef;

describe('one-time import of the local save', () => {
  it('keeps an honest save as it is, except the chest rng and the welcome pack deadline', () => {
    const local = { ...newProfile(42), gold: 830, gems: 31, fragments: 60, xp: 420, races: 12, wins: 4, packsOpened: 9, claimed: ['races-1'], campaign: { stars: [2, 1] } };
    const { state, report } = importSave(serializeProfile(local), T0, random);
    expect(report).toEqual([]);
    expect(state.profile).toEqual({ ...local, rng: 0xdeadbeef, welcomeUntil: T0 + 72 * 3_600_000 });
    expect(state.importedAt).toBe(T0);
    expect(state.race).toBeNull();
  });

  it('drops the trophies of a local save: they are earned on the server only', () => {
    const forged = { ...newProfile(42), ranked: { trophies: 4000, peak: 4500, races: 99, wins: 90, season: 3 } };
    const { state } = importSave(serializeProfile(forged), T0, random);
    expect(state.profile.ranked).toEqual({ trophies: 0, peak: 0, races: 0, wins: 0, season: 0 });
  });

  it('migrates an old save format', () => {
    const v3 = { version: 3, packs: 0, slots: [null, null, null, null], fragments: 0, gold: 500, gems: 20, xp: 0, owned: {}, loadout: { parts: {} }, rng: 5, races: 2, wins: 1, packsOpened: 0, upgrades: 0, campaign: 1, claimed: [] };
    const { state } = importSave(JSON.stringify(v3), T0, random);
    expect(state.profile.version).toBe(5);
    expect(state.profile.gold).toBe(500);
    expect(state.profile.campaign.stars).toEqual([1]);
  });

  it('brings a forged save down to plausible values and reports each change', () => {
    const legendary = ITEMS.filter((i) => i.rarity === 'legendary');
    const owned: Record<string, number> = {};
    for (const item of legendary) owned[item.id] = 5;
    const commonPart = PARTS.find((p) => p.rarity === 'common')!;
    owned[commonPart.id] = 5;
    const forged = {
      ...newProfile(1),
      gold: 9_999_999,
      gems: 999_999,
      fragments: 1e9,
      xp: 1e9,
      races: 10,
      wins: 500,
      pity: 29_000,
      owned,
      loadout: { parts: { [commonPart.slot]: commonPart.id } },
      slots: [
        { readyAt: 0, tier: 'legendary' },
        { readyAt: 0, tier: 'legendary' },
        { readyAt: T0 + 365 * 86_400_000, tier: 'legendary' },
        { readyAt: 0, tier: 'epic' },
      ],
      packs: Array.from({ length: 50 }, () => 'legendary'),
      campaign: { stars: [0, 3, 3] },
      claimed: ['races-1', 'invented-quest'],
    };
    const { state, report } = importSave(JSON.stringify(forged), T0, random);
    const p = state.profile;
    expect(p.gold).toBe(IMPORT_CAPS.gold);
    expect(p.gems).toBe(IMPORT_CAPS.gems);
    expect(p.fragments).toBe(IMPORT_CAPS.fragments);
    expect(p.xp).toBe(xpForLevel(IMPORT_CAPS.level));
    expect(p.wins).toBe(10);
    expect(p.pity).toBeLessThan(30);
    expect(Object.keys(p.owned).filter((id) => legendary.some((l) => l.id === id))).toHaveLength(Math.min(legendary.length, IMPORT_CAPS.legendaryItems));
    expect(Math.max(...Object.values(p.owned))).toBeLessThanOrEqual(IMPORT_CAPS.partLevel);
    expect(p.loadout.parts[commonPart.slot]).toBe(commonPart.id);
    // two big chests at most, timers no longer than the chest's own
    const tiers = [...p.slots.map((s) => s?.tier), ...p.packs];
    expect(tiers.filter((t) => t === 'epic' || t === 'legendary')).toHaveLength(IMPORT_CAPS.bigChests);
    expect(p.slots.filter(Boolean).length + p.packs.length).toBe(IMPORT_CAPS.chests);
    expect(p.slots[2]!.readyAt).toBeLessThanOrEqual(T0 + CHESTS[p.slots[2]!.tier].unlockMs);
    // stars on levels that were never opened are dropped
    expect(p.campaign.stars).toEqual([]);
    expect(p.claimed).toEqual(['races-1']);
    expect(p.rng).toBe(0xdeadbeef);
    const fields = report.map((r) => r.field);
    for (const f of ['gold', 'gems', 'fragments', 'xp', 'wins', 'pity', 'packs', 'campaign', `owned.${commonPart.id}`]) expect(fields).toContain(f);
    expect(report.find((r) => r.field === 'gold')).toEqual({ field: 'gold', from: 9_999_999, to: IMPORT_CAPS.gold });
  });

  it('refuses what is not a save', () => {
    for (const text of [undefined, 42, '', 'not json', '{"version":99}', '[]', 'x'.repeat(70_000)]) {
      expect(() => importSave(text, T0, random)).toThrowError(GameError);
    }
  });
});
