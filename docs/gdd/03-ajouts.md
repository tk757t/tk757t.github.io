# 3. Nos ajouts de gameplay

Les règles de course ([02-regles.md](02-regles.md)) sont la base commune. Quatre systèmes s'y ajoutent, tous construits pour
rester **lisibles en un coup d'œil** et **bornés en classé** :

| Système | Choisi | Agit sur | Progression |
|---|---|---|---|
| Cartes tactiques | deck de 8 avant la course, joué pendant | un tour précis | débloquées par les ligues et les coffres, sans niveau |
| Réglages | avant la course | toute la course, à somme nulle | aucune : un choix, pas un achat |
| Pièces | au garage | jauges, plages de dés, petits effets | rareté et niveau 1 à 5, plafonnés par ligue en classé |
| Pilotes | avant la course | un talent passif | débloqués, sans niveau |

Statut dans le code (octobre 2026) : les **pièces** existent (30 pièces, `src/data/parts`, effets lus par le moteur via `CarMods`).
Les cartes, réglages, pilotes et plafonds sont à construire ; chaque effet ci-dessous est écrit pour être traduit en un crochet
du moteur, comme les pièces.

## 3.1 Cartes tactiques

### Principe

- Avant une course, le joueur choisit un **deck de 8 cartes différentes** parmi celles qu'il a débloquées.
- En course, il a **4 cartes en main**. Une carte jouée retourne sous le deck et la suivante arrive en main (cycle de 8).
  La main de départ est tirée au hasard (graine de la course).
- Chaque carte coûte de l'**énergie** :
  - 2 énergies au départ ; **+1 au début de chacun de ses tours** ; **5 au plus**.
  - **Une carte par tour** au plus.
- Chaque carte a un **moment** :
  - **Avant le jet** : pendant le choix du rapport.
  - **Après le jet** : pendant l'ajustement, avant de choisir sa case.
  - **Au stand** : pendant un arrêt.
- Une carte jouée est visible des adversaires (icône sur la voiture, ligne dans le journal de course).
- Pas de niveau de carte : une carte a la même force pour tous. Son équilibre se règle par son **coût** et la **configuration
  à distance** ([07-technique.md](07-technique.md)).

> Ordre de grandeur : une course classée d'un tour dure environ 12 rondes, soit 12 énergies gagnées ; avec un coût moyen de 2,
> on joue 6 à 7 cartes par course. Une course de 3 tours (campagne) en voit 20 à 25.

### Les 20 cartes de départ

