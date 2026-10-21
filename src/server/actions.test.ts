import { describe, expect, it } from 'vitest';
import { LEVELS, starsFor } from '../data/campaign';
import { COSMETICS, ITEMS, PARTS } from '../data/parts/catalogue';
import { upgradeCost } from '../data/parts/packs';
import { GIFT_FRAGMENTS, GIFT_GOLD, GIFT_STREAK_DAYS, WELCOME_GEMS, WELCOME_GOLD, WELCOME_MS, WELCOME_PAINT } from '../data/gift';
import { seasonOf } from '../data/pass';
import { newProfile, serializeProfile } from '../data/profile/profile';
import { dailyOffers, parisDay } from '../data/shop';
import { importSave } from './importSave';
import { SOLO_GOLD, SOLO_PAID_PER_HOUR, openSlot } from '../data/profile/ops';
import { TRACKS } from '../data/tracks';
import { applyAction, type ActionContext } from './actions';
import { GameError } from './errors';
import { LAP_LENGTH, RACE_RULES, minRaceMs } from './race';
import { freshState, publicState, readState, rngFrom, type ServerState } from './state';

const T0 = Date.UTC(2026, 9, 21, 12);
const MIN = 60_000;

/** Deterministic stand-in for the server's crypto randomness. */
function counter(start = 1): () => number {
  let i = start;
  return () => Math.imul(i++, 2654435761) >>> 0;
}
const ctx = (now = T0, random = counter()): ActionContext => ({ now, random });
const fresh = (over: Partial<ServerState['profile']> = {}): ServerState => {
  const s = freshState(T0, counter(99));
  return { ...s, profile: { ...s.profile, ...over } };
};

/** Runs an action and returns the error it throws (or fails the test). */
function refused(state: ServerState, action: unknown, params: unknown, c: ActionContext = ctx()): GameError {
  try {
    applyAction(state, action, params, c);
  } catch (e) {
    expect(e).toBeInstanceOf(GameError);
    return e as GameError;
  }
  throw new Error(`${String(action)} should have been refused`);
}

const part = PARTS.find((p) => p.rarity === 'common')!;

describe('requests', () => {
  it('refuses unknown actions and malformed parameters', () => {
    const s = fresh();
    expect(refused(s, 'give_gems', {}).code).toBe('invalid');
    expect(refused(s, 42, {}).code).toBe('invalid');
    expect(refused(s, 'sync', [1, 2]).code).toBe('invalid');
    expect(refused(s, 'sync', 'x').code).toBe('invalid');
    // the browser cannot send its own profile, price or duration
    expect(refused(s, 'sync', { profile: { gems: 999 } }).code).toBe('invalid');
    expect(refused(s, 'buy_offer', { id: 'pack-1', price: 0 }).code).toBe('invalid');
    expect(refused(s, 'open_slot', { index: 0, now: T0 + 99 * 3_600_000 }).code).toBe('invalid');
  });

  it('sync changes nothing', () => {
    const s = fresh();
    const r = applyAction(s, 'sync', undefined, ctx());
    expect(r.changed).toBe(false);
    expect(r.state).toBe(s);
  });

  it('the public state hides the chest rng', () => {
    const s = fresh();
    expect(s.profile.rng).not.toBe(0);
    expect(publicState(s).profile.rng).toBe(0);
  });
});

describe('shop', () => {
  it('buys an offer with the server clock', () => {
    const r = applyAction(fresh(), 'buy_offer', { id: 'pack-1' }, ctx());
    expect(r.state.profile.gold).toBe(200 - 120);
    expect(r.state.profile.slots[3]).toEqual({ tier: 'common', readyAt: T0 + 30 * MIN });
    expect(r.result).toEqual({ action: 'buy_offer', offer: 'pack-1' });
  });

  it('refuses unknown offers, malformed ids and short balances', () => {
    expect(refused(fresh(), 'buy_offer', { id: 'pack-999' }).code).toBe('not_found');
    expect(refused(fresh(), 'buy_offer', { id: '../x' }).code).toBe('invalid');
    expect(refused(fresh(), 'buy_offer', { id: 'p'.repeat(41) }).code).toBe('invalid');
    expect(refused(fresh(), 'buy_offer', {}).code).toBe('invalid');
    const e = refused(fresh({ gems: 7 }), 'buy_offer', { id: 'pack-instant' });
    expect(e.code).toBe('refused');
    expect(e.message).toBe('Pas assez de ressources.');
  });
});

