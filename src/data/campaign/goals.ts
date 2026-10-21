import type { CampaignLevel, StarGoal } from './types';
import type { RaceStats } from './stats';

export interface LevelResult {
  rank: number;
  retired: boolean;
  stats: RaceStats;
}

const CONDITION_TEXT = {
  'no-tire-loss': 'sans perdre un point de pneus',
  'no-part-broken': 'sans qu’une pièce tombe à 0',
  'corner-overtake': 'avec au moins un dépassement en virage',
} as const;

export function goalText(goal: StarGoal): string {
  switch (goal.kind) {
    case 'finish':
      return 'Terminer la course';
    case 'top':
      return `Finir dans les ${goal.n} premiers`;
    case 'win':
      return `Gagner ${CONDITION_TEXT[goal.condition]}`;
  }
}

function met(goal: StarGoal, r: LevelResult): boolean {
  if (r.retired) return false;
  switch (goal.kind) {
    case 'finish':
      return true;
    case 'top':
      return r.rank <= goal.n;
    case 'win':
      if (r.rank !== 1) return false;
      if (goal.condition === 'no-tire-loss') return r.stats.tireLoss === 0;
      if (goal.condition === 'no-part-broken') return !r.stats.partBroken;
      return r.stats.cornerOvertakes >= 1;
  }
}

/** Which of the three objectives a result reaches, and how many stars that makes. */
export function starsFor(level: CampaignLevel, r: LevelResult): { met: boolean[]; stars: number } {
  const list = level.goals.map((g) => met(g, r));
  return { met: list, stars: list.filter(Boolean).length };
}
