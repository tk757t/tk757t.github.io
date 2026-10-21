import { LEVELS, starsFor } from '../data/campaign';
import { getItem, getPart } from '../data/parts/catalogue';
import { upgradeCost, type Card } from '../data/parts/packs';
import { MAX_LEVEL, SLOTS, type Slot } from '../data/parts/types';
import type { ChestTier } from '../data/chests';
import { awardRaceWithPass, claimQuestWithPass } from '../data/rewards';
import { SOLO_PAID_PER_HOUR, equip, openSlot, skipCost, skipSlot, slotState, unequipCosmetic, unequipSlot, upgradePart, type RaceRewards } from '../data/profile/ops';
import { SLOT_COUNT, type Profile } from '../data/profile/profile';
import { QUESTS, isClaimed, isClaimable } from '../data/quests';
import { PASS_TIERS, claimPassTier, type PassReward } from '../data/pass';
import { claimGift, claimWelcome, type GiftReward, type WelcomeReward } from '../data/gift';
import { buyOffer, canAfford, findOffer } from '../data/shop';
import { levelStatus } from '../storage/campaign';
import { fail } from './errors';
import { asParams, bool, id, int, only, record, type Params } from './params';
import { LAP_LENGTH, MAX_LAPS, MAX_PLAYERS, RACE_RULES, minRaceMs, raceSeed, tokenId, type RaceRules } from './race';
import { rngFrom, type RaceToken, type ServerState } from './state';

/**
 * The game rules as the server applies them. Pure: the state, the parameters sent by the browser, the server's clock and
 * the server's randomness go in; the new state and what to show come out. Every rule is the one of src/data (the same
 * code as the offline game), called with `ctx.now` and a fresh `ctx.random` draw, never with values from the browser.
 */
export const ACTIONS = ['sync', 'start_race', 'finish_race', 'open_slot', 'skip_slot', 'buy_offer', 'claim_gift', 'claim_welcome', 'claim_pass', 'upgrade_part', 'equip', 'unequip', 'claim_quest'] as const;
export type ActionName = (typeof ACTIONS)[number];
export const isAction = (x: unknown): x is ActionName => typeof x === 'string' && (ACTIONS as readonly string[]).includes(x);

export interface ActionContext {
  /** Server time, ms since epoch. */
  now: number;
  /** Server randomness: a uint32 per call (crypto.getRandomValues in the Edge Function). */
  random: () => number;
  rules?: RaceRules;
}

export interface OpenedResult {
  tier: ChestTier;
  cards: Card[];
  gold: number;
  gems: number;
  pityTriggered: boolean;
}

export type ActionResult =
  | { action: 'sync' }
  | { action: 'start_race'; race: RaceToken }
  | { action: 'finish_race'; rewards: RaceRewards; /** Always false for now: the rank is declared by the browser. */ verified: false }
  | { action: 'open_slot'; opened: OpenedResult }
  | { action: 'skip_slot'; cost: number }
  | { action: 'buy_offer'; offer: string }
  | { action: 'claim_gift'; reward: GiftReward }
  | { action: 'claim_welcome'; reward: WelcomeReward }
  | { action: 'claim_pass'; tier: number; reward: PassReward; fragments: number }
  | { action: 'upgrade_part'; id: string; level: number }
  | { action: 'equip'; id: string }
  | { action: 'unequip' }
  | { action: 'claim_quest'; id: string; levelUp: number | null };

export interface Applied {
  state: ServerState;
  result: ActionResult;
  /** Whether the state changed and must be written. */
  changed: boolean;
  /** Extra data for the action log (never shown to the player). */
  log?: Record<string, unknown>;
}

const HOUR = 3_600_000;
const COSMETIC_KINDS = ['paint', 'number', 'helmet'] as const;

/** The profile with its chest rng redrawn from the server's randomness. */
const reseed = (p: Profile, ctx: ActionContext): Profile => ({ ...p, rng: rngFrom(ctx.random) });

function slotIndex(p: Params): number {
  only(p, ['index']);
  return int(p, 'index', 0, SLOT_COUNT - 1);
}