describe('daily gift and welcome pack', () => {
  it('a new account has the welcome pack on offer for 72 hours, collected once', () => {
    const s = fresh();
    expect(s.profile.welcomeUntil).toBe(T0 + WELCOME_MS);
    const r = applyAction(s, 'claim_welcome', {}, ctx(T0 + 60 * MIN));
    expect(r.result).toMatchObject({ action: 'claim_welcome', reward: { gold: WELCOME_GOLD, gems: WELCOME_GEMS, itemId: WELCOME_PAINT } });
    expect(r.state.profile.gems).toBe(s.profile.gems + WELCOME_GEMS);
    expect(r.state.profile.owned[WELCOME_PAINT]).toBe(1);
    expect(refused(r.state, 'claim_welcome', {}, ctx(T0 + 61 * MIN)).message).toContain('pack de bienvenue');
  });

  it('refuses the welcome pack after the deadline, and extra parameters', () => {
    expect(refused(fresh(), 'claim_welcome', {}, ctx(T0 + WELCOME_MS)).code).toBe('refused');
    expect(refused(fresh(), 'claim_welcome', { gems: 99999 }).code).toBe('invalid');
    expect(refused(fresh(), 'claim_gift', { gold: 99999 }).code).toBe('invalid');
  });

  it('the gift of the day follows the server clock and the streak', () => {
    const r = applyAction(fresh(), 'claim_gift', {}, ctx(T0));
    expect(r.result).toMatchObject({ action: 'claim_gift', reward: { gold: GIFT_GOLD, fragments: GIFT_FRAGMENTS, streak: 1 } });
    expect(refused(r.state, 'claim_gift', {}, ctx(T0 + 60 * MIN)).message).toContain('cadeau du jour');
    const next = applyAction(r.state, 'claim_gift', {}, ctx(T0 + 24 * 60 * MIN));
    expect(next.result).toMatchObject({ reward: { streak: 2 } });
  });

  it('an imported save never keeps its own welcome deadline, and its streak is capped', () => {
    const local = { ...JSON.parse(serializeProfile(newProfile(3))), welcomeUntil: 9_999_999_999_999, gift: { day: '2026-10-20', streak: 900 } };
    const imported = importSave(JSON.stringify(local), T0, counter(3));
    expect(imported.state.profile.welcomeUntil).toBe(T0 + WELCOME_MS);
    expect(imported.state.profile.gift).toEqual({ day: '2026-10-20', streak: GIFT_STREAK_DAYS });
  });
});

