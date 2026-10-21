import { SOLO_PAID_PER_HOUR, equip, openSlot, skipSlot, unequipCosmetic, unequipSlot, upgradePart, type OpenedChest, type RaceRewards } from '../data/profile/ops';
import { claimPassTier, type PassReward } from '../data/pass';
import { claimGift, claimWelcome, type GiftReward, type WelcomeReward } from '../data/gift';
import type { Profile } from '../data/profile/profile';
import { awardRaceWithPass, claimQuestWithPass } from '../data/rewards';
import { buyOffer } from '../data/shop';
import type { RaceStats } from '../data/campaign';
import type { Slot } from '../data/parts/types';
import type { RaceToken } from '../server';
import type { AppContext } from './context';
import { getProfile, isServerBacked, rollbackOptimistic, showOptimistic, updateProfile } from './profile';
import { serverAction, serverNow, serverReady } from './serverGame';

/**
 * Every action that changes the player's economy, in one place. A signed-in account sends it to the game server
 * (src/app/serverGame.ts) and shows what the server answers; otherwise the same pure rules run on the device, as before.
 * Each function resolves to what happened (null / false: refused, the reason was already shown when it came from the server).
 */

const server = async (): Promise<boolean> => {
  await serverReady();
  return isServerBacked();
};

/**
 * Accounts: the screen shows the expected result of an action at once (the rules are the server's own, run on the
 * device), then the server's answer replaces it. A refusal puts the screen back. Only for actions without chance:
 * chests and races draw their randomness on the server, so they wait for it.
 */
async function ask<R>(expected: ((p: Profile) => Profile | null) | null, run: () => Promise<R | null>): Promise<R | null> {
  if (expected) {
    try {
      const next = expected(getProfile());
      if (next) showOptimistic(next);
    } catch {
      /* the server decides anyway */
    }
  }
  const r = await run();
  if (r === null) rollbackOptimistic();
  return r;
}

export async function buy(offerId: string, ctx: AppContext): Promise<boolean> {
  if (await server()) return (await ask((p) => buyOffer(p, offerId, ctx.now()), () => serverAction('buy_offer', { id: offerId }))) !== null;
  return updateProfile((p) => buyOffer(p, offerId, ctx.now(), ctx.unlockMs));
}

/** Collects the gift of the day (local play and accounts); resolves to what it gave, or null when refused. */
export async function claimGiftOfDay(ctx: AppContext): Promise<GiftReward | null> {
  if (await server()) return (await ask((p) => claimGift(p, ctx.now())?.profile ?? null, () => serverAction('claim_gift')))?.reward ?? null;
  let reward: GiftReward | null = null;
  updateProfile((p) => {
    const r = claimGift(p, ctx.now(), ctx.unlockMs);
    reward = r?.reward ?? null;
    return r ? r.profile : null;
  });
  return reward;
}

/** Collects the free reward of a pass tier; resolves to what it gave, or null when refused. */
export async function claimPass(tier: number, ctx: AppContext): Promise<PassClaim | null> {
  if (await server()) {
    const r = await ask((p) => claimPassTier(p, tier, ctx.now())?.profile ?? null, () => serverAction('claim_pass', { tier }));
    return r ? { reward: r.reward, fragments: r.fragments } : null;
  }
  let claim: PassClaim | null = null;
  updateProfile((p) => {
    const r = claimPassTier(p, tier, ctx.now(), ctx.unlockMs);
    claim = r ? { reward: r.reward, fragments: r.fragments } : null;
    return r ? r.profile : null;
  });
  return claim;
}

/** Collects the welcome pack (accounts only: the server sets the deadline). */
export async function claimWelcomePack(): Promise<WelcomeReward | null> {
  if (!(await server())) return null;
  return (await ask((p) => claimWelcome(p, serverNow())?.profile ?? null, () => serverAction('claim_welcome')))?.reward ?? null;
}

export async function openChest(index: number, ctx: AppContext): Promise<OpenedChest | null> {
  if (await server()) {
    const r = await serverAction('open_slot', { index });
    return r ? { ...r.opened, profile: getProfile() } : null;
  }
  let opened: OpenedChest | null = null;
  updateProfile((p) => {
    opened = openSlot(p, index, ctx.now(), ctx.unlockMs);
    return opened ? opened.profile : null;
  });
  return opened;
}

export async function skipChest(index: number, ctx: AppContext): Promise<boolean> {
  if (await server()) return (await ask((p) => skipSlot(p, index, ctx.now()), () => serverAction('skip_slot', { index }))) !== null;
  return updateProfile((p) => skipSlot(p, index, ctx.now()));
}

