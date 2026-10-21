# 1. Vision

> Document de design de **4 Mules** (nom de travail). Le GDD (`docs/gdd/`) est la référence du jeu : règles, ajouts, modes,
> économie, contenu et technique. `docs/regles.md` reste la fiche du moteur (sections citées dans le code) et doit rester
> cohérente avec [02-regles.md](02-regles.md) ; `npm test` vérifie les constantes (`tools/check-gdd.ts`).

## Sommaire

1. [Vision](01-vision.md) : pitch, public, piliers, références
2. [Règles de course](02-regles.md) : le cœur du jeu, chiffré
3. [Ajouts](03-ajouts.md) : cartes tactiques, réglages, pièces, pilotes
4. [Modes](04-modes.md) : campagne, IA, multijoueur, ligues, clubs, rediffusions
5. [Économie](05-economie.md) : monnaies, coffres, Pass, achats, équilibrage sur 30 jours
6. [Contenu du lancement](06-contenu-lancement.md) et saisons 1 à 3
7. [Technique](07-technique.md) : architecture client / serveur, achats, analytique
8. [Boutique](08-boutique.md) : offres du jour, cadeau, pack de bienvenue
9. [Passe de saison](09-passe.md) : 30 paliers gratuits
10. [Stats des voitures](10-stats-voitures.md) : stats lisibles, niveaux, contreparties, familles, équilibrage

## Pitch

**Une course de voitures où l'on ne pilote pas avec les pouces, mais avec la tête.** À chaque tour, on choisit un rapport ;
chaque rapport lance son propre dé, du petit 1-2 de la première au 21-30 de la sixième. Trop vite dans un virage et les pneus
fondent ; trop prudent et les autres filent. Freins, boîte, moteur, carrosserie : la voiture s'use, et chaque point dépensé
est un point qui manquera au dernier tour.

Une course dure 5 minutes, se joue à une main dans le métro, contre l'IA, contre des amis à son rythme ou en direct. Autour
de la course : un garage à améliorer, un deck de cartes tactiques, des pilotes, des ligues, des saisons.

## Public

| Cible | Ce qu'elle cherche | Ce qu'on lui donne |
|---|---|---|
| **Principale** : joueurs mobiles de 16 à 40 ans, amateurs de jeux de stratégie courts (jeux de cartes compétitifs, tactiques au tour par tour) | Des décisions qui comptent, des parties brèves, une progression visible | Un choix de rapport à chaque tour, des courses de 5 min, un garage et des ligues |
| **Secondaire** : amateurs de sport automobile et de jeux de plateau | Le frisson du virage pris à la limite, la gestion de course (stands, pneus, météo) | Des règles fidèles à l'esprit des courses au dé, la pluie, les stands, l'aspiration |
| **Tertiaire** : familles et amis | Jouer ensemble sans être au même endroit, au même moment | Le multijoueur asynchrone (un tour par jour suffit) et le jeu à plusieurs sur un téléphone |

Classification visée : PEGI 7 / 12+ sur les magasins (pas de violence ; achats intégrés signalés). Pas de cible enfant
(pas de COPPA « directed to children »), mais une interface lisible dès 10 ans.

## Piliers

Chaque fonctionnalité doit servir au moins un pilier ; une idée qui n'en sert aucun est écartée.

### 1. Tactique au dé

Le hasard est montré, jamais caché : avant de lancer, le joueur voit la plage de son dé et les cases qu'il peut atteindre.
Le talent consiste à choisir le dé qui rend la plupart des résultats bons, puis à rattraper un mauvais jet avec les freins,
la boîte ou une carte. Une défaite doit toujours pouvoir s'expliquer par un choix.

- Aperçu des cases atteignables avant chaque jet (déjà en place).
- Toute perte de jauge est annoncée et expliquée (« −2 Pneus : sortie du virage avec 1 arrêt manquant »).
- Pas d'effet aléatoire caché : les chances (contacts, moteur, météo, coffres) sont affichées.

### 2. Gestion du risque

Six jauges (Pneus, Freins, Boîte, Carrosserie, Moteur, Tenue de route) sont six budgets. Rouler vite coûte, freiner coûte,
rétrograder coûte. Une jauge sous zéro, c'est l'abandon. Le joueur arbitre sans cesse entre gagner des cases maintenant et
garder de quoi finir.

- Une jauge rouge clignote avant de casser ; le coût de chaque destination est affiché avant de la choisir.
- Les stands et la météo transforment la course en problème de stratégie (quand s'arrêter, quelle gomme).

### 3. Parties courtes sur mobile

Une course classée dure **5 minutes environ** (1 tour, 2 à 4 voitures, environ 12 rondes). Tout se joue au pouce, en portrait,
à une main. Une partie peut être quittée et reprise : l'état de course est sur le serveur.

- Écrans en portrait, 390 px de large au minimum, zones de toucher de 44 px au moins.
- Le multijoueur asynchrone permet de jouer une course sur une journée, un tour à la fois.

### 4. Progression

On revient chaque jour parce qu'on avance : trophées et ligues, pièces à améliorer, cartes à débloquer, pilotes à recruter,
étoiles de campagne, quêtes, Pass de saison. La progression ne doit jamais rendre une course gagnée d'avance : en classé, la
puissance des pièces est plafonnée par ligue ([03-ajouts.md](03-ajouts.md)).

## Références d'inspiration

| Référence | Ce qu'on lui emprunte | Ce qu'on n'en prend pas |
|---|---|---|
| **Clash Royale** (méta) | Deck de 8 cartes et main tournante, ressource qui se recharge (élixir → notre énergie), trophées et ligues, coffres à minuteur dans 4 emplacements, clubs, Pass de saison, défis et championnats | Le niveau de carte qui écrase l'adversaire ; la course aux dépenses pour monter en arène |
| **Clash Royale** (interface) | Onglets en bas, swipables, avec le bouton « Course » au centre ; cadres de rareté ; animation d'ouverture de coffre carte par carte ; barre du haut avec monnaies et niveau | — |
| Jeux de course au dé sur plateau (famille de jeux, sans en reprendre aucun) | Un dé par rapport, virages à arrêts, usure par jauges, stands | Plateaux, noms, illustrations, textes |
| Tactiques au tour par tour sur mobile | Aperçu clair des coups possibles, annulation avant validation | — |

## Ce que le jeu n'est pas

- Pas un jeu d'adresse : aucune action en temps réel hors du minuteur de tour en direct.
- Pas un jeu « payer pour gagner » : les achats accélèrent et décorent ; en classé, les plafonds de ligue égalisent les voitures ([05-economie.md](05-economie.md)).
- Pas une simulation : une seule règle par phénomène, expliquée en une phrase.

## Indicateurs de réussite (cibles du lancement mondial)

| Indicateur | Cible |
|---|---|
| Rétention J1 / J7 / J30 | 40 % / 15 % / 6 % |
| Durée médiane d'une course classée | 4 à 6 minutes |
| Courses par joueur actif et par jour | 6 |
| Part de joueurs payants (30 jours) | 2,5 % |
| Revenu moyen par utilisateur actif quotidien | 0,08 € |
| Taux d'abandon en cours de course en direct | < 8 % |
