import { describe, expect, it } from 'vitest';
import { QUESTS, claimQuest, claimableCount, counterValue, isClaimable, questProgress } from './quests';
import { LEVELS } from './campaign';
import { clearedLevels, levelStatus, starsOf } from '../storage/campaign';
import { CHESTS } from './chests';
import { COSMETICS } from './parts/catalogue';
import { DAILY_CHEAP, DAILY_COUNT, OFFERS, buyOffer, canAfford, dailyOffers, dailyView, findOffer, msUntilNextDay, parisDay } from './shop';
import {
  addPacks,
  addXp,
  awardRace,
  levelOf,
  levelProgress,
  openSlot,
  raceReward,
  readyPacks,
  refillSlots,
  skipCost,
  skipSlot,
  slotState,
  xpForLevel,
} from './profile/ops';
import { newProfile, totalPacks, type Profile } from './profile/profile';

const NOW = 1_000_000;
const COMMON_MS = CHESTS.common.unlockMs;
const MIN = 60_000;
const fresh = (): Profile => newProfile(7);
const empty = (): Profile => ({ ...fresh(), slots: [null, null, null, null] });

describe('levels and XP', () => {
  it('has growing thresholds', () => {
    expect([1, 2, 3, 4, 5].map(xpForLevel)).toEqual([0, 100, 264, 466, 696]);
    expect(levelOf(0)).toBe(1);
    expect(levelOf(99)).toBe(1);
    expect(levelOf(100)).toBe(2);
    expect(levelOf(263)).toBe(2);
    expect(levelOf(264)).toBe(3);
    expect(levelOf(10_000)).toBe(27);
  });

  it('reports the progress inside the current level', () => {
    expect(levelProgress(0)).toEqual({ level: 1, into: 0, span: 100 });
    expect(levelProgress(150)).toEqual({ level: 2, into: 50, span: 164 });
  });

  it('addXp announces a level up once', () => {
    const p = { ...fresh(), xp: 90 };
    const r = addXp(p, 20);
    expect(r.profile.xp).toBe(110);
    expect(r.levelUp).toBe(2);
    expect(addXp(r.profile, 5).levelUp).toBeNull();
    expect(addXp(p, 5).levelUp).toBeNull();
  });
});

