# 10. Stats des voitures

> Conception de l'étape S1. Complète [03-ajouts.md](03-ajouts.md) § 3.3 (pièces et plafonds de ligue) : ce chapitre rend les
> pièces **lisibles, utiles à chaque niveau et intéressantes à assembler**. Les chiffres sont une base de départ, ajustée par
> simulation à l'étape S1d (§ 10.8).

## 10.1 Ce qui ne va pas aujourd'hui

1. **Les niveaux sont plats.** Seuls les points de jauge montent à chaque niveau. Tous les autres effets (relance, arrêt gratuit,
   cases bonus, remises) gagnent +0,25 par niveau, arrondi vers le bas : les niveaux 1 à 4 sont identiques, le niveau 5 donne +1.
2. **Des « +N points » sans identité.** Aucune pièce n'oblige à choisir, aucune ne se combine avec une autre.
3. **Rien n'est visible en course.** On ne sait ni quand une pièce agit, ni combien d'usages il reste (relances, arrêts gratuits).
4. **Une fiche illisible** : 13 chiffres alignés, sans repère de ce qui est fort ou faible.
5. **Aucun usage en ligne** : toutes les voitures sont identiques.

## 10.2 Six stats lisibles

La fiche de la voiture regroupe les effets des six pièces en **six stats**, affichées en barres de 10 crans et résumées par une
**Puissance** (0 à 60, la somme des crans). Une stat se calcule avec les modificateurs que le moteur lit déjà.

| Stat | Ce qu'elle dit | Points qui la font monter | Poids |
|---|---|---|---|
| **Vitesse** | ce que le dé rapporte | cases bonus (somme sur les 6 rapports) | 3 par case |
| **Endurance** | tenir la distance | points de Pneus et de Freins | 1 par point |
| **Maniabilité** | bien prendre les virages | points de Tenue, arrêts gratuits, Pneus épargnés en virage raté | 1 par point, 3 par arrêt gratuit, 2 par pneu épargné |
| **Robustesse** | encaisser les contacts | points de Carrosserie, Carrosserie épargnée derrière une voiture | 1 par point, 2 par point épargné |
| **Fiabilité** | ne pas casser | points de Moteur et de Boîte, seuil du jet moteur, rapports offerts en rétrogradant | 1 par point, 2 par seuil, 2 par rapport offert |
| **Tactique** | choisir au bon moment | relances par course | 4 par relance |

- Crans d'une stat = 10 × (score de la voiture − score de la voiture de série) ÷ (score maximal − score de la voiture de série), arrondi,
  entre 0 et 10. Le score maximal est celui de la meilleure combinaison possible (6 pièces légendaires niveau 5). La voiture de
  série affiche donc 0 cran partout, et chaque pièce y ajoute quelque chose de visible.
- Le garage montre **trois barres comparées** : la voiture actuelle, la voiture avec la pièce sélectionnée, et (en classé) la
  voiture écrêtée par la ligue (§ 3.3, valeurs écrêtées en orange).
- Le joueur lit d'abord la Puissance et les barres ; la liste détaillée des effets reste à un tap (« Détails »).

## 10.3 Des niveaux qui comptent à chaque fois

Chaque pièce a un **effet principal** (sa ligne dans le catalogue) et une **jauge d'emplacement** : Moteur → Moteur, Boîte → Boîte,
Freins → Freins, Pneus → Pneus, Aileron → Tenue de route, Châssis → Carrosserie. Les paliers sont les mêmes pour toutes les pièces :

| Niveau | Gain |
|---|---|
| 1 | la pièce telle qu'écrite au catalogue |
| 2 | **+1 point** de la jauge d'emplacement |
| 3 | **+1 point** sur une jauge secondaire de la famille de la pièce (§ 10.5) |
| 4 | **+1 point** de la jauge d'emplacement |
| 5 | **effet principal +1** (une relance, un arrêt gratuit, une remise…, ou la jauge de la pièce), et le point du niveau 3 passe à 2 ; **les cases de dé et les relances ne montent jamais avec le niveau** (chacune vaut 7 à 10 points de victoires) |

- Les pièces dont l'effet principal est déjà un gain de jauge ne gagnent plus +1 point par niveau : elles suivent ce tableau (le
  niveau 5 de la Monocoque carbone ne dépasse plus la voiture de base, ce qui corrige le défaut signalé au § 3.3).
