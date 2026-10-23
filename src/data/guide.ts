import { GAUGES } from './glossary';
import { WEAR_CATEGORIES } from '../engine/types';

/**
 * The guide of the game, written for a player who has never seen a race: one page per question. `QUICK` is the short version shown during a
 * race; `TIPS` says what to do right now in each phase of a turn. The numbers are the ones of the engine (docs/regles.md); a test keeps the
 * dice table in step with src/engine/config.ts.
 */
export interface GuideSection {
  id: string;
  title: string;
  /** Paragraphs and bullet lines ("• ...") of the page. */
  lines: string[];
}

/** The dice of the six gears, as the engine rolls them: the least and the most cells. */
export const GEAR_RANGES: readonly (readonly [number, number])[] = [
  [1, 2],
  [2, 4],
  [4, 8],
  [7, 12],
  [11, 20],
  [21, 30],
];

export const GUIDE: GuideSection[] = [
  {
    id: 'goal',
    title: 'Le but',
    lines: [
      'C’est une course de voitures qui se joue aux dés, à 2, 3 ou 4. Chaque voiture avance de quelques cases par tour, et la première qui boucle tous ses tours gagne.',
      'Mais la voiture s’abîme en roulant. Si l’une de ses six jauges tombe sous 0, elle abandonne.',
      'Pour gagner, il faut choisir le bon dé au bon moment. Lancer le plus gros ne suffit pas toujours.',
    ],
  },
  {
    id: 'turn',
    title: 'Un tour de jeu',
    lines: [
      '1. Touchez le dé du rapport que vous voulez (de 1 à 6). Les cases que vous pouvez atteindre s’allument.',
      '2. Touchez-le une deuxième fois, ou appuyez sur « Lancer ». Le dé roule et donne un nombre de cases.',
      '3. Si vous voulez, ajustez. Chaque point de Freins enlève 1 case. « Boîte +1 » en ajoute 1, une fois par tour.',
      '4. Touchez la case où vous voulez arriver. Sa couleur indique ce qu’elle va vous coûter (voir « Les couleurs des cases »).',
      '5. La voiture avance, puis le jeu règle les contacts, le virage, le moteur et les pneus.',
      'Au premier tour, c’est un départ arrêté. Un d20 décide : 20 donne un super départ, 1 fait caler la voiture.',
    ],
  },
  {
    id: 'dice',
    title: 'Les dés et les rapports',
    lines: [
      'Il y a un dé par rapport. Plus le rapport est haut, plus le dé donne de cases, et plus la voiture souffre.',
      ...GEAR_RANGES.map(([a, b], i) => `• Rapport ${i + 1} : ${a} à ${b} cases.`),
      'On ne monte que d’un rapport à la fois : depuis le 3, on peut aller au 4 mais pas au 5. On peut redescendre quand on veut, sauf que redescendre de loin coûte des points :',
      '• de 2 rapports : −1 Boîte. De 3 : −1 Boîte et −1 Freins. De 4 ou plus : −1 Boîte, −1 Freins et −1 Moteur.',
      'Un dé grisé est indisponible : trop haut, ou vous n’avez pas de quoi le payer.',
    ],
  },
  {
    id: 'gauges',
    title: 'Les six jauges',
    lines: [
      'Votre voiture a six jauges. Dès qu’une passe sous 0, la voiture est hors course. Pour savoir à quoi sert une jauge, survolez-la ou touchez-la.',
      ...WEAR_CATEGORIES.map((c) => `• ${GAUGES[c].name} : ${GAUGES[c].role} ${GAUGES[c].uses}`),
    ],
  },
  {
    id: 'corners',
    title: 'Les virages',
    lines: [
      'Un virage est une zone orange avec un chiffre. Ce chiffre, c’est le nombre d’arrêts à y faire. Faire un arrêt, c’est finir son tour dans la zone.',
      '• Il faut donc passer le virage en plusieurs petits tours. Prenez un rapport bas.',
      '• Si vous sortez de la zone alors qu’il vous manque un arrêt, vous perdez des Pneus. C’est pire avec des gommes tendres ou sur piste mouillée.',
      '• Si vous sortez avec 2 arrêts manquants ou plus, vous tapez le mur et la voiture abandonne. La case est alors rouge.',
      'En haut des commandes, le jeu vous rappelle ce qu’il reste à faire : « encore 1 arrêt à faire ».',
    ],
  },
  {
    id: 'overtake',
    title: 'Dépasser et contacts',
    lines: [
      'La piste a plusieurs voies. Sur une ligne droite, vous pouvez changer de voie à chaque case pour doubler une voiture qui bloque le passage. C’est impossible dans un virage, ou à travers une voiture voisine.',
      '• Si une voiture bloque toute la route, vous vous arrêtez derrière elle et perdez 1 Carrosserie, peu importe le nombre de cases qui manquent.',
      '• Après chaque déplacement, un d20 est lancé pour chaque voiture voisine. Sur un 1 (ou un 1-2 sous la pluie), vous perdez 1 Carrosserie.',
      '• Les cases à risque (chicanes) demandent un d20. Avec 4 ou moins, vous perdez 1 Tenue de route.',
    ],
  },
  {
    id: 'colors',
    title: 'Les couleurs des cases',
    lines: [
      'Une fois le dé lancé, vous choisissez votre case d’arrivée. Sa couleur annonce ce qui vous attend :',
      '• Cyan : là où votre rapport peut vous mener, avant le jet.',
      '• Vert : rien à payer.',
      '• Jaune « P » : vous perdez des Pneus.',
      '• Violet « F » : vous perdez des Freins.',
      '• Rose « C » : une voiture bloque la route, vous perdez de la Carrosserie.',
      '• Rouge « MUR » : la voiture abandonne.',
    ],
  },
  {
    id: 'tires',
    title: 'Pneus, pluie et stands',
    lines: [
      'Il y a trois gommes. La dure tient longtemps. La tendre donne un peu plus de cases au début mais s’use vite. La pluie sert sur piste mouillée. On la choisit au départ, puis à chaque arrêt.',
      'La météo change pendant la course. Sous la pluie, les contacts, le moteur et les cases à risque sont plus dangereux, et il faut des pneus pluie dans les virages.',
      'Pour passer au stand, entrez dans la voie des stands, à côté de la ligne droite. Un arrêt remet les Pneus à neuf, avec la gomme de votre choix.',
      '• Arrêt rapide (sans réparation) : un d20 décide. Sous 11, vous repartez tout de suite. Sinon, l’arrêt devient long.',
      '• Arrêt long : vous perdez le tour, mais vous répartissez 2 points de réparation entre Freins, Boîte, Carrosserie, Moteur et Tenue.',
    ],
  },
  {
    id: 'slipstream',
    title: 'L’aspiration',
    lines: [
      'Roulez en 4e rapport ou plus, tout près d’une voiture de la même ligne qui roule aussi en 4e ou plus, à un rapport égal ou inférieur au vôtre. Le bouton « Aspiration » apparaît alors et vous donne des cases en plus. Vous pouvez le refuser.',
    ],
  },
  {
    id: 'rewards',
    title: 'Récompenses et progression',
    lines: [
      'Chaque course rapporte de l’or, de l’expérience et des coffres. Mieux vous finissez, meilleurs sont les coffres.',
      'Un coffre contient des pièces de voiture. Équipez-les dans le Garage : chacune améliore une jauge ou donne un pouvoir, comme une relance du dé, un arrêt gratuit en virage ou des cases bonus.',
      'La Campagne vous oppose à des rivaux et vous fait gagner des étoiles. La course classée fait monter vos trophées et votre ligue.',
    ],
  },
];

