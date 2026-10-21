import { LEVELS, EMPTY_STATS, opponentMods, starsFor, trackStats, type CampaignLevel, type RaceStats } from '../data/campaign';
import { TRACKS, toTrack } from '../data/tracks';
import { createGame, reducer, type CarMods, type TireType } from '../engine';
import { nextFloat } from '../engine/rng';
import { chooseAction } from './index';
import type { AiLevel } from './types';

export interface LevelRace {
  win: boolean;
  rank: number;
  retired: boolean;
  stars: number;
  rounds: number;
  stats: RaceStats;
  finished: boolean;
}

/**
 * Plays one race of a campaign level with the rules and the weather of the game: seat 1 is "the player", driven by
 * an AI of the given level with the starter car (no parts), the others are the level's opponents with their equipment.
 * The circuit must be registered in TRACKS (the app loads it lazily, scripts read the JSON).
 */
export function runLevel(level: CampaignLevel, seed: number, player: AiLevel = 'medium'): LevelRace {
  const mods: Record<string, CarMods> = {};
  const tires: Record<string, TireType> = {};
  level.opponents.forEach((o, i) => {
    mods[`p${i + 2}`] = opponentMods(o);
    tires[`p${i + 2}`] = o.tires;
  });
  const levels: AiLevel[] = [player, ...level.opponents.map((o) => o.ai)];
  let state = createGame({
    seed,
    cars: levels.map((_, i) => `p${i + 1}`),
    track: toTrack(TRACKS[level.trackId]),
    config: { laps: level.laps, maxRounds: 400, weather: level.weather === 'sun' ? 'sun' : 'random' },
    mods,
    tires,
  });
  let aiState = (seed * 2654435761) >>> 0;
  const rand = () => {
    const [v, n] = nextFloat(aiState);
    aiState = n;
    return v;
  };
  let stats = EMPTY_STATS;
  for (let actions = 0; state.status === 'racing' && actions < 20000; actions++) {
    const idx = state.cars.findIndex((c) => c.id === state.turn!.carId);
    const r = reducer(state, chooseAction(levels[idx], state, rand));
    stats = trackStats(stats, 'p1', state, r.state, r.events);
    state = r.state;
  }
  const mine = state.results?.find((r) => r.carId === 'p1');
  const rank = mine?.rank ?? levels.length;
  const retired = mine ? mine.retired !== null : true;
  return { win: rank === 1 && !retired, rank, retired, stars: starsFor(level, { rank, retired, stats }).stars, rounds: state.round, stats, finished: state.status === 'finished' };
}

export interface LevelBatch {
  level: CampaignLevel;
  races: number;
  winRate: number;
  retireRate: number;
  avgRank: number;
  avgRounds: number;
  /** How many races ended with 0, 1, 2 and 3 stars. */
  starCounts: number[];
  unfinished: number;
}

export function runLevelBatch(index: number, races: number, baseSeed = 1, player: AiLevel = 'medium'): LevelBatch {
  const level = LEVELS[index];
  let wins = 0;
  let retired = 0;
  let rank = 0;
  let rounds = 0;
  let unfinished = 0;
  const starCounts = [0, 0, 0, 0];
  for (let i = 0; i < races; i++) {
    const r = runLevel(level, baseSeed + i, player);
    if (r.win) wins++;
    if (r.retired) retired++;
    if (!r.finished) unfinished++;
    rank += r.rank;
    rounds += r.rounds;
    starCounts[r.stars]++;
  }
  return { level, races, winRate: wins / races, retireRate: retired / races, avgRank: rank / races, avgRounds: rounds / races, starCounts, unfinished };
}