- Chaque niveau gagné est donc **visible dans la fiche** (au moins un cran ou un point de plus) et dans l'écran de montée de niveau.

## 10.4 Des contreparties sur les pièces épiques et légendaires

Une pièce épique ou légendaire donne beaucoup, mais **coûte quelque chose** : un point en moins sur une jauge, en permanence. Les
pièces communes et rares restent simples (aucune contrepartie).

| Pièce | Rareté | Gain principal | Contrepartie |
|---|---|---|---|
| V8 Sport | épique | +1 case aux rapports 4, 5 et 6 | −1 Boîte |
| Hybride prototype | légendaire | +1 case aux rapports 3 à 6 | −2 Boîte |
| Séquentielle | épique | rétrogradation : 1 rapport offert | −1 Moteur |
| Double embrayage | légendaire | rétrogradation : 2 rapports offerts | −1 Moteur, −1 Freins |
| Carbone-céramique | épique | 1 arrêt gratuit en virage, +4 Freins | −1 Pneus |
| Freinage régénératif | légendaire | 1 arrêt gratuit, 1 point de Carrosserie épargné, +3 Freins | −1 Pneus |
| Slicks pro | épique | −1 pneu perdu en virage raté, +3 Pneus | −1 Tenue |
| Gommes prototype | légendaire | −1 pneu perdu en virage raté, +4 Pneus, +2 Tenue | −1 Freins |
| Aérodynamique active | épique | 1 relance, +3 Tenue | −1 Tenue |
| Soufflerie parfaite | légendaire | 2 relances, +3 Tenue | −1 Carrosserie, −1 Moteur |
| Titane usiné | épique | +3 Carrosserie, +3 Tenue, +1 Freins | −1 Pneus |
| Monocoque carbone | légendaire | +4 Carrosserie et +1 à toutes les autres jauges | −1 Moteur |

- Une contrepartie est un **malus de jauge**, déjà géré par le moteur (jauge de départ réduite). Les plafonds de ligue
  s'appliquent aux bonus positifs ; les malus s'appliquent toujours.
- Dans le catalogue, une contrepartie est un effet `wear` négatif (`perLevel: 0`) et, pour la Monocoque, un `moveBonus` négatif
  sur le rapport 1. Une jauge ne descend jamais sous 0 au départ.

## 10.5 Trois familles et des bonus de série

Chaque pièce appartient à une famille, affichée par une pastille de couleur :

| Famille | Idée | Pièces |
|---|---|---|
| **Vitesse** | aller plus loin à chaque tour | Turbo calibré, V8 Sport, Hybride prototype, Aérodynamique active, Huile racing, Panneaux allégés, Volet additionnel, Gommes tendres |
| **Endurance** | tenir, réparer, durer | Bloc de série renforcé, Carter renforcé, Plaquettes durcies, Disques ventilés, Cage renforcée, Monocoque alu, Titane usiné, Monocoque carbone, Slicks pro, Gommes prototype |
| **Précision** | gérer virages et rétrogradations | Radiateur surdimensionné, Embrayage souple, Séquentielle, Double embrayage, ABS de course, Carbone-céramique, Freinage régénératif, Slicks adhérents, Mixtes polyvalents, Aileron fixe, Aileron mobile, Soufflerie parfaite |

Le **bonus de série** récompense une voiture qui joue une idée :

| Pièces de la même famille | Bonus |
|---|---|
| 3 | **+1 point** sur la jauge secondaire de la famille : Vitesse → Moteur, Endurance → Pneus, Précision → Tenue |
| 5 | **la contrepartie d'une pièce est réduite de 1** (au choix du moteur : la plus grosse), et un bonus propre à la famille : **1 case au rapport 6** (Vitesse), **1 arrêt gratuit** (Endurance) ou **une relance de plus** (Précision) |

Chaque famille n'a aucune pièce sur un emplacement (Vitesse : Freins ; Endurance : Aileron ; Précision : Châssis) : **5 pièces sur 6
est le maximum**, ce qui oblige à garder un emplacement « libre » pour une pièce d'une autre famille.

Les pastilles et la ligne « Série : 3/6 Précision » sont affichées au garage ; on voit ce qu'il manque pour le palier suivant.

## 10.6 Voir les pièces agir en course

- **Puces dans le HUD** : une relance restante (« ↻ 2 »), les arrêts gratuits (« ⛯ 1 »), un bonus de dé actif (« +1 case »),
  une contrepartie à surveiller. Elles ne s'affichent que si la voiture en a.
