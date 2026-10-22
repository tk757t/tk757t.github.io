import { describe, expect, it } from 'vitest';
import { asCurrent, fixedDice, inRace, linearTrack, patchCar } from '../../engine/testing';
import { NO_ASSETS, setAssetProvider, type AssetProvider } from '../assets';
import { getPart } from '../parts/catalogue';
import { TRACKS, trackInfo, validateTrackDef } from '../tracks';
import { indicators } from '../tracks/difficulty';
import { EMPTY_STATS, LEVELS, goalText, opponentLook, opponentMods, starsFor, trackStats } from './index';

describe('campaign levels', () => {
  it('three levels, each on one of our circuits that passes the validator, none used twice', () => {
    expect(LEVELS).toHaveLength(3);
    const ids = LEVELS.map((l) => l.trackId);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) {
      expect(trackInfo(id), id).toBeDefined();
      expect(validateTrackDef(TRACKS[id]), id).toEqual([]);
    }
  });

  it('follows the brief: opponents, laps, weather, reward packs', () => {
    expect(LEVELS.map((l) => l.opponents.map((o) => o.ai))).toEqual([['easy'], ['medium', 'medium'], ['hard', 'medium', 'easy']]);
    expect(LEVELS.map((l) => l.laps)).toEqual([2, 3, 3]);
    expect(LEVELS.map((l) => l.weather)).toEqual(['sun', 'variable', 'variable']);
    expect(LEVELS.map((l) => l.reward.pack.tier)).toEqual(['common', 'rare', 'epic']);
    expect(LEVELS[2].reward.pack.guaranteedPart).toBeDefined();
    expect(getPart(LEVELS[2].reward.pack.guaranteedPart as string)).toBeDefined();
    expect(LEVELS[0].reward.pack.guaranteedPart).toBeUndefined();
  });

  it('each level has the three objectives: finish, a top place, then a win with one condition', () => {
    for (const l of LEVELS) {
      expect(l.goals[0]).toEqual({ kind: 'finish' });
      expect(l.goals[1]).toEqual({ kind: 'top', n: 2 });
      expect(l.goals[2].kind).toBe('win');
    }
    expect(LEVELS.map((l) => (l.goals[2] as { condition: string }).condition)).toEqual(['corner-overtake', 'no-part-broken', 'no-tire-loss']);
    expect(LEVELS.map((l) => goalText(l.goals[2]))).toEqual(['Gagner avec au moins un dépassement en virage', 'Gagner sans qu’une pièce tombe à 0', 'Gagner sans perdre un point de pneus']);
  });

  it('the circuits get harder: more stops to make, more corners of 2 stops or more', () => {
    const scores = LEVELS.map((l) => indicators(TRACKS[l.trackId]));
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i].stops).toBeGreaterThan(scores[i - 1].stops);
      expect(scores[i].hard).toBeGreaterThan(scores[i - 1].hard);
      expect(scores[i].corners).toBeGreaterThanOrEqual(scores[i - 1].corners);
    }
    expect(LEVELS.map((l) => l.trackId)).toEqual(['anneau', 'lac', 'epingles']);
    expect(scores.map((s) => s.stopsList)).toEqual([[1, 1, 1, 1], [1, 2, 2, 1], [2, 3, 2, 3]]);
  });

  it('the weather thresholds come from the circuits', () => {
    expect(trackInfo('lac')!.weather).toEqual({ rain: 7, sun: 13 });
    expect(TRACKS.epingles.weather).toEqual({ rain: 3, sun: 10 });
  });

  it('opponents are equipped from the parts catalogue, and the equipment shows in their modifiers', () => {
    for (const l of LEVELS) {
      for (const o of l.opponents) {
        for (const p of Object.values(o.parts)) expect(getPart(p!.id), p!.id).toBeDefined();
        expect(opponentMods(o)).toBeDefined();
      }
    }
    expect(opponentMods(LEVELS[1].opponents[0]).wearBonus.brakes).toBe(2);
    // the rival of level 1 has the active aerodynamics: +3 road holding, less its drawback of 1
    expect(opponentMods(LEVELS[0].opponents[0]).wearBonus).toEqual({ handling: 2 });
    expect(opponentMods(LEVELS[0].opponents[0]).moveBonus).toEqual([{ gears: [1, 2, 3], amount: 2 }]);
  });

  it('seats show their fictional names, and their pictures only when the asset registry has them', () => {
    const o = LEVELS[2].opponents[0];
    expect(opponentLook(o)).toEqual({ driver: 'Max Asphalte', team: 'Écurie Volcan', car: null, portrait: null });
    const art: AssetProvider = { ...NO_ASSETS, carSprite: (i) => `/car-${i}.png`, driverPortrait: (i) => `/face-${i}.png` };
    setAssetProvider(art);
    expect(opponentLook(o)).toEqual({ driver: 'Max Asphalte', team: 'Écurie Volcan', car: 0, portrait: 0 });
    setAssetProvider(NO_ASSETS);
  });
});

