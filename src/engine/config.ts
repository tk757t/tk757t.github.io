import type { EngineConfig, Wear } from './types';

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Wear in the order of §2: tires, brakes, gearbox, body, engine, handling. */
const wear = (tires: number, brakes: number, gearbox: number, body: number, engine: number, handling: number): Wear => ({
  tires,
  brakes,
  gearbox,
  body,
  engine,
  handling,
});

/** Values of docs/regles.md; everything here can be overridden (parts will do so). */
export const DEFAULT_CONFIG: EngineConfig = {
  // §1: 1-2, {2,3,3,4,4,4}, {4,5,6,6,7,7,8,8}, 6 + d6, 10 + d10, 20 + d10
  dice: [[1, 2], [2, 3, 3, 4, 4, 4], [4, 5, 6, 6, 7, 7, 8, 8], range(7, 12), range(11, 20), range(21, 30)],
  // §2
  startPoints: {
    lap1: wear(4, 3, 2, 2, 2, 2),
    lap2: wear(6, 3, 3, 2, 2, 2),
    lap3: wear(6, 3, 3, 3, 3, 2),
    practice: wear(12, 4, 3, 3, 3, 3),
  },
  laps: 2,
  practice: false,
  maxRounds: 400,
  startTires: 'hard',
  weather: 'random',
  // §4
  superStart: 20,
  stall: 1,
  superStartCells: 4,
  // §5
  brakeLossCap: 3,
  // §10
  repairPoints: 2,
  fastStopBelow: 11,
  // §13 (hypothesis)
  slipstreamBonus: 2,
  // §8
  contact: { dry: 1, rain: 2 },
  engineRoll: { dry: 4, rain: 3, minGear: 5 },
  risk: { dry: 4, rain: 5 },
  // §7 / §18 (hypothesis)
  rainOvershootExtra: { other: 3, rain: 1 },
};

/** The starting points that apply to a race of `laps` laps (§2). */
export function startPointsFor(config: EngineConfig): Wear {
  if (config.practice) return config.startPoints.practice;
  return config.laps <= 1 ? config.startPoints.lap1 : config.laps === 2 ? config.startPoints.lap2 : config.startPoints.lap3;
}
