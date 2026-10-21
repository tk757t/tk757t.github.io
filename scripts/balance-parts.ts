// Plays duels of an AI "Moyen" with one part (or a series) against the same AI with the starter car, on three circuits, and
// writes docs/equilibrage-pieces.md (npm run balance:parts [-- --races 200]). The targets are those of docs/gdd/10-stats-voitures.md § 10.8.
// Every pair of seeds is played twice with the seats swapped, so the grid does not favour the equipped car.
import { writeFileSync } from 'node:fs';
import { chooseAction } from '../src/ai/index.ts';
import { playPlan, plans } from '../src/ai/lookahead.ts';
import { PARTS } from '../src/data/parts/catalogue.ts';
import { modsFor } from '../src/data/parts/effects.ts';
import { FAMILIES, FAMILY_LABELS, RARITY_LABELS, SLOTS, type Family, type PartDef } from '../src/data/parts/types.ts';
import { TRACKS, toTrack } from '../src/data/tracks/index.ts';
import { createGame, currentCar, distanceRange, reducer, type CarMods, type RaceState } from '../src/engine/index.ts';
import { nextFloat } from '../src/engine/rng.ts';

const races = process.argv.includes('--races') ? Number(process.argv[process.argv.indexOf('--races') + 1]) : 150;
const plain = !process.argv.includes('--bold'); // --bold: pilots that take the farthest destination whatever it costs (see `choose`)
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const CIRCUITS = ['anneau', 'lac', 'epingles'];
const LEVELS = [1, 3, 5] as const;

/**
 * The AIs never use their rerolls, so a part that gives some would look useless: here a car with a relance left uses it when the roll
 * is in the lowest third of what its gear can give (the way a player would).
 */
function wantsReroll(state: RaceState): boolean {
  const car = currentCar(state);
  const turn = state.turn;
  if (!car || !turn || state.phase !== 'adjust' || turn.fixed || turn.start || car.rerolls < 1 || turn.roll === null) return false;
  const range = distanceRange(state.config, car, car.gear);
  return turn.roll <= range.min + (range.max - range.min) / 3;
}

/**
 * A bold pilot: the AI "Moyen" for the gear and the pits, but it always takes the farthest destination, whatever it costs. It is the
 * way to see what the parts that protect (free stops, discounts, drawbacks of the cars) are worth: a careful AI never needs them.
 */
function choose(state: RaceState, rand: () => number) {
  if (plain || state.phase !== 'adjust') return chooseAction('medium', state, rand);
  const all = plans(state);
  if (all.length === 0) return chooseAction('medium', state, rand);
  const far = (p: (typeof all)[number]) => p.option.laps * state.track.lapLength + state.track.cells[p.option.cellId].row;
  const best = [...all].sort((a, b) => far(b) - far(a) || a.option.cost - b.option.cost)[0];
  return playPlan(state, best);
}

/** Win share of the equipped car over the duels (a double retirement counts half). */
function duel(trackId: string, seed: number, mods: CarMods, seat: 0 | 1): number {
  const ids = ['p1', 'p2'];
  let state = createGame({
    seed,
    cars: ids,
    track: toTrack(TRACKS[trackId]),
    config: { laps: 2, maxRounds: 400, weather: 'random' },
    mods: { [ids[seat]]: mods },
  });
  let ai = (seed * 2654435761) >>> 0;
  const rand = () => {
    const [v, n] = nextFloat(ai);
    ai = n;
    return v;
  };
  for (let actions = 0; state.status === 'racing' && actions < 20000; actions++) state = reducer(state, wantsReroll(state) ? { type: 'REROLL' } : choose(state, rand)).state;
  const mine = state.results?.find((r) => r.carId === ids[seat]);
  const other = state.results?.find((r) => r.carId === ids[1 - seat]);
  if (!mine || !other) return 0.5;
  const mineOut = mine.retired !== null;
  const otherOut = other.retired !== null;
  if (mineOut && otherOut) return 0.5;
  if (mineOut) return 0;
  if (otherOut) return 1;
  return mine.rank < other.rank ? 1 : 0;
}

/** Percentage of duels won by a car with these mods against the starter car. */
function winRate(mods: CarMods): number {
  let won = 0;
  let total = 0;
  for (const trackId of CIRCUITS) {
    for (let i = 0; i < races; i++) {
      for (const seat of [0, 1] as const) {
        won += duel(trackId, 1000 + i, mods, seat);
        total++;
      }
    }
  }
  return won / total;
}

const fr = (x: number, d = 1) => x.toFixed(d).replace('.', ',');
const pct = (x: number) => `${fr(x * 100)} %`;
const noise = 0.04; // about 2 standard errors for ~900 duels: the targets of the design are read with this margin

/** A part is never a trap (floor) and never overwhelming (ceiling): the duel cannot see what protects, so it only guards the extremes. */
const FLOOR = 0.48;
const CEILING = 0.62;

interface Row {
  part: PartDef;
  rates: Record<number, number>;
  problems: string[];
}

// --combo id:level,id:level : the win rate of any set of parts (to look for what makes a series too strong)
if (process.argv.includes('--combo')) {
  const list = process.argv[process.argv.indexOf('--combo') + 1].split(',').map((x) => x.split(':'));
  const picked = list.map(([id, level]) => ({ part: PARTS.find((p) => p.id === id)!, level: Number(level) }));
  console.log(`${list.map((x) => x.join(':')).join(' + ')} -> ${pct(winRate(modsFor(picked)))}`);
  process.exit(0);
}