describe('stars', () => {
  const l3 = LEVELS[2];
  const run3 = (rank: number, retired: boolean, stats = EMPTY_STATS) => starsFor(l3, { rank, retired, stats });

  it('one star for finishing, one for the top 2, one for winning with the condition', () => {
    expect(run3(4, false)).toEqual({ met: [true, false, false], stars: 1 });
    expect(run3(2, false)).toEqual({ met: [true, true, false], stars: 2 });
    expect(run3(1, false)).toEqual({ met: [true, true, true], stars: 3 });
    expect(run3(1, false, { ...EMPTY_STATS, tireLoss: 1 })).toEqual({ met: [true, true, false], stars: 2 });
    expect(run3(1, true)).toEqual({ met: [false, false, false], stars: 0 });
  });

  it('the win condition of each level', () => {
    const win = (i: number, stats: Partial<typeof EMPTY_STATS>) => starsFor(LEVELS[i], { rank: 1, retired: false, stats: { ...EMPTY_STATS, ...stats } }).met[2];
    expect(win(0, {})).toBe(false);
    expect(win(0, { cornerOvertakes: 1 })).toBe(true);
    expect(win(1, {})).toBe(true);
    expect(win(1, { partBroken: true })).toBe(false);
    expect(win(2, {})).toBe(true);
    expect(win(2, { tireLoss: 2 })).toBe(false);
    // not winning never earns the third star
    expect(starsFor(LEVELS[0], { rank: 2, retired: false, stats: { ...EMPTY_STATS, cornerOvertakes: 3 } }).met[2]).toBe(false);
  });
});

describe('race stats', () => {
  const track = linearTrack(60, { corners: [{ from: 10, to: 14, stops: 1, id: 'T1' }], grid: [0, 1] });
  const dice = fixedDice([2, 3, 7, 9, 15, 25]);
  const start = () => {
    let s = inRace(track, { ...dice, laps: 1 }, 2);
    s = patchCar(s, 'car1', { position: 'c4', gear: 3 });
    s = patchCar(s, 'car2', { position: 'c8', gear: 3 });
    return asCurrent(s, 'car1');
  };

  // a single lane cannot be passed on, so the move is played on the state directly: only the positions and the event count
  const moved = (s: ReturnType<typeof start>, to: string, from = 'car1') => ({
    next: patchCar(s, from, { position: to }),
    events: [{ type: 'CAR_MOVED' as const, carId: from, from: s.cars[0].position as string, to, cells: 1, missing: 0 }],
  });

  it('counts the cars passed by a move that ends in a corner', () => {
    const s = start();
    const m = moved(s, 'c11'); // c4 -> c11 (corner T1), car2 waits on c8
    expect(trackStats(EMPTY_STATS, 'car1', s, m.next, m.events).cornerOvertakes).toBe(1);
  });

  it('does not count a pass that ends on a straight, a corner that passes nobody, or another car moving', () => {
    const s = start();
    const straight = moved(s, 'c20');
    expect(trackStats(EMPTY_STATS, 'car1', s, straight.next, straight.events).cornerOvertakes).toBe(0);
    const behind = moved(s, 'c6'); // still behind car2
    expect(trackStats(EMPTY_STATS, 'car1', s, behind.next, behind.events).cornerOvertakes).toBe(0);
    const other = moved(s, 'c12', 'car2'); // car2 moves: not the player's overtake
    expect(trackStats(EMPTY_STATS, 'car1', s, other.next, other.events).cornerOvertakes).toBe(0);
    const twice = trackStats({ ...EMPTY_STATS, cornerOvertakes: 2 }, 'car1', s, moved(s, 'c11').next, moved(s, 'c11').events);
    expect(twice.cornerOvertakes).toBe(3);
  });

  it('sums the tire points lost and notices a part falling to 0', () => {
    const s = start();
    const lost = patchCar(s, 'car1', { wear: { engine: 0 } });
    const events = [{ type: 'WEAR_LOST' as const, carId: 'car1', category: 'tires' as const, amount: 2, cause: 'overshoot' }, { type: 'WEAR_LOST' as const, carId: 'car2', category: 'tires' as const, amount: 5, cause: 'overshoot' }];
    const stats = trackStats(EMPTY_STATS, 'car1', s, lost, events);
    expect(stats).toEqual({ tireLoss: 2, partBroken: true, cornerOvertakes: 0 });
    // stats only grow
    expect(trackStats(stats, 'car1', s, s, [])).toEqual(stats);
  });
});
