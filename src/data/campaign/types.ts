import type { AiLevel } from '../../ai/types';
import type { TireType } from '../../engine/types';
import type { Slot } from '../parts/types';

/** What the third star asks, on top of winning. */
export type WinCondition = 'no-tire-loss' | 'no-part-broken' | 'corner-overtake';

/** One star's objective. A level has exactly three, in order. */
export type StarGoal = { kind: 'finish' } | { kind: 'top'; n: number } | { kind: 'win'; condition: WinCondition };

/** A car the player races against: its driver, its car, its equipment. */
export interface Opponent {
  ai: AiLevel;
  /** Fictional driver and team. */
  name: string;
  team: string;
  /** Index of the car picture and of the driver portrait in the asset registry (src/data/assets.ts), when it has them. */
  car: number;
  portrait: number;
  /** Tires on the car at the start (before any stop). */
  tires: TireType;
  /** Equipped parts: slot -> part id and level (the same effects as the player's garage). */
  parts: Partial<Record<Slot, { id: string; level: number }>>;
}

/** What the winner of a level's first clear receives. */
export interface PackReward {
  /** common: mostly common cards; rare: a rare or better card is guaranteed; epic: an epic or better one is. */
  tier: 'common' | 'rare' | 'epic';
  /** A part that is always in the pack (a duplicate still pays fragments). */
  guaranteedPart?: string;
}

export interface CampaignLevel {
  id: string;
  name: string;
  /** One line shown on the map. */
  tagline: string;
  /** Id of one of our circuits (src/data/tracks); they get harder from level to level. */
  trackId: string;
  laps: number;
  /** "sun": always sunny; "variable": the d20 draws the weather with the circuit's own thresholds, round after round. */
  weather: 'sun' | 'variable';
  opponents: Opponent[];
  /** Index (in the asset registry) of the car picture of the player. */
  playerCar: number;
  goals: [StarGoal, StarGoal, StarGoal];
  reward: { gold: number; gems: number; xp: number; pack: PackReward };
  /** Gems for each star earned for the first time. */
  starGems: number;
}
