import { describe, expect, it } from 'vitest';
import { getItem } from '../parts/catalogue';
import { DUPLICATE_FRAGMENTS } from '../parts/packs';
import { equip, loadoutMods, unequipCosmetic, unequipSlot, upgradePart } from './ops';
import {
  BACKUP_KEY,
  SAVE_KEY,
  SAVE_VERSION,
  SLOT_COUNT,
  START_GEMS,
  START_GOLD,
  STARTING_PACKS,
  loadProfile,
  newProfile,
  parseProfile,
  saveProfile,
  serializeProfile,
  totalPacks,
  type KeyValueStore,
  type Profile,
} from './profile';

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
  };
}

const rich = (): Profile => ({
  ...newProfile(5),
  fragments: 250,
  owned: { 'eng-turbo': 2, 'tir-grip': 1, 'wng-drs': 1, 'paint-gold': 1, 'num-42': 1, 'hlm-red': 1 },
  loadout: { parts: { engine: 'eng-turbo', tires: 'tir-grip' }, paint: 'paint-gold', number: 'num-42' },
  races: 4,
  wins: 1,
  claimed: ['races-1'],
  campaign: { stars: [3, 1] },
});

describe('save and load', () => {
  it('a new profile starts with starter packs ready, some money, and nothing else', () => {
    const p = newProfile(77);
    expect(p).toMatchObject({ version: SAVE_VERSION, fragments: 0, owned: {}, rng: 77, races: 0, wins: 0, gold: START_GOLD, gems: START_GEMS, xp: 0, campaign: { stars: [] } });
    expect(p.slots).toHaveLength(SLOT_COUNT);
    expect(p.slots.filter(Boolean)).toHaveLength(STARTING_PACKS);
    expect(p.slots.every((s) => s === null || s.readyAt === 0)).toBe(true);
    expect(totalPacks(p)).toBe(STARTING_PACKS);
  });

  it('round-trips a full profile', () => {
    const store = memoryStore();
    const p = rich();
    expect(saveProfile(store, p)).toBe(true);
    expect(store.data[SAVE_KEY]).toBe(serializeProfile(p));
    const back = loadProfile(store, 1);
    expect(back.status).toBe('loaded');
    expect(back.profile).toEqual(p);
  });

  it('no save yet: creates a new profile from the seed', () => {
    const r = loadProfile(memoryStore(), 1234);
    expect(r.status).toBe('new');
    expect(r.profile.rng).toBe(1234);
  });

  it('survives a storage that throws (private mode) and a missing storage', () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => undefined,
    };
    expect(loadProfile(broken, 3).status).toBe('new');
    expect(saveProfile(broken, newProfile(1))).toBe(false);
    expect(loadProfile(null, 3).status).toBe('new');
    expect(saveProfile(null, newProfile(1))).toBe(false);
  });

  it('unreadable data is kept as a backup, never silently destroyed', () => {
    const store = memoryStore({ [SAVE_KEY]: '{not json' });
    const r = loadProfile(store, 9);
    expect(r.status).toBe('recovered');
    expect(store.data[BACKUP_KEY]).toBe('{not json');
    expect(totalPacks(r.profile)).toBe(STARTING_PACKS);
  });

  it('a save from a newer version is backed up, not read', () => {
    const future = JSON.stringify({ version: SAVE_VERSION + 1, gold: 99999 });
    const store = memoryStore({ [SAVE_KEY]: future });
    const r = loadProfile(store, 9);
    expect(r.status).toBe('recovered');
    expect(store.data[BACKUP_KEY]).toBe(future);
    expect(r.profile.gold).toBe(START_GOLD);
  });

  it.each([['null'], ['[]'], ['"text"'], ['{}'], ['{"version":"2"}'], ['{"version":0}'], ['{"version":1.5}']])('rejects %s', (text) => {
    expect(parseProfile(text)).toBeNull();
  });
});