| # | Carte | Coût | Moment | Effet précis | Rareté | Déblocage |
|---|---|---|---|---|---|---|
| 1 | Freinage tardif | 1 | Après le jet | Retire jusqu'à 2 cases sans dépenser de Freins. | Commune | Départ |
| 2 | Coup de boîte | 1 | Après le jet | +1 case sans dépenser de Boîte ; cumulable avec le point de Boîte habituel (+2 au total). | Commune | Départ |
| 3 | Refroidissement | 1 | Avant le jet | Pas de jet de casse moteur à la fin de ce tour. | Commune | Départ |
| 4 | Prudence | 1 | Avant le jet | Le dé est lancé deux fois ; on garde le **plus petit** résultat. | Commune | Départ |
| 5 | Radar météo | 1 | Avant le jet | Montre le temps visé par les 3 prochains tirages météo (connu du serveur, la graine n'est pas révélée). | Commune | Départ |
| 6 | Grip | 2 | Avant le jet | Aucun jet de case à risque pendant ce tour. | Commune | Départ |
| 7 | Gomme fraîche | 2 | Avant le jet | +2 Pneus, sans dépasser le maximum. | Commune | Départ |
| 8 | Relance | 2 | Après le jet | Relance le dé du rapport choisi (impossible au départ). | Rare | Départ |
| 9 | Rétrogradage sec | 2 | Avant le jet | Ce tour, rétrograder compte 2 crans de moins pour le coût (de 5e en 2e : gratuit). | Rare | Ligue Bitume |
| 10 | Blindage | 2 | Avant le jet | Jusqu'à votre prochain tour, vous ne perdez pas de Carrosserie dans les contacts (les autres oui). | Rare | Ligue Bitume |
| 11 | Pit express | 2 | Au stand | L'arrêt rapide réussit sans jet, comme avec un d20 de 8 : repart en 4e avec 4 cases. | Rare | Ligue Bitume |
| 12 | Aspiration forcée | 2 | Après le jet | Aspiration (+2 cases) même si la voiture devant roule à un rapport supérieur au vôtre ; les autres conditions restent. | Rare | Ligue Chicane |
| 13 | Départ canon | 2 | Avant le jet | Au départ seulement : pas de calage, super départ sur 18, 19 ou 20. | Rare | Ligue Chicane |
| 14 | Rustine | 3 | Avant le jet | +1 point à une jauge au choix (sauf Pneus), sans dépasser le maximum. | Épique | Ligue Chicane |
| 15 | Trajectoire idéale | 3 | Après le jet | Ce tour, un arrêt manquant à la sortie d'un virage est pardonné (comme un arrêt gratuit). | Épique | Ligue Épingle |
| 16 | Pied au plancher | 3 | Avant le jet | En 4e ou plus : le dé est lancé deux fois ; on garde le **plus grand** résultat. | Épique | Ligue Épingle |
| 17 | Équipe affûtée | 3 | Au stand | +1 point de réparation pour cet arrêt (l'arrêt devient long s'il est utilisé). | Épique | Ligue Épingle |
| 18 | Coup de pression | 3 | Avant le jet | La voiture la plus proche derrière vous (6 cases au plus) fait un jet de case à risque au début de son prochain déplacement. | Épique | Ligue Turbo |
| 19 | Sprint final | 3 | Après le jet | Seulement pendant le dernier tour de circuit : +2 cases. | Légendaire | Ligue Turbo |
| 20 | Lecture de course | 0 | Avant le jet | Remet les 4 cartes de la main sous le deck et pioche les 4 suivantes ; ne compte pas comme la carte du tour. | Légendaire | Ligue Turbo |

Règles de combinaison :

- Les effets « deux jets, garder le meilleur / le pire » (4, 16) ne se cumulent pas avec une relance de pièce dans le même tour.
- Les cases ajoutées (2, 12, 19) s'ajoutent aux ajustements habituels ; un blocage reste un blocage.
- Une carte qui ne peut rien faire (Sprint final avant le dernier tour, Départ canon après le départ) est grisée.

### Deck conseillé au premier lancement

Freinage tardif, Coup de boîte, Refroidissement, Prudence, Radar météo, Grip, Gomme fraîche, Relance (coût moyen 1,4).

## 3.2 Réglages avant course : aéro ou vitesse

Avant chaque course, un curseur à 5 positions. Le réglage est **à somme nulle** : il déplace la force de la voiture, il ne
l'augmente pas. Il est visible des adversaires sur la grille.

| Position | Effets |
|---|---|
| Aéro +2 | +2 Tenue de route ; 1 Pneu épargné à chaque sortie de virage ratée ; face maximale des dés de 5e et 6e : −1 |
| Aéro +1 | +1 Tenue de route ; face maximale du dé de 6e : −1 |
| Neutre | aucun effet (réglage par défaut) |
| Vitesse +1 | face maximale des dés de 5e et 6e : +1 ; −1 Tenue de route |
| Vitesse +2 | face maximale des dés de 4e, 5e et 6e : +1 ; −1 Tenue de route ; seuil du jet de casse moteur +1 |

- Un circuit à longues lignes droites appelle la vitesse, un circuit tortueux et pluvieux l'aéro.
- L'IA choisit son réglage selon la part de cases en virage du circuit (au-dessus de 40 % : aéro).
- Crochets moteur nécessaires : bonus de Tenue (existe : `wearBonus`), remise sur la sortie de virage (existe :
  `overshootTireDiscount`), **modification de la face maximale d'un dé** (nouveau, distinct de `moveBonus` qui décale tout le dé),
  seuil moteur (existe : `rollWearDiscount`, accepter une valeur négative).

## 3.3 Pièces

### Ce qui existe

Six emplacements (Moteur, Boîte, Freins, Pneus, Aileron, Châssis), 5 pièces par emplacement (2 communes, 1 rare, 1 épique,
1 légendaire), soit 30 pièces, plus 20 cosmétiques. Une pièce a un niveau de 1 à 5, monté avec des fragments.

| Effet | Ce qu'il fait | Exemple |
|---|---|---|
| Jauge | + points de départ (et de maximum) d'une jauge | Cage renforcée : +2 Carrosserie |
| Plage de dés | + cases à chaque face du dé de certains rapports | Turbo calibré : +1 case en 4e |
| Relance | relances du dé par course | Aileron mobile : 1 relance |
| Arrêt gratuit | arrêts de virage pardonnés par course | Carbone-céramique : 1 arrêt gratuit |
| Rétrogradation | crans non comptés pour le coût d'une rétrogradation | Embrayage souple : 1 cran offert |
| Sortie de virage | Pneus épargnés lors d'une sortie ratée | Slicks adhérents : −1 Pneu perdu |
| Blocage | Freins épargnés quand on est bloqué | ABS de course : −1 Frein |
| Casse moteur | seuil du jet de casse moteur abaissé | Radiateur surdimensionné : seuil −1 |

### Ce qu'on change

1. **Progression des jauges** : aujourd'hui une pièce gagne +1 point de jauge par niveau ; au niveau 5, la Monocoque carbone
   donne +8 Carrosserie et +5 à toutes les autres jauges, soit plus que la voiture de base. Proposition : **+0,5 par niveau**
   (arrondi en dessous) pour les jauges ; les autres effets gardent leur +1 au niveau 5.
2. **Plages de dés** : en plus du décalage de tout le dé (`moveBonus`), une pièce peut élargir **la face maximale** d'un dé
   (« +1 au maximum en 5e »). C'est plus faible, plus lisible, et c'est le seul effet de dé autorisé dans les deux premières ligues.
3. **Six nouvelles pièces au lancement** (une par emplacement) utilisant l'élargissement de la face maximale ([06-contenu-lancement.md](06-contenu-lancement.md)).

### Plafonds en classé

En course classée, chaque voiture est **ramenée aux plafonds de sa ligue** (la ligue la plus haute des deux joueurs en cas de
match entre ligues voisines) : les pièces au-dessus du niveau plafond jouent à ce niveau, puis les totaux sont écrêtés.
Les courses amicales, la campagne et la course rapide n'ont pas de plafond.

| Ligue | Niveau de pièce max | Bonus max par jauge | Bonus total de jauges | Cases de dé max (somme sur les 6 rapports) | Relances | Arrêts gratuits | Remises (rétrogradation + sortie + blocage + moteur) |
|---|---|---|---|---|---|---|---|
| Paddock | 2 | +1 | +4 | 0 (face max : +1 sur un rapport) | 1 | 0 | 1 |
| Bitume | 3 | +2 | +6 | 1 | 1 | 1 | 2 |
| Chicane | 3 | +2 | +8 | 2 | 1 | 1 | 2 |
| Épingle | 4 | +3 | +10 | 3 | 2 | 1 | 3 |
| Turbo | 5 | +3 | +12 | 4 | 2 | 2 | 3 |
| Légende | 5 | +4 | +14 | 4 | 2 | 2 | 4 |

- Le garage affiche les deux fiches : « Ma voiture » et « En classé (Ligue Chicane) », avec les valeurs écrêtées en orange.
- Un joueur qui a tout au maximum et un joueur qui a des pièces moyennes de sa ligue ont un écart de puissance faible : les
  plafonds sont calculés pour qu'un joueur gratuit régulier les atteigne en 2 à 4 semaines dans sa ligue
  ([05-economie.md](05-economie.md)).

## 3.4 Pilotes

Un pilote par voiture. Chaque pilote a **un talent passif** d'effet modeste, toujours actif. Pas de niveau ; les talents
sont équilibrés entre eux, pas les uns au-dessus des autres. Les huit pilotes de lancement (noms inventés) :

| Pilote | Talent | Effet précis | Déblocage |
|---|---|---|---|
| Léa Virage | Trajectoire | 1 arrêt gratuit en virage par course | Départ |
| Hugo Turbo | Pied lourd | Pas de jet de casse moteur en 5e : seulement en 6e | Campagne, niveau 3 |
| Sami Gomme | Gomme douce | Les pneus tendres passent au facteur ×3 au 4e tour du relais au lieu du 3e | Ligue Bitume |
| Max Asphalte | Départ canon | Jamais de calage ; super départ sur 19 ou 20 | Campagne, niveau 10 |
| Zoé Chicane | Funambule | Seuil des cases à risque −1 (3 au sec, 4 sous la pluie) | Ligue Chicane |
| Tom Piston | Mécano | +1 point de réparation par course | Coffre (rare) |
| Inès Averse | Danseuse de pluie | Sous la pluie, contacts et casse moteur avec les seuils du sec | Ligue Épingle |
| Noé Relais | Arrêt éclair | Arrêt rapide réussi si le d20 est sous 14 (au lieu de 11) | Coffre (épique) |

- Le talent d'un pilote compte dans les plafonds de ligue (un arrêt gratuit de talent occupe la case « Arrêts gratuits »).
- Les adversaires de la campagne utilisent ces mêmes pilotes : le joueur découvre un talent en l'affrontant avant de le débloquer.
- Cosmétiques de pilote (casques, combinaisons) : voir [05-economie.md](05-economie.md).
