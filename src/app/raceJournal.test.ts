import { describe, expect, it } from 'vitest';
import { chooseAction } from '../ai';
import { reducer, currentCar } from '../engine';
import type { GameEvent, RaceState } from '../engine';
import { nextFloat } from '../engine/rng';
import { game, linearTrack } from '../engine/testing';
import { JOURNAL_FILTERS, filterJournal, groupByRound, journalLines, type JournalEntry } from './raceJournal';

const name = (id: string): string => `Joueur ${id.replace(/\D/g, '')}`;

/** Three cars on a straight road, placed on the given rows. */
function placed(rows: Record<string, number | null>): RaceState {
  const base = game(linearTrack(20, { grid: [0, 1, 2] }), { laps: 1 }, ['p1', 'p2', 'p3']);
  return { ...base, cars: base.cars.map((c) => ({ ...c, position: rows[c.id] === null ? null : rows[c.id] === undefined ? c.position : `c${rows[c.id]}` })) };
}

const moved = (carId: string, from: string, to: string, cells: number, missing = 0): GameEvent => ({ type: 'CAR_MOVED', carId, from, to, cells, missing });

describe('the race journal', () => {
  it('tells an overtake: a car that was behind another one and is now in front of it', () => {
    const prev = placed({ p1: 3, p2: 6, p3: 1 });
    const next = placed({ p1: 9, p2: 6, p3: 1 });
    const lines = journalLines(prev, next, [moved('p1', 'c3', 'c9', 6)], name);
    expect(lines.map((l) => l.kind)).toEqual(['move', 'overtake']);
    expect(lines[0].text).toBe('Avance de 6 cases.');
    expect(lines[1]).toMatchObject({ carId: 'p1', text: 'Dépasse Joueur 2.' });
  });

  it('tells nothing for a car that stays behind, or that was already in front', () => {
    const prev = placed({ p1: 3, p2: 6, p3: 1 });
    expect(journalLines(prev, placed({ p1: 5, p2: 6, p3: 1 }), [moved('p1', 'c3', 'c5', 2)], name).map((l) => l.kind)).toEqual(['move']);
    expect(journalLines(prev, placed({ p1: 3, p2: 6, p3: 2 }), [moved('p3', 'c1', 'c2', 1)], name).map((l) => l.kind)).toEqual(['move']);
    expect(journalLines(prev, placed({ p1: 3, p2: 9, p3: 1 }), [moved('p2', 'c6', 'c9', 3)], name).map((l) => l.kind)).toEqual(['move']);
  });

  it('does not count a car that is out of the race as overtaken', () => {
    const prev = placed({ p1: 3, p2: null, p3: 1 });
    const next = placed({ p1: 9, p2: null, p3: 1 });
    expect(journalLines(prev, next, [moved('p1', 'c3', 'c9', 6)], name).map((l) => l.kind)).toEqual(['move']);
  });

  it('tells the missing cells of a blocked move', () => {
    const s = placed({ p1: 3, p2: 6, p3: 1 });
    const [line] = journalLines(s, s, [moved('p1', 'c3', 'c5', 2, 3)], name);
    expect(line.text).toBe('Avance de 2 cases (3 cases manquantes).');
  });

  it('keeps the incidents, the wear, the corners, the pit stops and the laps, and leaves out the noise', () => {
    const s = placed({ p1: 3, p2: 6, p3: 1 });
    const events: GameEvent[] = [
      { type: 'TURN_STARTED', carId: 'p1', round: 1 },
      { type: 'ADJUSTED', carId: 'p1', brakes: 0, boost: false, slipstream: false, movement: 3 },
      { type: 'CONTACT', carId: 'p1', other: 'p2', d20: 3, hit: true },
      { type: 'CONTACT', carId: 'p1', other: 'p2', d20: 18, hit: false },
      { type: 'WEAR_LOST', carId: 'p1', category: 'body', amount: 1, cause: 'contact' },
      { type: 'CORNER_STOP', carId: 'p1', corner: 'K0', left: 1 },
      { type: 'PIT_STOP', carId: 'p1', fast: true, tires: 'soft', repairs: 0, d20: 15, restartCells: 3 },
      { type: 'LAP_COMPLETED', carId: 'p1', laps: 1 },
      { type: 'CAR_RETIRED', carId: 'p2', reason: 'engine' },
    ];
    const lines = journalLines(s, s, events, name);
    expect(lines.map((l) => l.kind)).toEqual(['incident', 'wear', 'corner', 'pit', 'lap', 'incident']);
    expect(lines.every((l) => l.text.length > 0 && l.icon.length > 0)).toBe(true);
    expect(lines[1].text).toBe('Carrosserie −1.');
    expect(lines[5]).toMatchObject({ carId: 'p2', text: 'abandonne : moteur cassé.' });
  });

  const entry = (n: number, round: number, carId: string | null, kind: JournalEntry['kind']): JournalEntry => ({ n, round, carId, kind, icon: '•', text: `ligne ${n}` });
  const entries = [entry(1, 1, 'p1', 'move'), entry(2, 1, 'p2', 'incident'), entry(3, 2, 'p1', 'overtake'), entry(4, 2, 'p2', 'wear'), entry(5, 3, 'p1', 'pit'), entry(6, 3, null, 'weather'), entry(7, 3, 'p2', 'corner')];

  it('filters: mine, overtakes, incidents (with the wear), stops (pit and corners)', () => {
    const mine = (id: string): boolean => id === 'p1';
    expect(filterJournal(entries, 'all', mine)).toHaveLength(7);
    expect(filterJournal(entries, 'mine', mine).map((e) => e.n)).toEqual([1, 3, 5]);
    expect(filterJournal(entries, 'overtake', mine).map((e) => e.n)).toEqual([3]);
    expect(filterJournal(entries, 'incident', mine).map((e) => e.n)).toEqual([2, 4]);
    expect(filterJournal(entries, 'pit', mine).map((e) => e.n)).toEqual([5, 7]);
    expect(JOURNAL_FILTERS.map((f) => f.id)).toEqual(['all', 'mine', 'overtake', 'incident', 'pit']);
  });

  it('groups the lines by round, in order', () => {
    const groups = groupByRound(entries);
    expect(groups.map((g) => [g.round, g.entries.length])).toEqual([[1, 2], [2, 2], [3, 3]]);
    expect(groupByRound([])).toEqual([]);
  });

  it('writes a whole race: rounds never go back, every line has its words, laps and the finish are told', () => {
    let state = game(linearTrack(30, { loop: true, grid: [0, 1, 2], lapLength: 30 }), { laps: 2 }, 3, 7);
    let r = 11;
    const rand = (): number => {
      const [v, n] = nextFloat(r);
      r = n;
      return v;
    };
    const all: Omit<JournalEntry, 'n'>[] = [];
    for (let i = 0; i < 3000 && state.status === 'racing'; i++) {
      const car = currentCar(state)!;
      const prev = state;
      const res = reducer(state, chooseAction('medium', state, rand));
      state = res.state;
      all.push(...journalLines(prev, state, res.events, name));
      expect(car).toBeDefined();
    }
    expect(state.status).toBe('finished');
    expect(all.length).toBeGreaterThan(20);
    expect(all.every((l) => l.text.trim().length > 0)).toBe(true);
    for (let i = 1; i < all.length; i++) expect(all[i].round).toBeGreaterThanOrEqual(all[i - 1].round);
    expect(all.some((l) => l.kind === 'lap' && /Tour 1 terminé/.test(l.text))).toBe(true);
    expect(all.some((l) => l.kind === 'lap' && /franchit la ligne|ligne/.test(l.text))).toBe(true);
    expect(all.some((l) => l.kind === 'move')).toBe(true);
  });
});

describe('the words of the journal', () => {
  it('tells the dice with the cells it gives, and the weather only when it changes', () => {
    const s = placed({ p1: 3, p2: 6, p3: 1 });
    const dry = { ...s, wetness: 0 };
    const wet = { ...s, wetness: 10 };
    const dice: GameEvent = { type: 'DICE_ROLLED', carId: 'p1', gear: 2, face: 3, roll: 4, bonus: 1 };
    expect(journalLines(dry, dry, [dice], name)[0].text).toBe('Dé 3 : 4 cases (+1 d’équipement).');
    const rain: GameEvent = { type: 'WEATHER', weather: 'rain', wetness: 10, d20: 2 };
    expect(journalLines(dry, wet, [rain], name).map((l) => l.text)).toEqual(['La pluie arrive.']);
    expect(journalLines(wet, wet, [rain], name)).toEqual([]);
  });
});
