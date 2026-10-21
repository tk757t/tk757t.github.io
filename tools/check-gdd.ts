// Checks that the tables of docs/gdd/02-regles.md match the engine constants (dice, starting points, downshift costs,
// d20 thresholds, tire wear factors), and that no name of the local forbidden list appears in docs/gdd.
// Run by npm test (tools/check-gdd.test.ts) and by npm run check:gdd.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/engine/config';
import { downshiftCost, tireFactor } from '../src/engine/rules';
import { TIRE_TYPES, WEAR_CATEGORIES, type EngineConfig, type TireType, type Wear, type WearCategory } from '../src/engine/types';
import { termMatchers, type ForbiddenList, loadForbiddenList } from './check-origin';

export const GDD_DIR = 'docs/gdd';
export const RULES_FILE = '02-regles.md';
export const TABLES = ['dice', 'start-points', 'downshift', 'thresholds', 'tires', 'lap-wear'] as const;
export type TableTag = (typeof TABLES)[number];

export interface Table {
  header: string[];
  rows: string[][];
}

const cellsOf = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

/** The markdown table that follows the `<!-- gdd:tag -->` comment, or null when the comment or the table is missing. */
export function taggedTable(markdown: string, tag: string): Table | null {
  const lines = markdown.split(/\r?\n/);
  const at = lines.findIndex((l) => l.trim() === `<!-- gdd:${tag} -->`);
  if (at < 0) return null;
  const table: string[] = [];
  for (let i = at + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|')) table.push(line);
    else if (table.length > 0 || line !== '') break;
  }
  if (table.length < 2 || !/^\|[\s:|-]+\|$/.test(table[1])) return null;
  return { header: cellsOf(table[0]), rows: table.slice(2).map(cellsOf) };
}

/** French number ("6,38", "1 000") or NaN. */
export const num = (text: string): number => (/^-?\d[\d\s]*(,\d+)?$/.test(text.trim()) ? Number(text.replace(/\s/g, '').replace(',', '.')) : NaN);

const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function checkDice(t: Table, config: EngineConfig): string[] {
  const out: string[] = [];
  const gears = t.rows.map((r) => num(r[0]));
  if (!same(gears, config.dice.map((_, i) => i + 1))) out.push(`gears listed ${gears.join(', ')}, engine has 1 to ${config.dice.length}`);
  for (const row of t.rows) {
    const faces = config.dice[num(row[0]) - 1];
    if (!faces) continue;
    const listed = row[1].split(/,\s+/).map(num);
    const sorted = [...faces].sort((a, b) => a - b);
    if (!same([...listed].sort((a, b) => a - b), sorted)) out.push(`gear ${row[0]}: faces "${row[1]}", engine has ${sorted.join(', ')}`);
    const mean = faces.reduce((s, f) => s + f, 0) / faces.length;
    if (num(row[2]) !== sorted[0]) out.push(`gear ${row[0]}: min ${row[2]}, engine ${sorted[0]}`);
    if (num(row[3]) !== sorted[sorted.length - 1]) out.push(`gear ${row[0]}: max ${row[3]}, engine ${sorted[sorted.length - 1]}`);
    if (!(Math.abs(num(row[4]) - mean) <= 0.006)) out.push(`gear ${row[0]}: mean ${row[4]}, engine ${mean.toFixed(2)}`);
  }
  return out;
}

const WEAR_COLUMNS: Record<string, WearCategory> = {
  Pneus: 'tires',
  Freins: 'brakes',
  Boîte: 'gearbox',
  Carrosserie: 'body',
  Moteur: 'engine',
  'Tenue de route': 'handling',
};
const RACES: Record<string, keyof EngineConfig['startPoints']> = { '1 tour': 'lap1', '2 tours': 'lap2', '3 tours': 'lap3', Entraînement: 'practice' };

function checkStartPoints(t: Table, config: EngineConfig): string[] {
  const out: string[] = [];
  const columns = t.header.slice(1).map((h) => WEAR_COLUMNS[h]);
  if (!same(columns.map((c) => WEAR_CATEGORIES.indexOf(c)), WEAR_CATEGORIES.map((_, i) => i))) out.push(`columns ${t.header.slice(1).join(', ')} do not match the six gauges`);
  const seen = new Set<string>();
  for (const row of t.rows) {
    const key = RACES[row[0]];
    if (!key) {
      out.push(`unknown race "${row[0]}"`);
      continue;
    }
    seen.add(key);
    const points: Wear = config.startPoints[key];
    columns.forEach((cat, i) => {
      if (cat && num(row[i + 1]) !== points[cat]) out.push(`${row[0]} / ${t.header[i + 1]}: ${row[i + 1]}, engine ${points[cat]}`);
    });
  }
  for (const [label, key] of Object.entries(RACES)) if (!seen.has(key)) out.push(`row "${label}" is missing`);
  return out;
}

function checkDownshift(t: Table, config: EngineConfig): string[] {
  const out: string[] = [];
  const top = config.dice.length - 1;
  const firsts = t.rows.map((r) => num(r[0].replace(/\D+$/, '')));
  if (!same(firsts, [1, 2, 3, 4])) out.push(`rows ${t.rows.map((r) => r[0]).join(', ')}, expected 1, 2, 3, 4 et plus`);
  for (const row of t.rows) {
    const from = num(row[0].replace(/\D+$/, ''));
    const to = /et plus/.test(row[0]) ? top : from;
    for (let drop = from; drop <= to; drop++) {
      const cost = downshiftCost(drop);
      const want = [cost.gearbox, cost.brakes, cost.engine];
      const listed = row.slice(1, 4).map(num);
      if (!same(listed, want)) out.push(`${drop} gears down: ${listed.join('/')} (gearbox/brakes/engine), engine ${want.join('/')}`);
    }
  }
  return out;
}