function startRace(state: ServerState, p: Params, ctx: ActionContext): Applied {
  let token: RaceToken;
  const base = { id: tokenId(ctx.random), seed: raceSeed(ctx.random), startedAt: ctx.now };
  if (p.level !== undefined) {
    // a campaign level: its circuit, laps and opponents are the level's, whatever the browser says
    only(p, ['level']);
    const level = int(p, 'level', 0, LEVELS.length - 1);
    if (levelStatus(state.profile.campaign, level) === 'locked') fail('Ce niveau de campagne n’est pas encore ouvert.');
    const def = LEVELS[level];
    token = { ...base, trackId: def.trackId, laps: def.laps, players: 1 + def.opponents.length, bots: def.opponents.length, level };
  } else {
    only(p, ['trackId', 'laps', 'players', 'bots']);
    const trackId = id(p, 'trackId');
    if (LAP_LENGTH[trackId] === undefined) fail('Circuit inconnu.', 'not_found');
    const players = int(p, 'players', 1, MAX_PLAYERS);
    token = { ...base, trackId, laps: int(p, 'laps', 1, MAX_LAPS), players, bots: int(p, 'bots', 0, players - 1), level: null };
  }
  // one active token: a new start replaces an unfinished race
  return { state: { ...state, race: token }, result: { action: 'start_race', race: token }, changed: true };
}

function finishRace(state: ServerState, p: Params, ctx: ActionContext): Applied {
  only(p, ['token', 'rank', 'retired', 'clean', 'stats']);
  const tokenParam = p.token;
  if (typeof tokenParam !== 'string' || !/^[0-9a-f]{32}$/.test(tokenParam)) fail('Paramètre invalide.', 'invalid');
  const token = state.race;
  if (!token || token.id !== tokenParam) return fail('Course inconnue ou déjà terminée : aucune récompense.', 'race');
  const rules = ctx.rules ?? RACE_RULES;
  const elapsed = ctx.now - token.startedAt;
  if (elapsed > rules.tokenTtlMs) fail('Course expirée : aucune récompense.', 'race');
  // NOT VERIFIED: rank, retirement, clean race and campaign statistics are what the browser declares (see race.ts)
  const rank = int(p, 'rank', 1, token.players);
  const retired = bool(p, 'retired');
  const clean = !retired && bool(p, 'clean', false);
  if (elapsed < minRaceMs(token, retired, rules)) fail('Course terminée trop vite : aucune récompense.', 'race');
  const recent = state.finishes.filter((t) => ctx.now - t < HOUR && t <= ctx.now);
  if (recent.length >= rules.maxPerHour) fail('Trop de courses récompensées cette heure-ci : réessayez plus tard.', 'too_many', 429);
  let campaign: { level: number; stars: number } | undefined;
  if (token.level !== null) {
    const s = record(p, 'stats');
    only(s, ['tireLoss', 'partBroken', 'cornerOvertakes']);
    const stats = { tireLoss: int(s, 'tireLoss', 0, 10_000), partBroken: bool(s, 'partBroken'), cornerOvertakes: int(s, 'cornerOvertakes', 0, 10_000) };
    campaign = { level: token.level, stars: starsFor(LEVELS[token.level], { rank, retired, stats }).stars };
  } else if (p.stats !== undefined) record(p, 'stats');
  // a free race against AIs only is worth little gold and limited per hour; the quota counts the races that were paid
  const soloVsAi = token.level === null && token.bots > 0 && token.players - token.bots === 1;
  const soloRecent = state.soloFinishes.filter((t) => ctx.now - t < HOUR && t <= ctx.now);
  const soloPaid = soloRecent.length < SOLO_PAID_PER_HOUR;
  const r = awardRaceWithPass(reseed(state.profile, ctx), { rank, retired, clean, players: token.players, vsBots: token.bots > 0, now: ctx.now, campaign, soloVsAi, soloPaid });
  const soloFinishes = soloVsAi && soloPaid && !retired ? [...soloRecent, ctx.now] : soloRecent;
  return {
    state: { ...state, profile: r.profile, race: null, finishes: [...recent, ctx.now], soloFinishes },
    result: { action: 'finish_race', rewards: r.rewards, verified: false },
    changed: true,
    log: { token: token.id, seed: token.seed, trackId: token.trackId, laps: token.laps, players: token.players, bots: token.bots, level: token.level, elapsedMs: elapsed, rank, retired, clean, stars: campaign?.stars ?? null, verified: false },
  };
}

