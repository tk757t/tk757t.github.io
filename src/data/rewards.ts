import { PASS_QUEST_POINTS, PASS_RACE_POINTS, PASS_WIN_POINTS, addPassPoints, passProgress } from './pass';
import { claimQuest } from './quests';
import { awardRace, type RaceContext, type RaceRewards } from './profile/ops';
import type { Profile } from './profile/profile';

// What a finished race or a collected quest pays, including the season pass points. Kept apart from ops.ts and quests.ts
// because the pass rules import them (a module cycle otherwise). The game server and the device both go through here.

/** Pass points of a race: nothing when retired; a free race against AIs only counts while it is paid (5 per hour). */
export function racePassPoints(ctx: Pick<RaceContext, 'rank' | 'retired' | 'soloVsAi' | 'soloPaid' | 'campaign'>): number {
  if (ctx.retired) return 0;
  if (ctx.soloVsAi && !ctx.campaign && ctx.soloPaid === false) return 0;
  return ctx.rank === 1 ? PASS_WIN_POINTS : PASS_RACE_POINTS;
}

/** `awardRace` plus the pass points; `rewards.pass` is what the race really added (0 once the pass is complete). */
export function awardRaceWithPass(profile: Profile, ctx: RaceContext): { profile: Profile; rewards: RaceRewards } {
  const r = awardRace(profile, ctx);
  const before = passProgress(r.profile, ctx.now).points;
  const next = addPassPoints(r.profile, racePassPoints(ctx), ctx.now);
  return { profile: next, rewards: { ...r.rewards, pass: next.pass.points - before } };
}

/** `claimQuest` plus the pass points of a quest. */
export function claimQuestWithPass(profile: Profile, id: string, now: number): { profile: Profile; levelUp: number | null } | null {
  const r = claimQuest(profile, id);
  return r ? { ...r, profile: addPassPoints(r.profile, PASS_QUEST_POINTS, now) } : null;
}
