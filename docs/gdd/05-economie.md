# 5. Économie

Principe : **on paie pour du temps et du style, jamais pour gagner une course classée.** Toutes les quantités ci-dessous
sont des valeurs de départ, servies par la configuration à distance ([07-technique.md](07-technique.md)) et réglées après le
lancement doux.

État du code : le prototype a déjà l'or, les gemmes, les fragments, l'XP, 4 emplacements de coffres à quatre qualités (30 min à 12 h),
une boutique et des quêtes (`src/data/shop.ts`, `src/data/quests.ts`, `src/data/profile`). Le tableau 5.9 liste ce qui change.

## 5.1 Ressources

| Ressource | Rôle | Obtenue surtout par | Dépensée surtout pour |
|---|---|---|---|
| **Or** (monnaie douce) | améliorer, acheter au quotidien | courses, coffres, quêtes | améliorations de pièces, boutique du jour |
| **Gemmes** (monnaie forte) | gagner du temps, se faire plaisir | achats, quêtes, étoiles, Pass | minuteurs de coffres, cosmétiques, or |
| Fragments | matière d'amélioration (pas une monnaie : non achetable avec de l'argent) | coffres, doublons, dons de club | améliorations de pièces |
| XP | niveau du joueur (affichage, déblocages) | courses, quêtes | — |

### XP de course et niveau du compte

XP d'une course terminée = barème de la place × (1 + 10 % si aucune pièce n'est cassée) × (0,5 si au moins un adversaire est
une IA), arrondie, **au moins 1** pour qui termine ; **0 en cas d'abandon**. Le barème est dégressif : 100 / 70 / 50 / 35 à
4 joueurs ; pour 1 à 8 joueurs la valeur est interpolée linéairement entre ces quatre points selon la place relative
(première = 100, dernière = 35). Le calcul est dans `src/data/xp.ts` ; il devra migrer côté serveur quand celui-ci
accordera les récompenses.

| Place (4 joueurs) | XP de base | Course propre (+10 %) | Contre IA (× 0,5) | Propre et contre IA |
|---|---|---|---|---|
| 1 | 100 | 110 | 50 | 55 |
| 2 | 70 | 77 | 35 | 39 |
| 3 | 50 | 55 | 25 | 28 |
| 4 | 35 | 39 | 18 | 19 |

| Joueurs | XP de base, de la 1re à la dernière place |
|---|---|
| 2 | 100, 35 |
| 3 | 100, 60, 35 |
| 5 | 100, 78, 60, 46, 35 |
| 8 | 100, 87, 74, 64, 56, 48, 41, 35 |

Niveau du compte : XP cumulée pour atteindre le niveau N = 100 × (N − 1)^1,4, arrondie (0 pour le niveau 1).

| Niveau | 2 | 3 | 4 | 5 | 10 | 20 | 50 |
|---|---|---|---|---|---|---|---|
| XP cumulée | 100 | 264 | 466 | 696 | 2 167 | 6 170 | 23 242 |

Les quêtes et les récompenses de campagne ajoutent leur XP fixe à celle de la course.

## 5.2 Coffres et minuteurs

### Coffres à quatre qualités (en jeu, `src/data/chests.ts`)

Quatre emplacements. Chaque coffre a une **qualité fixée à l'obtention** (Commun, Rare, Épique, Légendaire) qui donne son
minuteur et son contenu. Les gemmes n'apparaissent **qu'à partir du coffre Rare**. Tous les minuteurs tournent en parallèle.

<!-- gdd:chests -->

| Qualité | Minuteur | Cartes | Or | Gemmes | Rareté de chaque carte (commune / rare / épique / légendaire) |
|---|---|---|---|---|---|
| Commun | 30 min | 3 | 20 à 40 | 0 | 85 % / 13 % / 2 % / 0 % |
| Rare | 3 h | 4 | 50 à 90 | 1 à 3 | 60 % / 32 % / 7 % / 1 % |
| Épique | 8 h | 5 | 100 à 180 | 3 à 6 | 40 % / 40 % / 17 % / 3 % |
| Légendaire | 12 h | 6 | 250 à 400 | 6 à 12 | 20 % / 40 % / 30 % / 10 % |

