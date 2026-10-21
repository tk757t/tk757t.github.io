// Writes docs/circuits.md: difficulty indicators and AI simulations of the circuits drawn with the editor.
// npm run circuits:report (about half a minute: 600 races).
import { writeFileSync } from 'node:fs';
import { EDITOR_CIRCUITS, TRACKS, type TrackDef } from '../src/data/tracks/index.ts';
import { indicators } from '../src/data/tracks/difficulty.ts';
import { THEME_LABELS, parseDoc } from '../src/editor/doc.ts';
import { generate } from '../src/editor/generate.ts';
import { SECONDS_PER_TURN, SIM_LINEUP, SIM_RACES, simulateSync, type SimReport } from '../src/editor/simulate.ts';

const AI = { easy: 'Facile', medium: 'Moyen', hard: 'Difficile' } as const;
const CAUSES: Record<string, string> = { tires: 'pneus', brakes: 'freins', gearbox: 'boîte', body: 'carrosserie', engine: 'moteur', handling: 'tenue de route', 'no-move': 'sans case jouable' };
const fr = (x: number, digits = 1) => x.toFixed(digits).replace('.', ',');
const pct = (x: number) => `${fr(x * 100)} %`;

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
    .map(([id, z]) => `${id} ${z.stops} arrêt${z.stops > 1 ? 's' : ''} (${z.cells} cases${z.risk ? `, chicane ${z.risk} jet${z.risk > 1 ? 's' : ''}` : ''})`)
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

const sims = new Map<string, { two: SimReport; one: SimReport }>();
for (const id of EDITOR_CIRCUITS) {
  const def = TRACKS[id];
  sims.set(id, { two: simulateSync(def, { laps: 2 }), one: simulateSync(def, { laps: 1 }) });
  console.log(`${id}: done`);
}