describe('season pass', () => {
  const start = (s: ServerState, params: object, c = ctx()) => applyAction(s, 'start_race', params, c);
  const finishParams = (s: ServerState) => ({ token: s.race!.id, rank: 1, retired: false, clean: true });
  const withPoints = (points: number, claimed: number[] = []) => {
    const s = fresh();
    return { ...s, profile: { ...s.profile, pass: { season: seasonOf(T0), points, claimed } } };
  };

  it('collects a reached tier once, paid by the server', () => {
    const s = withPoints(100);
    const r = applyAction(s, 'claim_pass', { tier: 1 }, ctx());
    expect(r.result).toEqual({ action: 'claim_pass', tier: 1, reward: { kind: 'gold', amount: 150 }, fragments: 0 });
    expect(r.state.profile.gold).toBe(s.profile.gold + 150);
    expect(r.state.profile.pass.claimed).toEqual([1]);
    expect(refused(r.state, 'claim_pass', { tier: 1 }).message).toContain('palier du passe');
    expect(applyAction(r.state, 'claim_pass', { tier: 2 }, ctx()).changed).toBe(true);
  });

  it('refuses a tier not reached, a wrong tier, extra parameters, and points of an older season', () => {
    expect(refused(withPoints(49), 'claim_pass', { tier: 1 }).code).toBe('refused');
    for (const tier of [0, 31, 1.5, '1', null]) expect(refused(withPoints(1500), 'claim_pass', { tier }).code).toBe('invalid');
    expect(refused(withPoints(1500), 'claim_pass', { tier: 1, premium: true }).code).toBe('invalid');
    expect(refused(withPoints(1500), 'claim_pass', {}).code).toBe('invalid');
    expect(refused(withPoints(1500), 'claim_pass', { tier: 1 }, ctx(T0 + 15 * 86_400_000)).code).toBe('refused');
  });

  it('a race and a quest add pass points on the server', () => {
    const s = start(fresh(), { trackId: 'oval', laps: 2, players: 3, bots: 1 }).state;
    const r = applyAction(s, 'finish_race', { token: s.race!.id, rank: 1, retired: false, clean: true }, ctx(T0 + 3_600_000));
    expect(r.result).toMatchObject({ rewards: { pass: 30 } });
    expect(r.state.profile.pass).toEqual({ season: seasonOf(T0), points: 30, claimed: [] });
    const q = applyAction({ ...r.state, profile: { ...r.state.profile, races: 1 } }, 'claim_quest', { id: 'races-1' }, ctx(T0 + 3_600_000));
    expect(q.state.profile.pass.points).toBe(50);
  });

  it('a solo race against AIs adds pass points only while it is paid', () => {
    const solo = { trackId: 'oval', laps: 2, players: 2, bots: 1 };
    let s = fresh();
    let t = T0;
    for (let i = 0; i < SOLO_PAID_PER_HOUR + 1; i++) {
      s = start(s, solo, ctx(t, counter(i * 10 + 1))).state;
      t += 60_000;
      const r = applyAction(s, 'finish_race', finishParams(s), ctx(t));
      expect((r.result as { rewards: { pass: number } }).rewards.pass).toBe(i < SOLO_PAID_PER_HOUR ? 30 : 0);
      s = r.state;
    }
    expect(s.profile.pass.points).toBe(SOLO_PAID_PER_HOUR * 30);
  });

  it('an imported save starts the pass from zero', () => {
    const local = { ...JSON.parse(serializeProfile(newProfile(3))), pass: { season: 0, points: 1500, claimed: [] } };
    expect(importSave(JSON.stringify(local), T0, counter(3)).state.profile.pass).toEqual({ season: 0, points: 0, claimed: [] });
  });
});

describe('offers of the day', () => {
  const lineOf = (now: number) => dailyOffers(parisDay(now), {}).find((o) => !o.itemId)!;

  it('sells an offer of the server day once, and refuses it again', () => {
    const offer = lineOf(T0);
    const s = fresh({ gold: 1000 });
    const r = applyAction(s, 'buy_offer', { id: offer.id }, ctx());
    expect(r.state.profile.gold).toBe(1000 - offer.price);
    expect(r.state.profile.shop).toMatchObject({ day: parisDay(T0), bought: [offer.id] });
    const again = refused(r.state, 'buy_offer', { id: offer.id }, ctx(T0 + MIN));
    expect(again.code).toBe('not_found');
    expect(again.message).toContain('offre du jour');
  });

  it('only the server clock decides the day: an offer of another day is refused', () => {
    const other = Array.from({ length: 60 }, (_, d) => T0 + (d + 1) * 86_400_000).find((t) => !dailyOffers(parisDay(t), {}).some((o) => o.id === lineOf(T0).id))!;
    expect(refused(fresh({ gold: 1000 }), 'buy_offer', { id: lineOf(T0).id }, ctx(other)).code).toBe('not_found');
  });
});

