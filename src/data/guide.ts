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
      'Une course de voitures à jouer au dé, de 2 à 4 voitures. Chaque voiture avance de quelques cases par tour ; la première qui termine tous les tours gagne.',
      'Mais une voiture se use : si une de ses six jauges passe sous 0, elle abandonne. Aller vite, c’est aussi risquer de tout casser.',
      'Les plus belles courses se gagnent en choisissant le bon dé au bon moment, pas seulement en lançant le plus gros.',
    ],
  },
  {
    id: 'turn',
    title: 'Un tour de jeu',
    lines: [
      '1. Touchez le dé de votre rapport (de 1 à 6). Les cases que vous pouvez atteindre s’éclairent.',
      '2. Touchez-le encore (ou « Lancer ») : le dé roule et donne un nombre de cases.',
      '3. Ajustez si vous voulez : chaque point de Freins retire 1 case, et « Boîte +1 » en ajoute 1 (une fois par tour).',
      '4. Touchez la case d’arrivée sur la piste. Sa couleur dit ce qu’elle coûte (voir « Les couleurs des cases »).',
      '5. La voiture avance, puis le jeu applique les conséquences : contacts, virage, moteur, pneus.',
      'Le premier tour d’une course est un départ arrêté : un d20 décide du départ (20 = super départ, 1 = calage).',
    ],
  },
  {
    id: 'dice',
    title: 'Les dés et les rapports',
    lines: [
      'Il y a un dé par rapport. Plus le rapport est haut, plus le dé donne de cases, mais plus la voiture souffre :',
      ...GEAR_RANGES.map(([a, b], i) => `• Rapport ${i + 1} : ${a} à ${b} cases.`),
      'On monte d’un seul rapport à la fois (du 3 on peut aller au 4, pas au 5). On peut descendre quand on veut, mais descendre de loin coûte :',
      '• de 2 rapports : −1 Boîte ; de 3 : −1 Boîte et −1 Freins ; de 4 ou plus : −1 Boîte, −1 Freins et −1 Moteur.',
      'Les dés indisponibles sont grisés : on ne peut pas les payer, ou ils sont trop haut.',
    ],
  },
  {
    id: 'gauges',
    title: 'Les six jauges',
    lines: [
      'Votre voiture a six jauges. Une jauge qui passe sous 0 met la voiture hors course. Survolez une jauge (ou touchez-la) pour lire ce qu’elle fait.',
      ...WEAR_CATEGORIES.map((c) => `• ${GAUGES[c].name} : ${GAUGES[c].role} ${GAUGES[c].uses}`),
    ],
  },
  {
    id: 'corners',
    title: 'Les virages',
    lines: [
      'Un virage est une zone orange avec un chiffre : le nombre d’arrêts à y faire. Faire un arrêt, c’est terminer votre tour dans la zone.',
      '• Il faut donc passer le virage en plusieurs petits tours : choisissez un rapport bas.',
      '• Sortir de la zone avec un arrêt manquant coûte des Pneus (plus avec des gommes tendres, ou sur la piste mouillée).',
      '• Sortir avec 2 arrêts manquants ou plus, c’est le mur : la voiture abandonne. La case est alors rouge.',
      'Le chiffre qui reste s’affiche en haut des commandes : « encore 1 arrêt à faire ».',
    ],
  },
  {
    id: 'overtake',
    title: 'Dépasser et contacts',
    lines: [
      'La piste a plusieurs voies. On change de voie à chaque case d’une ligne droite, pour doubler une voiture qui barre la route (pas dans un virage, et pas à travers une voiture voisine).',
      '• Une voiture qui barre toute la route : on s’arrête derrière elle et on perd 1 Carrosserie, quel que soit le nombre de cases manquantes.',
      '• Après un déplacement, un d20 est lancé pour chaque voiture voisine : 1 (ou 1-2 sous la pluie) = −1 Carrosserie.',
      '• Les cases à risque (chicanes) demandent un d20 : 4 ou moins = −1 Tenue de route.',
    ],
  },
  {
    id: 'colors',
    title: 'Les couleurs des cases',
    lines: [
      'Quand le dé est lancé, vous choisissez votre case d’arrivée. Sa couleur dit ce qui vous attend :',
      '• Cyan : où votre rapport pourrait vous mener (avant le jet).',
      '• Vert : rien n’est perdu.',
      '• Jaune « P » : vous perdez des Pneus.',
      '• Violet « F » : vous perdez des Freins.',
      '• Rose « C » : une voiture barre la route, vous perdez de la Carrosserie.',
      '• Rouge « MUR » : la voiture abandonne.',
    ],
  },
  {
    id: 'tires',
    title: 'Pneus, pluie et stands',
    lines: [
      'Trois gommes : dure (tient longtemps), tendre (un peu plus de cases au début, s’use vite) et pluie (pour la piste mouillée). Choisissez-la au départ et à chaque arrêt.',
      'La météo change pendant la course. Sous la pluie, les contacts, le moteur et les cases à risque sont plus dangereux, et il faut des pneus pluie dans les virages.',
      'Le stand se prend en entrant dans la voie des stands, à côté de la ligne droite : un arrêt remet les Pneus à neuf avec la gomme de votre choix.',
      '• Arrêt rapide (sans réparation) : un d20 décide s’il passe tout de suite (sous 11) ou s’il devient long.',
      '• Arrêt long : le tour est perdu, mais vous répartissez 2 points de réparation sur Freins, Boîte, Carrosserie, Moteur et Tenue.',
    ],
  },
  {
    id: 'slipstream',
    title: 'L’aspiration',
    lines: [
      'En 4e rapport ou plus, quand vous suivez de près une voiture de la même ligne qui roule elle aussi en 4e ou plus, à un rapport égal ou inférieur au vôtre, le bouton « Aspiration » apparaît : il ajoute des cases. Vous pouvez le refuser.',
    ],
  },
  {
    id: 'rewards',
    title: 'Récompenses et progression',
    lines: [
      'Chaque course rapporte de l’or, de l’expérience et des coffres : plus vous finissez haut, meilleurs sont les coffres.',
      'Un coffre contient des pièces de voiture. Équipez-les dans le Garage : chaque pièce améliore une jauge ou donne un pouvoir (une relance du dé, un arrêt gratuit en virage, des cases bonus).',
      'La Campagne propose des courses contre des rivaux, avec des étoiles à gagner. La course classée fait monter vos trophées et votre ligue.',
    ],
  },
];

