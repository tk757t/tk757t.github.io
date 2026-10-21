# Circuits originaux

Généré par `npm run circuits:report` (scripts/circuits-report.ts) : ne pas modifier à la main.

Trois circuits dessinés avec l’éditeur (`/editor`, en développement), de difficulté croissante.
Chaque fichier `src/data/tracks/<id>.json` contient le circuit au format du moteur **et** le document de l’éditeur qui l’a produit (champ `editor`) :
on les rouvre avec `/editor?load=<id>` (ou « Ouvrir un circuit du jeu » dans l’onglet Circuit), et `npm run gen:tracks` régénère les cases depuis ce document
(`src/data/tracks/tracks.test.ts` vérifie qu’ils sont synchrones).

## Les circuits

### Dunes d’Ocre (`dunes`)

- Décor : Désert ; 3 voies, 113 cases par voie, 354 cases en tout ; voie des stands de 15 cases.
- Virages : V1 1 arrêt (20 cases), V2 1 arrêt (9 cases), V3 1 arrêt (8 cases), V4 2 arrêts (12 cases).
- Météo (d20) : pluie 10 %, nuageux 35 %, soleil 55 % (seuils 3 / 9).

### Boucle des Pins (`pins`)

- Décor : Forêt ; 3 voies, 135 cases par voie, 420 cases en tout ; voie des stands de 15 cases.
- Virages : V1 1 arrêt (7 cases), V2 2 arrêts (6 cases), V3 2 arrêts (5 cases, chicane 1 jet), V4 2 arrêts (6 cases), V5 2 arrêts (5 cases), V6 2 arrêts (6 cases).
- Météo (d20) : pluie 30 %, nuageux 35 %, soleil 35 % (seuils 7 / 13).

### Col des Neiges (`col`)

- Décor : Neige ; 2 voies, 189 cases par voie, 391 cases en tout ; voie des stands de 13 cases.
- Virages : V1 2 arrêts (10 cases), V2 2 arrêts (12 cases), V3 3 arrêts (11 cases), V4 2 arrêts (4 cases), V5 1 arrêt (5 cases, chicane 1 jet), V6 2 arrêts (6 cases).
- Météo (d20) : pluie 40 %, nuageux 35 %, soleil 25 % (seuils 9 / 15).

## Indicateurs de difficulté

Calculés par `src/data/tracks/difficulty.ts` (les mêmes que pour la campagne) : arrêts à faire, nombre de virages, virages qui s’enchaînent
(à moins de 25 rangs), part du tour passée en virage. Le score ne compte pas le nombre de voies : à 2 voies (Col des Neiges), on est plus souvent bloqué.

| Circuit | Voies | Cases / tour | Virages | Arrêts | À 2 arrêts ou plus | Enchaînés | Part en virage | Score |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dunes d’Ocre | 3 | 113 | 4 | 5 (1, 1, 1, 2) | 1 | 3 | 43,4 % | 35,0 |
| Boucle des Pins | 3 | 135 | 6 | 11 (1, 2, 2, 2, 2, 2) | 5 | 4 | 25,9 % | 46,8 |
| Col des Neiges | 2 | 189 | 6 | 12 (2, 2, 3, 2, 1, 2) | 5 | 3 | 25,4 % | 46,6 |

## Simulation

100 courses par circuit et par format, entre quatre IA (Facile, Moyen, Moyen, Difficile), places tournantes, graines 1 à 100,
pneus durs, météo tirée au d20 du circuit : le bouton « Tester » de l’éditeur (src/editor/simulate.ts). Durée estimée pour quatre joueurs humains à 6 s par tour.
Le coût d’un virage = pneus perdus en sortie ratée + 6 par abandon qui s’y produit, par course.

| Circuit | Tours | Manches | Durée estimée | Abandons | Causes | Virages les plus coûteux (coût par course) |
| --- | --- | --- | --- | --- | --- | --- |
| Dunes d’Ocre | 1 | 22,3 | 9 min | 1,5 % | moteur 3, sans case jouable 3 | V4 (0,71), V2 (0,34), V3 (0,23) |
| Dunes d’Ocre | 2 | 42,4 | 17 min | 13,5 % | moteur 41, sans case jouable 12, carrosserie 1 | V2 (1,20), V4 (1,02), V3 (0,95) |
| Boucle des Pins | 1 | 36,0 | 14 min | 6,8 % | sans case jouable 20, carrosserie 7 | V3 (1,27), V5 (0,83), V4 (0,73) |
| Boucle des Pins | 2 | 74,1 | 30 min | 18,0 % | sans case jouable 42, carrosserie 21, tenue de route 8, moteur 1 | V3 (3,02), V2 (2,28), V5 (1,67) |
| Col des Neiges | 1 | 46,6 | 19 min | 11,8 % | sans case jouable 41, carrosserie 5, moteur 1 | V4 (1,95), V2 (0,87), V3 (0,82) |
| Col des Neiges | 2 | 93,8 | 38 min | 29,0 % | sans case jouable 92, tenue de route 11, moteur 7, carrosserie 6 | V4 (4,55), V3 (3,01), V2 (2,02) |

## Lecture

- Ordre de difficulté sur 2 tours (abandons et manches croissants) : **respecté**.
- **Dunes d’Ocre** (facile) : deux longues lignes droites et des virages larges à 1 arrêt, sauf le dernier (2 arrêts) ; il pleut rarement.
  Les abandons viennent surtout du moteur : les lignes droites poussent les IA en 5e et 6e. Le virage de la contre-ligne droite casse la vitesse.
- **Boucle des Pins** (moyen) : une « morsure » vers l’intérieur crée une chicane (cases à risque à l’entrée et à la sortie) et des virages
  à 2 arrêts qui s’enchaînent ; c’est là que les courses se jouent.
- **Col des Neiges** (difficile) : trois épingles en lacets (dont une à 3 arrêts), un virage court à 2 arrêts au bout de la ligne droite du haut
  (V4, le plus coûteux), une chicane dans la descente, 2 voies seulement et le seuil de pluie le plus haut (40 % des tirages). Le plus long des trois.
  Première cause d’abandon : « sans case jouable » (aucune destination que la voiture puisse payer en freins ou en pneus).
- **Durée** : ces trois circuits sont longs (113 à 189 cases par voie). À quatre joueurs, même un tour dépasse l’objectif de 5 minutes
  du classé (docs/gdd/01-vision.md) ; ils conviennent à la campagne et aux courses rapides, le classé demandera des tracés plus courts
  (environ 60 cases) ou des courses à deux.
