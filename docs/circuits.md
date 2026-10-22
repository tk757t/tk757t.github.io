# Circuits originaux

Généré par `npm run circuits:report` (scripts/circuits-report.ts) : ne pas modifier à la main.

Six circuits dessinés avec l’éditeur (`/editor`, en développement), deux de 1 tour, deux de 2 tours, deux de 3 tours. **Une course dure environ 5 minutes**
(docs/gdd/01-vision.md : 4 à 6 minutes, environ 12 rondes) **quel que soit le circuit** : plus il y a de tours, plus le tour est court (de 51 cases à 17 cases).
Les files classée et non classée en tirent un au hasard, avec ses tours (`src/data/ranked.ts`, `queueCircuit`) ; « Course perso » et « Jouer avec des amis »
proposent les mêmes circuits et partent de leurs tours, que le joueur peut changer. Chaque circuit porte son nombre de tours conseillé (`laps` du document de l’éditeur).
Chaque fichier `src/data/tracks/<id>.json` contient le circuit au format du moteur **et** le document de l’éditeur qui l’a produit (champ `editor`) :
on les rouvre avec `/editor?load=<id>` (ou « Ouvrir un circuit du jeu » dans l’onglet Circuit), et `npm run gen:tracks` régénère les cases depuis ce document
(`src/data/tracks/tracks.test.ts` vérifie qu’ils sont synchrones, et que chaque course dure de 10,5 à 15 rondes).

## Les circuits

### Dunes d’Ocre (`dunes`) : 1 tour

- Décor : Désert ; 3 voies, 51 cases par voie et par tour, 162 cases en tout ; voie des stands de 9 cases.
- Virages : V1 1 arrêt (9 cases), V2 1 arrêt (4 cases), V3 1 arrêt (5 cases).
- Météo (d20) : pluie 10 %, nuageux 35 %, soleil 55 % (seuils 3 / 9).

### Rues du Port (`port`) : 1 tour

- Décor : Ville ; 3 voies, 36 cases par voie et par tour, 115 cases en tout ; voie des stands de 7 cases.
- Virages : V1 1 arrêt (7 cases), V2 1 arrêt (3 cases, chicane 1 jet), V3 1 arrêt (3 cases), V4 1 arrêt (4 cases), V5 1 arrêt (3 cases).
- Météo (d20) : pluie 20 %, nuageux 40 %, soleil 40 % (seuils 5 / 12).

### Corniche d’Azur (`corniche`) : 2 tours

- Décor : Côte ; 3 voies, 24 cases par voie et par tour, 79 cases en tout ; voie des stands de 7 cases.
- Virages : V1 1 arrêt (7 cases), V2 1 arrêt (11 cases).
- Météo (d20) : pluie 15 %, nuageux 35 %, soleil 50 % (seuils 4 / 10).

### Boucle des Pins (`pins`) : 2 tours

- Décor : Forêt ; 3 voies, 24 cases par voie et par tour, 79 cases en tout ; voie des stands de 7 cases.
- Virages : V1 1 arrêt (7 cases), V2 1 arrêt (5 cases, chicane 1 jet).
- Météo (d20) : pluie 30 %, nuageux 35 %, soleil 35 % (seuils 7 / 13).

### Col des Neiges (`col`) : 3 tours

- Décor : Neige ; 2 voies, 17 cases par voie et par tour, 41 cases en tout ; voie des stands de 7 cases.
- Virages : V1 1 arrêt (5 cases).
- Météo (d20) : pluie 40 %, nuageux 35 %, soleil 25 % (seuils 9 / 15).

### Tour du Cratère (`cratere`) : 3 tours

- Décor : Désert ; 3 voies, 18 cases par voie et par tour, 61 cases en tout ; voie des stands de 7 cases.
- Virages : V1 1 arrêt (7 cases).
- Météo (d20) : pluie 10 %, nuageux 30 %, soleil 60 % (seuils 3 / 8).

## Indicateurs de difficulté

Calculés par `src/data/tracks/difficulty.ts` (les mêmes que pour la campagne) : arrêts à faire, nombre de virages, virages qui s’enchaînent
(à moins de 25 rangs), part du tour passée en virage. Le score ne compte ni le nombre de voies (à 2 voies, on est plus souvent bloqué) ni le nombre de tours.

