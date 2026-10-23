// Writes docs/circuits.md: difficulty indicators, and AI simulations (rounds, minutes, retirements) of the circuits drawn with the editor.
// npm run circuits:report (about half a minute: 600 races).
import { writeFileSync } from 'node:fs';
import { EDITOR_CIRCUITS, TRACKS, type TrackDef } from '../src/data/tracks/index.ts';
import { indicators } from '../src/data/tracks/difficulty.ts';
import { THEME_LABELS, parseDoc } from '../src/editor/doc.ts';
import { generate } from '../src/editor/generate.ts';
import { SECONDS_PER_TURN, SIM_LINEUP, SIM_RACES, simulateSync, type SimReport } from '../src/editor/simulate.ts';

const AI = { easy: 'Facile', medium: 'Moyen', hard: 'Difficile' } as const;
const CAUSES: Record<string, string> = { tires: 'pneus', brakes: 'freins', gearbox: 'boîte', body: 'carrosserie', engine: 'moteur', handling: 'tenue de route', 'no-move': 'sans case jouable', crash: 'mur' };
const fr = (x: number, digits = 1) => x.toFixed(digits).replace('.', ',');
const pct = (x: number) => `${fr(x * 100)} %`;
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** What the editor document says about a circuit, in a sentence per element. */
function describe(def: TrackDef): { lanes: number; pit: number; corners: string; weather: string } {
  const g = generate(parseDoc(def.editor));
  const zones = new Map<string, { stops: number; cells: number; risk: number }>();
  for (const c of def.cells) {
    if (!c.corner || c.lane !== 0) continue;
    const z = zones.get(c.corner.id) ?? { stops: c.corner.stops, cells: 0, risk: 0 };
    z.cells++;
    z.risk = Math.max(z.risk, c.risk);
    zones.set(c.corner.id, z);
  }
  const corners = [...zones]
    .sort((a, b) => a[0].localeCompare(b[0], 'fr', { numeric: true }))
    .map(([id, z]) => `${id} ${plural(z.stops, 'arrêt')} (${z.cells} cases${z.risk ? `, chicane ${plural(z.risk, 'jet')}` : ''})`)
    .join(', ');
  const { rain, sun } = def.weather;
  const share = (k: number) => `${Math.round((k / 20) * 100)} %`;
  return {
    lanes: parseDoc(def.editor).lanes,
    pit: g.pitSlots.length,
    corners,
    weather: `pluie ${share(rain - 1)}, nuageux ${share(sun - rain + 1)}, soleil ${share(20 - sun)} (seuils ${rain} / ${sun})`,
  };
}

const sims = new Map<string, SimReport>();
for (const id of EDITOR_CIRCUITS) {
  const def = TRACKS[id];
  sims.set(id, simulateSync(def, { laps: def.laps ?? 1 }));
  console.log(`${id}: done`);
}

