import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/engine/config';
import { RULES_FILE, TABLES, checkRules, checkTerms, loadForbidden, num, readGdd, taggedTable } from './check-gdd';

const files = readGdd();
// line endings as in the repository (a Windows checkout may have CRLF)
const rules = (files.find((f) => f.name === RULES_FILE)?.text ?? '').replace(/\r\n/g, '\n');

/** The rules document with one table cell replaced (first match after the tag). */
function tamper(tag: string, from: string, to: string): string {
  const at = rules.indexOf(`<!-- gdd:${tag} -->`);
  const i = rules.indexOf(from, at);
  expect(at).toBeGreaterThanOrEqual(0);
  expect(i).toBeGreaterThan(at);
  return rules.slice(0, i) + to + rules.slice(i + from.length);
}

describe('GDD rules tables (docs/gdd/02-regles.md)', () => {
  it('has the ten chapters', () => {
    expect(files.map((f) => f.name)).toEqual([
      '01-vision.md',
      '02-regles.md',
      '03-ajouts.md',
      '04-modes.md',
      '05-economie.md',
      '06-contenu-lancement.md',
      '07-technique.md',
      '08-boutique.md',
      '09-passe.md',
      '10-stats-voitures.md',
    ]);
  });

  it('finds every tagged table', () => {
    for (const tag of TABLES) expect(taggedTable(rules, tag), tag).not.toBeNull();
  });

  it('matches the engine constants', () => {
    expect(checkRules(rules)).toEqual([]);
  });

  it('reads French numbers', () => {
    expect(num('6,38')).toBe(6.38);
    expect(num('1 000')).toBe(1000);
    expect(num('4 et plus')).toBeNaN();
    expect(num('')).toBeNaN();
  });

  it('catches a wrong die face', () => {
    expect(checkRules(tamper('dice', '| 2 | 2, 3, 3, 4, 4, 4 |', '| 2 | 2, 3, 3, 3, 4, 4 |'))).toEqual([expect.stringContaining('dice: gear 2: faces')]);
    expect(checkRules(tamper('dice', '| 3,33 |', '| 3,5 |'))).toEqual(['dice: gear 2: mean 3,5, engine 3.33']);
  });

  it('catches a wrong lap wear', () => {
    expect(checkRules(tamper('lap-wear', '| Tendre | sèche | 1 |', '| Tendre | sèche | 2 |'))).toEqual(['lap-wear: Tendre / sèche: 2, engine 1']);
  });

  it('catches a die the engine changed', () => {
    const config = { ...DEFAULT_CONFIG, dice: DEFAULT_CONFIG.dice.map((f, i) => (i === 5 ? f.map((x) => x + 1) : f)) };
    expect(checkRules(rules, config).filter((i) => i.startsWith('dice: gear 6')).length).toBe(4);
  });

  it('catches wrong starting points', () => {
    expect(checkRules(tamper('start-points', '| 3 tours | 6 | 3 | 3 | 3 | 3 | 2 |', '| 3 tours | 6 | 3 | 3 | 3 | 4 | 2 |'))).toEqual([
      'start-points: 3 tours / Moteur: 4, engine 3',
    ]);
  });

  it('catches a wrong downshift cost, including the "4 et plus" row', () => {
    expect(checkRules(tamper('downshift', '| 2 | 1 | 0 | 0 |', '| 2 | 0 | 0 | 0 |'))).toEqual([expect.stringContaining('downshift: 2 gears down')]);
    expect(checkRules(tamper('downshift', '| 4 et plus | 1 | 1 | 1 |', '| 4 et plus | 1 | 1 | 2 |'))).toHaveLength(2); // drops 4 and 5
  });

  it('catches a wrong threshold and an unknown key', () => {
    expect(checkRules(tamper('thresholds', '| 11 |', '| 10 |'))).toEqual(['thresholds: fastStopBelow: 10, engine 11']);
    expect(checkRules(tamper('thresholds', '`contact.dry`', '`contact.wet`'))).toEqual([expect.stringContaining('"contact.wet" is not a number')]);
  });

  it('catches a wrong tire factor and a missing row', () => {
    expect(checkRules(tamper('tires', '| Tendre | sèche | 2 | 3 |', '| Tendre | sèche | 2 | 2 |'))).toHaveLength(2); // stints 2 and 5
    expect(checkRules(tamper('tires', '| Pluie | mouillée | 1 | 1 |\n', ''))).toEqual(['tires: row rain / wet is missing']);
  });

  it('reports a missing table', () => {
    expect(checkRules(rules.replace('<!-- gdd:tires -->', ''))).toEqual([expect.stringContaining('tires: table not found')]);
  });
});

describe('GDD names', () => {
  it('contains no forbidden name', () => {
    expect(checkTerms(files, loadForbidden())).toEqual([]);
  });

  it('would catch one', () => {
    const list = { terms: ['Zorglub'], caseSensitiveTerms: [], paths: [], forbiddenDirs: [] };
    expect(checkTerms([{ name: 'x.md', text: 'Inspiré de Zorglub.' }], list)).toEqual(['x.md: contains "Zorglub"']);
  });
});