describe('pack slots and timers', () => {
  it('describes each slot as empty, locked with a countdown, or ready', () => {
    const p: Profile = { ...empty(), slots: [null, { readyAt: NOW + 5000, tier: 'rare' }, { readyAt: NOW, tier: 'common' }, { readyAt: NOW - 1, tier: 'epic' }] };
    expect(slotState(p, 0, NOW)).toEqual({ kind: 'empty' });
    expect(slotState(p, 1, NOW)).toEqual({ kind: 'locked', remainingMs: 5000, tier: 'rare' });
    expect(slotState(p, 2, NOW)).toEqual({ kind: 'ready', tier: 'common' });
    expect(slotState(p, 3, NOW)).toEqual({ kind: 'ready', tier: 'epic' });
    expect(readyPacks(p, NOW)).toBe(2);
  });

  it('new packs go to free slots with a running timer, the rest to the reserve', () => {
    let p = addPacks(empty(), 3, NOW);
    expect(p.slots.map((s) => s?.readyAt)).toEqual([NOW + COMMON_MS, NOW + COMMON_MS, NOW + COMMON_MS, undefined]);
    p = addPacks(p, 3, NOW);
    expect(p.slots.every(Boolean)).toBe(true);
    expect(p.packs).toHaveLength(2);
    expect(totalPacks(p)).toBe(6);
    expect(addPacks(p, 0, NOW)).toBe(p);
  });

  it('instant packs are ready at once', () => {
    const p = addPacks(empty(), 1, NOW, COMMON_MS, true);
    expect(slotState(p, 0, NOW).kind).toBe('ready');
  });

  it('a custom unlock time is honoured (used by tests and the ?timers option)', () => {
    expect(addPacks(empty(), 1, NOW, 1500).slots[0]).toEqual({ readyAt: NOW + 1500, tier: 'common' });
  });

  it('opening a ready pack frees the slot, counts it, and pulls the reserve in with a new timer', () => {
    let p = addPacks(empty(), 5, NOW, 0); // 4 ready now + 1 in reserve
    expect(p.packs).toHaveLength(1);
    const r = openSlot(p, 2, NOW + 10)!;
    expect(r.cards).toHaveLength(3);
    expect(r.profile.packsOpened).toBe(1);
    expect(r.profile.packs).toHaveLength(0);
    expect(r.profile.slots[2]).toEqual({ readyAt: NOW + 10 + COMMON_MS, tier: 'common' });
    expect(totalPacks(r.profile)).toBe(4);
    p = r.profile;
    expect(p.rng).not.toBe(empty().rng);
  });

  it('a locked or empty slot cannot be opened', () => {
    const p = addPacks(empty(), 1, NOW);
    expect(openSlot(p, 0, NOW + 1)).toBeNull();
    expect(openSlot(p, 1, NOW + COMMON_MS)).toBeNull();
    expect(openSlot(p, 0, NOW + COMMON_MS)).not.toBeNull();
  });

  it('the same profile and time open the same cards', () => {
    const p = addPacks(empty(), 1, NOW, 0);
    expect(openSlot(p, 0, NOW)!.cards).toEqual(openSlot(p, 0, NOW)!.cards);
  });

  it('refillSlots does nothing without reserve or free slots', () => {
    const p = empty();
    expect(refillSlots(p, NOW)).toBe(p);
    const full = addPacks(empty(), 4, NOW);
    expect(refillSlots({ ...full, packs: ['common', 'common', 'common'] }, NOW).packs).toHaveLength(3);
  });

  it('skipping costs one gem per started minute and needs enough gems', () => {
    expect(skipCost(1)).toBe(1);
    expect(skipCost(10 * MIN)).toBe(1);
    expect(skipCost(10 * MIN + 1)).toBe(2);
    expect(skipCost(COMMON_MS)).toBe(3);
    const p = { ...addPacks(empty(), 1, NOW), gems: 5 };
    const r = skipSlot(p, 0, NOW + 1000)!; // 2 min 59 s left -> 3 gems
    expect(r.gems).toBe(2);
    expect(slotState(r, 0, NOW + 1000).kind).toBe('ready');
    expect(skipSlot({ ...p, gems: 2 }, 0, NOW + 1000)).toBeNull();
    expect(skipSlot(r, 0, NOW + 1000)).toBeNull(); // already ready
    expect(skipSlot(p, 1, NOW)).toBeNull(); // empty
  });
});