const lines: string[] = [];
const row = (cells: (string | number)[]) => lines.push(`| ${cells.join(' | ')} |`);
lines.push(
  '# Circuits originaux',
  '',
  'Généré par `npm run circuits:report` (scripts/circuits-report.ts) : ne pas modifier à la main.',
  '',
  'Six circuits dessinés avec l’éditeur (`/editor`, en développement), deux de 1 tour, deux de 2 tours, deux de 3 tours. **Un tour dure environ 5 minutes**',
  '(environ 12 rondes à quatre voitures) et compte de 46 à 55 cases : une course dure donc environ 5 minutes par tour (de 5 à 14 minutes selon le circuit).',
  'Les files classée et non classée en tirent un au hasard, avec ses tours (`src/data/ranked.ts`, `queueCircuit`) ; « Course perso » et « Jouer avec des amis »',
  'proposent les mêmes circuits et partent de leurs tours, que le joueur peut changer. Chaque circuit porte son nombre de tours conseillé (`laps` du document de l’éditeur).',
  'Chaque fichier `src/data/tracks/<id>.json` contient le circuit au format du moteur **et** le document de l’éditeur qui l’a produit (champ `editor`) :',
  'on les rouvre avec `/editor?load=<id>` (ou « Ouvrir un circuit du jeu » dans l’onglet Circuit), et `npm run gen:tracks` régénère les cases depuis ce document',
  '(`src/data/tracks/tracks.test.ts` vérifie qu’ils sont synchrones, et que chaque tour compte de 46 à 55 cases et dure de 9 à 15 rondes).',
  '',
  '## Les circuits',
  '',
);
for (const id of EDITOR_CIRCUITS) {
  const def = TRACKS[id];
  const d = describe(def);
  lines.push(
    `### ${def.name} (\`${id}\`) : ${plural(def.laps ?? 1, 'tour')}`,
    '',
    `- Décor : ${THEME_LABELS[def.theme ?? 'forest']} ; ${d.lanes} voies, ${def.lapLength} cases par voie et par tour, ${def.cells.length} cases en tout ; voie des stands de ${d.pit} cases.`,
    `- Virages : ${d.corners || 'aucun'}.`,
    `- Météo (d20) : ${d.weather}.`,
    '',
  );
}
lines.push(
  '## Indicateurs de difficulté',
  '',
  'Calculés par `src/data/tracks/difficulty.ts` (les mêmes que pour la campagne) : arrêts à faire, nombre de virages, virages qui s’enchaînent',
  '(à moins de 25 rangs), part du tour passée en virage. Le score ne compte ni le nombre de voies (à 2 voies, on est plus souvent bloqué) ni le nombre de tours.',
  '',
);
row(['Circuit', 'Tours', 'Voies', 'Cases / tour', 'Virages', 'Arrêts', 'À 2 arrêts ou plus', 'Enchaînés', 'Part en virage', 'Score']);
row(['---', '---', '---', '---', '---', '---', '---', '---', '---', '---']);
for (const id of EDITOR_CIRCUITS) {
  const def = TRACKS[id];
  const ind = indicators(def);
  row([def.name, def.laps ?? 1, describe(def).lanes, def.lapLength, ind.corners, `${ind.stops} (${ind.stopsList.join(', ')})`, ind.hard, ind.chicanes, pct(ind.cornerShare), fr(ind.score)]);
}
lines.push(
  '',
  '## Simulation',
  '',
  `${SIM_RACES} courses par circuit, sur ses tours, entre quatre IA (${SIM_LINEUP.map((l) => AI[l]).join(', ')}), places tournantes, graines 1 à ${SIM_RACES},`,
  `pneus durs, météo tirée au d20 du circuit : le bouton « Tester » de l’éditeur (src/editor/simulate.ts). Durée estimée pour quatre joueurs humains à ${SECONDS_PER_TURN} s par tour`,
  '(la moitié pour deux joueurs humains : les IA jouent sans attendre).',
  '',
);
row(['Circuit', 'Tours', 'Cases en tout', 'Manches', 'Durée estimée (4 humains)', 'Abandons', 'Causes', 'Virages les plus coûteux (coût par course)']);
row(['---', '---', '---', '---', '---', '---', '---', '---']);
for (const id of EDITOR_CIRCUITS) {
  const def = TRACKS[id];
  const r = sims.get(id)!;
  const causes = Object.entries(r.causes)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${CAUSES[k] ?? k} ${v}`)
    .join(', ');
  const worst = r.corners
    .filter((c) => c.cost > 0)
    .slice(0, 3)
    .map((c) => `${c.id} (${fr(c.cost, 2)})`)
    .join(', ');
  row([def.name, def.laps ?? 1, def.lapLength * (def.laps ?? 1), fr(r.avgRounds), `${fr(r.minutes)} min`, pct(r.retireRate), causes || 'aucune', worst || '—']);
}
const rounds = EDITOR_CIRCUITS.map((id) => sims.get(id)!.avgRounds);
lines.push(
  '',
  '## Lecture',
  '',
  `- **Durée** : de ${fr(Math.min(...rounds))} à ${fr(Math.max(...rounds))} manches, soit de ${fr(Math.min(...EDITOR_CIRCUITS.map((id) => sims.get(id)!.minutes)))} à ${fr(Math.max(...EDITOR_CIRCUITS.map((id) => sims.get(id)!.minutes)))} minutes à quatre joueurs humains : la durée d’une course ne dépend pas du circuit tiré.`,
  '  Chaque virage coûte environ 1,2 manche par tour (un virage large à 1 arrêt coûte moins qu’un virage court ou à 2 arrêts) : plus il y a de tours, moins le circuit peut avoir de virages.',
  '- **Dunes d’Ocre** (1 tour, facile) : deux longues lignes droites et trois virages larges à 1 arrêt ; il pleut rarement. Les abandons sont rares.',
  '- **Rues du Port** (1 tour, moyen) : des rues à angle droit, une chicane (cases à risque) entre deux virages à gauche, cinq virages à 1 arrêt qui s’enchaînent ; une course d’attention.',
  '- **Corniche d’Azur** (2 tours, moyen) : un long virage de 11 cases qui se prend vite et une épingle ; la route fait la course, la météo est clémente.',
  '- **Boucle des Pins** (2 tours, difficile) : une chicane à risque dès la sortie de l’épingle ; la tenue de route lâche souvent. Le plus d’abandons des six.',
  '- **Col des Neiges** (3 tours, moyen) : 2 voies seulement, donc on se bloque plus souvent, et le plus de pluie (40 % des tirages) ; un seul virage, large.',
  '- **Tour du Cratère** (3 tours, facile) : un anneau très court, rapide et au soleil ; la course se joue aux stands et à la mise en vitesse.',
  '',
);
writeFileSync(new URL('../docs/circuits.md', import.meta.url), lines.join('\n'));
console.log('docs/circuits.md written');
