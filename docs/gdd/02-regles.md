# 2. Règles de course

Ce chapitre décrit la course telle que le moteur (`src/engine`) la joue aujourd'hui. Les tableaux marqués d'un commentaire
`gdd:` sont comparés aux constantes du moteur à chaque `npm test` (`tools/check-gdd.ts`) : changer une valeur ici sans
changer le moteur (ou l'inverse) fait échouer les tests. Les modifications apportées par les pièces, cartes, réglages et
pilotes sont dans [03-ajouts.md](03-ajouts.md) ; ici, la voiture est **nue**.

Les encadrés **« Écart »** signalent où nos règles s'éloignent du jeu de plateau qui nous a inspirés, et pourquoi.

## 2.1 Vue d'ensemble

- 2 à 5 voitures sur un circuit fait de cases, en 3 voies, avec des zones de virage, une voie des stands et un stand par équipe.
- La course dure 1, 2 ou 3 tours de circuit. Les voitures jouent chacune leur tour, **le leader d'abord** ; une **ronde** est
  terminée quand toutes les voitures en course ont joué.
- Un tour de jeu : **choisir un rapport → le dé est lancé → ajuster → choisir sa case d'arrivée** → conséquences
  (virages, contacts, moteur, risque) → éventuellement s'arrêter au stand.
- On gagne en franchissant la ligne le premier au dernier tour. On perd une voiture quand une de ses jauges passe sous zéro.

## 2.2 Rapports et dés

Chaque rapport a son dé. Le résultat est le nombre de cases à parcourir. Le dé est tiré uniformément parmi ses faces.

<!-- gdd:dice -->
| Rapport | Faces du dé | Min | Max | Moyenne |
|---|---|---|---|---|
| 1 | 1, 2 | 1 | 2 | 1,5 |
| 2 | 2, 3, 3, 4, 4, 4 | 2 | 4 | 3,33 |
| 3 | 4, 5, 6, 6, 7, 7, 8, 8 | 4 | 8 | 6,38 |
| 4 | 7, 8, 9, 10, 11, 12 | 7 | 12 | 9,5 |
| 5 | 11, 12, 13, 14, 15, 16, 17, 18, 19, 20 | 11 | 20 | 15,5 |
| 6 | 21, 22, 23, 24, 25, 26, 27, 28, 29, 30 | 21 | 30 | 25,5 |

Les dés des rapports 2 et 3 sont **pondérés vers le haut** : en 2e, on fait 4 une fois sur deux ; en 3e, 8 une fois sur quatre.
Les plages se recouvrent peu : passer de la 4e à la 5e, c'est accepter un écart de 10 cases entre le meilleur et le pire jet.

**Changer de rapport**

- On ne monte que d'**un** rapport par tour (de la 3e on peut passer en 4e, pas en 5e).
- Rester sur le même rapport ou descendre d'un cran est gratuit. Descendre de plusieurs crans d'un coup coûte des points :

<!-- gdd:downshift -->
| Rapports descendus | Boîte | Freins | Moteur |
|---|---|---|---|
| 1 | 0 | 0 | 0 |
| 2 | 1 | 0 | 0 |
| 3 | 1 | 1 | 0 |
| 4 et plus | 1 | 1 | 1 |

- Un rapport qu'on ne peut pas payer n'est pas proposé. Exception : pour descendre de 4 crans ou plus, il faut **au moins 2**
  points de Moteur (on ne peut pas casser son moteur volontairement en rétrogradant).
- Le jeu affiche, pour chaque rapport proposé, sa plage de cases et les cases du circuit qu'il peut atteindre.

> **Exemple.** Vous êtes en 5e à l'approche d'un virage. Passer en 2e (3 crans) coûte 1 Boîte et 1 Freins ; passer en 3e
> (2 crans) coûte 1 Boîte ; passer en 4e est gratuit. En 4e, vous ferez de 7 à 12 cases.

## 2.3 Ajuster après le jet

Une fois le dé lancé, avant de choisir sa case, le joueur peut corriger le résultat :

- **Freiner** : chaque point de Freins retire 1 case (jusqu'à la valeur du jet, et dans la limite des Freins restants).
- **Forcer** : un point de Boîte ajoute 1 case, **une fois par tour**.
- **Aspiration** (§ 2.9) : ajoute des cases si les conditions sont réunies.

Les points d'ajustement sont payés à l'arrivée. On peut changer d'avis tant qu'on n'a pas choisi sa case.

> **Exemple.** En 4e, le dé donne 11. La bonne case (dernière case avant le virage) est à 9 cases : vous dépensez 2 Freins.
> Si le dé avait donné 8 et que la case visée était à 9, 1 point de Boîte suffisait.

## 2.4 La voiture : six jauges

Chaque voiture a six jauges. Leurs points de départ dépendent de la longueur de la course ; ils sont aussi le **maximum** de
la jauge (les réparations ne vont pas au-delà).

<!-- gdd:start-points -->
| Course | Pneus | Freins | Boîte | Carrosserie | Moteur | Tenue de route |
|---|---|---|---|---|---|---|
| 1 tour | 4 | 3 | 2 | 2 | 2 | 2 |
| 2 tours | 6 | 3 | 3 | 2 | 2 | 2 |
| 3 tours | 6 | 3 | 3 | 3 | 3 | 2 |
| Entraînement | 12 | 4 | 3 | 3 | 3 | 3 |

| Jauge | Ce qui la fait baisser |
|---|---|
| Pneus | sortir d'un virage avec 1 arrêt manquant (§ 2.6), chaque tour terminé (§ 2.7) |
| Freins | freiner après le jet, rétrograder de 3 crans ou plus |
| Boîte | forcer d'une case, rétrograder de 2 crans ou plus |
| Carrosserie | être arrêté par une voiture (§ 2.5), les contacts avec les voitures voisines (§ 2.8) |
| Moteur | rouler en 5e ou 6e (jet de casse, § 2.8), rétrograder de 4 crans ou plus |
| Tenue de route | les cases à risque (§ 2.8) |

- **Une jauge sous 0 : abandon.** Une jauge à 0 exactement n'est pas un abandon ; des Pneus à 0 arrêtent toutefois la voiture (§ 2.6).
- En **entraînement**, la voiture ne s'use pas : chaque point qui aurait été perdu devient un point de pénalité de temps.
  Ce mode sert aux essais libres et au tutoriel.

## 2.5 Se déplacer

- Le moteur calcule **tous les chemins** possibles pour le nombre de cases obtenu et propose chaque case d'arrivée, avec son
  coût. Si plusieurs chemins mènent à la même case, on garde le moins coûteux.
- Le circuit a **3 voies**. On change de voie **en ligne droite seulement** (jamais dans une zone de virage, où l'on suit sa
  voie) et jamais en passant à travers une voiture qui roule à côté.
- **Contact avec une voiture** : une case occupée ne se traverse pas. Si une voiture barre la route, on s'arrête derrière elle
  et on **perd 1 point de Carrosserie**, quel que soit le nombre de cases manquantes. Les Freins et les Pneus ne sont pas
  touchés. Certaines pièces (ABS) réduisent cette perte. Une impasse (qui n'existe sur aucun de nos circuits) coûte 1 point de
  Freins par case manquante, **3 au plus**, le reste en Pneus.
- **Le mur** : sortir d'un virage avec 2 arrêts manquants ou plus, c'est percuter le mur. La destination est proposée en
  rouge, mais la voiture qui la choisit **abandonne aussitôt**. Si toutes les destinations mènent au mur, elle y va.
- Une destination qu'on ne peut pas payer (Freins ou Pneus insuffisants dans une impasse, ou 1 arrêt manquant trop cher en
  Pneus) est grisée. Si aucune destination n'est jouable, quel que soit l'ajustement, la voiture **abandonne**.
- La voie des stands ne sert qu'à s'arrêter à son stand ; on ne peut pas l'emprunter comme raccourci.

> **Exemple.** Vous faites 8 ; après 5 cases, une voiture occupe la seule case devant vous. Il vous manque 3 cases :
> −1 Carrosserie. Avec un jet de 10, il en manquerait 5 : toujours −1 Carrosserie. Mieux vaut sans doute changer de voie plus
> tôt, ou freiner pour s'arrêter ailleurs : la Carrosserie ne se répare qu'au stand.

## 2.6 Virages à arrêts

Chaque zone de virage exige un nombre d'**arrêts** (1 à 3), affiché sur le circuit. Un arrêt, c'est **finir son tour dans la
zone**.

- En entrant dans la zone, le compteur d'arrêts restants prend la valeur du virage. Chaque tour terminé dans la zone le baisse de 1.
- Sortir de la zone avec **1 arrêt manquant** coûte des Pneus : les cases encore à parcourir au moment de sortir (la première
  case hors de la zone comprise), multipliées par le facteur d'usure de la gomme (§ 2.7). Sous la pluie, on perd en plus 3
  Pneus (1 seulement avec des pneus pluie).
- Sortir avec **2 arrêts manquants ou plus**, c'est le **mur** : la voiture abandonne (voir § 2.5). Les Freins peuvent
  encore sauver la voiture en retirant des cases au jet, avant de choisir la destination.
- Pneus **à 0 exactement** après un déplacement : la voiture est arrêtée et repasse au point mort ; elle repartira en 1re.

> **Exemple.** Course de 2 tours, pneus durs (6 Pneus). Virage à 1 arrêt de 3 cases, vous êtes à 1 case de l'entrée, en 4e, et
> le dé donne 9. Vous traversez la zone (1 + 3 cases) et en sortez avec 5 cases à faire : −5 Pneus, il vous en reste 1. Avec
> des tendres (facteur 2), ce serait −10 : destination grisée. Sous la pluie en pneus durs : −5 − 3 = −8, grisée aussi.
> Freiner de 3 points (6 cases) ne fait sortir qu'avec 2 cases à faire : −3 Freins et −2 Pneus. Le bon choix se faisait
> avant le jet : en 2e (2 à 4 cases, pour 1 Boîte), on était sûr de finir dans la zone.

> **Exemple.** Virage à 2 arrêts : il faut finir **deux** tours dans la zone. Y entrer en 6e, c'est presque toujours
> l'abandon ; on y entre en 2e ou 3e, on s'y arrête une fois, puis on repart en visant la sortie.

## 2.7 Pneus

Trois gommes : **dure**, **tendre**, **pluie**. On choisit la gomme au départ et à chaque arrêt au stand. Le **relais** compte les
tours de circuit terminés depuis le dernier changement de pneus.

<!-- gdd:tires -->
| Gomme | Piste | Facteur, tours 1 et 2 du relais | Facteur, tour 3 et suivants |
|---|---|---|---|
| Dure | sèche | 1 | 1 |
| Dure | mouillée | 1 | 1 |
| Tendre | sèche | 2 | 3 |
| Tendre | mouillée | 2 | 3 |
| Pluie | sèche | 2 | 2 |
| Pluie | mouillée | 1 | 1 |

**Usure à chaque tour.** Même sans erreur de conduite, les pneus s'usent : à chaque tour de circuit terminé, ils perdent **1 point
de Pneus** selon la gomme et la piste. Le dernier tour de la course est gratuit (la voiture arrive), l'entraînement n'a pas d'usure,
et un arrêt au stand remet le compteur du relais à zéro.

<!-- gdd:lap-wear -->
| Gomme | Piste | Un point perdu tous les (tours) |
|---|---|---|
| Dure | sèche | 2 |
| Dure | mouillée | 2 |
| Tendre | sèche | 1 |
| Tendre | mouillée | 1 |
| Pluie | sèche | 1 |
| Pluie | mouillée | 2 |

- **Tendres** : pendant les tours 1 et 2 du relais, la face la plus haute du dé vaut 1 case de plus (en 4e : 7 à 13). Ensuite,
  chaque face vaut 1 case de moins, sans descendre sous 1 (en 4e : 6 à 11).
- **Pluie** : pas de bonus au dé, mais une sortie de virage ratée sous la pluie ne coûte que 1 Pneu de plus au lieu de 3 (§ 2.6).
- **Dures** : rien de spécial, la gomme sûre.

> **Exemple.** Course de 3 tours, sans arrêt, en tendres : rapides au premier tour, chères au deuxième en cas d'erreur, et à
> partir du troisième tour la 5e ne fait plus que 10 à 19 cases. Un arrêt au stand en fin de 2e tour remet les compteurs à zéro.

## 2.8 Contacts, moteur et cases à risque

Ces trois jets utilisent un **d20** : le coup porte si le d20 est **inférieur ou égal** au seuil.

<!-- gdd:thresholds -->
| Clé moteur | Règle | Valeur |
|---|---|---|
| `contact.dry` | Contact, piste sèche : seuil du d20 | 1 |
| `contact.rain` | Contact, pluie : seuil du d20 | 2 |
| `engineRoll.minGear` | Jet de casse moteur à partir du rapport | 5 |
| `engineRoll.dry` | Casse moteur, piste sèche : seuil du d20 | 4 |
| `engineRoll.rain` | Casse moteur, pluie : seuil du d20 | 3 |
| `risk.dry` | Case à risque, piste sèche : seuil du d20 | 4 |
| `risk.rain` | Case à risque, pluie : seuil du d20 | 5 |
| `rainOvershootExtra.other` | Pneus perdus en plus, virage raté sous la pluie (pneus non pluie) | 3 |
| `rainOvershootExtra.rain` | Pneus perdus en plus, virage raté sous la pluie (pneus pluie) | 1 |
| `brakeLossCap` | Cases manquantes payées en Freins au plus (blocage) | 3 |
| `superStart` | Départ : d20 à partir duquel c'est un super départ | 20 |
| `stall` | Départ : d20 jusqu'auquel la voiture cale | 1 |
| `superStartCells` | Cases d'un super départ | 4 |
| `repairPoints` | Points de réparation par voiture et par course | 2 |
| `fastStopBelow` | Arrêt rapide réussi si le d20 est strictement sous | 11 |
| `slipstreamBonus` | Cases gagnées par l'aspiration | 2 |
| `maxRounds` | Rondes au plus (sécurité : la course s'arrête et classe) | 400 |

- **Contact** : après son déplacement, la voiture lance un d20 pour chaque voiture sur une case voisine. Coup porté :
  la voisine perd 1 Carrosserie, et la voiture qui arrive aussi, mais **une seule fois par voisine sur toute la course**.
- **Casse moteur** : à la fin de son tour, une voiture en 5e ou 6e (hors stands) lance un d20 : coup porté = −1 Moteur.
  La pluie le rend un peu moins probable (on roule moins fort).
- **Case à risque** : certaines cases (vibreurs, bosses) portent un nombre de jets. Chaque jet raté coûte 1 Tenue de route,
  pour chaque case à risque traversée ou atteinte.

> **Exemple.** Vous finissez votre tour en 5e, au soleil, à côté de deux voitures. Deux jets de contact (5 % chacun de toucher),
> puis un jet moteur (20 % de perdre 1 Moteur). Avec 2 Moteur au départ d'une course d'un tour, trois tours en 5e ont environ
> 49 % de chances de vous coûter au moins un point.

## 2.9 Aspiration

Une voiture en 4e ou plus qui a, **juste devant elle dans sa ligne**, une voiture roulant elle aussi en 4e ou plus et à un
rapport **inférieur ou égal** au sien, peut prendre l'aspiration : **+2 cases**. Le joueur peut la refuser (elle pousserait
parfois dans un virage).

> **Exemple.** Vous êtes en 5e, la voiture devant vous en 4e : aspiration possible. Elle passe en 5e : toujours possible.
> Elle est en 6e : impossible, elle va plus vite que vous.

## 2.10 Météo

- Chaque circuit a deux seuils de d20 (par exemple 7 et 13) : en dessous du premier, pluie ; jusqu'au second, nuageux ;
  au-dessus, soleil.
- Au départ, un d20 fixe le temps. L'humidité de la piste va de 0 (sec) à 4 (trempé) : pluie = 4, nuageux = 2, soleil = 0.
  **Il pleut quand l'humidité vaut 3 ou 4.**
- À chaque nouvelle ronde, un d20 donne le temps « visé » et l'humidité fait **un seul pas** vers lui. Il faut donc au moins
  3 rondes pour passer du plein soleil à la pluie : on voit l'averse arriver.
- Les modes peuvent fixer le temps (campagne, défis).

> **Exemple.** Seuils 7 / 13. Départ : d20 = 15, soleil (humidité 0). Ronde 2 : d20 = 3 (pluie visée), humidité 1. Ronde 3 :
> d20 = 5, humidité 2, nuageux. Ronde 4 : d20 = 2, humidité 3 : il pleut. Ronde 5 : d20 = 18 (soleil visé), humidité 2.

## 2.11 Stands

- Chaque équipe a son stand dans la voie des stands. Pour s'arrêter, il faut **finir son déplacement sur la case de son stand** ;
  le joueur choisit alors de s'arrêter ou non. Un seul arrêt par tour de circuit.
- À l'arrêt : nouvelle gomme au choix, **Pneus remis au maximum**, et on peut dépenser des **points de réparation** (2 pour toute
  la course) sur les autres jauges, sans dépasser leur maximum.
- **Arrêt rapide** (aucune réparation) : un d20 ; sous 11, la voiture repart **aussitôt en 4e** avec la moitié du d20 en cases
  (arrondie au-dessus, 2 au moins), sans ajustement possible. Sinon, l'arrêt traîne : le tour est perdu, la voiture repart en 3e
  au tour suivant.
- **Arrêt long** (au moins une réparation) : le tour est perdu, la voiture repart en 3e au tour suivant.

> **Exemple.** Arrêt rapide, d20 = 7 : vous repartez en 4e avec 4 cases tout de suite. d20 = 1 : 2 cases. d20 = 14 : tour perdu.
> Avec 1 Moteur restant sur 3, un arrêt long avec 1 réparation au Moteur vous remet à 2 et laisse 1 point pour plus tard.

## 2.12 Ordre de jeu

- Au début de chaque ronde, puis après chaque tour, la prochaine voiture à jouer est **la plus avancée** parmi celles qui n'ont pas
  encore joué (tours faits × longueur du circuit + position dans le tour). À égalité : le **rapport le plus haut**, puis la voiture
  **arrivée la première** sur sa case.
- L'ordre peut donc changer au cours d'une ronde : dépasser une voiture qui n'a pas joué, c'est jouer avant elle à la ronde suivante.

> **Exemple.** A est en case 40 (4e), B en case 40 (5e), C en case 38. Ordre : B (même case, rapport plus haut), A, puis C.

## 2.13 Départ

- La grille est fournie par le mode de jeu (tirée au hasard en course rapide ; voir [04-modes.md](04-modes.md) pour le classé).
- Au premier tour, chaque voiture est en 1re et lance un d20 : **20** = super départ (4 cases) ; **1** = calage, le tour est
  perdu ; sinon, dé de 1re (1 ou 2 cases). Les ajustements restent possibles ; une relance (pièce, carte) ne l'est pas.

## 2.14 Fin de course et classement

- Une voiture qui termine son dernier tour sort de la piste et prend la place suivante à l'arrivée.
- La course s'arrête quand toutes les voitures ont fini ou abandonné (ou au bout de 400 rondes, par sécurité).
- Classement : d'abord les voitures arrivées, dans l'ordre d'arrivée ; puis celles encore en piste (rare), selon leur avancée ;
  puis les abandons, **le dernier à abandonner devant les autres**.

## 2.15 Choix propres à 4 Mules

Nos règles reprennent les mécaniques (libres) des courses au dé, mais certaines sont des choix de conception :

| Sujet | Notre règle | Pourquoi |
|---|---|---|
| Pluie et virages | +3 Pneus perdus en cas de sortie ratée (+1 en pneus pluie) | Simple à expliquer et testée |
| Aspiration | +2 cases, voiture juste devant dans la ligne | 2 cases rendent l'aspiration utile sans en faire un téléport |
| Cases à risque | −1 Tenue de route, sans déviation de la voiture | Une voiture déplacée hors de la case choisie est mal comprise sur un petit écran |
| Variante « capital unique » de points | Absente : six jauges toujours | Un seul système à apprendre ; les jauges portent le pilier « gestion du risque » |
| Qualifications | Absentes ; grille tirée par le mode | Parties courtes : la qualification doublerait la durée d'une session |
| Réparations | Toutes les jauges sauf les Pneus sont réparables | Plus lisible ; les Pneus sont remis à neuf de toute façon |
| Arrêt rapide | Repart en 4e avec ⌈d20 / 2⌉ cases (2 au moins), sinon tour perdu | Donne un vrai pari |
| Météo | Un pas d'humidité par ronde | Lisible : l'averse s'annonce |
| Classement en ligne | Trophées et ligues ([04-modes.md](04-modes.md)) | Un barème pensé pour des courses de 2 à 4 voitures sur mobile |
| Limite de 400 rondes | Ajoutée | Sécurité du serveur |

## 2.16 Récapitulatif d'un tour

1. **Rapport** : monter d'un cran au plus, ou descendre (en payant). Le dé est lancé aussitôt.
2. **Ajuster** : Freins (−1 case par point), Boîte (+1 case, une fois), aspiration (+2), cartes ([03-ajouts.md](03-ajouts.md)).
3. **Case d'arrivée** : parmi celles proposées, avec leur coût.
4. **Conséquences** : arrêt de virage, sortie ratée, blocage, cases à risque, contacts, casse moteur, tour de circuit, arrivée.
5. **Stand** : si la voiture est sur son stand, s'arrêter ou non.
