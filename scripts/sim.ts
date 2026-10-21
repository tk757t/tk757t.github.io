// AI vs AI simulation: npm run sim -- [--races 200] [--laps 2] [--seed 1] [--track oval]
import { AI_LABELS, type AiLevel } from '../src/ai/index.ts';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runBatch } from '../src/ai/sim.ts';
import { TRACKS, type TrackDef } from '../src/data/tracks/index.ts';

const arg = (name: string, fallback: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};
const races = arg('races', 200);
const laps = arg('laps', 2);
const seed = arg('seed', 1);
const config = process.argv.includes('--config') ? JSON.parse(process.argv[process.argv.indexOf('--config') + 1]) : undefined;
const trackId = process.argv.includes('--track') ? process.argv[process.argv.indexOf('--track') + 1] : 'oval';
// other circuits (development resources, git-ignored) are read from disk
const devTrack = (id: string): string => fileURLToPath(new URL(`../src/dev-only/tracks/${id}.json`, import.meta.url));
if (!TRACKS[trackId] && existsSync(devTrack(trackId))) TRACKS[trackId] = JSON.parse(readFileSync(devTrack(trackId), 'utf8')) as TrackDef;
const levels: AiLevel[] = ['easy', 'medium', 'hard'];

// campaign mode: npm run sim -- --level 1|2|3|all [--races 200] [--seed 1] [--player medium]
const levelArg = process.argv.includes('--level') ? process.argv[process.argv.indexOf('--level') + 1] : null;
if (levelArg) {
  const { LEVELS } = await import('../src/data/campaign/index.ts');
  const { runLevelBatch } = await import('../src/ai/campaignSim.ts');
  const player = (process.argv.includes('--player') ? process.argv[process.argv.indexOf('--player') + 1] : 'medium') as AiLevel;
  const picks = levelArg === 'all' ? LEVELS.map((_, i) => i) : [Number(levelArg) - 1];
  for (const i of picks) {
    const id = LEVELS[i].trackId;
    const t1 = Date.now();
    const b = runLevelBatch(i, races, seed, player);
    const p = (x: number) => `${(x * 100).toFixed(1)} %`;
    console.log(`Niveau ${i + 1} ${b.level.name} (${id}, ${b.level.laps} tours), joueur : IA ${AI_LABELS[player]}, ${races} courses, seeds ${seed}..${seed + races - 1}`);
    console.log(`  victoires ${p(b.winRate)} · abandons ${p(b.retireRate)} · rang moyen ${b.avgRank.toFixed(2)} · durée ${b.avgRounds.toFixed(0)} manches · non terminées ${b.unfinished}`);
    console.log(`  étoiles : 0 → ${b.starCounts[0]}, 1 → ${b.starCounts[1]}, 2 → ${b.starCounts[2]}, 3 → ${b.starCounts[3]}  (${((Date.now() - t1) / 1000).toFixed(1)} s)`);
  }
  process.exit(0);
}

const t0 = Date.now();
const r = runBatch(races, levels, { laps, config, trackId }, seed);
const pct = (x: number) => `${(x * 100).toFixed(1).padStart(5)} %`;

console.log(`${races} courses IA contre IA, ${laps} tours, circuit ${trackId}, 3 voitures (une par niveau, places tournantes), seeds ${seed}..${seed + races - 1}`);
console.log('');
console.log('Niveau      Victoires   Taux victoire   Abandons   Rang moyen');
for (const s of r.perLevel) {
  console.log(
    `${AI_LABELS[s.level].padEnd(11)} ${String(s.wins).padStart(9)}   ${pct(s.winRate).padStart(13)}   ${pct(s.retireRate).padStart(8)}   ${s.avgRank.toFixed(2).padStart(10)}`,
  );
}
console.log('');
console.log(`Taux d'abandon global : ${pct(r.retireRate)}`);
console.log(`Durée moyenne         : ${r.avgRounds.toFixed(1)} manches`);
console.log(`Courses sans vainqueur: ${r.noWinner}, non terminées: ${r.unfinished}, actions invalides: ${r.invalid}`);
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);

const win = Object.fromEntries(r.perLevel.map((s) => [s.level, s.winRate]));
const gaps = { 'Difficile - Moyen': win.hard - win.medium, 'Moyen - Facile': win.medium - win.easy };
for (const [k, g] of Object.entries(gaps)) console.log(`Écart ${k} : ${(g * 100).toFixed(1)} points`);