const rows: Row[] = PARTS.filter((p) => !only || only.includes(p.id)).map((part) => {
  const rates: Record<number, number> = {};
  for (const level of LEVELS) rates[level] = winRate(modsFor([{ part, level }]));
  const problems: string[] = [];
  for (const level of LEVELS) {
    if (rates[level] < FLOOR - noise) problems.push(`niveau ${level} sous ${Math.round((FLOOR - noise) * 100)} %`);
    if (rates[level] > CEILING + noise) problems.push(`niveau ${level} au-dessus de ${Math.round((CEILING + noise) * 100)} %`);
  }
  console.log(`${part.id} ${LEVELS.map((l) => pct(rates[l])).join(' / ')}${problems.length ? ' <- ' + problems.join(', ') : ''}`);
  return { part, rates, problems };
});

// the series of five: every part of a family, one per slot, at level 5 (the strongest ones of each slot)
const series = (only && !process.argv.includes('--series') ? [] : FAMILIES).map((family: Family) => {
  const picks = SLOTS.flatMap((slot) => {
    const options = PARTS.filter((p) => p.family === family && p.slot === slot);
    return options.length ? [options.reduce((a, b) => (RARITY_ORDER(b) > RARITY_ORDER(a) ? b : a))] : [];
  });
  const rate = winRate(modsFor(picks.map((part) => ({ part, level: 5 }))));
  console.log(`série ${family} (${picks.length} pièces) ${pct(rate)}`);
  return { family, picks, rate, problem: rate > 0.7 + noise ? 'au-dessus de 74 %' : '' };
});

function RARITY_ORDER(p: PartDef): number {
  return ['common', 'rare', 'epic', 'legendary'].indexOf(p.rarity);
}

const problems = [...rows.flatMap((r) => r.problems.map((p) => `${r.part.id} : ${p}`)), ...series.filter((s) => s.problem).map((s) => `série ${s.family} : ${s.problem}`)];
const ok = problems.length === 0;

const table = rows
  .map(({ part, rates, problems: p }) => `| ${part.name} | ${RARITY_LABELS[part.rarity]} | ${FAMILY_LABELS[part.family]} | ${LEVELS.map((l) => pct(rates[l])).join(' | ')} | ${p.length ? p.join(', ') : 'ok'} |`)
  .join('\n');
const seriesTable = series.map((s) => `| ${FAMILY_LABELS[s.family]} | ${s.picks.map((p) => p.name).join(', ')} | ${pct(s.rate)} | ${s.problem || 'ok'} |`).join('\n');

if (only && !process.argv.includes('--series')) {
  console.log(problems.length ? `HORS GARDE-FOUS (${problems.length})` : 'garde-fous respectés (sélection)');
  process.exit(0);
}

writeFileSync(
  new URL('../docs/equilibrage-pieces.md', import.meta.url),
  `# Équilibrage des pièces

Généré par "npm run balance:parts" (scripts/balance-parts.ts). Contrôlé à chaque "npm test" par src/data/parts/balanceDoc.test.ts.

## Méthode

Une voiture équipée d'une seule pièce (niveau 1, 3 ou 5) affronte la voiture de série, toutes deux pilotées par l'IA Moyen, en duel de 2 tours
avec météo variable, sur 3 circuits (${CIRCUITS.join(', ')}), ${races} graines par circuit, chaque graine jouée deux fois avec les places échangées :
${CIRCUITS.length * races * 2} duels par pièce et par niveau. Un double abandon compte pour moitié. Les garde-fous sont ceux du chapitre 10 du document
de design (§ 10.8), lus avec une marge de ${Math.round(noise * 100)} points pour le hasard de l'échantillon.

| Garde-fou | Seuil (avec la marge) |
|---|---|
| Aucune pièce n'est un piège | jamais sous ${Math.round((FLOOR - noise) * 100)} % |
| Aucune pièce n'écrase | jamais au-dessus de ${Math.round((CEILING + noise) * 100)} % |
| Série de 5 pièces d'une famille, niveau 5 | au plus ${Math.round((0.7 + noise) * 100)} % |

Le duel ne voit que ce que l'IA sait utiliser (cases de dé, relances, jauges) : les pièces qui protègent (arrêts gratuits, remises) pèsent
peu face à une IA prudente. La hiérarchie des raretés se contrôle donc par la **Puissance** de la fiche (src/data/parts/stats.ts, test
src/data/parts/rarity.test.ts), pas par le duel.

## Pièces

| Pièce | Rareté | Famille | Niveau 1 | Niveau 3 | Niveau 5 | Garde-fous |
|---|---|---|---|---|---|---|
${table}

## Séries de 5

| Famille | Pièces (niveau 5) | Victoires | Garde-fous |
|---|---|---|---|
${seriesTable}

Garde-fous respectés : **${ok ? 'oui' : 'NON'}**.${ok ? '' : `\n\nÀ corriger :\n${problems.map((p) => `- ${p}`).join('\n')}`}
`,
);
console.log(ok ? 'garde-fous respectés' : `HORS GARDE-FOUS (${problems.length})`);
for (const p of problems) console.log('  ' + p);
