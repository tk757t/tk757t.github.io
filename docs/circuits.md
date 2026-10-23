# Circuits originaux

Généré par `npm run circuits:report` (scripts/circuits-report.ts) : ne pas modifier à la main.

Six circuits dessinés avec l’éditeur (`/editor`, en développement), deux de 1 tour, deux de 2 tours, deux de 3 tours. **Un tour dure environ 5 minutes**
(environ 12 rondes à quatre voitures) et compte de 46 à 55 cases : une course dure donc environ 5 minutes par tour (de 5 à 14 minutes selon le circuit).
Les files classée et non classée en tirent un au hasard, avec ses tours (`src/data/ranked.ts`, `queueCircuit`) ; « Course perso » et « Jouer avec des amis »
proposent les mêmes circuits et partent de leurs tours, que le joueur peut changer. Chaque circuit porte son nombre de tours conseillé (`laps` du document de l’éditeur).
Chaque fichier `src/data/tracks/<id>.json` contient le circuit au format du moteur **et** le document de l’éditeur qui l’a produit (champ `editor`) :
on les rouvre avec `/editor?load=<id>` (ou « Ouvrir un circuit du jeu » dans l’onglet Circuit), et `npm run gen:tracks` régénère les cases depuis ce document
(`src/data/tracks/tracks.test.ts` vérifie qu’ils sont synchrones, et que chaque tour compte de 46 à 55 cases et dure de 9 à 15 rondes).

## Les circuits

### Dunes d’Ocre (`dunes`) : 1 tour

- Décor : Désert ; 3 voies, 55 cases par voie et par tour, 174 cases en tout ; voie des stands de 9 cases.
- Virages : V1 1 arrêt (10 cases), V2 1 arrêt (4 cases), V3 1 arrêt (5 cases).
- Météo (d20) : pluie 10 %, nuageux 35 %, soleil 55 % (seuils 3 / 9).

### Rues du Port (`port`) : 1 tour

- Décor : Ville ; 3 voies, 46 cases par voie et par tour, 146 cases en tout ; voie des stands de 8 cases.
- Virages : V1 1 arrêt (4 cases), V2 1 arrêt (4 cases, chicane 1 jet), V3 1 arrêt (5 cases), V4 1 arrêt (4 cases).
- Météo (d20) : pluie 20 %, nuageux 40 %, soleil 40 % (seuils 5 / 12).

### Corniche d’Azur (`corniche`) : 2 tours

- Décor : Côte ; 3 voies, 51 cases par voie et par tour, 160 cases en tout ; voie des stands de 7 cases.
- Virages : V1 2 arrêts (7 cases), V2 1 arrêt (5 cases), V3 1 arrêt (4 cases, chicane 1 jet).
- Météo (d20) : pluie 15 %, nuageux 35 %, soleil 50 % (seuils 4 / 10).

### Boucle des Pins (`pins`) : 2 tours

- Décor : Forêt ; 3 voies, 52 cases par voie et par tour, 163 cases en tout ; voie des stands de 7 cases.
- Virages : V1 1 arrêt (12 cases), V2 1 arrêt (10 cases, chicane 1 jet), V3 1 arrêt (10 cases).
- Météo (d20) : pluie 30 %, nuageux 35 %, soleil 35 % (seuils 7 / 13).

### Col des Neiges (`col`) : 3 tours

- Décor : Neige ; 2 voies, 49 cases par voie et par tour, 105 cases en tout ; voie des stands de 7 cases.
- Virages : V1 1 arrêt (7 cases), V2 1 arrêt (6 cases), V3 1 arrêt (4 cases).
- Météo (d20) : pluie 40 %, nuageux 35 %, soleil 25 % (seuils 9 / 15).

### Tour du Cratère (`cratere`) : 3 tours

- Décor : Désert ; 3 voies, 53 cases par voie et par tour, 166 cases en tout ; voie des stands de 7 cases.
- Virages : V1 1 arrêt (15 cases).
- Météo (d20) : pluie 10 %, nuageux 30 %, soleil 60 % (seuils 3 / 8).

## Indicateurs de difficulté

Calculés par `src/data/tracks/difficulty.ts` (les mêmes que pour la campagne) : arrêts à faire, nombre de virages, virages qui s’enchaînent
(à moins de 25 rangs), part du tour passée en virage. Le score ne compte ni le nombre de voies (à 2 voies, on est plus souvent bloqué) ni le nombre de tours.

