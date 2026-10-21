import type { CarMods, WearCategory } from '../../engine/types';
import { PARTS } from './catalogue';
import { modsFor } from './effects';
import { SLOTS, type Slot } from './types';

/**
 * The six readable stats of a car (docs/gdd/10-stats-voitures.md § 10.2). Each one is a score computed from the modifiers
 * the engine reads, shown as bars of 10 and summed in a "power".
 */
export const STAT_KEYS = ['speed', 'endurance', 'handling', 'robustness', 'reliability', 'tactics'] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export const STAT_LABELS: Record<StatKey, string> = {
  speed: 'Vitesse',
  endurance: 'Endurance',
  handling: 'Maniabilité',
  robustness: 'Robustesse',
  reliability: 'Fiabilité',
  tactics: 'Tactique',
};

export const STAT_HINTS: Record<StatKey, string> = {
  speed: 'Ce que le dé rapporte : cases bonus aux rapports.',
  endurance: 'Tenir la distance : points de Pneus et de Freins.',
  handling: 'Bien prendre les virages : Tenue de route, arrêts gratuits, pneus épargnés.',
  robustness: 'Encaisser les contacts : Carrosserie et carrosserie épargnée.',
  reliability: 'Ne pas casser : Moteur, Boîte, jet moteur, rétrogradation.',
  tactics: 'Choisir au bon moment : relances du dé.',
};

const gauge = (m: CarMods, c: WearCategory): number => m.wearBonus[c] ?? 0;
const cases = (m: CarMods): number => m.moveBonus.reduce((sum, b) => sum + b.amount * (b.gears === 'all' ? 6 : b.gears.length), 0);

/** The score of a car for each stat; a car without parts scores 0 everywhere. */
const SCORES: Record<StatKey, (m: CarMods) => number> = {
  speed: (m) => 3 * cases(m),
  endurance: (m) => gauge(m, 'tires') + gauge(m, 'brakes'),
  handling: (m) => gauge(m, 'handling') + 3 * m.freeStops + 2 * m.overshootTireDiscount,
  robustness: (m) => gauge(m, 'body') + 2 * m.blockBrakeDiscount,
  reliability: (m) => gauge(m, 'engine') + gauge(m, 'gearbox') + 2 * (m.rollWearDiscount.engine ?? 0) + 2 * m.downshiftDiscount,
  tactics: (m) => 4 * m.rerolls,
};

export const statScore = (key: StatKey, mods: CarMods): number => SCORES[key](mods);

let maxScores: Record<StatKey, number> | null = null;

/** The best score a stat can reach: the best part of each slot at level 5 for that stat, summed (the 10th bar). */
export function maxStatScores(): Record<StatKey, number> {
  if (maxScores) return maxScores;
  const out = {} as Record<StatKey, number>;
  for (const key of STAT_KEYS) {
    let total = 0;
    for (const slot of SLOTS as readonly Slot[]) {
      const best = Math.max(0, ...PARTS.filter((p) => p.slot === slot).map((p) => SCORES[key](modsFor([{ part: p, level: 5 }]))));
      total += best;
    }
    out[key] = total;
  }
  return (maxScores = out);
}

export interface CarStat {
  key: StatKey;
  label: string;
  score: number;
  max: number;
  /** Filled bars, 0 to 10. */
  bars: number;
}

export interface CarStats {
  stats: CarStat[];
  /** The sum of the bars, 0 to 60. */
  power: number;
}

/** The six stats of a car and its power, from its modifiers. */
export function carStats(mods: CarMods): CarStats {
  const max = maxStatScores();
  const stats = STAT_KEYS.map((key): CarStat => {
    const score = SCORES[key](mods);
    const bars = max[key] > 0 ? Math.min(10, Math.max(0, Math.round((10 * score) / max[key]))) : 0;
    return { key, label: STAT_LABELS[key], score, max: max[key], bars };
  });
  return { stats, power: stats.reduce((sum, s) => sum + s.bars, 0) };
}
