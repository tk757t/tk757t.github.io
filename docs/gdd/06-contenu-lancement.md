# 6. Contenu du lancement et saisons

## 6.1 Contenu minimum du lancement

| Contenu | Lancement | Existe aujourd'hui | Reste à faire |
|---|---|---|---|
| Circuits originaux | **8** (3 faciles, 3 moyens, 2 difficiles ; 2 au moins avec pluie fréquente, 1 avec cases à risque nombreuses) | 6 circuits dessinés avec l'éditeur (de 1 à 3 tours, 46 à 55 cases par tour, environ 5 minutes par tour, `docs/circuits.md`) + 4 circuits de test générés (ovale, Petit anneau, Ovale du lac, Ovale des épingles, ces trois derniers pour la campagne), sans art | 8 tracés dessinés à la main, avec plateau illustré et miniature |
| Pièces | **36** (6 emplacements × 6) | 30 | 6 pièces « face maximale », révision de la progression des jauges ([03-ajouts.md](03-ajouts.md)) |
| Cosmétiques | **60** (peintures, numéros, casques, jantes, fumées, émotes, cadres) | 20 | 40, dont 8 du Pass de la saison 1 |
| Cartes tactiques | **20** | 0 | les 20 cartes de [03-ajouts.md](03-ajouts.md), main et énergie dans l'interface de course |
| Pilotes | **8** avec talent | 6 noms d'adversaires de campagne, sans talent | talents, portraits originaux |
| Réglages | curseur aéro / vitesse à 5 positions | — | crochet « face maximale » du moteur |
| Campagne | **30 niveaux** en 3 chapitres de 10, 90 étoiles | 3 niveaux | 27 niveaux, équilibrés par simulation |
| Quêtes | **3 quêtes du jour** tirées d'une liste de 24, **5 quêtes de la semaine** tirées de 12, **30 succès** permanents | 9 quêtes permanentes | quêtes renouvelées, tirage serveur |
| Ligues | 6 ligues, route des trophées de 40 paliers | — | tout |
| Coffres | 5 types (bronze, argent, or, légendaire, gratuit), cycle de 12 | paquets de 5 cartes, coffres de récompense de campagne | minuteurs longs, tirage serveur, garanties |
| Pass de saison | 40 paliers, voies gratuite et Premium | — | tout |
| Modes | campagne, course rapide, classé en direct, asynchrone, amical, partie locale | campagne, course rapide, partie locale | multijoueur (serveur), amis |
| Clubs | discussion, dons, coffre de club, courses amicales | — | tout (peut glisser à la saison 1, voir 6.3) |
| Rediffusions | 20 dernières courses, partage par lien | — (le journal d'actions et la graine existent) | stockage serveur, lecteur |
| Tutoriel | 5 premiers niveaux de campagne guidés | bulles d'aide partielles | scénario guidé |
| Langues | français, anglais | français | anglais ; prévoir allemand, espagnol, italien, portugais du Brésil à la saison 2 |
| Art et sons | 100 % originaux | aucun en production (jetons ronds, sons synthétisés) | voitures, portraits, plateaux, icônes, musique, sons |

**Critère de sortie** : `npm run verify` vert, aucune ressource de développement dans le build (`npm run check:origin`), chaque niveau de
campagne dans ses bornes d'équilibrage, le lancement doux (2 pays anglophones, 4 semaines) ayant tenu les cibles de rétention
de [01-vision.md](01-vision.md) à 80 % au moins.

## 6.2 Rythme des saisons

- Une saison = **28 jours** : nouveau Pass, réinitialisation partielle des trophées, rotation des circuits du classé
  (3 par semaine, tirés des circuits de la saison).
- Chaque saison apporte au minimum : 1 circuit, 2 cartes, 1 pilote, 3 pièces, 15 cosmétiques, 10 niveaux de campagne une
  saison sur deux, 1 règle d'événement.
- Équilibrage des cartes et des plafonds par configuration à distance, sans mise à jour de l'application, au début de chaque
  saison (et en urgence si un taux de victoire dépasse ses bornes).

## 6.3 Feuille de route des saisons 1 à 3

### Saison 1 : « Premier tour » (lancement mondial)

- Contenu du lancement (6.1).
- Événements de la saison : « Pluie battante » (pluie garantie, pneus pluie conseillés), « Sprint » (courses d'un tour sur le
  circuit le plus court).
- Si les clubs ne sont pas prêts au lancement, ils arrivent à mi-saison (semaine 3).
- Mesures prioritaires : durée réelle des courses, taux d'abandon en direct, taux de réponse en asynchrone.

### Saison 2 : « Mousson »

- **Météo** au premier plan : 2 circuits très pluvieux, cartes « Pneus intermédiaires » (une gomme mixte pour un arrêt :
  facteur 1 partout, pas de bonus au dé) et « Parapluie » (la prochaine sortie ratée sous la pluie ne coûte pas le supplément).
- Pilote : « Inès Averse » passe en vitrine ; nouveau pilote « Yanis Brouillard » (voit le temps visé de la prochaine ronde).
- **Championnat des clubs** et coffre de club amélioré.
- Langues : allemand, espagnol, italien, portugais du Brésil.
- Chapitre 4 de la campagne (niveaux 31 à 40).

### Saison 3 : « Ville de nuit »

- Circuits urbains : nombreuses cases à risque, lignes droites courtes, une voie des stands étroite.
- Nouvelle règle d'événement **« Voiture de sécurité »** : sur un abandon, une ronde où personne ne peut dépasser le 4e rapport.
  Testée d'abord en événement, intégrée aux règles si les joueurs l'adoptent.
- Mode **2 contre 2** en direct (classement par équipe : somme des places), pour jouer avec un ami.
- Cartes : « Feux de détresse » (réaction : une voiture qui vous bloque ce tour ne vous coûte que 1 Frein), « Ravitaillement
  de nuit ».
- Spectateur : regarder en direct la course d'un membre de son club.