export async function equipItem(itemId: string): Promise<boolean> {
  if (await server()) return (await ask((p) => equip(p, itemId), () => serverAction('equip', { id: itemId }))) !== null;
  return updateProfile((p) => equip(p, itemId));
}

export type UnequipTarget = { type: 'slot'; slot: Slot } | { type: 'cosmetic'; kind: 'paint' | 'number' | 'helmet' };

export async function unequip(target: UnequipTarget): Promise<boolean> {
  if (await server()) {
    const expected = (p: Profile) => (target.type === 'slot' ? unequipSlot(p, target.slot) : unequipCosmetic(p, target.kind));
    return (await ask(expected, () => serverAction('unequip', target.type === 'slot' ? { slot: target.slot } : { cosmetic: target.kind }))) !== null;
  }
  return updateProfile((p) => (target.type === 'slot' ? unequipSlot(p, target.slot) : unequipCosmetic(p, target.kind)));
}

export async function upgrade(partId: string): Promise<boolean> {
  if (await server()) return (await ask((p) => upgradePart(p, partId), () => serverAction('upgrade_part', { id: partId }))) !== null;
  return updateProfile((p) => upgradePart(p, partId));
}

/** Collects a quest; resolves to the new level (if any) or false when refused. */
export async function claim(questId: string, ctx: AppContext): Promise<{ levelUp: number | null } | false> {
  if (await server()) {
    const r = await ask((p) => claimQuestWithPass(p, questId, ctx.now())?.profile ?? null, () => serverAction('claim_quest', { id: questId }));
    return r ? { levelUp: r.levelUp } : false;
  }
  let levelUp: number | null = null;
  const ok = updateProfile((p) => {
    const r = claimQuestWithPass(p, questId, ctx.now());
    levelUp = r?.levelUp ?? null;
    return r ? r.profile : null;
  });
  return ok ? { levelUp } : false;
}

// ------------------------------------------------------------- races

/** What the server needs to know when a race starts (a campaign level fixes the rest itself). */
export interface RaceStart {
  trackId: string;
  laps: number;
  players: number;
  bots: number;
  level?: number;
}

export interface RaceEnd {
  rank: number;
  retired: boolean;
  clean: boolean;
  players: number;
  vsBots: boolean;
  /** One person against AIs only (a free race: it pays little gold, a few times per hour). */
  soloVsAi: boolean;
  stats: RaceStats;
}

/**
 * Asks the server for a race token (accounts only). Null without an account (local play) or when the server refused:
 * then the race is played without any reward. `undefined` means local play.
 */
export async function beginRace(start: RaceStart): Promise<RaceToken | null | undefined> {
  if (!(await server())) return undefined;
  const r = await serverAction('start_race', start.level !== undefined ? { level: start.level } : { trackId: start.trackId, laps: start.laps, players: start.players, bots: start.bots });
  return r ? r.race : null;
}

export interface PassClaim {
  reward: PassReward;
  fragments: number;
}

/** Local play only (an account is limited by the server): when the solo races were paid during the last hour. */
let localSolo: number[] = [];

/** Pays a finished race: the server with its token (accounts), or the local rules. */
export function finishRace(token: RaceToken | null | undefined, end: RaceEnd, local: { now: number; unlockMs?: number; campaign?: { level: number; stars: number } }): RaceRewards | null | Promise<RaceRewards | null> {
  if (token === undefined && !isServerBacked()) {
    let rewards: RaceRewards | null = null;
    localSolo = localSolo.filter((t) => local.now - t < 3_600_000 && t <= local.now);
    const soloPaid = localSolo.length < SOLO_PAID_PER_HOUR;
    updateProfile((p) => {
      const r = awardRaceWithPass(p, { rank: end.rank, retired: end.retired, players: end.players, vsBots: end.vsBots, clean: end.clean, now: local.now, unlockMs: local.unlockMs, campaign: local.campaign, soloVsAi: end.soloVsAi, soloPaid });
      if (end.soloVsAi && !local.campaign && soloPaid && !end.retired) localSolo.push(local.now);
      rewards = r.rewards;
      return r.profile;
    });
    return rewards;
  }
  if (!token) return null; // no token: the server pays nothing
  return serverAction('finish_race', {
    token: token.id,
    rank: end.rank,
    retired: end.retired,
    clean: end.clean,
    ...(token.level !== null ? { stats: { tireLoss: end.stats.tireLoss, partBroken: end.stats.partBroken, cornerOvertakes: end.stats.cornerOvertakes } } : {}),
  }).then((r) => (r ? r.rewards : null));
}
