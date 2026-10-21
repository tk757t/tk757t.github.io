// Regenerates the JSON circuits in src/data/tracks: the test circuits from their generators, the circuits drawn with the
// editor from the editor document they carry: npm run gen:tracks
import { readFileSync, writeFileSync } from 'node:fs';
import { EDITOR_CIRCUITS } from '../src/data/tracks/index.ts';
import { TEST_CIRCUITS } from '../src/data/tracks/generators/circuits.ts';
import { buildOval } from '../src/data/tracks/generators/oval.ts';
import { parseDoc } from '../src/editor/doc.ts';
import { generate } from '../src/editor/generate.ts';

const file = (id: string) => new URL(`../src/data/tracks/${id}.json`, import.meta.url);
const write = (def: { id: string }) => writeFileSync(file(def.id), JSON.stringify(def, null, 1) + '\n');
for (const options of TEST_CIRCUITS) write(buildOval(options));
for (const id of EDITOR_CIRCUITS) write(generate(parseDoc(JSON.parse(readFileSync(file(id), 'utf8')).editor)).def);