describe('chests', () => {
  it('opens a ready chest with the server randomness, not the stored rng', () => {
    const s = fresh();
    const random = counter(7);
    const expected = openSlot({ ...s.profile, rng: rngFrom(counter(7)) }, 0, T0);
    const r = applyAction(s, 'open_slot', { index: 0 }, ctx(T0, random));
    expect(r.result).toMatchObject({ action: 'open_slot', opened: { tier: 'common', cards: expected!.cards } });
    expect(r.state.profile.packsOpened).toBe(1);
    expect(r.state.profile.slots[0]).toBeNull();
  });

  it('refuses a locked, an empty or a missing slot', () => {
    const locked = applyAction(fresh(), 'buy_offer', { id: 'pack-1' }, ctx()).state;
    expect(refused(locked, 'open_slot', { index: 3 }).message).toBe('Ce coffre n’est pas encore prêt.');
    expect(refused(fresh(), 'open_slot', { index: 3 }).message).toBe('Cet emplacement est vide.');
    for (const index of [4, -1, 1.5, '0', null]) expect(refused(fresh(), 'open_slot', { index }).code).toBe('invalid');
  });

  it('a device clock in the future does not open a chest: only the server time counts', () => {
    const locked = applyAction(fresh(), 'buy_offer', { id: 'pack-1' }, ctx()).state;
    expect(refused(locked, 'open_slot', { index: 3 }, ctx(T0 + 29 * MIN)).code).toBe('refused');
    expect(applyAction(locked, 'open_slot', { index: 3 }, ctx(T0 + 30 * MIN)).changed).toBe(true);
  });

  it('skips a timer with gems, refuses when gems are short', () => {
    const locked = applyAction(fresh(), 'buy_offer', { id: 'pack-1' }, ctx()).state; // 30 min left: 3 gems
    const r = applyAction(locked, 'skip_slot', { index: 3 }, ctx());
    expect(r.result).toEqual({ action: 'skip_slot', cost: 3 });
    expect(r.state.profile.gems).toBe(25 - 3);
    expect(r.state.profile.slots[3]?.readyAt).toBe(T0);
    const poor: ServerState = { ...locked, profile: { ...locked.profile, gems: 2 } };
    expect(refused(poor, 'skip_slot', { index: 3 }).message).toBe('Pas assez de gemmes.');
    expect(refused(fresh(), 'skip_slot', { index: 0 }).message).toBe('Ce coffre est déjà prêt.');
  });
});

describe('garage', () => {
  it('upgrades an owned part with fragments', () => {
    const cost = upgradeCost(part.rarity, 1)!;
    const r = applyAction(fresh({ owned: { [part.id]: 1 }, fragments: cost }), 'upgrade_part', { id: part.id }, ctx());
    expect(r.state.profile.owned[part.id]).toBe(2);
    expect(r.state.profile.fragments).toBe(0);
    expect(r.result).toEqual({ action: 'upgrade_part', id: part.id, level: 2 });
  });

  it('refuses unknown, missing, maxed parts and short fragments', () => {
    expect(refused(fresh(), 'upgrade_part', { id: 'turbo-x' }).code).toBe('not_found');
    expect(refused(fresh(), 'upgrade_part', { id: part.id }).message).toBe('Vous ne possédez pas cette pièce.');
    expect(refused(fresh({ owned: { [part.id]: 5 }, fragments: 9999 }), 'upgrade_part', { id: part.id }).message).toContain('maximum');
    expect(refused(fresh({ owned: { [part.id]: 1 }, fragments: 0 }), 'upgrade_part', { id: part.id }).message).toBe('Pas assez de fragments.');
  });

  it('equips and unequips owned items only', () => {
    const cosmetic = COSMETICS[0];
    const owned = fresh({ owned: { [part.id]: 1, [cosmetic.id]: 1 } });
    const a = applyAction(owned, 'equip', { id: part.id }, ctx()).state;
    expect(a.profile.loadout.parts[part.slot]).toBe(part.id);
    const b = applyAction(a, 'equip', { id: cosmetic.id }, ctx()).state;
    expect(b.profile.loadout[cosmetic.cosmetic]).toBe(cosmetic.id);
    expect(applyAction(b, 'unequip', { slot: part.slot }, ctx()).state.profile.loadout.parts[part.slot]).toBeUndefined();
    expect(applyAction(b, 'unequip', { cosmetic: cosmetic.cosmetic }, ctx()).state.profile.loadout[cosmetic.cosmetic]).toBeUndefined();
    expect(refused(fresh(), 'equip', { id: part.id }).message).toBe('Vous ne possédez pas cet objet.');
    expect(refused(fresh(), 'equip', { id: 'nope' }).code).toBe('not_found');
    expect(refused(b, 'unequip', { slot: part.slot, cosmetic: 'paint' }).code).toBe('invalid');
    expect(refused(b, 'unequip', {}).code).toBe('invalid');
    expect(refused(b, 'unequip', { slot: 'roof' }).code).toBe('not_found');
  });
});