/** The short version, read during a race. */
export const QUICK: string[] = [
  '🎲 Un tour : touchez un dé (rapport 1 à 6), touchez-le encore pour lancer, puis touchez la case d’arrivée.',
  '⬆ On monte d’un seul rapport à la fois ; plus le rapport est haut, plus le dé donne de cases (de 1-2 à 21-30).',
  '🛞 Virage orange : le chiffre est le nombre d’arrêts à y faire (finir son tour dans la zone). Sortir trop tôt coûte des pneus ; 2 arrêts manquants, c’est le mur.',
  '🎨 Cases d’arrivée : vert = rien de perdu, jaune = pneus, violet = freins, rose = contact, rouge = mur.',
  '❤ Chaque jauge sous 0 met la voiture hors course : survolez une jauge pour savoir ce qui la use.',
  '🔧 Les pneus s’usent à chaque tour : passez au stand avant qu’ils ne tombent à 0.',
  '↔ Pour doubler, changez de voie sur une ligne droite.',
];

/** What to do right now, by phase of the turn. */
export const TIPS: Record<'gear' | 'adjust' | 'pit' | 'other', string> = {
  gear: 'À vous : touchez un dé pour choisir votre rapport, touchez-le encore pour lancer.',
  adjust: 'Le dé est lancé : ajustez avec les Freins ou « Boîte +1 », puis touchez la case d’arrivée.',
  pit: 'Vous êtes au stand : choisissez vos pneus et vos réparations.',
  other: 'C’est au tour d’un autre pilote : regardez la course.',
};
