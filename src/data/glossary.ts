import type { WearCategory } from '../engine/types';
import { STAT_HINTS, STAT_LABELS, type StatKey } from './parts/stats';

/**
 * What every characteristic of the car means, in words the player reads in the tooltips of the garage and of the race and in the guide
 * (docs/regles.md §2, §3, §6, §8 and docs/gdd/10-stats-voitures.md §10.2). One place, so that the rules are told the same way everywhere.
 */
export interface GaugeInfo {
  name: string;
  /** What the gauge is. */
  role: string;
  /** What spends it. */
  uses: string;
  /** What happens when it runs out. */
  empty: string;
}

export const GAUGES: Record<WearCategory, GaugeInfo> = {
  tires: {
    name: 'Pneus',
    role: 'L’usure de vos gommes.',
    uses: 'Chaque tour terminé en use un point (selon la gomme) ; un virage dont on sort trop tôt en use davantage.',
    empty: 'À 0 la voiture s’arrête (point mort) ; en dessous, sortie de piste : abandon. Un arrêt au stand remet les pneus à neuf.',
  },
  brakes: {
    name: 'Freins',
    role: 'Raccourcir le dé après le jet, et rétrograder de loin.',
    uses: 'Après le jet, chaque point dépensé retire 1 case au résultat. Rétrograder de 3 rapports ou plus en coûte aussi 1.',
    empty: 'En dessous de 0 : abandon.',
  },
  gearbox: {
    name: 'Boîte',
    role: 'Gagner une case en plus, et rétrograder.',
    uses: 'Le bouton « Boîte +1 » ajoute 1 case (une fois par tour) pour 1 point. Rétrograder de 2 rapports ou plus en coûte aussi 1.',
    empty: 'En dessous de 0 : abandon.',
  },
  body: {
    name: 'Carrosserie',
    role: 'Encaisser les contacts.',
    uses: 'On perd 1 point quand une voiture barre la route (on s’arrête derrière) et quand un d20 de contact touche une voisine : 1 chance sur 20 par voiture voisine (2 sous la pluie).',
    empty: 'En dessous de 0 : abandon.',
  },
  engine: {
    name: 'Moteur',
    role: 'Tenir la vitesse.',
    uses: 'En fin de tour en 5e ou 6e, un d20 : 1 à 4 (1 à 3 sous la pluie) = −1 point. Rétrograder de 4 rapports ou plus en coûte aussi 1.',
    empty: 'En dessous de 0 : abandon.',
  },
  handling: {
    name: 'Tenue de route',
    role: 'Passer les cases à risque (chicanes).',
    uses: 'Sur une case à risque, un d20 : 4 ou moins (5 sous la pluie) = −1 point.',
    empty: 'En dessous de 0 : abandon.',
  },
};

export interface StatInfo {
  name: string;
  /** What the stat says. */
  hint: string;
  /** What makes it go up. */
  raise: string;
}

const RAISE: Record<StatKey, string> = {
  speed: 'Des pièces qui donnent des cases bonus aux rapports (Turbo, V8, Hybride…).',
  endurance: 'Des pièces qui ajoutent des points de Pneus et de Freins.',
  handling: 'Des points de Tenue de route, des arrêts gratuits en virage et des pneus épargnés quand on rate un virage.',
  robustness: 'Des points de Carrosserie, et de la carrosserie épargnée derrière une voiture.',
  reliability: 'Des points de Moteur et de Boîte, un jet moteur plus sûr, des rapports offerts en rétrogradant.',
  tactics: 'Des relances du dé : on relance un mauvais jet, une fois par relance.',
};

export const STATS: Record<StatKey, StatInfo> = Object.fromEntries(
  (Object.keys(STAT_LABELS) as StatKey[]).map((k) => [k, { name: STAT_LABELS[k], hint: STAT_HINTS[k], raise: RAISE[k] }]),
) as Record<StatKey, StatInfo>;