describe('migration', () => {
  const v1 = {
    version: 1,
    packs: 2,
    seed: 4242,
    inventory: ['eng-turbo', 'tir-grip', 'eng-turbo', 'gone-forever', 'paint-gold', 'tir-grip', 'tir-grip'],
    equipped: { engine: 'eng-turbo', tires: 'tir-grip', wing: 'wng-drs', brakes: 'eng-turbo' },
  };

  it('upgrades a version 1 save all the way to the current format', () => {
    const r = parseProfile(JSON.stringify(v1))!;
    expect(r.migrated).toBe(true);
    const p = r.profile;
    expect(p.version).toBe(SAVE_VERSION);
    expect(totalPacks(p)).toBe(2);
    expect(p.slots.filter(Boolean)).toHaveLength(2);
    expect(p.rng).toBe(4242);
    expect(Object.keys(p.owned).sort()).toEqual(['eng-turbo', 'paint-gold', 'tir-grip']);
    expect(Object.values(p.owned).every((l) => l === 1)).toBe(true);
    expect(p).toMatchObject({ gold: START_GOLD, gems: START_GEMS, campaign: { stars: [] }, packsOpened: 0, claimed: [] });
  });

  it('turns v1 duplicates into fragments, rarity by rarity', () => {
    const p = parseProfile(JSON.stringify(v1))!.profile;
    const rarity = (id: string) => getItem(id)!.rarity;
    expect(p.fragments).toBe(DUPLICATE_FRAGMENTS[rarity('eng-turbo')] + 2 * DUPLICATE_FRAGMENTS[rarity('tir-grip')]);
  });

  it('keeps valid equipment and drops what is unowned or in the wrong slot', () => {
    const p = parseProfile(JSON.stringify(v1))!.profile;
    expect(p.loadout.parts).toEqual({ engine: 'eng-turbo', tires: 'tir-grip' });
  });

  const v2 = {
    version: 2,
    packs: 6,
    fragments: 33,
    owned: { 'eng-turbo': 3, 'paint-gold': 1 },
    loadout: { parts: { engine: 'eng-turbo' }, paint: 'paint-gold' },
    rng: 8,
    races: 10,
    wins: 4,
  };

  it('upgrades a version 2 save: packs fill the slots, the rest waits in reserve', () => {
    const r = parseProfile(JSON.stringify(v2))!;
    expect(r.migrated).toBe(true);
    const p = r.profile;
    expect(p.slots.filter(Boolean)).toHaveLength(SLOT_COUNT);
    expect(p.slots.every((s) => s?.readyAt === 0)).toBe(true);
    expect(p.packs).toEqual(["common", "common"]);
    expect(totalPacks(p)).toBe(6);
    expect(p.xp).toBe(10 * 20 + 4 * 30);
    expect(p.fragments).toBe(33);
    expect(p.owned).toEqual({ 'eng-turbo': 3, 'paint-gold': 1 });
    expect(p.loadout.parts.engine).toBe('eng-turbo');
    expect(p.races).toBe(10);
  });

  it('loadProfile reports migrated, and saving again writes the current version', () => {
    const store = memoryStore({ [SAVE_KEY]: JSON.stringify(v1) });
    const r = loadProfile(store, 1);
    expect(r.status).toBe('migrated');
    saveProfile(store, r.profile);
    expect(JSON.parse(store.data[SAVE_KEY]).version).toBe(SAVE_VERSION);
    expect(loadProfile(store, 1).status).toBe('loaded');
  });

  it('copes with a minimal or broken old save', () => {
    const p = parseProfile('{"version":1}')!.profile;
    expect(p).toMatchObject({ packs: [], fragments: 0, owned: {}, rng: 1 });
    expect(totalPacks(p)).toBe(0);
    const q = parseProfile('{"version":1,"inventory":"nope","equipped":[1],"packs":-5}')!.profile;
    expect(totalPacks(q)).toBe(0);
    expect(q.owned).toEqual({});
    expect(parseProfile('{"version":2}')!.profile.slots.filter(Boolean)).toHaveLength(0);
  });
});

describe('sanitising a current save', () => {
  const raw = (o: object) => parseProfile(JSON.stringify({ version: SAVE_VERSION, ...o }))!.profile;

  it('clamps numbers and levels, drops unknown items', () => {
    const p = raw({ packs: -3, fragments: 1e9, gold: -5, gems: 'x', xp: 12.7, owned: { 'eng-turbo': 99, 'tir-grip': 0, nope: 3, 'paint-gold': 4 }, rng: -1, races: 'x' });
    expect(p.packs).toEqual([]);
    expect(p.fragments).toBe(1e9);
    expect(p.gold).toBe(0);
    expect(p.gems).toBe(0);
    expect(p.xp).toBe(12);
    expect(p.owned).toEqual({ 'eng-turbo': 5, 'tir-grip': 1, 'paint-gold': 1 });
    expect(p.rng).toBe(1);
    expect(p.races).toBe(0);
  });

  it('always has four slots, each empty or with a valid timer', () => {
    expect(raw({ slots: [{ readyAt: 5 }, { readyAt: 'soon' }, 7, null, { readyAt: 1 }] }).slots).toEqual([{ readyAt: 5, tier: 'common' }, null, null, null]);
    expect(raw({ slots: 'broken' }).slots).toEqual([null, null, null, null]);
    expect(raw({ slots: [{ readyAt: -4 }] }).slots[0]).toEqual({ readyAt: 0, tier: 'common' });
  });

  it('cleans what was bought from the offers of the day (an older save has none)', () => {
    expect(raw({}).shop).toEqual({ day: '', bought: [], items: [] });
    expect(raw({ shop: { day: '2026-10-21', bought: ['daily-number', 'daily-number', 4], items: ['num-7', 'paint-white', 'eng-turbo', 'nope'] } }).shop).toEqual({ day: '2026-10-21', bought: ['daily-number'], items: ['num-7', 'paint-white'] });
    expect(raw({ shop: { day: 'yesterday', bought: 'x' } }).shop).toEqual({ day: '', bought: [], items: [] });
  });

  it('cleans the season pass progress (an older save has none)', () => {
    expect(raw({}).pass).toEqual({ season: 0, points: 0, claimed: [] });
    expect(raw({ pass: { season: 3, points: 999_999, claimed: [4, 2, 2, 0, 31, 'x', 1.5] } }).pass).toEqual({ season: 3, points: 1500, claimed: [2, 4] });
    expect(raw({ pass: 'x' }).pass).toEqual({ season: 0, points: 0, claimed: [] });
  });

  it('keeps the claimed quests once each, strings only', () => {
    expect(raw({ claimed: ['a', 'a', 3, 'b', null] }).claimed).toEqual(['a', 'b']);
    expect(raw({ claimed: 'x' }).claimed).toEqual([]);
  });

  it('repairs a loadout that points at unowned, mismatched or unknown items', () => {
    const p = raw({
      owned: { 'eng-turbo': 1, 'paint-gold': 1, 'num-42': 1 },
      loadout: { parts: { engine: 'eng-turbo', tires: 'eng-turbo', wing: 'wng-drs', chassis: 'unknown' }, paint: 'num-42', number: 'num-42', helmet: 'hlm-red' },
    });
    expect(p.loadout).toEqual({ parts: { engine: 'eng-turbo' }, number: 'num-42' });
  });

  it('is idempotent', () => {
    const once = raw(rich());
    expect(raw(once)).toEqual(once);
  });
});

