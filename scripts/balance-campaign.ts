// Plays the three campaign levels with an AI "Moyen" driving the starter car and writes docs/equilibrage-campagne.md
// (npm run balance:campaign [-- --races 200]). The same bounds are checked by src/ai/campaignBalance.test.ts.
import { writeFileSync } from 'node:fs';
import { runLevelBatch, type LevelBatch } from '../src/ai/campaignSim.ts';
import { LEVELS, opponentLook } from '../src/data/campaign/index.ts';

const races = process.argv.includes('--races') ? Number(process.argv[process.argv.indexOf('--races') + 1]) : 200;

const SEEDS = [1, 1000];
const fr = (x: number, d = 1) => x.toFixed(d).replace('.', ',');
const pct = (x: number) => `${fr(x * 100)} %`;

const batches = SEEDS.map((seed) => LEVELS.map((_, i) => runLevelBatch(i, races, seed, 'medium')));
const row = (b: LevelBatch, i: number) =>
  `| ${i + 1}. ${b.level.name} | ${b.level.trackId} | ${b.level.laps} | ${pct(b.winRate)} | ${pct(b.retireRate)} | ${fr(b.avgRank, 2)} | ${fr(b.avgRounds, 0)} | ${b.starCounts.map((n) => pct(n / b.races)).join(' / ')} |`;
const table = (list: LevelBatch[]) =>
  `| Niveau | Circuit | Tours | Victoires | Abandons du joueur | Rang moyen | Manches | Étoiles 0 / 1 / 2 / 3 |\n|---|---|---|---|---|---|---|---|\n${list.map(row).join('\n')}`;
const ok = batches.flat().every((b) => b.winRate >= 0.3 && b.winRate <= 0.9 && b.retireRate < 0.25 && b.unfinished === 0);

const opponents = LEVELS.map((l, i) => {
  const lines = l.opponents.map((o) => {
    const parts = Object.entries(o.parts).map(([slot, p]) => `${slot}: ${p!.id} niv. ${p!.level}`);
    return `  - IA ${o.ai}, ${opponentLook(o).driver} (${opponentLook(o).team}), pneus ${o.tires}${parts.length ? `, ${parts.join(', ')}` : ', sans pièce'}`;
  });
  return `- Niveau ${i + 1} ${l.name} :\n${lines.join('\n')}`;
}).join('\n');

writeFileSync(
  new URL('../docs/equilibrage-campagne.md', import.meta.url),
  `# Équilibrage de la campagne

Généré par "npm run balance:campaign" (scripts/balance-campaign.ts). Contrôlé à chaque "npm test" par src/ai/campaignBalance.test.ts.

## Méthode

Chaque niveau est joué ${races} fois avec les règles du jeu (moteur inchangé), la météo du niveau (soleil fixe, ou tirage du d20 avec les seuils du circuit)
et les adversaires de src/data/campaign/levels.ts. Le joueur est une **IA Moyen au volant de la voiture de départ** (aucune pièce, pneus durs).
Bornes visées : taux de victoire du joueur **entre 30 % et 90 %**, abandons du joueur **sous 25 %**. Seules les voitures des IA et la difficulté du niveau
se règlent, pas les règles. Deux séries de seeds, ${SEEDS.map((s) => `${s} à ${s + races - 1}`).join(' et ')}.

## Résultats finaux

${SEEDS.map((s, k) => `Seeds ${s} à ${s + races - 1} :\n\n${table(batches[k])}`).join('\n\n')}

Bornes respectées sur les deux séries : **${ok ? 'oui' : 'NON'}**.

## Adversaires

${opponents}

## Ce qui a été réglé, dans l'ordre

La campagne tourne sur nos circuits de test (src/data/tracks/generators/circuits.ts), dessinés par le générateur d'ovales : seuls leur tracé
(longueur des lignes droites et des virages, arrêts requis, seuils de météo), le nombre de tours et les adversaires se règlent.

1. **Débutant** : l'IA Facile ne dépasse jamais le 3e rapport ; sur un ovale à longues lignes droites, le joueur gagnait 99 % des courses, même face
   à une Facile équipée de pièces. Le Petit anneau a des lignes droites courtes et de longs virages à 1 arrêt, et la Facile part en pneus tendres
   (+1 au maximum du dé) : environ 84 % de victoires.
2. **Challenger** : sur l'ovale de test (un virage à 3 arrêts), le joueur abandonnait dans plus de 25 % des courses. L'Ovale du lac garde deux virages
   à 2 arrêts et les averses (seuils 7/13), sans virage à 3 arrêts : environ 40 % de victoires, 20 % d'abandons.
3. **Champion** : face à un Difficile, un Moyen et un Facile, sur 3 tours, plus le circuit est simple plus le Difficile gagne, plus il est dur plus le joueur abandonne.
   Recherche systématique (longueur des lignes droites et des virages, ordre des arrêts) : l'Ovale des épingles (lignes droites de 18 cases, virages de 7, arrêts 2-3-2-3,
   pluie rare, seuils 3/10) est le seul tracé testé qui tient les deux bornes, avec le Difficile et le Moyen partis en pneus pluie (un pari sur la météo qui use
   leurs gommes au sec) : environ 35 % de victoires, 24 % d'abandons, au bord de la borne.

Les niveaux restent ordonnés par difficulté : le taux de victoire de l'IA Moyen baisse du Débutant au Champion.
`,
);
console.log(batches.map((b) => b.map((x) => `${x.level.name} ${pct(x.winRate)}/${pct(x.retireRate)}`).join(' · ')).join('\n'));
console.log(ok ? 'bornes respectées' : 'HORS BORNES');
