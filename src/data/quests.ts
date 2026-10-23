import { addXp } from './profile/ops';
import { clearedLevels } from '../storage/campaign';
import type { Profile } from './profile/profile';

export type Counter = 'races' | 'wins' | 'packsOpened' | 'upgrades' | 'equipped' | 'campaign';

export interface Quest {
  id: string;
  title: string;
  counter: Counter;
  target: number;
  reward: { gold?: number; gems?: number; xp?: number };
}

export const QUESTS: Quest[] = [
  { id: 'races-1', title: 'Terminer une course', counter: 'races', target: 1, reward: { gold: 50 } },
  { id: 'races-5', title: 'Terminer 5 courses', counter: 'races', target: 5, reward: { gold: 150, gems: 3 } },
  { id: 'wins-1', title: 'Gagner une course', counter: 'wins', target: 1, reward: { gold: 100, gems: 2 } },
  { id: 'wins-5', title: 'Gagner 5 courses', counter: 'wins', target: 5, reward: { gold: 300, gems: 6, xp: 100 } },
  { id: 'packs-1', title: 'Ouvrir un coffre', counter: 'packsOpened', target: 1, reward: { gold: 40 } },
  { id: 'packs-5', title: 'Ouvrir 5 coffres', counter: 'packsOpened', target: 5, reward: { gems: 5, xp: 60 } },
  { id: 'equip-3', title: 'Équiper 3 pièces', counter: 'equipped', target: 3, reward: { gold: 120, gems: 2 } },
  { id: 'upgrade-1', title: 'Améliorer une pièce', counter: 'upgrades', target: 1, reward: { gold: 80 } },
  { id: 'campaign-3', title: 'Terminer les 3 niveaux de la campagne', counter: 'campaign', target: 3, reward: { gems: 5, xp: 80 } },
];

export function counterValue(profile: Profile, counter: Counter): number {
  switch (counter) {
    case 'equipped':
      return Object.keys(profile.loadout.parts).length;
    case 'campaign':
      return clearedLevels(profile.campaign);
    default:
      return profile[counter];
  }
}

export const questProgress = (profile: Profile, q: Quest): number => Math.min(q.target, counterValue(profile, q.counter));

export const isClaimed = (profile: Profile, q: Quest): boolean => profile.claimed.includes(q.id);

export const isClaimable = (profile: Profile, q: Quest): boolean => !isClaimed(profile, q) && questProgress(profile, q) >= q.target;

export const claimableCount = (profile: Profile): number => QUESTS.filter((q) => isClaimable(profile, q)).length;

/** Collects a finished quest: pays its reward once. Null if it is not done or already collected. */
export function claimQuest(profile: Profile, id: string): { profile: Profile; levelUp: number | null } | null {
  const q = QUESTS.find((x) => x.id === id);
  if (!q || !isClaimable(profile, q)) return null;
  const paid: Profile = {
    ...profile,
    gold: profile.gold + (q.reward.gold ?? 0),
    gems: profile.gems + (q.reward.gems ?? 0),
    claimed: [...profile.claimed, q.id],
  };
  return addXp(paid, q.reward.xp ?? 0);
}