function openChestAt(state: ServerState, p: Params, ctx: ActionContext): Applied {
  const index = slotIndex(p);
  const s = slotState(state.profile, index, ctx.now);
  if (s.kind === 'empty') fail('Cet emplacement est vide.');
  if (s.kind === 'locked') fail('Ce coffre n’est pas encore prêt.');
  const r = openSlot(reseed(state.profile, ctx), index, ctx.now);
  if (!r) return fail('Ce coffre ne peut pas être ouvert.');
  return {
    state: { ...state, profile: r.profile },
    result: { action: 'open_slot', opened: { tier: r.tier, cards: r.cards, gold: r.gold, gems: r.gems, pityTriggered: r.pityTriggered } },
    changed: true,
    log: { index, tier: r.tier, cards: r.cards.map((c) => c.itemId) },
  };
}

function skipChestAt(state: ServerState, p: Params, ctx: ActionContext): Applied {
  const index = slotIndex(p);
  const s = slotState(state.profile, index, ctx.now);
  if (s.kind !== 'locked') fail(s.kind === 'empty' ? 'Cet emplacement est vide.' : 'Ce coffre est déjà prêt.');
  const cost = s.kind === 'locked' ? skipCost(s.remainingMs) : 0;
  if (state.profile.gems < cost) fail('Pas assez de gemmes.');
  const profile = skipSlot(state.profile, index, ctx.now);
  if (!profile) return fail('Ce coffre ne peut pas être accéléré.');
  return { state: { ...state, profile }, result: { action: 'skip_slot', cost }, changed: true, log: { index, cost } };
}

function buy(state: ServerState, p: Params, ctx: ActionContext): Applied {
  only(p, ['id']);
  const offerId = id(p, 'id');
  // an offer of the day is the one of the server's day, and can be bought once
  const offer = findOffer(state.profile, offerId, ctx.now);
  if (!offer) return fail(offerId.startsWith('daily-') ? 'Cette offre du jour n’est pas disponible (ou déjà achetée).' : 'Offre inconnue.', 'not_found');
  if (!canAfford(state.profile, offer)) fail('Pas assez de ressources.');
  // no unlock override on the server: chests take their real time
  const profile = buyOffer(state.profile, offer.id, ctx.now);
  if (!profile) return fail('Achat impossible.');
  return { state: { ...state, profile }, result: { action: 'buy_offer', offer: offer.id }, changed: true, log: { price: offer.price, currency: offer.currency } };
}

function claimGiftAction(state: ServerState, p: Params, ctx: ActionContext): Applied {
  only(p, []);
  const r = claimGift(state.profile, ctx.now);
  if (!r) return fail('Le cadeau du jour est déjà récupéré : revenez demain.');
  return { state: { ...state, profile: r.profile }, result: { action: 'claim_gift', reward: r.reward }, changed: true, log: { streak: r.reward.streak, chest: r.reward.chest } };
}

function claimWelcomeAction(state: ServerState, p: Params, ctx: ActionContext): Applied {
  only(p, []);
  const r = claimWelcome(state.profile, ctx.now);
  if (!r) return fail('Le pack de bienvenue n’est pas disponible (déjà récupéré ou expiré).');
  return { state: { ...state, profile: r.profile }, result: { action: 'claim_welcome', reward: r.reward }, changed: true, log: { itemId: r.reward.itemId } };
}

function claimPassAction(state: ServerState, p: Params, ctx: ActionContext): Applied {
  only(p, ['tier']);
  const tier = int(p, 'tier', 1, PASS_TIERS);
  const r = claimPassTier(state.profile, tier, ctx.now);
  if (!r) return fail('Ce palier du passe n’est pas atteint ou sa récompense est déjà récupérée.');
  return { state: { ...state, profile: r.profile }, result: { action: 'claim_pass', tier, reward: r.reward, fragments: r.fragments }, changed: true, log: { tier, kind: r.reward.kind } };
}