- **Messages du journal** (J1) : « Hybride prototype : +1 case », « Carbone-céramique : arrêt gratuit utilisé », « Embrayage souple :
  1 rapport offert ». Le moteur n'a pas besoin d'un nouvel événement : `DICE_ROLLED` (champ `bonus`), `FREE_STOP_USED`, `REROLLED`,
  `CORNER_OVERSHOOT` et `BLOCKED` disent déjà quand un effet agit ; l'interface retrouve la pièce de la voiture qui porte cet
  effet (le moteur ne connaît pas les noms de pièces).
- **Écran de fin** : « Vos pièces ont servi N fois : +4 cases, 1 arrêt gratuit, 1 relance… » : le joueur voit ce que valent ses pièces.

## 10.7 En ligne et en classé

- L'équipement n'est **pas** envoyé entre appareils tant que le serveur ne rejoue pas les courses (étape 4e) : sans cela, un
  joueur pourrait annoncer des pièces qu'il n'a pas.
- L'étape S1 livre l'outil d'écrêtage `capMods(mods, ligue)` (table du § 3.3) et la **double fiche du garage** « Ma voiture » /
  « En classé (Ligue X) ». Le classé l'utilisera quand les ligues existeront (étapes 4a à 4e). D'ici là, les courses en ligne
  entre amis restent à voiture identique.
- La campagne et la course rapide continuent d'utiliser l'équipement sans plafond.

## 10.8 Équilibrage par simulation

Un script `npm run balance:parts` joue des duels d'IA Moyen (une voiture équipée d'une seule pièce contre la voiture de série) sur trois
circuits, 900 duels par pièce et par niveau (1, 3 et 5), graines fixes, places échangées. Une relance simple est ajoutée à l'IA du script
(les IA du jeu n'en utilisent jamais), pour que les pièces à relance se mesurent.

Premier constat, après essais : un duel d'IA prudente **ne voit que ce que l'IA sait utiliser** (cases de dé, relances, jauges). Les
pièces qui protègent (arrêts gratuits, remises sur les virages ratés) ne bougent presque pas le résultat, parce qu'une IA prudente ne
prend pas les risques que ces pièces permettent. Le duel sert donc de **garde-fou aux extrêmes**, et la **hiérarchie des raretés**
se contrôle par la Puissance de la fiche.

| Contrôle | Seuil |
|---|---|
| Aucune pièce n'est un piège (duel) | jamais sous 44 % de victoires (48 % avec une marge de 4 points de hasard) |
| Aucune pièce n'écrase (duel) | jamais au-dessus de 66 % (62 % avec la même marge) |
| Série de 5 pièces d'une famille, niveau 5 (duel) | au plus 74 % (70 % avec la marge) |
| Hiérarchie (Puissance de la fiche) | dans chaque emplacement, la meilleure pièce d'une rareté n'est pas plus faible que celle de la rareté en dessous, aux niveaux 1 et 5 ; en moyenne la Puissance croît avec la rareté aux niveaux 1, 3 et 5 |

Les écarts à corriger sont traités en changeant une valeur du catalogue, jamais une règle de course. Les résultats sont écrits dans
`docs/equilibrage-pieces.md`, contrôlés par un test (comme l'équilibrage de la campagne) ; la hiérarchie par `src/data/parts/rarity.test.ts`.
Premier réglage : les bonus de cases étaient trop forts (une case de plus à un rapport vaut environ 9 points de victoires) : le Turbo calibré
passe au rapport 5, l'Hybride prototype aux rapports 3 à 6, l'Aérodynamique active perd son bonus de case contre 3 points de Tenue.

## 10.9 Découpage

| Étape | Contenu | Sortie vérifiable |
|---|---|---|
| S1a | Ce chapitre | relu et validé |
| S1b | Données et moteur : paliers de niveau, contreparties, familles, bonus de série, plafonds de ligue (`capLoadoutMods`), calcul des stats (`carStats`) — **fait** | `src/data/parts/{effects,stats,caps}.ts`, tests unitaires |
| S1c | Interface : fiche en barres et Puissance, comparaison, série de famille, puces du HUD, messages, écran de fin | e2e et captures 390×844 et 1440×900 |
| S1d | Équilibrage par simulation, ajustement du catalogue, doc, publication | `docs/equilibrage-pieces.md`, `npm run verify` vert |
