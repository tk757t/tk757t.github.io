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