describe('quests', () => {
  it('pays a finished quest once', () => {
    const s = fresh({ races: 1 });
    const r = applyAction(s, 'claim_quest', { id: 'races-1' }, ctx());
    expect(r.state.profile.gold).toBe(250);
    expect(r.state.profile.claimed).toEqual(['races-1']);
    expect(refused(r.state, 'claim_quest', { id: 'races-1' }).message).toBe('Récompense déjà récupérée.');
    expect(refused(s, 'claim_quest', { id: 'wins-1' }).message).toBe('Cette quête n’est pas encore terminée.');
    expect(refused(s, 'claim_quest', { id: 'races-99' }).code).toBe('not_found');
  });
});

describe('races', () => {
  const start = (s: ServerState, params: object = { trackId: 'oval', laps: 2, players: 3, bots: 1 }, c = ctx()) => applyAction(s, 'start_race', params, c);
  const finishParams = (s: ServerState, over: object = {}) => ({ token: s.race!.id, rank: 1, retired: false, clean: true, ...over });

  it('issues one token with a server seed and server time', () => {
    const a = start(fresh());
    expect(a.state.race).toMatchObject({ trackId: 'oval', laps: 2, players: 3, bots: 1, level: null, startedAt: T0 });
    expect(a.state.race!.id).toMatch(/^[0-9a-f]{32}$/);
    expect(a.state.race!.seed).toBeGreaterThan(0);
    // a new start replaces the unfinished race
    const b = start(a.state, undefined, ctx(T0 + 1000, counter(50)));
    expect(b.state.race!.id).not.toBe(a.state.race!.id);
  });

  it('refuses unknown circuits and impossible fields, and never takes a seed from the browser', () => {
    expect(refused(fresh(), 'start_race', { trackId: 'no-such-track', laps: 2, players: 2, bots: 1 }).code).toBe('not_found');
    expect(refused(fresh(), 'start_race', { trackId: 'oval', laps: 4, players: 2, bots: 1 }).code).toBe('invalid');
    expect(refused(fresh(), 'start_race', { trackId: 'oval', laps: 2, players: 5, bots: 1 }).code).toBe('invalid');
    expect(refused(fresh(), 'start_race', { trackId: 'oval', laps: 2, players: 2, bots: 2 }).code).toBe('invalid');
    expect(refused(fresh(), 'start_race', { trackId: 'oval', laps: 2, players: 2, bots: 1, seed: 5 }).code).toBe('invalid');
  });

  it('pays a race once, after a plausible time', () => {
    const s = start(fresh()).state;
    const at = T0 + minRaceMs(s.race!, false);
    const r = applyAction(s, 'finish_race', finishParams(s), ctx(at));
    expect(r.result).toMatchObject({ action: 'finish_race', verified: false, rewards: { packs: 2, gold: 100 } });
    expect(r.state.race).toBeNull();
    expect(r.state.profile.races).toBe(1);
    expect(r.state.profile.wins).toBe(1);
    expect(r.state.finishes).toEqual([at]);
    expect(r.log).toMatchObject({ verified: false, rank: 1 });
    // the same token again: refused
    expect(refused(r.state, 'finish_race', finishParams(s), ctx(at + 1)).code).toBe('race');
  });

  it('refuses a race finished too fast, a wrong or missing token, an impossible rank', () => {
    const s = start(fresh()).state;
    const short = refused(s, 'finish_race', finishParams(s), ctx(T0 + 5_000));
    expect(short.code).toBe('race');
    expect(short.message).toContain('trop vite');
    expect(refused(s, 'finish_race', finishParams(s, { token: 'f'.repeat(32) }), ctx(T0 + 3_600_000)).code).toBe('race');
    expect(refused(fresh(), 'finish_race', { token: 'a'.repeat(32), rank: 1, retired: false }, ctx(T0 + 3_600_000)).code).toBe('race');
    expect(refused(s, 'finish_race', finishParams(s, { token: 'not-hex' })).code).toBe('invalid');
    expect(refused(s, 'finish_race', finishParams(s, { rank: 0 }), ctx(T0 + 3_600_000)).code).toBe('invalid');
    expect(refused(s, 'finish_race', finishParams(s, { rank: 4 }), ctx(T0 + 3_600_000)).code).toBe('invalid');
    expect(refused(s, 'finish_race', finishParams(s, { gold: 1e6 }), ctx(T0 + 3_600_000)).code).toBe('invalid');
  });

  it('a retirement only needs the floor; an old token expires', () => {
    const s = start(fresh()).state;
    const r = applyAction(s, 'finish_race', finishParams(s, { retired: true, rank: 3 }), ctx(T0 + RACE_RULES.floorMs));
    expect(r.result).toMatchObject({ rewards: { packs: 0, gold: 10 } });
    expect(refused(s, 'finish_race', finishParams(s), ctx(T0 + RACE_RULES.tokenTtlMs + 1)).message).toContain('expirée');
  });

  it('pays at most maxPerHour races per hour', () => {
    let s = fresh();
    let t = T0;
    for (let i = 0; i < RACE_RULES.maxPerHour; i++) {
      s = start(s, undefined, ctx(t, counter(i * 10 + 1))).state;
      t += 60_000;
      s = applyAction(s, 'finish_race', finishParams(s, { rank: 2 }), ctx(t)).state;
    }
    s = start(s, undefined, ctx(t, counter(999))).state;
    const e = refused(s, 'finish_race', finishParams(s, { rank: 2 }), ctx(t + 60_000));
    expect(e.code).toBe('too_many');
    // an hour after the first ones, races pay again
    expect(applyAction(s, 'finish_race', finishParams(s, { rank: 2 }), ctx(T0 + 3_600_000 + 120_000)).changed).toBe(true);
  });

  it('a free race against AIs only pays 10 gold and no chest, at most 5 times per hour', () => {
    const solo = { trackId: 'oval', laps: 2, players: 3, bots: 2 };
    let s = fresh();
    const gold0 = s.profile.gold;
    let t = T0;
    for (let i = 0; i < SOLO_PAID_PER_HOUR; i++) {
      s = start(s, solo, ctx(t, counter(i * 10 + 1))).state;
      t += 60_000;
      const r = applyAction(s, 'finish_race', finishParams(s), ctx(t));
      expect(r.result).toMatchObject({ rewards: { packs: 0, chests: [], gold: SOLO_GOLD } });
      s = r.state;
    }
    expect(s.profile.gold).toBe(gold0 + SOLO_PAID_PER_HOUR * SOLO_GOLD);
    // the sixth in the hour pays no gold; an hour after the first one, a paid slot is free again
    s = start(s, solo, ctx(t, counter(777))).state;
    const sixth = applyAction(s, 'finish_race', finishParams(s), ctx(t + 60_000));
    expect(sixth.result).toMatchObject({ rewards: { gold: 0, packs: 0 } });
    s = start(sixth.state, solo, ctx(T0 + 3_600_000 + 120_000, counter(888))).state;
    expect(applyAction(s, 'finish_race', finishParams(s), ctx(T0 + 3_600_000 + 180_000)).result).toMatchObject({ rewards: { gold: SOLO_GOLD } });
  });

  it('a solo race left early pays nothing and does not use the quota; a race with another person is not solo', () => {
    const solo = { trackId: 'oval', laps: 2, players: 2, bots: 1 };
    const s = start(fresh(), solo).state;
    const out = applyAction(s, 'finish_race', finishParams(s, { retired: true, rank: 2 }), ctx(T0 + RACE_RULES.floorMs));
    expect(out.result).toMatchObject({ rewards: { gold: 0, packs: 0 } });
    expect(out.state.soloFinishes).toEqual([]);
    const withFriend = start(fresh(), { trackId: 'oval', laps: 2, players: 3, bots: 1 }).state;
    const r = applyAction(withFriend, 'finish_race', finishParams(withFriend), ctx(T0 + 3_600_000));
    expect(r.result).toMatchObject({ rewards: { gold: 100, packs: 2 } });
    expect(r.state.soloFinishes).toEqual([]);
  });

  it('a campaign level fixes the race and pays its stars', () => {
    const level = LEVELS[0];
    const s = start(fresh(), { level: 0 }).state;
    expect(s.race).toMatchObject({ trackId: level.trackId, laps: level.laps, players: 1 + level.opponents.length, bots: level.opponents.length, level: 0 });
    const stats = { tireLoss: 0, partBroken: false, cornerOvertakes: 1 };
    const r = applyAction(s, 'finish_race', finishParams(s, { stats }), ctx(T0 + 3_600_000));
    const stars = starsFor(level, { rank: 1, retired: false, stats }).stars;
    expect(r.result).toMatchObject({ rewards: { stageCleared: true, campaign: { level: 0, stars } } });
    expect(r.state.profile.campaign.stars[0]).toBe(stars);
    expect(refused(s, 'finish_race', finishParams(s), ctx(T0 + 3_600_000)).code).toBe('invalid'); // stats required
    expect(refused(s, 'finish_race', finishParams(s, { stats: { ...stats, tireLoss: -1 } }), ctx(T0 + 3_600_000)).code).toBe('invalid');
  });

  it('a locked campaign level cannot start, and its fields cannot be overridden', () => {
    expect(refused(fresh(), 'start_race', { level: 1 }).message).toContain('pas encore ouvert');
    expect(refused(fresh(), 'start_race', { level: 0, laps: 1 }).code).toBe('invalid');
    expect(refused(fresh(), 'start_race', { level: 99 }).code).toBe('invalid');
  });

  it('the lap lengths of the server match the circuits', () => {
    for (const [trackId, def] of Object.entries(TRACKS)) expect(LAP_LENGTH[trackId], trackId).toBe(def.lapLength);
    expect(Object.keys(LAP_LENGTH).sort()).toEqual(Object.keys(TRACKS).sort());
  });

  it('the minimum duration grows with laps and circuit length', () => {
    expect(minRaceMs({ trackId: 'col', laps: 3 }, false)).toBeGreaterThan(minRaceMs({ trackId: 'col', laps: 1 }, false));
    expect(minRaceMs({ trackId: 'col', laps: 3 }, false)).toBeGreaterThan(minRaceMs({ trackId: 'oval', laps: 3 }, false));
    expect(minRaceMs({ trackId: 'col', laps: 3 }, true)).toBe(RACE_RULES.floorMs);
  });
});

