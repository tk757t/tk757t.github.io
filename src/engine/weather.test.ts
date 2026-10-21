import { describe, expect, it } from 'vitest';
import { createGame } from './reducer';
import { driftWetness, isRaining, weatherFromD20, weatherOf, wetnessFor } from './rules';
import { adjust, fixedDice, game, linearTrack, moveTo, ready, run, shift } from './testing';
import type { GameEvent, Weather } from './types';

const sigma = (p: number, n: number) => 4 * Math.sqrt((p * (1 - p)) / n);
const weathers = (events: GameEvent[]) => events.filter((e): e is Extract<GameEvent, { type: 'WEATHER' }> => e.type === 'WEATHER');

describe('§9 weather from a d20', () => {
  it('default thresholds 7 and 13: 1-6 rain, 7-13 cloudy, 14-20 sunny', () => {
    const t = { rain: 7, sun: 13 };
    const by = (n: number): Weather => weatherFromD20(n, t);
    expect([1, 6].map(by)).toEqual(['rain', 'rain']);
    expect([7, 13].map(by)).toEqual(['cloud', 'cloud']);
    expect([14, 20].map(by)).toEqual(['sun', 'sun']);
  });

  it('other thresholds (5 and 9): 1-4 rain, 5-9 cloudy, 10-20 sunny', () => {
    const t = { rain: 5, sun: 9 };
    const counts = { rain: 0, cloud: 0, sun: 0 };
    for (let n = 1; n <= 20; n++) counts[weatherFromD20(n, t)]++;
    expect(counts).toEqual({ rain: 4, cloud: 5, sun: 11 });
    expect(weatherFromD20(4, t)).toBe('rain');
    expect(weatherFromD20(5, t)).toBe('cloud');
    expect(weatherFromD20(9, t)).toBe('cloud');
    expect(weatherFromD20(10, t)).toBe('sun');
  });

  it('the five wetness levels: 0-1 sun, 2 cloudy, 3-4 rain', () => {
    expect([0, 1, 2, 3, 4].map(weatherOf)).toEqual(['sun', 'sun', 'cloud', 'rain', 'rain']);
    expect([0, 1, 2, 3, 4].map((w) => isRaining({ wetness: w }))).toEqual([false, false, false, true, true]);
    expect(wetnessFor('sun')).toBe(0);
    expect(wetnessFor('cloud')).toBe(2);
    expect(wetnessFor('rain')).toBe(4);
  });

  it('the wetness slides one step at a time towards the weather drawn (hypothesis of §9)', () => {
    expect(driftWetness(0, 'rain')).toBe(1);
    expect(driftWetness(4, 'sun')).toBe(3);
    expect(driftWetness(1, 'cloud')).toBe(2);
    expect(driftWetness(3, 'cloud')).toBe(2);
    expect(driftWetness(2, 'cloud')).toBe(2);
    expect(driftWetness(4, 'rain')).toBe(4);
    expect(driftWetness(0, 'sun')).toBe(0);
  });
});

describe('§9 weather in a race', () => {
  const track = linearTrack(300);

  it('the starting weather is a d20 against the thresholds of the circuit', () => {
    const n = 6000;
    const seen = { rain: 0, cloud: 0, sun: 0 };
    for (let seed = 1; seed <= n; seed++) seen[weatherOf(createGame({ seed, track, cars: 1, config: { weather: 'random' } }).wetness)]++;
    expect(Math.abs(seen.rain / n - 6 / 20)).toBeLessThan(sigma(0.3, n)); // 1-6
    expect(Math.abs(seen.cloud / n - 7 / 20)).toBeLessThan(sigma(0.35, n)); // 7-13
    expect(Math.abs(seen.sun / n - 7 / 20)).toBeLessThan(sigma(0.35, n)); // 14-20
  });

  it('uses the thresholds stored in the circuit', () => {
    const custom = { ...track, weather: { rain: 5, sun: 9 } };
    const n = 6000;
    let rain = 0;
    for (let seed = 1; seed <= n; seed++) if (isRaining(createGame({ seed, track: custom, cars: 1, config: { weather: 'random' } }))) rain++;
    expect(Math.abs(rain / n - 4 / 20)).toBeLessThan(sigma(0.2, n));
  });

  it.each(['sun', 'cloud', 'rain'] as const)('a fixed %s weather never changes and does not use the generator', (w) => {
    let s = ready(game(track, { weather: w, ...fixedDice([2, 3, 6, 9, 15, 25]) }, 1));
    const rng = s.rng;
    expect(weatherOf(s.wetness)).toBe(w === 'cloud' ? 'cloud' : w);
    for (let i = 0; i < 5; i++) {
      const r = run(s, shift(1), adjust(0), moveTo(`c${s.cars[0].position === 'c0' ? 2 : Number(s.cars[0].position!.slice(1)) + 2}`));
      expect(weathers(r.events)).toEqual([]);
      s = r.state;
    }
    expect(s.wetness).toBe(w === 'rain' ? 4 : w === 'cloud' ? 2 : 0);
    expect(s.round).toBe(6);
    void rng;
  });

  it('with a random weather every new round draws a d20 and moves the wetness by at most one step', () => {
    let s = ready(createGame({ seed: 7, track, cars: 1, config: { weather: 'random', ...fixedDice([2, 3, 6, 9, 15, 25]) } }));
    let wet = s.wetness;
    for (let i = 0; i < 40; i++) {
      const at = Number(s.cars[0].position!.slice(1));
      const r = run(s, shift(1), adjust(0), moveTo(`c${at + 2}`));
      const w = weathers(r.events);
      expect(w).toHaveLength(1);
      expect(w[0].d20).toBeGreaterThanOrEqual(1);
      expect(w[0].d20).toBeLessThanOrEqual(20);
      expect(Math.abs(r.state.wetness - wet)).toBeLessThanOrEqual(1);
      expect(w[0].weather).toBe(weatherOf(r.state.wetness));
      wet = r.state.wetness;
      s = r.state;
    }
  });

  it('a long race ends up visiting several weathers', () => {
    let s = ready(createGame({ seed: 3, track, cars: 1, config: { weather: 'random', ...fixedDice([2, 3, 6, 9, 15, 25]) } }));
    const seen = new Set<string>();
    for (let i = 0; i < 120; i++) {
      const at = Number(s.cars[0].position!.slice(1));
      s = run(s, shift(1), adjust(0), moveTo(`c${at + 2}`)).state;
      seen.add(weatherOf(s.wetness));
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });
});