function configValue(config: EngineConfig, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), config);
}

function checkThresholds(t: Table, config: EngineConfig): string[] {
  const out: string[] = [];
  for (const row of t.rows) {
    const key = row[0].replace(/`/g, '');
    const value = configValue(config, key);
    if (typeof value !== 'number') out.push(`"${key}" is not a number of the engine config`);
    else if (num(row[2]) !== value) out.push(`${key}: ${row[2]}, engine ${value}`);
  }
  return out;
}

const TIRES: Record<string, TireType> = { Dure: 'hard', Tendre: 'soft', Pluie: 'rain' };
const TRACK: Record<string, boolean> = { sèche: false, mouillée: true };

function checkTires(t: Table): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of t.rows) {
    const tires = TIRES[row[0]];
    const raining = TRACK[row[1]];
    if (!tires || raining === undefined) {
      out.push(`unknown row "${row[0]} / ${row[1]}"`);
      continue;
    }
    seen.add(`${tires}-${raining}`);
    // stint = laps finished since the stop: 0 and 1 are laps 1 and 2 of the stint, 2 is the third
    for (const [col, stint] of [
      [2, 0],
      [2, 1],
      [3, 2],
      [3, 5],
    ] as const) {
      const factor = tireFactor({ tires, stint }, raining);
      if (num(row[col]) !== factor) out.push(`${row[0]} / ${row[1]} / ${t.header[col]}: ${row[col]}, engine ${factor} (stint ${stint})`);
    }
  }
  for (const tires of TIRE_TYPES) for (const raining of [false, true]) if (!seen.has(`${tires}-${raining}`)) out.push(`row ${tires} / ${raining ? 'wet' : 'dry'} is missing`);
  return out;
}

/** The wear of the tires at each finished lap (§7): one point lost every `n` laps, per tires and track. */
function checkLapWear(t: Table, config: EngineConfig): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of t.rows) {
    const tires = TIRES[row[0]];
    const raining = TRACK[row[1]];
    if (!tires || raining === undefined) {
      out.push(`unknown row "${row[0]} / ${row[1]}"`);
      continue;
    }
    seen.add(`${tires}-${raining}`);
    const every = config.lapTireWear[tires][raining ? 'wet' : 'dry'];
    if (num(row[2]) !== every) out.push(`${row[0]} / ${row[1]}: ${row[2]}, engine ${every}`);
  }
  for (const tires of TIRE_TYPES) for (const raining of [false, true]) if (!seen.has(`${tires}-${raining}`)) out.push(`row ${tires} / ${raining ? 'wet' : 'dry'} is missing`);
  return out;
}

/** Every difference between the rules document and the engine config, as readable lines (empty when they agree). */
export function checkRules(markdown: string, config: EngineConfig = DEFAULT_CONFIG): string[] {
  const out: string[] = [];
  for (const tag of TABLES) {
    const table = taggedTable(markdown, tag);
    if (!table) {
      out.push(`${tag}: table not found (expected <!-- gdd:${tag} --> followed by a markdown table)`);
      continue;
    }
    const issues =
      tag === 'dice'
        ? checkDice(table, config)
        : tag === 'start-points'
          ? checkStartPoints(table, config)
          : tag === 'downshift'
            ? checkDownshift(table, config)
            : tag === 'thresholds'
              ? checkThresholds(table, config)
              : tag === 'lap-wear'
                ? checkLapWear(table, config)
                : checkTires(table);
    out.push(...issues.map((i) => `${tag}: ${i}`));
  }
  return out;
}

/** Forbidden names (local list) found in the GDD files. */
export function checkTerms(files: { name: string; text: string }[], list: ForbiddenList): string[] {
  const out: string[] = [];
  const matchers = termMatchers(list);
  for (const f of files) for (const { term, re } of matchers) if (re.test(f.text)) out.push(`${f.name}: contains "${term}"`);
  return out;
}

export function readGdd(dir = GDD_DIR): { name: string; text: string }[] {
  return readdirSync(dir)
    .filter((n) => n.endsWith('.md'))
    .sort()
    .map((name) => ({ name, text: readFileSync(join(dir, name), 'utf8') }));
}

export function loadForbidden(): ForbiddenList {
  return loadForbiddenList() ?? { terms: [], caseSensitiveTerms: [], paths: [], forbiddenDirs: [] };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const files = readGdd();
  const rules = files.find((f) => f.name === RULES_FILE);
  const issues = [...(rules ? checkRules(rules.text) : [`${RULES_FILE} not found in ${GDD_DIR}`]), ...checkTerms(files, loadForbidden())];
  if (issues.length) {
    console.error(`check:gdd: ${issues.length} problem(s)`);
    for (const i of issues) console.error(`  ${i}`);
    process.exit(1);
  }
  console.log(`check:gdd: ${GDD_DIR}/${RULES_FILE} matches the engine (${TABLES.length} tables), ${files.length} files without forbidden names`);
}
