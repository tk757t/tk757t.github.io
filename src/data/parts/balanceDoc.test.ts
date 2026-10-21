import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PARTS } from './catalogue';

// docs/equilibrage-pieces.md is written by `npm run balance:parts` (scripts/balance-parts.ts). The duels take minutes, so they are not
// replayed here: this checks that the committed table is complete and within its guard rails, and so that a change of the catalogue
// that was not measured again is noticed (a part missing from the table, a table marked out of bounds).
const doc = readFileSync(new URL('../../../docs/equilibrage-pieces.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

describe('docs/equilibrage-pieces.md', () => {
  it('says the guard rails are respected', () => {
    expect(doc).toContain('Garde-fous respectés : **oui**');
  });

  it('has a row for every part of the catalogue, and nothing else', () => {
    const names = [...doc.matchAll(/^\| ([^|]+?) \| (Commune|Rare|Épique|Légendaire) \|/gm)].map((m) => m[1]);
    expect(names.sort()).toEqual(PARTS.map((p) => p.name).sort());
  });

  it('measures the three series of five', () => {
    for (const family of ['Vitesse', 'Endurance', 'Précision']) expect(doc).toMatch(new RegExp('^[|] ' + family + ' [|] .+ [|] [0-9]+,[0-9] %', 'm'));
  });
});