describe('stored state', () => {
  it('a row that cannot be read is refused, not repaired silently', () => {
    for (const raw of [null, 'x', {}, { v: 2, profile: {} }, { v: 1, profile: { version: 99 } }, { v: 1, profile: { version: 3 } }]) {
      expect(() => readState(raw)).toThrowError(GameError);
    }
  });

  it('reads back what it wrote, and drops a malformed race token', () => {
    const s = start0();
    expect(readState(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(readState({ ...JSON.parse(JSON.stringify(s)), race: { id: 'x' } }).race).toBeNull();
  });

  function start0(): ServerState {
    return applyAction(fresh(), 'start_race', { trackId: 'oval', laps: 1, players: 1, bots: 0 }, ctx()).state;
  }

  it('every catalogue item is known to the server rules', () => {
    for (const item of ITEMS) expect(applyAction(fresh({ owned: { [item.id]: 1 } }), 'equip', { id: item.id }, ctx()).changed).toBe(true);
  });
});

describe('test tools', () => {
  const tester = (now = T0): ActionContext => ({ ...ctx(now), role: 'tester' });

  it('are for testers and admins only, and the refusal is a 403', () => {
    const s = fresh();
    for (const role of [undefined, 'player', 'vip']) {
      const e = refused(s, 'tester_grant', { gold: 10 }, { ...ctx(), role });
      expect([e.code, e.status]).toEqual(['refused', 403]);
      expect(refused(s, 'tester_reset', { confirm: true }, { ...ctx(), role }).status).toBe(403);
    }
    expect(applyAction(s, 'tester_grant', { gold: 10 }, { ...ctx(), role: 'admin' }).changed).toBe(true);
  });

  it('give resources, experience, a chest ready to open and a part at the asked level, on the tester account', () => {
    const s = fresh({ gold: 5, gems: 6, fragments: 7, xp: 0 });
    const a = applyAction(s, 'tester_grant', { gold: 1000, gems: 50, fragments: 200, xp: 500, chest: 'epic', item: part.id, itemLevel: 3 }, tester());
    const p = a.state.profile;
    expect([p.gold, p.gems, p.fragments, p.xp]).toEqual([1005, 56, 207, 500]);
    expect(p.owned[part.id]).toBe(3);
    expect(p.slots.some((slot) => slot?.tier === 'epic' && slot.readyAt <= T0)).toBe(true);
    expect(a.result).toMatchObject({ action: 'tester_grant', granted: { gold: 1000, chest: 'epic', item: part.id } });
    expect(a.log).toMatchObject({ tester: true });
  });

  it('never lower a part the tester already has, and a cosmetic is simply owned', () => {
    const cosmetic = COSMETICS[0];
    const s = fresh({ owned: { [part.id]: 4 } });
    expect(applyAction(s, 'tester_grant', { item: part.id, itemLevel: 2 }, tester()).state.profile.owned[part.id]).toBe(4);
    expect(applyAction(s, 'tester_grant', { item: cosmetic.id }, tester()).state.profile.owned[cosmetic.id]).toBe(1);
  });

  it('refuse empty, oversized, unknown and unexpected requests', () => {
    const s = fresh();
    expect(refused(s, 'tester_grant', {}, tester()).code).toBe('invalid');
    expect(refused(s, 'tester_grant', { gold: 100_001 }, tester()).code).toBe('invalid');
    expect(refused(s, 'tester_grant', { gold: -5 }, tester()).code).toBe('invalid');
    expect(refused(s, 'tester_grant', { gold: 1.5 }, tester()).code).toBe('invalid');
    expect(refused(s, 'tester_grant', { chest: 'mythic' }, tester()).code).toBe('not_found');
    expect(refused(s, 'tester_grant', { item: 'nope' }, tester()).code).toBe('not_found');
    expect(refused(s, 'tester_grant', { itemLevel: 3 }, tester()).code).toBe('invalid');
    expect(refused(s, 'tester_grant', { gold: 1, userId: 'someone-else' }, tester()).code).toBe('invalid');
  });

  it('start the account over only on an explicit confirmation, keeping its age', () => {
    const s = { ...fresh({ gold: 9999, races: 12 }), createdAt: T0 - 5 * MIN };
    expect(refused(s, 'tester_reset', {}, tester()).code).toBe('invalid');
    expect(refused(s, 'tester_reset', { confirm: false }, tester()).code).toBe('invalid');
    const a = applyAction(s, 'tester_reset', { confirm: true }, tester());
    expect(a.state.profile.races).toBe(0);
    expect(a.state.profile.welcomeUntil).toBeGreaterThan(T0);
    expect(a.state.createdAt).toBe(T0 - 5 * MIN);
    expect(a.state.race).toBeNull();
  });
});
