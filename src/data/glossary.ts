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
    uses: 'Chaque tour terminé en use un point, selon la gomme. Sortir trop tôt d’un virage en use plus.',
    empty: 'À 0, la voiture s’arrête (point mort). Sous 0, elle sort de piste et abandonne. Un arrêt au stand remet les pneus à neuf.',
  },
  brakes: {
    name: 'Freins',
    role: 'Raccourcir un jet trop long, et rétrograder de loin.',
    uses: 'Après le jet, chaque point dépensé retire 1 case. Rétrograder de 3 rapports ou plus en coûte aussi 1.',
    empty: 'Sous 0, la voiture abandonne.',
  },
  gearbox: {
    name: 'Boîte',
    role: 'Gagner une case de plus, et rétrograder.',
    uses: '« Boîte +1 » ajoute 1 case pour 1 point, une fois par tour. Rétrograder de 2 rapports ou plus en coûte aussi 1.',
    empty: 'Sous 0, la voiture abandonne.',
  },
  body: {
    name: 'Carrosserie',
    role: 'Encaisser les contacts.',
    uses: 'Vous perdez 1 point quand une voiture bloque la route, ou quand un d20 de contact vous touche : 1 chance sur 20 par voiture voisine, 2 sous la pluie.',
    empty: 'Sous 0, la voiture abandonne.',
  },
  engine: {
    name: 'Moteur',
    role: 'Tenir la vitesse.',
    uses: 'Si vous finissez votre tour en 5e ou 6e, un d20 est lancé : de 1 à 4 (de 1 à 3 sous la pluie), vous perdez 1 point. Rétrograder de 4 rapports ou plus en coûte aussi 1.',
    empty: 'Sous 0, la voiture abandonne.',
  },
  handling: {
    name: 'Tenue de route',
    role: 'Passer les cases à risque (chicanes).',
    uses: 'Sur une case à risque, un d20 est lancé : avec 4 ou moins (5 sous la pluie), vous perdez 1 point.',
    empty: 'Sous 0, la voiture abandonne.',
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
  speed: 'Les pièces qui donnent des cases en plus, comme le Turbo, le V8 ou l’Hybride.',
  endurance: 'Les pièces qui ajoutent des points de Pneus et de Freins.',
  handling: 'Les points de Tenue de route, les arrêts gratuits en virage et les pneus épargnés quand on rate un virage.',
  robustness: 'Les points de Carrosserie, et la carrosserie épargnée quand une voiture vous bloque.',
  reliability: 'Les points de Moteur et de Boîte, un jet moteur plus sûr et des rapports offerts en rétrogradant.',
  tactics: 'Les relances : on peut refaire un mauvais jet, une fois par relance.',
};

export const STATS: Record<StatKey, StatInfo> = Object.fromEntries(
  (Object.keys(STAT_LABELS) as StatKey[]).map((k) => [k, { name: STAT_LABELS[k], hint: STAT_HINTS[k], raise: RAISE[k] }]),
) as Record<StatKey, StatInfo>;