| Circuit | Tours | Voies | Cases / tour | Virages | Arrêts | À 2 arrêts ou plus | Enchaînés | Part en virage | Score |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dunes d’Ocre | 1 | 3 | 51 | 3 | 3 (1, 1, 1) | 0 | 3 | 35,3 % | 27,1 |
| Rues du Port | 1 | 3 | 36 | 5 | 5 (1, 1, 1, 1, 1) | 0 | 5 | 55,6 % | 44,2 |
| Corniche d’Azur | 2 | 3 | 24 | 2 | 2 (1, 1) | 0 | 2 | 75,0 % | 33,5 |
| Boucle des Pins | 2 | 3 | 24 | 2 | 2 (1, 1) | 0 | 2 | 50,0 % | 26,0 |
| Col des Neiges | 3 | 2 | 17 | 1 | 1 (1) | 0 | 1 | 29,4 % | 14,3 |
| Tour du Cratère | 3 | 3 | 18 | 1 | 1 (1) | 0 | 1 | 38,9 % | 17,2 |

## Simulation

100 courses par circuit, sur ses tours, entre quatre IA (Facile, Moyen, Moyen, Difficile), places tournantes, graines 1 à 100,
pneus durs, météo tirée au d20 du circuit : le bouton « Tester » de l’éditeur (src/editor/simulate.ts). Durée estimée pour quatre joueurs humains à 6 s par tour
(la moitié pour deux joueurs humains : les IA jouent sans attendre).

| Circuit | Tours | Cases en tout | Manches | Durée estimée (4 humains) | Abandons | Causes | Virages les plus coûteux (coût par course) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Dunes d’Ocre | 1 | 51 | 12,8 | 5,1 min | 1,3 % | carrosserie 5 | V2 (0,55), V3 (0,27), V1 (0,15) |
| Rues du Port | 1 | 36 | 13,9 | 5,6 min | 6,5 % | carrosserie 26 | V3 (0,63), V2 (0,49), V5 (0,44) |
| Corniche d’Azur | 2 | 48 | 12,3 | 4,9 min | 5,0 % | carrosserie 14, pneus 5, sans case jouable 1 | V2 (1,88), V1 (1,14) |
| Boucle des Pins | 2 | 48 | 13,3 | 5,3 min | 7,5 % | carrosserie 16, tenue de route 14 | V1 (1,40), V2 (0,96) |
| Col des Neiges | 3 | 51 | 13,8 | 5,5 min | 3,0 % | carrosserie 12 | V1 (0,72) |
| Tour du Cratère | 3 | 54 | 12,9 | 5,2 min | 0,8 % | carrosserie 3 | V1 (0,66) |

## Lecture

- **Durée** : de 12,3 à 13,9 manches, soit de 4,9 à 5,6 minutes à quatre joueurs humains : la durée d’une course ne dépend pas du circuit tiré.
  Chaque virage coûte environ 1,2 manche par tour (un virage large à 1 arrêt coûte moins qu’un virage court ou à 2 arrêts) : plus il y a de tours, moins le circuit peut avoir de virages.
- **Dunes d’Ocre** (1 tour, facile) : deux longues lignes droites et trois virages larges à 1 arrêt ; il pleut rarement. Les abandons sont rares.
- **Rues du Port** (1 tour, moyen) : des rues à angle droit, une chicane (cases à risque) entre deux virages à gauche, cinq virages à 1 arrêt qui s’enchaînent ; une course d’attention.
- **Corniche d’Azur** (2 tours, moyen) : un long virage de 11 cases qui se prend vite et une épingle ; la route fait la course, la météo est clémente.
- **Boucle des Pins** (2 tours, difficile) : une chicane à risque dès la sortie de l’épingle ; la tenue de route lâche souvent. Le plus d’abandons des six.
- **Col des Neiges** (3 tours, moyen) : 2 voies seulement, donc on se bloque plus souvent, et le plus de pluie (40 % des tirages) ; un seul virage, large.
- **Tour du Cratère** (3 tours, facile) : un anneau très court, rapide et au soleil ; la course se joue aux stands et à la mise en vitesse.