describe('race rewards', () => {
  const ctx = { now: NOW, unlockMs: 1000 };

  it('pack count: 1 for finishing, +1 for winning, none when retired', () => {
    expect(raceReward(1, false)).toBe(2);
    expect(raceReward(3, false)).toBe(1);
    expect(raceReward(1, true)).toBe(0);
  });

  it('a win pays gold, XP, packs and counts the race', () => {
    const r = awardRace(empty(), { ...ctx, rank: 1, retired: false });
    expect(r.rewards).toMatchObject({ packs: 2, gold: 100, xp: 50, gems: 0, stageCleared: false });
    expect(r.profile).toMatchObject({ gold: 200 + 100, xp: 50, races: 1, wins: 1 });
    expect(totalPacks(r.profile)).toBe(2);
    expect(r.profile.slots[0]).toMatchObject({ readyAt: NOW + 1000 });
  });

  it('second place and retirements pay less', () => {
    expect(awardRace(empty(), { ...ctx, rank: 2, retired: false }).rewards).toMatchObject({ packs: 1, gold: 60, xp: 35 });
    expect(awardRace(empty(), { ...ctx, rank: 4, retired: false }).rewards).toMatchObject({ packs: 1, gold: 30, xp: 18 });
    const out = awardRace(empty(), { ...ctx, rank: 1, retired: true });
    expect(out.rewards).toMatchObject({ packs: 0, gold: 10, xp: 0 });
    expect(out.profile.wins).toBe(0);
  });

  it('XP scales with the field, bots and a clean finish', () => {
    const solo = awardRace(empty(), { ...ctx, rank: 1, retired: false, players: 4, vsBots: false, clean: true });
    expect(solo.rewards).toMatchObject({ xp: 110, xpBefore: 0, xpAfter: 110 });
    expect(awardRace(empty(), { ...ctx, rank: 2, retired: false, players: 2, vsBots: true }).rewards.xp).toBe(18);
  });

  it('a solo race against AIs pays 10 gold and no chest, nothing when over quota or retired, and never counts in the campaign', () => {
    const solo = { ...ctx, rank: 1, retired: false, soloVsAi: true };
    expect(awardRace(empty(), solo).rewards).toMatchObject({ gold: 10, packs: 0, chests: [] });
    expect(awardRace(empty(), { ...solo, soloPaid: false }).rewards).toMatchObject({ gold: 0, packs: 0 });
    expect(awardRace(empty(), { ...solo, retired: true }).rewards).toMatchObject({ gold: 0, packs: 0 });
    expect(awardRace(empty(), { ...solo, campaign: { level: 0, stars: 1 } }).rewards.packs).toBe(2);
  });

  it('reports a level up', () => {
    const r = awardRace({ ...empty(), xp: 60 }, { ...ctx, rank: 1, retired: false });
    expect(r.rewards.levelUp).toBe(2);
  });

  it('finishing the next campaign level unlocks the one after, pays its reward once and opens its pack', () => {
    const level = LEVELS[0];
    const first = awardRace(empty(), { ...ctx, rank: 1, retired: false, campaign: { level: 0, stars: 2 } });
    expect(first.rewards.stageCleared).toBe(true);
    expect(first.profile.campaign.stars).toEqual([2]);
    expect(levelStatus(first.profile.campaign, 1)).toBe('next');
    // gems: the level's reward and 2 new stars
    expect(first.rewards.gems).toBe(level.reward.gems + 2 * level.starGems);
    expect(first.rewards.gold).toBe(100 + level.reward.gold);
    // the reward pack is drawn and already in the collection
    const cards = first.rewards.campaign!.cards;
    expect(cards).toHaveLength(5);
    for (const c of cards) expect(first.profile.owned[c.itemId] ?? 0).toBeGreaterThan(0);
    expect(first.profile.packsOpened).toBe(1);
    expect(first.profile.rng).not.toBe(empty().rng);
    // playing it again: no second reward, only the stars that improve pay gems
    const again = awardRace(first.profile, { ...ctx, rank: 1, retired: false, campaign: { level: 0, stars: 3 } });
    expect(again.rewards.stageCleared).toBe(false);
    expect(again.rewards.campaign!.cards).toEqual([]);
    expect(again.profile.campaign.stars).toEqual([3]);
    expect(again.rewards.gems).toBe(level.starGems);
    expect(again.rewards.gold).toBe(100 + Math.floor(level.reward.gold / 4));
    const worse = awardRace(again.profile, { ...ctx, rank: 2, retired: false, campaign: { level: 0, stars: 1 } });
    expect(worse.profile.campaign.stars).toEqual([3]); // the best result is kept
    expect(worse.rewards.gems).toBe(0);
  });

  it('a level finished with no star, or a locked one, does not progress the campaign', () => {
    expect(awardRace(empty(), { ...ctx, rank: 4, retired: true, campaign: { level: 0, stars: 0 } }).profile.campaign.stars).toEqual([0]);
    expect(clearedLevels(awardRace(empty(), { ...ctx, rank: 4, retired: true, campaign: { level: 0, stars: 0 } }).profile.campaign)).toBe(0);
    const locked = awardRace(empty(), { ...ctx, rank: 1, retired: false, campaign: { level: 2, stars: 3 } });
    expect(locked.profile.campaign.stars).toEqual([]);
    expect(locked.rewards.campaign).toBeUndefined();
  });

  it('the epic level pack always holds its guaranteed part', () => {
    const progress = { stars: [1, 1] };
    const r = awardRace({ ...empty(), campaign: progress }, { ...ctx, rank: 1, retired: false, campaign: { level: 2, stars: 3 } });
    expect(r.rewards.campaign!.cards.some((c) => c.itemId === LEVELS[2].reward.pack.guaranteedPart)).toBe(true);
    expect(starsOf(r.profile.campaign, 2)).toBe(3);
  });
});

