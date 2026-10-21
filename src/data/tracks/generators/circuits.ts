import type { OvalOptions } from './oval';

/**
 * Our own test circuits, all drawn by the oval generator, until the real circuits of the game are designed.
 * The test oval stays the default circuit; the three others are the campaign's, from the gentlest to the most
 * technical (tuned with `npm run sim -- --level N`, see docs/equilibrage-campagne.md).
 */
export const TEST_CIRCUITS: Partial<OvalOptions>[] = [
  {},
  { id: 'anneau', name: 'Petit anneau', straight: 14, turn: 16, halfStraight: 280, innerRadius: 170, stops: [1, 1, 1, 1], weather: { rain: 4, sun: 10 } },
  { id: 'lac', name: 'Ovale du lac', straight: 26, turn: 12, halfStraight: 520, innerRadius: 150, stops: [1, 2, 2, 1], weather: { rain: 7, sun: 13 } },
  { id: 'epingles', name: 'Ovale des épingles', straight: 18, turn: 14, halfStraight: 360, innerRadius: 154, stops: [2, 3, 2, 3], weather: { rain: 3, sun: 10 } },
];
