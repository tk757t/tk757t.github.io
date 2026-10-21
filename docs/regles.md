# Règles du jeu (référence du moteur)

Le document de design de référence du jeu est [docs/gdd/](gdd/01-vision.md) ; ce fichier-ci reste la fiche du moteur, et ses valeurs sont aussi dans [gdd/02-regles.md](gdd/02-regles.md) (vérifié par `npm test`).

Ce document décrit les règles que le moteur (`src/engine`) applique. Le code y renvoie par numéro de section (« §6 »).
Les valeurs chiffrées sont les valeurs par défaut de `src/engine/config.ts` ; les pièces du garage peuvent les modifier.

## 1. Dés

Chaque rapport a son dé ; le résultat est le nombre de cases à parcourir.

| Rapport | Résultat |
|---|---|
| 1 | 1 à 2 |
| 2 | 2 à 4 (faces 2, 3, 3, 4, 4, 4) |
| 3 | 4 à 8 (faces 4, 5, 6, 6, 7, 7, 8, 8) |
| 4 | 7 à 12 |
| 5 | 11 à 20 |
| 6 | 21 à 30 |

- Un d20 sert aux jets de départ, de risque, de contact, de moteur, de météo et de stand.
- Tous les tirages viennent d'un générateur à graine : une partie est rejouable à l'identique à partir de sa graine et de ses actions.
- Le dé est lancé dès le choix du rapport ; le joueur peut ensuite ajuster le résultat (§3).

## 2. Voiture : points

Six jauges, dans cet ordre : Pneus, Freins, Boîte, Carrosserie, Moteur, Tenue de route. Les points de départ dépendent de la longueur de la course.

| Course | Pneus | Freins | Boîte | Carross. | Moteur | Tenue |
|---|---|---|---|---|---|---|
| 1 tour | 4 | 3 | 2 | 2 | 2 | 2 |
| 2 tours | 6 | 3 | 3 | 2 | 2 | 2 |
| 3 tours | 6 | 3 | 3 | 3 | 3 | 2 |

Une jauge qui passe sous 0 met la voiture hors course (abandon).

## 3. Rapports de vitesse

- Neutre (0) et 6 rapports. On monte d'un seul rapport à la fois.
- Rétrograder d'un rapport est gratuit ; de 2 : −1 Boîte ; de 3 : −1 Boîte et −1 Freins ; de 4 ou plus : −1 Boîte, −1 Freins, −1 Moteur.
  Un rapport n'est proposé que si la voiture peut payer (il faut au moins 2 points de Moteur pour descendre de 4 rapports ou plus).
- **Ajustement après le jet** : chaque point de Freins retire 1 case au résultat ; un point de Boîte ajoute 1 case (une fois par tour).
  Les points sont débités à l'arrivée et ne peuvent pas faire passer une jauge sous 0.

## 4. Départ

Au premier tour, un d20 : 20 = super départ (4 cases en 1re) ; 1 = calage (le tour est perdu) ; sinon 1re et d2.
La grille est tirée au hasard.

## 5. Déplacement

- Le moteur énumère tous les chemins possibles dans le graphe des cases pour le résultat du dé ; le joueur choisit sa case d'arrivée.
- Trois voies de piste. On change de voie en ligne droite seulement, jamais à travers une voiture ; dans un virage on suit sa voie.
- Une case occupée ne se traverse pas : la voiture s'arrête derrière et chaque case manquante coûte 1 Freins (3 au plus, le reste en Pneus).
- Plusieurs chemins vers la même case : on garde le moins coûteux. Un chemin que la voiture ne peut pas payer n'est pas jouable.
- La voie des stands n'est accessible que pour s'y arrêter ou si on y est déjà.

## 6. Virages

- Une zone de virage demande un nombre d'arrêts (1 à 3). En y entrant, le compteur d'arrêts restants vaut ce nombre ; chaque tour qui finit dans la zone le diminue de 1.
- Sortir de la zone avec des arrêts restants coûte des Pneus : les cases parcourues au-delà, multipliées par le facteur d'usure (§7), et davantage s'il restait plus d'un arrêt.
  Pneus exactement à 0 : la voiture s'arrête (neutre) ; sous 0 : sortie de piste.
- Chaque case porte un rapport conseillé selon les arrêts restants, utilisé par l'IA.

## 7. Pneus

Trois gommes : dure, pluie, tendre.

