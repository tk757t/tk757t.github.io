import { describe, expect, it } from 'vitest';
import { rankedSeasonOf } from '../data/ranked';
import { RANKED_PER_HOUR, applyAction, type ActionContext } from './actions';
import { GameError } from './errors';
import { RACE_RULES, minRaceMs } from './race';
import { freshState, publicState, readState, type ServerState } from './state';

const T0 = Date.UTC(2026, 9, 21, 12);

/** Deterministic stand-in for the server's crypto randomness. */
function counter(start = 1): () => number {
  let i = start;
  return () => Math.imul(i++, 2654435761) >>> 0;
}
const ctx = (now = T0): ActionContext => ({ now, random: counter() });
const season = rankedSeasonOf(T0);

type Ranked = ServerState['profile']['ranked'];
const withRanked = (ranked: Partial<Ranked> = {}): ServerState => {
  const s = freshState(T0, counter(99));
  return { ...s, profile: { ...s.profile, ranked: { trophies: 0, peak: 0, races: 0, wins: 0, season, ...ranked } } };
};

/** Runs an action and returns the error it throws (or fails the test). */
function refused(state: ServerState, action: string, params: unknown, c: ActionContext = ctx()): GameError {
  try {
    applyAction(state, action, params, c);
  } catch (e) {
    expect(e).toBeInstanceOf(GameError);
    return e as GameError;
  }
  throw new Error(`${action} should have been refused`);
}

const startRanked = (s: ServerState, over: object = {}, c = ctx()) => applyAction(s, 'start_race', { trackId: 'dunes', laps: 1, players: 2, bots: 0, ranked: true, ...over }, c);
const finish = (s: ServerState, over: object = {}, at?: number) =>
  applyAction(s, 'finish_race', { token: s.race!.id, rank: 1, retired: false, clean: true, ...over }, ctx(at ?? T0 + minRaceMs(s.race!, false)));