describe('campaign', () => {
  it('has three levels on three different validated circuits, with growing laps and rewards', () => {
    expect(LEVELS).toHaveLength(3);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(3);
    expect(new Set(LEVELS.map((l) => l.trackId)).size).toBe(3);
    expect(LEVELS.map((l) => l.opponents.length)).toEqual([1, 2, 3]);
    expect(LEVELS.map((l) => l.laps)).toEqual([2, 3, 3]);
    expect(LEVELS.map((l) => l.reward.pack.tier)).toEqual(['common', 'rare', 'epic']);
    for (let i = 1; i < LEVELS.length; i++) expect(LEVELS[i].reward.gold).toBeGreaterThan(LEVELS[i - 1].reward.gold);
  });

  it('reports cleared, next and locked levels', () => {
    expect([0, 1, 2].map((i) => levelStatus({ stars: [1, 3] }, i))).toEqual(['cleared', 'cleared', 'next']);
    expect([0, 1, 2].map((i) => levelStatus({ stars: [1] }, i))).toEqual(['cleared', 'next', 'locked']);
    expect(levelStatus({ stars: [] }, 0)).toBe('next');
    expect(levelStatus({ stars: [0] }, 1)).toBe('locked'); // a level played without a star does not open the next
  });
});

describe('quests', () => {
  const base = empty();

  it('progress follows the counters and is capped at the target', () => {
    const q = QUESTS.find((x) => x.id === 'races-5')!;
    expect(questProgress({ ...base, races: 3 }, q)).toBe(3);
    expect(questProgress({ ...base, races: 99 }, q)).toBe(5);
    expect(counterValue({ ...base, loadout: { parts: { engine: 'a', tires: 'b' } } }, 'equipped')).toBe(2);
  });

  it('a finished quest can be claimed once, paying gold, gems and XP', () => {
    const p = { ...base, wins: 5 };
    const q = QUESTS.find((x) => x.id === 'wins-5')!;
    expect(isClaimable(p, q)).toBe(true);
    const r = claimQuest(p, 'wins-5')!;
    expect(r.profile).toMatchObject({ gold: p.gold + 300, gems: p.gems + 6, xp: 100 });
    expect(r.profile.claimed).toEqual(['wins-5']);
    expect(r.levelUp).toBe(2);
    expect(claimQuest(r.profile, 'wins-5')).toBeNull();
  });

  it('an unfinished or unknown quest cannot be claimed', () => {
    expect(claimQuest(base, 'wins-1')).toBeNull();
    expect(claimQuest({ ...base, wins: 1 }, 'nope')).toBeNull();
  });

  it('counts claimable quests for the tab badge', () => {
    expect(claimableCount(base)).toBe(0);
    const p = { ...base, races: 1, wins: 1, packsOpened: 1 };
    expect(claimableCount(p)).toBe(3); // races-1, wins-1, packs-1
  });

  it('quest ids are unique and every reward is something', () => {
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(QUESTS.length);
    for (const q of QUESTS) expect((q.reward.gold ?? 0) + (q.reward.gems ?? 0) + (q.reward.xp ?? 0)).toBeGreaterThan(0);
  });
});

