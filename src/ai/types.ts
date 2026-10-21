import type { Action, RaceState } from '../engine/types';

export type AiLevel = 'easy' | 'medium' | 'hard';
export type Rand = () => number;
export type Strategy = (state: RaceState, rand: Rand) => Action;

export const AI_LEVELS: AiLevel[] = ['easy', 'medium', 'hard'];
export const AI_LABELS: Record<AiLevel, string> = { easy: 'Facile', medium: 'Moyen', hard: 'Difficile' };