const lines: string[] = [];
const row = (cells: (string | number)[]) => lines.push(`| ${cells.join(' | ')} |`);
lines.push(
  '# Circuits originaux',
  '',
  'Généré par `npm run circuits:report` (scripts/circuits-report.ts) : ne pas modifier à la main.',
  '',
  'Trois circuits dessinés avec l’éditeur (`/editor`, en développement), de difficulté croissante.',
  'Chaque fichier `src/data/tracks/<id>.json` contient le circuit au format du moteur **et** le document de l’éditeur qui l’a produit (champ `editor`) :',
  'on les rouvre avec `/editor?load=<id>` (ou « Ouvrir un circuit du jeu » dans l’onglet Circuit), et `npm run gen:tracks` régénère les cases depuis ce document',
  '(`src/data/tracks/tracks.test.ts` vérifie qu’ils sont synchrones).',
  '',
  '## Les circuits',
  '',
);
for (const id of EDITOR_CIRCUITS) {
  const def = TRACKS[id];
  const d = describe(def);
  lines.push(
    `### ${def.name} (\`${id}\`)`,
    '',
    `- Décor : ${THEME_LABELS[def.theme ?? 'forest']} ; ${d.lanes} voies, ${def.lapLength} cases par voie, ${def.cells.length} cases en tout ; voie des stands de ${d.pit} cases.`,
    `- Virages : ${d.corners}.`,
    `- Météo (d20) : ${d.weather}.`,
    '',
  );
}
lines.push(
  '## Indicateurs de difficulté',
  '',
  'Calculés par `src/data/tracks/difficulty.ts` (les mêmes que pour la campagne) : arrêts à faire, nombre de virages, virages qui s’enchaînent',
  `(à moins de 25 rangs), part du tour passée en virage. Le score ne compte pas le nombre de voies : à 2 voies (Col des Neiges), on est plus souvent bloqué.`,
  '',
);
row(['Circuit', 'Voies', 'Cases / tour', 'Virages', 'Arrêts', 'À 2 arrêts ou plus', 'Enchaînés', 'Part en virage', 'Score']);
row(['---', '---', '---', '---', '---', '---', '---', '---', '---']);
for (const id of EDITOR_CIRCUITS) {
  const def = TRACKS[id];
  const ind = indicators(def);
  row([def.name, describe(def).lanes, def.lapLength, ind.corners, `${ind.stops} (${ind.stopsList.join(', ')})`, ind.hard, ind.chicanes, pct(ind.cornerShare), fr(ind.score)]);
}
lines.push(
  '',
  '## Simulation',
  '',
  `${SIM_RACES} courses par circuit et par format, entre quatre IA (${SIM_LINEUP.map((l) => AI[l]).join(', ')}), places tournantes, graines 1 à ${SIM_RACES},`,
  `pneus durs, météo tirée au d20 du circuit : le bouton « Tester » de l’éditeur (src/editor/simulate.ts). Durée estimée pour quatre joueurs humains à ${SECONDS_PER_TURN} s par tour.`,
  'Le coût d’un virage = pneus perdus en sortie ratée + 6 par abandon qui s’y produit, par course.',
  '',
);
row(['Circuit', 'Tours', 'Manches', 'Durée estimée', 'Abandons', 'Causes', 'Virages les plus coûteux (coût par course)']);
row(['---', '---', '---', '---', '---', '---', '---']);
for (const id of EDITOR_CIRCUITS) {
  for (const [laps, r] of [
    [1, sims.get(id)!.one],
    [2, sims.get(id)!.two],
  ] as const) {
    const causes = Object.entries(r.causes)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${CAUSES[k] ?? k} ${v}`)
      .join(', ');
    const worst = r.corners
      .slice(0, 3)
      .map((c) => `${c.id} (${fr(c.cost, 2)})`)
      .join(', ');
    row([TRACKS[id].name, laps, fr(r.avgRounds), `${Math.round(r.minutes)} min`, pct(r.retireRate), causes || 'aucune', worst]);
  }
}
const two = EDITOR_CIRCUITS.map((id) => sims.get(id)!.two);
const ordered = two.every((r, i) => i === 0 || (r.retireRate > two[i - 1].retireRate && r.avgRounds > two[i - 1].avgRounds));
lines.push(
  '',
  '## Lecture',
  '',
  `- Ordre de difficulté sur 2 tours (abandons et manches croissants) : **${ordered ? 'respecté' : 'NON respecté'}**.`,
  '- **Dunes d’Ocre** (facile) : deux longues lignes droites et des virages larges à 1 arrêt, sauf le dernier (2 arrêts) ; il pleut rarement.',
  '  Les abandons viennent surtout du moteur : les lignes droites poussent les IA en 5e et 6e. Le virage de la contre-ligne droite casse la vitesse.',
  '- **Boucle des Pins** (moyen) : une « morsure » vers l’intérieur crée une chicane (cases à risque à l’entrée et à la sortie) et des virages',
  '  à 2 arrêts qui s’enchaînent ; c’est là que les courses se jouent.',
  '- **Col des Neiges** (difficile) : trois épingles en lacets (dont une à 3 arrêts), un virage court à 2 arrêts au bout de la ligne droite du haut',
  '  (V4, le plus coûteux), une chicane dans la descente, 2 voies seulement et le seuil de pluie le plus haut (40 % des tirages). Le plus long des trois.',
  '  Première cause d’abandon : « sans case jouable » (aucune destination que la voiture puisse payer en freins ou en pneus).',
  '- **Durée** : ces trois circuits sont longs (113 à 189 cases par voie). À quatre joueurs, même un tour dépasse l’objectif de 5 minutes',
  '  du classé (docs/gdd/01-vision.md) ; ils conviennent à la campagne et aux courses rapides, le classé demandera des tracés plus courts',
  '  (environ 60 cases) ou des courses à deux.',
  '',
);
writeFileSync(new URL('../docs/circuits.md', import.meta.url), lines.join('\n'));
console.log('docs/circuits.md written');