describe('shop', () => {
  it('buys a pack with gold: pays, and the pack waits in a slot', () => {
    const p = { ...empty(), gold: 500 };
    const r = buyOffer(p, 'pack-1', NOW)!;
    expect(r.gold).toBe(380);
    expect(r.slots[0]).toEqual({ readyAt: NOW + COMMON_MS, tier: 'common' });
  });

  it('buys three packs, some may land in the reserve', () => {
    const full = { ...addPacks(empty(), 3, NOW), gold: 500 };
    const r = buyOffer(full, 'pack-3', NOW)!;
    expect(r.gold).toBe(200);
    expect(totalPacks(r)).toBe(6);
    expect(r.packs).toHaveLength(2);
  });

  it('gems buy an instant pack, or turn into gold', () => {
    const p = { ...empty(), gems: 30 };
    const pack = buyOffer(p, 'pack-instant', NOW)!;
    expect(pack.gems).toBe(22);
    expect(slotState(pack, 0, NOW).kind).toBe('ready');
    const gold = buyOffer(p, 'gold-400', NOW)!;
    expect(gold).toMatchObject({ gems: 6, gold: p.gold + 400 });
  });

  it('the epic chest costs 60 gems and takes 8 hours', () => {
    const r = buyOffer({ ...empty(), gems: 60 }, 'pack-epic', NOW)!;
    expect(r.gems).toBe(0);
    expect(r.slots[0]).toEqual({ readyAt: NOW + 8 * 3_600_000, tier: 'epic' });
    expect(buyOffer({ ...empty(), gems: 59 }, 'pack-epic', NOW)).toBeNull();
  });

  it('fragments are added to the stock', () => {
    expect(buyOffer({ ...empty(), gold: 150, fragments: 5 }, 'fragments-40', NOW)).toMatchObject({ gold: 0, fragments: 45 });
  });

  it('the shop day is the Paris calendar day', () => {
    expect(parisDay(Date.UTC(2026, 9, 21, 21, 59))).toBe('2026-10-21'); // 23:59 in Paris (summer time)
    expect(parisDay(Date.UTC(2026, 9, 21, 22, 0))).toBe('2026-10-22');
    expect(parisDay(Date.UTC(2026, 11, 31, 22, 59))).toBe('2026-12-31'); // 23:59 (winter time)
    expect(parisDay(Date.UTC(2026, 11, 31, 23, 0))).toBe('2027-01-01');
  });

  it('counts the time to the next Paris midnight, also on the days the clock changes', () => {
    const H = 3_600_000;
    expect(msUntilNextDay(Date.UTC(2026, 9, 21, 10, 0))).toBe(12 * H);
    expect(msUntilNextDay(Date.UTC(2026, 9, 21, 21, 59, 59))).toBe(1000);
    expect(msUntilNextDay(Date.UTC(2026, 9, 21, 22, 0))).toBe(24 * H);
    expect(msUntilNextDay(Date.UTC(2026, 9, 24, 22, 0))).toBe(25 * H); // 25 October: the clock goes back, a 25-hour day
    expect(msUntilNextDay(Date.UTC(2026, 2, 28, 23, 0))).toBe(23 * H); // 29 March: the clock goes forward, a 23-hour day
  });

  it('every day has 3 distinct offers, one under 200 gold, the same for everyone', () => {
    for (let d = 0; d < 120; d++) {
      const day = parisDay(Date.UTC(2026, 0, 1) + d * 86_400_000);
      const offers = dailyOffers(day, {});
      expect(offers, day).toHaveLength(DAILY_COUNT);
      expect(new Set(offers.map((o) => o.id)).size, day).toBe(DAILY_COUNT);
      expect(offers.some((o) => o.price < DAILY_CHEAP), day).toBe(true);
      expect(dailyOffers(day, {}), day).toEqual(offers);
    }
    const lists = new Set(Array.from({ length: 30 }, (_, d) => dailyOffers(parisDay(Date.UTC(2026, 5, 1) + d * 86_400_000), {}).map((o) => o.id).join()));
    expect(lists.size).toBeGreaterThan(10); // the offers do change
  });

  it('a cosmetic offer sells a common item the player does not own, and disappears when all are owned', () => {
    const commons = (kind: string) => COSMETICS.filter((c) => c.cosmetic === kind && c.rarity === 'common').map((c) => c.id);
    const days = Array.from({ length: 200 }, (_, d) => parisDay(Date.UTC(2026, 0, 1) + d * 86_400_000));
    const sold = new Set<string>();
    for (const day of days) for (const o of dailyOffers(day, {})) if (o.itemId) sold.add(o.itemId);
    expect([...sold].every((id) => [...commons('number'), ...commons('helmet')].includes(id))).toBe(true);
    const ownedAll = Object.fromEntries([...commons('number'), ...commons('helmet')].map((id) => [id, 1]));
    for (const day of days) expect(dailyOffers(day, ownedAll).filter((o) => o.itemId)).toEqual([]);
    for (const day of days) for (const o of dailyOffers(day, { [commons('number')[0]]: 1 })) expect(o.itemId).not.toBe(commons('number')[0]);
  });

  /** A day (and its offers) that sells the given line, for the tests below. */
  const dayWith = (id: string): number => {
    for (let d = 0; d < 400; d++) {
      const now = Date.UTC(2026, 0, 1, 12) + d * 86_400_000;
      if (dailyOffers(parisDay(now), {}).some((o) => o.id === id)) return now;
    }
    throw new Error('no day sells ' + id);
  };

  it('buys an offer of the day with gold, once per day', () => {
    const now = dayWith('daily-fragments-25');
    const p = { ...empty(), gold: 500, fragments: 3 };
    const r = buyOffer(p, 'daily-fragments-25', now)!;
    expect(r).toMatchObject({ gold: 400, fragments: 28 });
    expect(buyOffer(r, 'daily-fragments-25', now + 3_600_000)).toBeNull(); // already bought today
    expect(findOffer(r, 'daily-fragments-25', now)).toBeUndefined();
    expect(dailyView(r, now).offers.find((o) => o.offer.id === 'daily-fragments-25')!.bought).toBe(true);
    // the next day the offer is bought again only if the new draw sells it
    const next = now + 86_400_000;
    const again = dailyOffers(parisDay(next), {}).some((o) => o.id === 'daily-fragments-25');
    expect(buyOffer({ ...r, gold: 500 }, 'daily-fragments-25', next) !== null).toBe(again);
  });

  it('an offer of the day that is not listed today cannot be bought, whatever the id', () => {
    const now = dayWith('daily-fragments-25');
    const listed = new Set(dailyOffers(parisDay(now), {}).map((o) => o.id));
    const missing = ['daily-fragments-80', 'daily-fragments-200', 'daily-pack-common', 'daily-pack-rare'].find((id) => !listed.has(id))!;
    expect(buyOffer({ ...empty(), gold: 5000 }, missing, now)).toBeNull();
    expect(buyOffer({ ...empty(), gold: 5000 }, 'daily-nope', now)).toBeNull();
  });

  it('a cosmetic of the day is granted once and stays listed as bought', () => {
    const d = Array.from({ length: 400 }, (_, i) => Date.UTC(2026, 0, 1, 12) + i * 86_400_000).find((t) => dailyOffers(parisDay(t), {}).some((o) => o.itemId))!;
    const offer = dailyOffers(parisDay(d), {}).find((o) => o.itemId)!;
    const r = buyOffer({ ...empty(), gold: 1000 }, offer.id, d)!;
    expect(r.owned[offer.itemId!]).toBe(1);
    expect(r.gold).toBe(1000 - offer.price);
    const view = dailyView(r, d).offers;
    expect(view.map((o) => o.offer.id)).toEqual(dailyOffers(parisDay(d), {}).map((o) => o.id)); // same list after the purchase
    expect(view.find((o) => o.offer.id === offer.id)!.bought).toBe(true);
    expect(buyOffer({ ...r, gold: 1000 }, offer.id, d)).toBeNull();
  });

  it('refuses when the player cannot pay, or the offer is unknown', () => {
    expect(buyOffer({ ...empty(), gold: 119 }, 'pack-1', NOW)).toBeNull();
    expect(buyOffer({ ...empty(), gems: 7 }, 'pack-instant', NOW)).toBeNull();
    expect(buyOffer(empty(), 'nope', NOW)).toBeNull();
  });

  it('every offer has a positive price and can be afforded with enough of its currency', () => {
    for (const o of OFFERS) {
      expect(o.price).toBeGreaterThan(0);
      expect(canAfford({ ...empty(), [o.currency]: o.price }, o)).toBe(true);
      expect(canAfford({ ...empty(), [o.currency]: o.price - 1 }, o)).toBe(false);
    }
  });
});