describe('ranked races (docs/gdd/04-modes.md § 4.3 and § 4.5, src/data/ranked.ts)', () => {
  it('issues a ranked token only for 2 to 4 cars on one lap', () => {
    const a = startRanked(withRanked());
    expect(a.state.race).toMatchObject({ players: 2, laps: 1, bots: 0, level: null, ranked: true });
    expect(refused(withRanked(), 'start_race', { trackId: 'dunes', laps: 1, players: 1, bots: 0, ranked: true }).code).toBe('invalid');
    expect(refused(withRanked(), 'start_race', { trackId: 'dunes', laps: 2, players: 2, bots: 0, ranked: true }).code).toBe('invalid'); // the laps are the circuit's
    expect(refused(withRanked(), 'start_race', { trackId: 'oval', laps: 1, players: 2, bots: 0, ranked: true }).code).toBe('invalid'); // not a circuit of the queue
    expect(refused(withRanked(), 'start_race', { trackId: 'dunes', laps: 1, players: 2, bots: 0, ranked: 'yes' }).code).toBe('invalid');
    // an ordinary race stays ordinary
    expect(applyAction(withRanked(), 'start_race', { trackId: 'oval', laps: 1, players: 2, bots: 0 }, ctx()).state.race!.ranked).toBeUndefined();
    expect(applyAction(withRanked(), 'start_race', { level: 0 }, ctx()).state.race!.ranked).toBeUndefined();
  });

  it('lets AIs complete a race of the Paddock league only', () => {
    expect(startRanked(withRanked({ trophies: 100 }), { players: 3, bots: 1 }).state.race!.bots).toBe(1);
    const higher = refused(withRanked({ trophies: 450, peak: 450 }), 'start_race', { trackId: 'dunes', laps: 1, players: 3, bots: 1, ranked: true });
    expect(higher.code).toBe('refused');
    expect(higher.message).toContain('Paddock');
  });

  it('moves the trophies by place and tells the screen', () => {
    const s = startRanked(withRanked({ trophies: 100, peak: 100, races: 4, wins: 1 })).state;
    const r = finish(s);
    expect(r.result).toMatchObject({ action: 'finish_race', verified: false, ranked: { delta: 30, trophies: 130, league: 'paddock', promoted: false, demoted: false } });
    expect(r.state.profile.ranked).toEqual({ trophies: 130, peak: 130, races: 5, wins: 2, season });
    const later = T0 + 9_000_000;
    const second = startRanked(r.state, {}, ctx(later)).state;
    const lost = finish(second, { rank: 2 }, later + 60_000);
    expect(lost.result).toMatchObject({ ranked: { delta: -20, trophies: 110 } });
    expect(lost.state.profile.ranked).toMatchObject({ trophies: 110, peak: 130, races: 6, wins: 2 });
  });

  it('counts an abandon as the last place, whatever rank is declared', () => {
    const s = startRanked(withRanked({ trophies: 100, peak: 100 }), { players: 4 }).state;
    const r = finish(s, { retired: true, rank: 1 }, T0 + RACE_RULES.floorMs);
    expect(r.result).toMatchObject({ ranked: { delta: -20, trophies: 80 } });
    expect(r.state.profile.ranked.wins).toBe(0);
  });

  it('never goes under the floor of a league reached, and promotes', () => {
    const floor = finish(startRanked(withRanked({ trophies: 405, peak: 405 })).state, { rank: 2 });
    expect(floor.state.profile.ranked.trophies).toBe(400);
    const up = finish(startRanked(withRanked({ trophies: 390, peak: 390 }), { players: 4 }).state, { rank: 1 });
    expect(up.result).toMatchObject({ ranked: { delta: 40, trophies: 430, league: 'bitume', promoted: true } });
  });

  it('applies the end of the season to the figures of an older season before the race', () => {
    const old = withRanked({ trophies: 4600, peak: 4700, races: 80, wins: 50, season: season - 1 });
    const r = finish(startRanked(old).state, { rank: 2 });
    // 4 600 -> 4 000 + 300 = 4 300 at the end of the season, then -20
    expect(r.state.profile.ranked).toMatchObject({ trophies: 4280, season });
  });

  it('is limited per hour, and an ordinary race never moves the trophies', () => {
    let s = withRanked();
    let t = T0;
    for (let i = 0; i < RANKED_PER_HOUR; i++) {
      s = startRanked(s, {}, ctx(t)).state;
      s = finish(s, {}, t + 60_000).state;
      t += 90_000;
    }
    s = startRanked(s, {}, ctx(t)).state;
    expect(refused(s, 'finish_race', { token: s.race!.id, rank: 1, retired: false, clean: true }, ctx(t + 60_000)).code).toBe('too_many');
    // an ordinary race
    const ordinary = applyAction(withRanked(), 'start_race', { trackId: 'oval', laps: 2, players: 3, bots: 1 }, ctx()).state;
    const done = applyAction(ordinary, 'finish_race', { token: ordinary.race!.id, rank: 1, retired: false, clean: true }, ctx(T0 + minRaceMs(ordinary.race!, false)));
    expect(done.result).not.toHaveProperty('ranked');
    expect(done.state.profile.ranked.trophies).toBe(0);
  });

  it('keeps the token and the figures through the stored state, and reads a row from before the ranked mode', () => {
    const s = startRanked(withRanked({ trophies: 120, peak: 150 })).state;
    const stored = readState(JSON.parse(JSON.stringify(s)));
    expect(stored.race!.ranked).toBe(true);
    expect(stored.profile.ranked).toMatchObject({ trophies: 120, peak: 150 });
    const old = JSON.parse(JSON.stringify(withRanked()));
    delete old.profile.ranked;
    delete old.rankedFinishes;
    const read = readState(old);
    expect(read.profile.ranked).toEqual({ trophies: 0, peak: 0, races: 0, wins: 0, season: 0 });
    expect(read.rankedFinishes).toEqual([]);
    expect(publicState(read).profile.ranked.trophies).toBe(0);
  });

  it('the trophies cannot be asked for or given by the browser', () => {
    expect(refused(withRanked(), 'start_race', { trackId: 'dunes', laps: 1, players: 2, bots: 0, ranked: true, trophies: 4000 }).code).toBe('invalid');
    const s = startRanked(withRanked()).state;
    expect(refused(s, 'finish_race', { token: s.race!.id, rank: 1, retired: false, trophies: 999 }, ctx(T0 + 3_600_000)).code).toBe('invalid');
  });
});