function upgrade(state: ServerState, p: Params): Applied {
  only(p, ['id']);
  const partId = id(p, 'id');
  const part = getPart(partId);
  if (!part) return fail('Pièce inconnue.', 'not_found');
  const level = state.profile.owned[partId];
  if (!level) fail('Vous ne possédez pas cette pièce.');
  if (level >= MAX_LEVEL) fail('Cette pièce est déjà au niveau maximum.');
  const cost = upgradeCost(part.rarity, level);
  if (cost === null || state.profile.fragments < cost) fail('Pas assez de fragments.');
  const profile = upgradePart(state.profile, partId);
  if (!profile) return fail('Amélioration impossible.');
  return { state: { ...state, profile }, result: { action: 'upgrade_part', id: partId, level: level + 1 }, changed: true, log: { cost } };
}

function equipItem(state: ServerState, p: Params): Applied {
  only(p, ['id']);
  const itemId = id(p, 'id');
  if (!getItem(itemId)) fail('Objet inconnu.', 'not_found');
  const profile = equip(state.profile, itemId);
  if (!profile) return fail('Vous ne possédez pas cet objet.');
  return { state: { ...state, profile }, result: { action: 'equip', id: itemId }, changed: true };
}

function unequip(state: ServerState, p: Params): Applied {
  only(p, ['slot', 'cosmetic']);
  if ((p.slot === undefined) === (p.cosmetic === undefined)) fail('Paramètre invalide.', 'invalid');
  let profile: Profile;
  if (p.slot !== undefined) {
    const slot = id(p, 'slot');
    if (!(SLOTS as readonly string[]).includes(slot)) fail('Emplacement inconnu.', 'not_found');
    profile = unequipSlot(state.profile, slot as Slot);
  } else {
    const kind = id(p, 'cosmetic');
    if (!(COSMETIC_KINDS as readonly string[]).includes(kind)) fail('Emplacement inconnu.', 'not_found');
    profile = unequipCosmetic(state.profile, kind as (typeof COSMETIC_KINDS)[number]);
  }
  return { state: { ...state, profile }, result: { action: 'unequip' }, changed: true };
}

function claim(state: ServerState, p: Params, ctx: ActionContext): Applied {
  only(p, ['id']);
  const questId = id(p, 'id');
  const quest = QUESTS.find((q) => q.id === questId);
  if (!quest) return fail('Quête inconnue.', 'not_found');
  if (isClaimed(state.profile, quest)) fail('Récompense déjà récupérée.');
  if (!isClaimable(state.profile, quest)) fail('Cette quête n’est pas encore terminée.');
  const r = claimQuestWithPass(state.profile, questId, ctx.now);
  if (!r) return fail('Récompense impossible à récupérer.');
  return { state: { ...state, profile: r.profile }, result: { action: 'claim_quest', id: questId, levelUp: r.levelUp }, changed: true };
}

/** Applies one action of the player. Throws a GameError (French message) when the action is malformed or refused. */
export function applyAction(state: ServerState, action: unknown, rawParams: unknown, ctx: ActionContext): Applied {
  if (!isAction(action)) return fail('Action inconnue.', 'invalid');
  const p = asParams(rawParams);
  switch (action) {
    case 'sync':
      only(p, []);
      return { state, result: { action: 'sync' }, changed: false };
    case 'start_race':
      return startRace(state, p, ctx);
    case 'finish_race':
      return finishRace(state, p, ctx);
    case 'open_slot':
      return openChestAt(state, p, ctx);
    case 'skip_slot':
      return skipChestAt(state, p, ctx);
    case 'buy_offer':
      return buy(state, p, ctx);
    case 'claim_gift':
      return claimGiftAction(state, p, ctx);
    case 'claim_welcome':
      return claimWelcomeAction(state, p, ctx);
    case 'claim_pass':
      return claimPassAction(state, p, ctx);
    case 'upgrade_part':
      return upgrade(state, p);
    case 'equip':
      return equipItem(state, p);
    case 'unequip':
      return unequip(state, p);
    case 'claim_quest':
      return claim(state, p, ctx);
  }
}
