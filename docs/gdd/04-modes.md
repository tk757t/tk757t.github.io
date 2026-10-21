# 4. Modes de jeu

| Mode | Joueurs | Durée | Plafonds de ligue | Trophées | Coffres | Hors ligne |
|---|---|---|---|---|---|---|
| Campagne | 1 contre 1 à 3 IA | 5 à 15 min | non | non | coffre de récompense au premier passage | oui |
| Course rapide | 1 contre 1 à 4 IA | au choix | non | non | non (or et quêtes) | oui |
| Classé en direct | 2 à 4 | 4 à 6 min | oui | oui | oui | non |
| Asynchrone | 2 à 4 | 1 à 3 jours | oui | non (classement séparé) | oui | non |
| Amical (direct ou asynchrone) | 2 à 4, sur invitation | au choix | au choix | non | non | non |
| Championnat saisonnier | 4 | 5 manches | oui | points de championnat | oui | non |
| Partie locale (un téléphone) | 2 à 4 humains | au choix | non | non | non | oui |

Les pièces, cartes, réglages et pilotes ([03-ajouts.md](03-ajouts.md)) sont disponibles dans tous les modes.

## 4.1 Campagne

Le fil rouge en solo et le **tutoriel déguisé**. Existe aujourd'hui avec 3 niveaux (`src/data/campaign`, équilibrage dans
`docs/equilibrage-campagne.md`).

- **Chapitres** de 10 niveaux, chacun sur un circuit, avec météo, nombre de tours et adversaires fixés (IA Facile, Moyen ou
  Difficile avec pilote, pièces et gomme).
- **3 étoiles par niveau** : terminer ; finir dans les N premiers ; gagner avec une condition (sans perdre de Pneus, sans
  qu'une jauge tombe à 0, en dépassant dans un virage…). Chaque nouvelle étoile rapporte des gemmes.
- **Premier passage** : or, gemmes, XP et un coffre (commun, rare ou épique) avec parfois une pièce garantie. Rejouer un niveau
  gagné rapporte un quart de l'or.
- Chaque niveau enseigne une règle : niveau 1 les rapports, 2 les virages à 2 arrêts, 3 la pluie, 4 les stands, 5 l'aspiration,
  6 les cartes, 7 les réglages, etc. Une bulle d'aide apparaît la première fois que la règle sert.
- Équilibrage : chaque niveau est joué 200 fois par une IA Moyen avec la voiture attendue à ce stade ; bornes visées 30 % à
  90 % de victoires, moins de 25 % d'abandons (méthode actuelle, `npm run balance:campaign`).
- Le classé se débloque au niveau 5 de la campagne (environ 30 minutes de jeu).

## 4.2 Course rapide contre l'IA

- Circuit, nombre de tours (1 à 3), météo (aléatoire ou fixée), 1 à 4 IA et leur niveau.
- Gains : **50 % de l'or d'une course classée**, progression des quêtes, pas de trophée, pas de coffre (pour ne pas cultiver
  les coffres contre une IA facile).
- Jouable hors ligne. Sert aussi à essayer un deck ou un réglage.

## 4.3 Multijoueur en direct (classé)

- **Mise en relation** par trophées (écart initial ±100, élargi de 50 toutes les 5 s, 20 s au plus) ; 2 à 4 joueurs, complétés
  par des IA nommées comme telles si l'attente dépasse 20 s (en Ligue Paddock seulement).
- **Format** : 1 tour de circuit, météo aléatoire, circuit tiré parmi les 3 circuits de la saison (rotation hebdomadaire).
- **Grille** : inverse des trophées (le moins classé en pole), pour compenser.
- **Minuteur par tour** : 15 s pour choisir son rapport, 15 s pour ajuster et choisir sa case, plus une **réserve de 20 s**
  par course qui se consomme quand on dépasse. À la fin du temps : l'IA joue ce tour à sa place (choix prudent).
  Deux tours de suite au minuteur : **l'IA reprend la voiture** jusqu'au retour du joueur ([07-technique.md](07-technique.md)).
- On voit en direct les tours des autres (rapport choisi, dé, déplacement), accélérés à 2× si on le souhaite.
- **Émotes** prédéfinies (8 par joueur, cosmétiques) ; pas de discussion libre en course.

## 4.4 Multijoueur asynchrone

Pour jouer avec des amis ou des inconnus sans être disponible en même temps.

- 2 à 4 joueurs ; **1 tour de circuit** (les courses de 2 ou 3 tours seulement entre amis).
- **24 heures pour jouer son tour.** Passé ce délai, l'IA joue le tour (choix prudent) ; après 3 tours joués par l'IA, elle
  garde la voiture jusqu'à la fin, le joueur peut reprendre la main à tout moment.
- **Notifications** : « C'est à vous » (dès que c'est son tour), rappel à 12 h et à 2 h de l'échéance, « Course terminée ».
  Regroupées : au plus une notification par heure et par course, aucune entre 22 h et 8 h (heure locale) sauf échéance.