Une carte déjà possédée devient des fragments. Ces taux sont affichés en jeu dans la fenêtre « Contenu des coffres ».

**Obtention.** Une course terminée donne un coffre, la victoire un second ; l'abandon n'en donne pas. La qualité est tirée
à l'obtention selon la place (interpolation entre la 1re place et la dernière) :

| Place | Commun | Rare | Épique | Légendaire |
|---|---|---|---|---|
| 1re | 30 % | 40 % | 22 % | 8 % |
| Dernière | 85 % | 13 % | 2 % | 0 % |

Garantie de victoire : tous les 5 victoires, le premier coffre gagné est au moins Rare.

**Pitié** : si 29 coffres ouverts de suite ne contiennent aucune carte légendaire, le 30e en contient une (la jauge est
dans le profil et affichée sur l'écran Course). Le tirage du contenu utilise la graine sauvegardée du profil.

**Ouvrir plus vite** : 1 gemme par tranche de 10 minutes restantes, au moins 1 (Commun neuf : 3 ; Rare : 18 ; Épique : 48 ;
Légendaire : 72). Cela n'achète que du temps.

Ces calculs sont faits côté client pour l'instant ; ils devront migrer côté serveur avec le tirage du contenu.

### Cible à long terme (serveur)

- **4 emplacements**. Une victoire (ou une place dans la moitié haute d'une course à 4) en classé, en asynchrone ou en
  championnat rapporte un coffre si un emplacement est libre ; sinon, rien (le jeu le dit avant la course).
- **Un seul coffre se déverrouille à la fois** (on lance le minuteur de son choix). *Changement : le prototype déverrouille
  les 4 en parallèle en 3 minutes.*
- Ordre des coffres : un **cycle fixe de 12** (8 bronze, 3 argent, 1 or) dont la position est propre à chaque joueur.
- **Le contenu est tiré par le serveur au moment où le coffre est gagné**, pas à l'ouverture. Payer pour ouvrir plus vite
  n'achète donc que du temps, jamais une chance (important pour 5.6).
- **Coffre gratuit** : un toutes les 12 h, deux en réserve au plus, sans minuteur.

| Coffre | Minuteur | Or | Fragments | Pièces | Rareté de chaque pièce |
|---|---|---|---|---|---|
| Bronze | 3 h | 50 – 70 | 20 | 1 | 75 % commune, 20 % rare, 4,5 % épique, 0,5 % légendaire |
| Argent | 8 h | 120 – 160 | 50 | 2, dont 1 rare au moins | 55 % / 33 % / 10 % / 2 % |
| Or | 12 h | 300 – 400 | 120 | 3, dont 1 rare au moins | 35 % / 45 % / 16 % / 4 % |
| Légendaire (route des trophées, Pass) | 24 h | 1 000 | 300 | 3, dont 1 légendaire garantie | 0 % / 40 % / 40 % / 20 % pour les deux autres |
| Gratuit | aucun | 20 | 8 | 0 | — |

- Une pièce déjà possédée devient des fragments : commune 25, rare 60, épique 150, légendaire 350 (le prototype donne 5 / 12 /
  30 / 70, à multiplier par 5 avec les nouveaux coûts).
- **Garantie** : une pièce épique au plus tard tous les 15 coffres argent ou or, une légendaire au plus tard tous les 60 ; le
  compteur est visible.
- **Ouvrir plus vite** : 1 gemme par tranche de 10 minutes restantes (un coffre bronze neuf : 18 gemmes ; or : 72).

## 5.3 Améliorer une pièce

| Rareté | Fragments du niveau L au niveau L + 1 | Or (4 par fragment) | Total du niveau 1 au niveau 5 |
|---|---|---|---|
| Commune | 80 × L | 320 × L | 800 fragments, 3 200 or |
| Rare | 160 × L | 640 × L | 1 600 fragments, 6 400 or |
| Épique | 320 × L | 1 280 × L | 3 200 fragments, 12 800 or |
| Légendaire | 640 × L | 2 560 × L | 6 400 fragments, 25 600 or |

*Changement : le prototype demande 10 / 20 / 40 / 80 × L fragments et pas d'or ; un joueur régulier aurait tout au maximum en
deux semaines.*

## 5.4 Pass de saison

> **Décision du 2026-10-21 :** le jeu est gratuit, avec un passe gratuit de 2 semaines et 30 paliers en attendant les paiements : voir [09-passe.md](09-passe.md). Le tableau ci-dessous reste la référence de la voie premium.

Saison de **28 jours**, 40 paliers ; on gagne des points de Pass en jouant (10 par course, 30 par victoire, quêtes).

| Voie | Prix | Contenu sur la saison |
|---|---|---|
| Gratuite | — | 1 500 or, 400 fragments, 60 gemmes, 2 coffres argent, 1 cosmétique rare |
| Premium | 4,99 € | + 4 000 or, 1 200 fragments, 250 gemmes, 2 coffres or, 1 coffre légendaire, 4 cosmétiques dont 1 légendaire de saison, 1 emplacement d'émote |
| Premium+ | 9,99 € | Premium + 10 paliers d'avance + une peinture animée exclusive |

- Le Pass ne contient **ni carte ni pilote exclusifs** : tout ce qui joue en course s'obtient aussi gratuitement.
- Pas de récompense de Pass au-delà des plafonds de ligue (les fragments servent, mais la voiture classée reste plafonnée).

## 5.5 Cosmétiques et prix indicatifs

### Cosmétiques

Peintures, numéros, casques (existent), plus au lancement : jantes, traînées de fumée, émotes, cadres de profil, bannières de
club, animations de victoire. Ils n'ont **aucun effet** en course.

| Rareté | Prix en gemmes | Exemple |
|---|---|---|
| Commune | 80 | Numéro 7 |
| Rare | 200 | Peinture Vert acide |
| Épique | 500 | Casque doré |
| Légendaire | 1 200 | Peinture Chrome liquide |

### Achats intégrés (prix de départ, paliers des magasins)

| Offre | Contenu | Prix |
|---|---|---|
| Poignée de gemmes | 80 gemmes | 0,99 € |
| Sac de gemmes | 500 gemmes | 4,99 € |
| Coffret de gemmes | 1 200 gemmes | 9,99 € |
| Malle de gemmes | 2 600 gemmes | 19,99 € |
| Coffre-fort | 7 000 gemmes | 49,99 € |
| Réserve d'usine | 15 000 gemmes | 99,99 € |
| Offre de bienvenue (une fois, 72 h) | 300 gemmes, 2 000 or, peinture rare | 1,99 € |
| Pass de saison | voir 5.4 | 4,99 € / 9,99 € |
| Offre de ligue (une fois par ligue atteinte) | 1 coffre or, 600 gemmes | 9,99 € |

Conversions en jeu : 60 gemmes → 1 000 or ; 300 gemmes → 5 500 or. Coffre or en boutique : 160 gemmes (5.6).

## 5.6 Règles anti « payer pour gagner »

1. **Plafonds de ligue** en classé ([03-ajouts.md](03-ajouts.md)) : au-delà, l'argent n'achète plus de puissance.
2. **Cartes et pilotes** : jamais vendus contre de l'argent ou des gemmes ; débloqués en jouant (ligues, campagne, coffres).
3. **Fragments** : jamais vendus directement contre de l'argent réel.
4. **Mise en relation** par trophées **et** par puissance plafonnée (écart de puissance limité à 10 % quand c'est possible).
5. **Pas de vente d'énergie, de relance ou de réparation en course.** Rien ne s'achète pendant une course.
6. **Écart mesuré** : à J30, un joueur qui paie le Pass et 5 € de gemmes a un niveau moyen de pièces de 4,2 contre 3,7 pour
   un joueur gratuit régulier (5.8) ; dans les ligues où le niveau plafond est 3 ou moins, l'écart en course est nul.
7. Suivi après lancement : taux de victoire classé des payeurs contre les non-payeurs à trophées égaux ; alerte au-delà de 52 %.

## 5.7 Coffres et loi : probabilités et pays à risque

### Affichage des probabilités

- Chaque coffre a un bouton « Contenu et chances » : le tableau 5.2 du coffre, le compteur de garantie et le nombre de pièces
  encore à découvrir par rareté. Obligatoire sur l'App Store et Google Play pour tout objet aléatoire acheté, affiché pour tous
  les coffres même gratuits.
- Les chances viennent de la même configuration que le tirage serveur : ce qui est affiché est ce qui est tiré (test automatique).
- Étiquette PEGI « Achats intégrés (inclut des éléments aléatoires) ».

### Pays à risque juridique

- **Belgique** : la Commission des jeux de hasard considère depuis 2018 les coffres payants comme des jeux de hasard interdits
  sans licence. **Dans ce pays : aucun coffre contre gemmes ou argent, aucune offre contenant un coffre, pas d'inscription
  payante aux championnats.** Restent : les coffres gagnés en jouant, l'ouverture accélérée (le contenu étant déjà tiré, 5.2),
  les achats directs (gemmes, cosmétiques, Pass sans coffre : ses coffres y sont remplacés par leur valeur moyenne en or et fragments).
- **Pays-Bas** : l'autorité des jeux a sanctionné des coffres payants revendables ; la plus haute juridiction administrative a
  annulé une amende en 2022, mais le Parlement a demandé une interdiction. **Même traitement que la Belgique par prudence.**
- Mécanisme : drapeau `paidChests` par pays dans la configuration à distance, pays déterminé par la vitrine du magasin
  (RevenueCat) puis l'adresse IP ; il ne change qu'au redémarrage.
- **À faire valider par un juriste** avant le lancement : ces deux pays, et le suivi d'autres pays (Allemagne : protection des
  mineurs ; Royaume-Uni ; Australie : classification des jeux à éléments aléatoires payants ; Chine : non visée).

## 5.8 Sources, puits et équilibrage sur 30 jours

### Sources et puits par ressource

| Ressource | Sources | Puits |
|---|---|---|
| Or | courses (classé : 1er 40, 2e 25, 3e 15, 4e 10, abandon 5 ; rapide : la moitié), coffres, coffre gratuit, quêtes du jour (3 × 50), Pass, campagne, dons de club, conversion de gemmes | améliorations (4 or par fragment), boutique du jour (fragments communs et rares contre or, cosmétiques communs), inscription aux événements |
| Gemmes | quêtes du jour (2 chacune), quêtes de la semaine, étoiles de campagne, route des trophées, Pass, fin de saison, achats | ouvrir les coffres plus vite, cosmétiques, conversion en or, coffre or en boutique (hors Belgique et Pays-Bas), seconde inscription au championnat |
| Fragments | coffres, doublons, Pass, dons de club, boutique du jour (contre or) | améliorations |
| XP | courses (20, +30 en cas de victoire), quêtes, campagne | — |

### Modèle

Modèle en valeurs moyennes (pas de hasard), jour par jour ; le joueur améliore ses pièces dès qu'il a les fragments **et** l'or,
en commençant par l'amélioration la moins chère ; voiture de 6 pièces (2 communes, 2 rares, 1 épique, 1 légendaire).
Le script est `scripts/economy-model.mjs` (`node scripts/economy-model.mjs`).

| Profil | Courses / jour | Coffres ouverts / jour | Coffres gratuits / jour | Quêtes (or / jour) | Gemmes gratuites / jour | Achats |
|---|---|---|---|---|---|---|
| Occasionnel gratuit | 5 | 1 | 1 | 100 | 4 | aucun |
| Régulier gratuit | 12 | 3,5 | 2 | 150 | 6 | aucun |
| Régulier payant | 12 | 3,5 + 1 accéléré (18 gemmes / jour) | 2 | 150 | 6 | Pass Premium + 500 gemmes au J1 (9,98 €) |

Or moyen par course : 20 ; coffre moyen du cycle : 104 or et 36 fragments. Les gemmes gratuites sont celles des quêtes et
des étoiles ; tous les profils reçoivent en plus la voie gratuite du Pass, répartie sur ses 28 jours (et la voie Premium pour
le profil payant).

### Résultats (cumuls)

| Profil | Jour | Or gagné | Or dépensé | Or en poche | Fragments gagnés | Niveau moyen des pièces | Pièces (C/C/R/R/É/L) | Gemmes gagnées | Gemmes dépensées | Coffres ouverts |
|---|---|---|---|---|---|---|---|---|---|---|
| Occasionnel | J1 | 378 | 0 | 578 | 58 | 1,0 | 1/1/1/1/1/1 | 6 | 0 | 2 |
| Occasionnel | J7 | 2 644 | 1 280 | 1 564 | 407 | 1,5 | 3/2/1/1/1/1 | 43 | 0 | 14 |
| Occasionnel | J14 | 5 288 | 3 200 | 2 288 | 814 | 2,0 | 3/3/2/2/1/1 | 86 | 0 | 28 |
| Occasionnel | J30 | 11 332 | 6 400 | 5 132 | 1 744 | 2,5 | 5/4/2/2/1/1 | 184 | 0 | 60 |
| Régulier | J1 | 848 | 320 | 728 | 156 | 1,2 | 2/1/1/1/1/1 | 8 | 0 | 6 |
| Régulier | J7 | 5 937 | 4 160 | 1 977 | 1 090 | 2,2 | 4/3/2/2/1/1 | 57 | 0 | 39 |
| Régulier | J14 | 11 874 | 7 680 | 4 394 | 2 180 | 2,7 | 5/5/2/2/1/1 | 114 | 0 | 77 |
| Régulier | J30 | 25 445 | 17 920 | 7 725 | 4 671 | 3,7 | 5/5/5/4/2/1 | 244 | 0 | 165 |
| Payant | J1 | 1 095 | 640 | 655 | 234 | 1,3 | 2/2/1/1/1/1 | 17 | 18 | 7 |
| Payant | J7 | 7 666 | 6 400 | 1 466 | 1 641 | 2,5 | 5/4/2/2/1/1 | 119 | 126 | 46 |
| Payant | J14 | 15 332 | 11 520 | 4 013 | 3 282 | 3,2 | 5/5/3/3/2/1 | 239 | 252 | 91 |
| Payant | J30 | 32 855 | 25 600 | 7 455 | 7 032 | 4,2 | 5/5/5/5/3/2 | 512 | 540 | 195 |

Lecture :

- **Les fragments limitent, l'or suit** : l'or en trop (5 000 à 7 700 à J30) est le puits de la boutique du jour et des
  cosmétiques ; s'il s'accumule au-delà de 10 000 chez les réguliers, baisser l'or des coffres plutôt que celui des courses.
- Un régulier gratuit atteint le **plafond de la Ligue Chicane (niveau 3)** sur ses pièces communes en une semaine et sur
  ses rares avant J30, où 4 de ses 6 pièces sont au niveau plafond de l'Épingle (4) : c'est l'objectif des plafonds.
- Les gemmes gratuites (environ 8 par jour) ouvrent un coffre bronze tous les deux jours, ou un cosmétique rare par mois.
- Les pièces épiques et légendaires restent un objectif de long terme (le niveau 5 légendaire demande 6 400 fragments).

## 5.9 Écarts avec le prototype

| Sujet | Prototype | GDD |
|---|---|---|
| Nom | « paquet » de 5 « cartes » | « coffre » contenant des pièces ; le mot « carte » est réservé aux cartes tactiques |
| Minuteur | 3 min, 4 en parallèle | 3 h à 24 h, un à la fois |
| Gain | 1 paquet par course, +1 en cas de victoire, dans tous les modes | 1 coffre par victoire en classé, asynchrone et championnat |
| Tirage | à l'ouverture, sur l'appareil | au gain, sur le serveur |
| Amélioration | fragments seuls | fragments + or |
| Accélération | 1 gemme par minute | 1 gemme par 10 minutes |
| Sauvegarde | `localStorage` | serveur (le local devient un cache) |
