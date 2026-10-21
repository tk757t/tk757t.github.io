import type { CampaignLevel, Opponent } from './types';

// Opponents are tuned by `npm run sim -- --level N` (see docs/equilibrage-campagne.md): their parts and tires, not the rules.
const op = (o: Opponent): Opponent => o;

/** Three levels on three of our test circuits, from the gentlest to the most technical (src/data/tracks/generators/circuits.ts). */
export const LEVELS: CampaignLevel[] = [
  {
    id: 'debutant',
    name: 'Débutant',
    tagline: 'Le Petit anneau : des virages faciles, sans pluie',
    trackId: 'anneau',
    laps: 2,
    weather: 'sun',
    playerCar: 0,
    opponents: [
      op({
        ai: 'easy',
        name: 'Léa Virage',
        team: 'Écurie Corail',
        car: 3,
        portrait: 4,
        tires: 'soft',
        parts: { wing: { id: 'wng-active', level: 1 } },
      }),
    ],
    goals: [{ kind: 'finish' }, { kind: 'top', n: 2 }, { kind: 'win', condition: 'corner-overtake' }],
    reward: { gold: 150, gems: 5, xp: 60, pack: { tier: 'common' } },
    starGems: 3,
  },
  {
    id: 'challenger',
    name: 'Challenger',
    tagline: 'L’Ovale du lac, ses virages à deux arrêts et ses averses',
    trackId: 'lac',
    laps: 3,
    weather: 'variable',
    playerCar: 0,
    opponents: [
      op({
        ai: 'medium',
        name: 'Hugo Turbo',
        team: 'Team Ardoise',
        car: 1,
        portrait: 2,
        tires: 'hard',
        parts: { brakes: { id: 'brk-stock', level: 1 } },
      }),
      op({
        ai: 'medium',
        name: 'Sami Gomme',
        team: 'Écurie Lagon',
        car: 2,
        portrait: 1,
        tires: 'hard',
        parts: {},
      }),
    ],
    goals: [{ kind: 'finish' }, { kind: 'top', n: 2 }, { kind: 'win', condition: 'no-part-broken' }],
    reward: { gold: 300, gems: 10, xp: 120, pack: { tier: 'rare' } },
    starGems: 5,
  },
  {
    id: 'champion',
    name: 'Champion',
    tagline: 'L’Ovale des épingles : un seul faux pas et c’est le rail',
    trackId: 'epingles',
    laps: 3,
    weather: 'variable',
    playerCar: 0,
    opponents: [
      op({
        ai: 'hard',
        name: 'Max Asphalte',
        team: 'Écurie Volcan',
        car: 0,
        portrait: 0,
        tires: 'rain',
        parts: {},
      }),
      op({
        ai: 'medium',
        name: 'Zoé Chicane',
        team: 'Team Glacier',
        car: 2,
        portrait: 3,
        tires: 'rain',
        parts: {},
      }),
      op({
        ai: 'easy',
        name: 'Tom Piston',
        team: 'Écurie Prairie',
        car: 8,
        portrait: 4,
        tires: 'hard',
        parts: { wing: { id: 'wng-flap', level: 1 } },
      }),
    ],
    goals: [{ kind: 'finish' }, { kind: 'top', n: 2 }, { kind: 'win', condition: 'no-tire-loss' }],
    reward: { gold: 600, gems: 20, xp: 240, pack: { tier: 'epic', guaranteedPart: 'eng-v8' } },
    starGems: 8,
  },
];

export const LEVEL_COUNT = LEVELS.length;