- Jusqu'à **10 courses asynchrones en parallèle** ; un écran liste celles où c'est à vous.
- **Pré-réglage** facultatif : « en ligne droite, monter d'un rapport et aller le plus loin possible sans coût » ; si le tour ne
  demande aucune décision risquée (aucune destination coûteuse, pas de virage atteignable), il se joue tout seul. C'est ce qui
  ramène une course de 12 rondes à quelques décisions par jour.
- Récompenses : comme le classé, mais avec un **classement asynchrone séparé** (pas de trophées), pour qu'un joueur lent ne
  bloque pas sa progression.

## 4.5 Ligues et trophées

| Ligue | Trophées | Débloque |
|---|---|---|
| Paddock | 0 – 399 | classé, 8 cartes de départ |
| Bitume | 400 – 999 | cartes 9 à 11, pilote Sami Gomme, clubs |
| Chicane | 1 000 – 1 799 | cartes 12 à 14, pilote Zoé Chicane, championnats |
| Épingle | 1 800 – 2 799 | cartes 15 à 17, pilote Inès Averse |
| Turbo | 2 800 – 3 999 | cartes 18 à 20 |
| Légende | 4 000 et plus | classement mondial, cosmétiques de saison |

Trophées par course selon la place (abandon = dernière place) :

| Voitures | 1er | 2e | 3e | 4e |
|---|---|---|---|---|
| 2 | +30 | −20 | | |
| 3 | +35 | +5 | −20 | |
| 4 | +40 | +15 | −5 | −20 |