| Effet | Détail |
|---|---|
| Usure en virage | tendre ×2 (×3 à partir du 3e tour du relais), pluie par temps sec ×2, dure ×1 |
| Tendres | +1 au maximum du dé les 2 premiers tours du relais, puis −1 au minimum et au maximum |
| Pluie | pneus non-pluie : +3 cases d'arrêt requises en virage, pneus pluie : +1 |

La gomme se choisit au départ et à chaque arrêt au stand.

## 8. Contacts, moteur, tenue de route

- **Contact** : après un déplacement, d20 pour chaque voiture voisine ; 1 (1 ou 2 sous la pluie) = −1 Carrosserie.
- **Moteur** : en fin de tour, une voiture en 5e ou 6e lance un d20 ; 1 à 4 (1 à 3 sous la pluie) = −1 Moteur.
- **Case à risque** : d20 par jet ; 4 ou moins (5 sous la pluie) = −1 Tenue de route.

## 9. Météo

- Un d20 donne le temps, avec les seuils du circuit : sous le premier, pluie ; jusqu'au second, nuageux ; au-dessus, soleil (par défaut 7 et 13).
- Le temps évolue par paliers (5 niveaux d'humidité) : à chaque ronde un nouveau tirage le fait glisser d'un cran vers la pluie ou le soleil.
- La pluie rend contacts, casse moteur et cases à risque plus probables (§8).

## 10. Stands

- Voie des stands et un stand par équipe (5 équipes).
- Chaque équipe a 2 points de réparation pour la course, à répartir entre Freins, Boîte, Carrosserie, Moteur et Tenue de route lors des arrêts.
- Les Pneus reviennent à leur valeur de départ à chaque arrêt, avec la gomme choisie.
- **Arrêt rapide** (sans réparation) : d20 ; sous 11, la voiture repart aussitôt en 4e avec la moitié du jet en cases (2 au moins) ; sinon l'arrêt devient long.
- **Arrêt long** : le tour est perdu, les réparations sont faites.
- Un seul arrêt par tour de circuit.

## 11. Ordre de jeu et fin de course

- Le leader joue en premier : la voiture la plus avancée, à égalité le rapport le plus haut, puis la première arrivée. Chacune joue une fois par ronde.
- Classement : tours × longueur + position ; les abandons finissent derniers, le dernier à abandonner devant les autres.
- La course finit quand toutes les voitures ont fini ou abandonné.

## 12. Classement en ligne

À définir.

## 13. Aspiration

Une voiture en 4e ou plus, non bloquée, qui suit une voiture dans la même ligne (case `link`) roulant en 4e ou plus à un rapport inférieur ou égal,
peut prendre l'aspiration pour gagner des cases ; le joueur peut la refuser.

## 14. IA

- **Rapport** : vise le rapport conseillé de la case selon les arrêts restants ; un cran de moins sous la pluie sans pneus pluie en virage ; plus bas si l'usure
  attendue est trop forte ; ne rétrograde que ce que l'état de la voiture permet.
- **Case d'arrivée** : minimise pertes de Pneus + 3 × pertes de Freins, en préférant rejoindre son stand quand il le faut, les voies libres, puis la case la plus avancée.
- **Arrêt au stand** : quand les pneus ne tiendront pas jusqu'à l'arrivée, quand la gomme ne convient plus à la météo, ou quand une autre jauge est trop basse.
- **Réparations** : Moteur, puis Carrosserie, puis Freins ; Boîte et Tenue de route ensuite.

## 15. Format de circuit

Les circuits sont des fichiers JSON (`src/data/tracks`, schéma dans `src/data/tracks/schema.ts`) : une liste de cases avec leurs successeurs (`next`),
leur rang le long du tour (`row`), leur type (0 piste, 1 virage, 2 voie des stands, 3 à 7 stands d'équipe), leur voie, la zone de virage et ses arrêts,
les rapports conseillés, les voisines (contacts), la case suivante dans la même ligne (`link`, aspiration), la ligne d'arrivée et la grille.
`validateTrackDef` (`src/data/tracks/validate.ts`) vérifie un circuit avant de l'accepter.
L’éditeur (`/editor`, en développement, `src/editor`) dessine un circuit à partir d’une ligne centrale en courbes de Bézier et génère ses cases ; le fichier exporté (champ `version`) garde le document de l’éditeur (champ `editor`). Nos circuits sont décrits dans `docs/circuits.md`.

## 16. Multijoueur (principe)

Chaque client rejoue la partie à partir de la graine et des actions partagées ; un joueur déconnecté est remplacé par l'IA.
