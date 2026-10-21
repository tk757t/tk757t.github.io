import { TRACKS, toTrack, type TrackDef } from '../data/tracks';
import { createGame, reducer, type EngineConfig, type GameEvent, type RaceState } from '../engine';
import { nextFloat } from '../engine/rng';
import { chooseAction } from './index';
import type { AiLevel } from './types';

export interface SimOptions {
  laps: number;
  trackId: string;
  maxActions: number;
  /** Rule overrides, for balancing experiments. */
  config?: Partial<EngineConfig>;
  /** A circuit that is not in TRACKS (the editor's), used instead of `trackId`. */
  track?: TrackDef;
  /** Sees every step: the state before the action and the events it produced. */
  onEvents?: (events: GameEvent[], before: RaceState) => void;
}

export const DEFAULT_SIM: SimOptions = { laps: 2, trackId: 'oval', maxActions: 6000 };

export interface RaceOutcome {
  levels: AiLevel[];
  /** Seat index of the winner (first non-retired car in the ranking), or null. */
  winner: number | null;
  /** Rank of each seat (1 = best). */
  ranks: number[];
  retired: boolean[];
  rounds: number;
  actions: number;
  finished: boolean;
  invalid: number;
}

export function runRace(levels: AiLevel[], seed: number, opts: Partial<SimOptions> = {}): RaceOutcome {
  const o = { ...DEFAULT_SIM, ...opts };
  let state = createGame({
    seed,
    cars: levels.map((_, i) => `p${i + 1}`),
    track: toTrack(o.track ?? TRACKS[o.trackId]),
    config: { laps: o.laps, maxRounds: 400, ...o.config },
  });
  let aiState = (seed * 2654435761) >>> 0;
  const rand = () => {
    const [v, n] = nextFloat(aiState);
    aiState = n;
    return v;
  };
  let actions = 0;
  let invalid = 0;
  while (state.status === 'racing' && actions < o.maxActions) {
    const idx = state.cars.findIndex((c) => c.id === state.turn!.carId);
    const r = reducer(state, chooseAction(levels[idx], state, rand));
    if (r.events.some((e) => e.type === 'INVALID_ACTION')) invalid++;
    o.onEvents?.(r.events, state);
    state = r.state;
    actions++;
  }
  const results = state.results ?? [];
  const ranks = state.cars.map((c) => results.find((r) => r.carId === c.id)?.rank ?? state.cars.length);
  const first = results[0];
  return {
    levels,
    winner: first && !first.retired ? state.cars.findIndex((c) => c.id === first.carId) : null,
    ranks,
    retired: state.cars.map((c) => c.retired !== null),
    rounds: state.round,
    actions,
    finished: state.status === 'finished',
    invalid,
  };
}

export interface LevelStats {
  level: AiLevel;
  seats: number;
  wins: number;
  winRate: number;
  retired: number;
  retireRate: number;
  avgRank: number;
}

export interface BatchResult {
  races: number;
  perLevel: LevelStats[];
  retireRate: number;
  avgRounds: number;
  unfinished: number;
  invalid: number;
  noWinner: number;
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]));
}

/** One race per seed, rotating who sits where so the grid position does not favour a level. */
export function runBatch(races: number, levels: AiLevel[], opts: Partial<SimOptions> = {}, baseSeed = 1): BatchResult {
  const lineups = permutations(levels);
  const stats = new Map<AiLevel, { seats: number; wins: number; retired: number; rank: number }>();
  for (const l of levels) stats.set(l, { seats: 0, wins: 0, retired: 0, rank: 0 });
  let rounds = 0;
  let unfinished = 0;
  let invalid = 0;
  let noWinner = 0;
  let retiredTotal = 0;
  let cars = 0;
  for (let i = 0; i < races; i++) {
    const lineup = lineups[i % lineups.length];
    const r = runRace(lineup, baseSeed + i, opts);
    rounds += r.rounds;
    invalid += r.invalid;
    if (!r.finished) unfinished++;
    if (r.winner === null) noWinner++;
    lineup.forEach((level, seat) => {
      const s = stats.get(level) as { seats: number; wins: number; retired: number; rank: number };
      s.seats++;
      s.rank += r.ranks[seat];
      if (r.winner === seat) s.wins++;
      if (r.retired[seat]) {
        s.retired++;
        retiredTotal++;
      }
      cars++;
    });
  }
  return {
    races,
    perLevel: [...stats].map(([level, s]) => ({
      level,
      seats: s.seats,
      wins: s.wins,
      winRate: s.wins / s.seats,
      retired: s.retired,
      retireRate: s.retired / s.seats,
      avgRank: s.rank / s.seats,
    })),
    retireRate: retiredTotal / cars,
    avgRounds: rounds / races,
    unfinished,
    invalid,
    noWinner,
  };
}