- On ne redescend jamais sous le seuil d'une ligue atteinte (paliers protégés), sauf en Légende.
- **Règles réalisées** (`src/data/ranked.ts`, testées) : la ligue d'un nombre de trophées, les trophées par place (abandon = dernière place),
  le plancher protégé, la fin de saison, la fenêtre de mise en relation, l'ordre de la grille. Deux précisions que le texte ci-dessus ne donnait pas :
  - **Le plancher suit le meilleur total de la saison** (le « pic »), pas le total du moment : à 1 005 trophées après être monté à 1 010, on ne
    descend pas sous 1 000.
  - **Légende** : on peut en sortir, mais **pas redescendre sous le seuil de Turbo** (2 800).
  - À la fin de saison le pic repart du total ramené (4 000 + la moitié de l'excédent).
- **Route des trophées** : 40 paliers de récompenses (coffres, or, cartes, pilotes, cosmétiques), réclamés une seule fois.
- **Fin de saison** (toutes les 4 semaines) : au-delà de 4 000, les trophées sont ramenés à 4 000 + la moitié de l'excédent ;
  récompense de fin de saison selon le meilleur palier atteint.

## 4.6 Championnats saisonniers

- Un championnat par semaine, ouvert à partir de la Ligue Chicane, inscription gratuite (une par semaine) ou une seconde
  inscription pour 100 gemmes (désactivée dans les pays où les coffres payants le sont, [05-economie.md](05-economie.md)).
- **4 joueurs, 5 manches** en direct ou en asynchrone (au choix à l'inscription), sur 5 circuits imposés, avec des règles du
  moment (« pluie garantie », « pas de stand », « pneus tendres obligatoires », « 2 tours »).
- Points par manche : 10 / 6 / 3 / 1 ; à égalité, la meilleure place à la dernière manche.
- Récompenses selon le classement final (coffre or au vainqueur) et points de saison du club.

## 4.7 Clubs

- 30 membres au plus ; ouvert, sur demande ou fermé ; chef, adjoints, membres.
- **Discussion** du club (messages filtrés, signalement), **courses amicales** entre membres en direct ou en asynchrone.
- **Dons de fragments** : un membre demande des fragments d'une rareté (une demande toutes les 8 h), les autres donnent
  (communes et rares seulement) ; chaque don rapporte de l'or et de l'XP au donneur.
- **Coffre de club** hebdomadaire : rempli par les victoires classées des membres, ouvert le lundi par tous les membres.
- **Championnat des clubs** (saison 2) : la somme des points de championnat des membres.

## 4.8 Rediffusions

- Toute course est rejouable à l'identique à partir de sa **graine et de son journal d'actions** ([07-technique.md](07-technique.md)).
- Le joueur garde ses **20 dernières courses** ; il peut en épingler 5.
- Lecture à 1×, 2× ou 4×, tour par tour, avec les jauges de chaque voiture et les dés affichés.
- **Partage** par lien (ouvre la rediffusion dans le jeu, ou dans une page web sans compte).
- Onglet « Courses du moment » : les rediffusions des 100 meilleurs joueurs de la saison.
- La rediffusion d'une course en cours n'est jamais disponible (la graine reste secrète jusqu'à la fin).

## 4.9 Partie locale

Le mode actuel « plusieurs joueurs sur un téléphone » (écran de passage entre joueurs) reste disponible dans la course rapide,
sans récompense.

## 4.10 Chat (réalisé)

Un **canal général** ouvert depuis le bouton 💬 de la barre du haut, réservé aux comptes qui ont un pseudo. Pas de messages privés pour l'instant
(le public est probablement mineur : modération d'abord). Les règles sont **imposées par le serveur** (migration `20261022100000_chat.sql`) ; le
navigateur ne lit ni n'écrit les tables directement.

| Règle | Valeur |
|---|---|
| Longueur | 1 à 200 caractères, espaces réduits |
| Débit | 1 message par seconde, 10 par 30 secondes |
| Doublons | le même message est refusé pendant 60 secondes |
| Liens | refusés (adresses web et noms de domaine courants) |
| Filtre de mots | insultes et mots haineux refusés, argot et accents compris (« c0nnard ») ; liste modifiable sans redéploiement |
| Pseudo | imposé par le serveur (celui du compte) |
| Compte suspendu ou réduit au silence | écriture refusée |
| Signalement | 4 motifs (insulte, spam, harcèlement, autre) ; **3 joueurs différents** masquent le message en attendant la modération ; 10 signalements par heure au plus |
| Blocage | chacun masque les messages des joueurs qu'il bloque ; liste et déblocage dans la fenêtre du chat |
| Conservation | les messages de plus de 30 jours sont supprimés ; supprimer son compte supprime ses messages |
| Affichage | **texte seulement** (jamais du balisage) : un message qui ressemble à du code reste du texte |

La lecture se fait par interrogation toutes les 3 secondes, uniquement fenêtre ouverte et page visible. La modération (silence, masquage) passe par des
fonctions réservées au service, jamais au navigateur. Reste à faire : écran d'administration (étape 10), messages privés et amis (plus tard).

## 4.11 Classement de la saison (réalisé)

Le bouton **🏆** de la barre du haut, à droite des gemmes (comptes avec pseudo), ouvre le classement des trophées de la saison classée en cours : les
50 meilleurs (rang, pseudo, ligue, trophées, victoires et courses), votre place et le nombre de jours avant la fin de saison. À égalité de trophées, le
même rang. Ne figurent que les joueurs qui ont **un pseudo**, ne sont **pas suspendus** et ont joué **au moins une course classée dans la saison** ; les
trophées d'une saison passée ne comptent plus tant que le joueur n'a pas rejoué. La **ligue** de chaque auteur s'affiche aussi dans le chat, et votre rang
en haut de la fenêtre du chat. Lecture par des fonctions serveur (`leaderboard_top`, `leaderboard_me`, migration `20261022120000_leaderboard.sql`) ; la
saison est calculée comme `rankedSeasonOf` (`src/data/ranked.ts`, début le lundi 19 octobre 2026, 4 semaines).

## 4.12 Le rang montré au joueur (réalisé)

À la fin d'une course classée, l'écran de classement de la course affiche les **trophées gagnés ou perdus** (avec la mention « palier protégé » quand le
plancher de la ligue retient une perte), le total, la **ligue**, une **montée ou descente de ligue** le cas échéant, et la progression vers la ligue
suivante. Le profil montre la **ligue** et les **trophées** (comptes avec pseudo) ; les trophées d'une saison passée y sont déjà ramenés par la fin de
saison (`currentRanked`). Le serveur fournit le résultat (`finish_race` → `ranked`) : l'écran n'invente rien. En développement, `?ranked=1` rend la
prochaine course classée (un tour) pour essayer ces écrans sans la mise en relation (4d).

## 4.13 Mise en relation des courses classées (réalisé, SQL à éprouver)

Le bouton **🏆 Course classée** (onglet Course, comptes avec pseudo) ouvre la file d'attente : le joueur est placé dans la file du serveur
(`queue_join`, trophées plafonnés à ce que le serveur connaît), puis la relève toutes les 2 s (`queue_poll`). Le serveur forme les groupes de 2 à 4 joueurs
dont l'écart de trophées tient dans la fenêtre (±100, +50 toutes les 5 s, 20 s au plus), à partir de 5 s d'attente (tout de suite à 4) ; après 20 s, un groupe de
la ligue Paddock est complété par des IA jusqu'à 4 voitures, les autres ligues attendent. Il donne un code de salon et désigne l'hôte (le plus ancien dans la
file). Le salon est celui des parties entre amis (canal temps réel) : circuit de la semaine (`rankedTrack`), 1 tour, météo aléatoire, **grille inversée**
(le moins de trophées en pole), départ automatique. Un invité que l'hôte n'a pas encore listé redit bonjour toutes les 3 s. Chaque joueur obtient un jeton
classé du serveur ; « Rejouer » relance la recherche. Migration : `20261022140000_ranked_queue.sql` (appliquée en production à la main ; ses fonctions restent à
éprouver sur de faux joueurs en transactions annulées).

## 4.14 L'onglet Course : trois façons de jouer (réalisé)

- **COURSE !** (gros bouton) lance la mise en relation **classée** (§ 4.13). Sans compte avec pseudo, un message l'explique.
- **Course non classée** : le joueur rejoint la salle ouverte qui a encore de la place, ou en crée une (il en est l'hôte). Les joueurs suivants la remplissent
  jusqu'à 4, puis le suivant en crée une nouvelle (une salle reste ouverte 40 s). La course part quand la salle est pleine, ou après 20 s avec des IA pour les
  places libres ; l’hôte ajoute ou enlève des IA (− et +, dans la limite des places libres) et peut démarrer quand il veut ; le circuit et les tours sont ceux de l’hôte (réglage de « Course perso »). Rien n'est gagné ni perdu. Serveur : `open_join` et
  `open_close` (migration `20261022150000_open_rooms.sql`, tables `open_rooms`).
- **Course perso** : la fenêtre de réglage de course (joueurs humains ou IA, circuit, tours, équipement) pour jouer en local ou contre des IA, hors ligne.
- Un petit bouton **Jouer avec des amis** garde les salons à code (§ 4.4 : code ou lien à envoyer).

## 4.15 Journal de course (réalisé)

Le bouton **📋** de la barre de course (et « Journal de la course » dans l'écran de classement de fin) ouvre le journal : ce qui s'est passé, manche par
manche, depuis les événements du moteur (`src/app/raceJournal.ts`, sans écran). Chaque ligne a une icône, la voiture concernée (les vôtres sont marquées) et son
texte : dé et cases gagnées, rapport changé, déplacement (avec les cases manquantes), **dépassement** (une voiture qui était derrière une autre et se retrouve devant
après son déplacement ; les voitures sorties ne comptent pas), incidents (contact, case barrée, jet raté, mur, panne, abandon), usure, virages et arrêts gratuits,
arrêts aux stands, tours et arrivée, météo (seulement quand elle change). Cinq filtres : **Tout, Moi, Dépassements, Incidents** (avec l'usure), **Arrêts** (stands et
virages). La fenêtre suit la course en direct, sauf si on lit plus haut ; en ligne, les manches rattrapées au retour d'un joueur sont écrites aussi. Le journal garde les
3 000 dernières lignes.