| Circuit | Tours | Voies | Cases / tour | Virages | Arrêts | À 2 arrêts ou plus | Enchaînés | Part en virage | Score |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dunes d’Ocre | 1 | 3 | 55 | 3 | 3 (1, 1, 1) | 0 | 3 | 34,5 % | 26,9 |
| Rues du Port | 1 | 3 | 46 | 4 | 4 (1, 1, 1, 1) | 0 | 4 | 37,0 % | 33,1 |
| Corniche d’Azur | 2 | 3 | 51 | 3 | 4 (2, 1, 1) | 1 | 3 | 31,4 % | 27,9 |
| Boucle des Pins | 2 | 3 | 52 | 3 | 3 (1, 1, 1) | 0 | 3 | 61,5 % | 35,0 |
| Col des Neiges | 3 | 2 | 49 | 3 | 3 (1, 1, 1) | 0 | 3 | 34,7 % | 26,9 |
| Tour du Cratère | 3 | 3 | 53 | 1 | 1 (1) | 0 | 0 | 28,3 % | 12,0 |

## Simulation

100 courses par circuit, sur ses tours, entre quatre IA (Facile, Moyen, Moyen, Difficile), places tournantes, graines 1 à 100,
pneus durs, météo tirée au d20 du circuit : le bouton « Tester » de l’éditeur (src/editor/simulate.ts). Durée estimée pour quatre joueurs humains à 6 s par tour
(la moitié pour deux joueurs humains : les IA jouent sans attendre).

| Circuit | Tours | Cases en tout | Manches | Durée estimée (4 humains) | Abandons | Causes | Virages les plus coûteux (coût par course) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Dunes d’Ocre | 1 | 55 | 13,7 | 5,5 min | 0,8 % | carrosserie 3 | V2 (0,44), V3 (0,32), V1 (0,10) |
| Rues du Port | 1 | 46 | 14,4 | 5,8 min | 1,3 % | carrosserie 5 | V1 (0,54), V4 (0,34), V2 (0,26) |
| Corniche d’Azur | 2 | 102 | 25,4 | 10,2 min | 4,5 % | carrosserie 10, tenue de route 8 | V1 (1,67), V3 (1,18), V2 (0,35) |
| Boucle des Pins | 2 | 104 | 20,7 | 8,3 min | 7,5 % | tenue de route 15, carrosserie 11, moteur 4 | V2 (1,11), V3 (0,59), V1 (0,48) |
| Col des Neiges | 3 | 147 | 34,0 | 13,6 min | 7,0 % | carrosserie 27, pneus 1 | V3 (1,85), V2 (0,72), V1 (0,66) |
| Tour du Cratère | 3 | 159 | 28,5 | 11,4 min | 2,0 % | moteur 5, carrosserie 3 | V1 (0,60) |

## Lecture

- **Durée** : de 13,7 à 34,0 manches, soit de 5,5 à 13,6 minutes à quatre joueurs humains : la durée d’une course ne dépend pas du circuit tiré.
  Chaque virage coûte environ 1,2 manche par tour (un virage large à 1 arrêt coûte moins qu’un virage court ou à 2 arrêts) : plus il y a de tours, moins le circuit peut avoir de virages.
- **Dunes d’Ocre** (1 tour, facile) : deux longues lignes droites et trois virages larges à 1 arrêt ; il pleut rarement. Les abandons sont rares.
- **Rues du Port** (1 tour, moyen) : des rues à angle droit, une chicane (cases à risque) entre deux virages à gauche, cinq virages à 1 arrêt qui s’enchaînent ; une course d’attention.
- **Corniche d’Azur** (2 tours, moyen) : un long virage de 11 cases qui se prend vite et une épingle ; la route fait la course, la météo est clémente.
- **Boucle des Pins** (2 tours, difficile) : une chicane à risque dès la sortie de l’épingle ; la tenue de route lâche souvent. Le plus d’abandons des six.
- **Col des Neiges** (3 tours, moyen) : 2 voies seulement, donc on se bloque plus souvent, et le plus de pluie (40 % des tirages) ; un seul virage, large.
- **Tour du Cratère** (3 tours, facile) : un anneau très court, rapide et au soleil ; la course se joue aux stands et à la mise en vitesse.