/** The short version, read during a race. */
export const QUICK: string[] = [
  'Un tour : touchez un dé (rapport 1 à 6), touchez-le encore pour lancer, puis touchez la case d’arrivée.',
  'On ne monte que d’un rapport à la fois. Plus il est haut, plus le dé donne de cases (de 1-2 à 21-30).',
  'Virage orange : le chiffre est le nombre d’arrêts à faire, c’est-à-dire finir son tour dans la zone. Sortir trop tôt coûte des pneus, et avec 2 arrêts manquants c’est le mur.',
  'Case d’arrivée : vert, rien à payer. Jaune, pneus. Violet, freins. Rose, contact. Rouge, mur.',
  'Une jauge sous 0 et la voiture est hors course. Survolez une jauge pour voir ce qui l’use.',
  'Les pneus s’usent à chaque tour. Passez au stand avant qu’ils tombent à 0.',
  'Pour doubler, changez de voie sur une ligne droite.',
];

/** What to do right now, by phase of the turn. */
export const TIPS: Record<'gear' | 'adjust' | 'pit' | 'other', string> = {
  gear: 'À vous : touchez un dé pour choisir le rapport, touchez-le encore pour lancer.',
  adjust: 'Le dé est lancé. Ajustez avec les Freins ou « Boîte +1 », puis touchez votre case d’arrivée.',
  pit: 'Vous êtes au stand. Choisissez vos pneus et vos réparations.',
  other: 'Un autre pilote joue. Regardez la course.',
};