describe('equipment operations', () => {
  it('equips owned parts in their slot and cosmetics in their category', () => {
    let p = rich();
    p = equip(p, 'wng-drs')!;
    expect(p.loadout.parts.wing).toBe('wng-drs');
    p = equip(p, 'hlm-red')!;
    expect(p.loadout.helmet).toBe('hlm-red');
    expect(equip(p, 'eng-v8')).toBeNull(); // not owned
    expect(equip(p, 'nope')).toBeNull();
    expect(loadoutMods(p).rerolls).toBe(1);
  });

  it('replaces what was in the slot and can unequip', () => {
    let p: Profile = { ...rich(), owned: { ...rich().owned, 'eng-cooler': 1 } };
    p = equip(p, 'eng-cooler')!;
    expect(p.loadout.parts.engine).toBe('eng-cooler');
    p = unequipSlot(p, 'engine');
    expect(p.loadout.parts.engine).toBeUndefined();
    p = unequipCosmetic(p, 'paint');
    expect(p.loadout.paint).toBeUndefined();
    expect(p.loadout.number).toBe('num-42');
  });

  it('upgrades with fragments up to level 5, counting upgrades, never below zero', () => {
    let p: Profile = { ...rich(), fragments: 1000 };
    const cost = [20, 40, 60, 80]; // rare part: 20 * level
    for (let level = 1; level < 5; level++) {
      const next = upgradePart({ ...p, owned: { ...p.owned, 'wng-drs': level } }, 'wng-drs')!;
      expect(next.owned['wng-drs']).toBe(level + 1);
      expect(p.fragments - next.fragments).toBe(cost[level - 1]);
      expect(next.upgrades).toBe(p.upgrades + 1);
    }
    p = { ...p, owned: { ...p.owned, 'wng-drs': 5 } };
    expect(upgradePart(p, 'wng-drs')).toBeNull();
    expect(upgradePart({ ...p, owned: { 'wng-drs': 1 }, fragments: 19 }, 'wng-drs')).toBeNull();
    expect(upgradePart(p, 'not-owned')).toBeNull();
    expect(upgradePart(p, 'paint-gold')).toBeNull();
  });

  it('upgrading a part changes the mods of an equipped loadout', () => {
    let p: Profile = { ...rich(), fragments: 500 };
    const before = loadoutMods(p).wearBonus.engine!;
    p = upgradePart(p, 'eng-turbo')!;
    expect(loadoutMods(p).wearBonus.engine).toBe(before + 1);
  });
});

describe('version 3 saves (eight stages) become the three-level campaign', () => {
  const v3 = (campaign: unknown) => JSON.stringify({ ...JSON.parse(serializeProfile(newProfile(3))), version: 3, campaign });

  it('stages won count as levels finished with one star, at most three', () => {
    expect(parseProfile(v3(0))!.profile.campaign).toEqual({ stars: [] });
    expect(parseProfile(v3(2))!.profile.campaign).toEqual({ stars: [1, 1] });
    expect(parseProfile(v3(8))!.profile.campaign).toEqual({ stars: [1, 1, 1] });
    expect(parseProfile(v3('x'))!.profile.campaign).toEqual({ stars: [] });
    const out = parseProfile(v3(2))!;
    expect(out.migrated).toBe(true);
    expect(out.profile.version).toBe(SAVE_VERSION);
  });

  it('a current save keeps its stars, cleaned: at most three levels, each between 0 and 3', () => {
    const raw = (campaign: unknown) => parseProfile(JSON.stringify({ ...JSON.parse(serializeProfile(newProfile(3))), campaign }))!.profile.campaign;
    expect(raw({ stars: [3, 2, 1] })).toEqual({ stars: [3, 2, 1] });
    expect(raw({ stars: [9, -4, 2, 3, 3] })).toEqual({ stars: [3, 0, 2] });
    expect(raw({ stars: 'x' })).toEqual({ stars: [] });
    expect(raw(7)).toEqual({ stars: [] });
  });
});
