import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, parseProfile } from './profile';

describe('migration to version 5 (chest qualities)', () => {
  const v4 = {
    version: 4,
    packs: 3,
    slots: [{ readyAt: 5 }, { readyAt: 99 }, null, null],
    fragments: 0,
    gold: 10,
    gems: 2,
    xp: 0,
    owned: {},
    loadout: { parts: {} },
    rng: 9,
    races: 0,
    wins: 0,
    packsOpened: 0,
    upgrades: 0,
    campaign: { stars: [] },
    claimed: [],
  };

  it('turns every old pack, in a slot or in reserve, into a Common chest and starts the pity gauge', () => {
    const r = parseProfile(JSON.stringify(v4))!;
    expect(r.migrated).toBe(true);
    expect(r.profile.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(5);
    expect(r.profile.slots).toEqual([{ readyAt: 5, tier: 'common' }, { readyAt: 99, tier: 'common' }, null, null]);
    expect(r.profile.packs).toEqual(['common', 'common', 'common']);
    expect(r.profile.pity).toBe(0);
  });

  it('keeps valid qualities and repairs invalid ones in a current save', () => {
    const p = parseProfile(JSON.stringify({ ...v4, version: SAVE_VERSION, packs: ['epic', 'nope', 'rare'], slots: [{ readyAt: 1, tier: 'legendary' }, { readyAt: 2, tier: 'x' }], pity: 7.9 }))!.profile;
    expect(p.packs).toEqual(['epic', 'rare']);
    expect(p.slots.map((s) => s?.tier)).toEqual(['legendary', 'common', undefined, undefined]);
    expect(p.pity).toBe(7);
  });
});
