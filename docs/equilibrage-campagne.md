# Équilibrage de la campagne

Généré par "npm run balance:campaign" (scripts/balance-campaign.ts). Contrôlé à chaque "npm test" par src/ai/campaignBalance.test.ts.

## Méthode

Chaque niveau est joué 200 fois avec les règles du jeu (moteur inchangé), la météo du niveau (soleil fixe, ou tirage du d20 avec les seuils du circuit)
et les adversaires de src/data/campaign/levels.ts. Le joueur est une **IA Moyen au volant de la voiture de départ** (aucune pièce, pneus durs).
Bornes visées : taux de victoire du joueur **entre 30 % et 90 %**, abandons du joueur **sous 25 %**. Seules les voitures des IA et la difficulté du niveau
se règlent, pas les règles. Deux séries de seeds, 1 à 200 et 1000 à 1199.

## Résultats finaux

Seeds 1 à 200 :

| Niveau | Circuit | Tours | Victoires | Abandons du joueur | Rang moyen | Manches | Étoiles 0 / 1 / 2 / 3 |
|---|---|---|---|---|---|---|---|
| 1. Débutant | anneau | 2 | 84,5 % | 15,5 % | 1,16 | 24 | 15,5 % / 0,0 % / 58,5 % / 26,0 % |
| 2. Challenger | lac | 3 | 40,0 % | 19,0 % | 1,91 | 50 | 19,0 % / 14,5 % / 65,5 % / 1,0 % |
| 3. Champion | epingles | 3 | 35,0 % | 24,5 % | 2,10 | 57 | 24,5 % / 8,0 % / 46,5 % / 21,0 % |

Seeds 1000 à 1199 :

| Niveau | Circuit | Tours | Victoires | Abandons du joueur | Rang moyen | Manches | Étoiles 0 / 1 / 2 / 3 |
|---|---|---|---|---|---|---|---|
| 1. Débutant | anneau | 2 | 82,5 % | 17,5 % | 1,18 | 24 | 17,5 % / 0,0 % / 57,5 % / 25,0 % |
| 2. Challenger | lac | 3 | 41,5 % | 20,0 % | 1,85 | 50 | 20,0 % / 10,0 % / 70,0 % / 0,0 % |
| 3. Champion | epingles | 3 | 35,0 % | 23,5 % | 2,07 | 56 | 23,5 % / 7,5 % / 49,0 % / 20,0 % |

Bornes respectées sur les deux séries : **oui**.

## Adversaires

- Niveau 1 Débutant :
  - IA easy, Léa Virage (Écurie Corail), pneus soft, sans pièce
- Niveau 2 Challenger :
  - IA medium, Hugo Turbo (Team Ardoise), pneus hard, brakes: brk-stock niv. 1
  - IA medium, Sami Gomme (Écurie Lagon), pneus hard, sans pièce
- Niveau 3 Champion :
  - IA hard, Max Asphalte (Écurie Volcan), pneus rain, sans pièce
  - IA medium, Zoé Chicane (Team Glacier), pneus rain, sans pièce
  - IA easy, Tom Piston (Écurie Prairie), pneus hard, wing: wng-flap niv. 1

## Ce qui a été réglé, dans l'ordre

La campagne tourne sur nos circuits de test (src/data/tracks/generators/circuits.ts), dessinés par le générateur d'ovales : seuls leur tracé
(longueur des lignes droites et des virages, arrêts requis, seuils de météo), le nombre de tours et les adversaires se règlent.

1. **Débutant** : l'IA Facile ne dépasse jamais le 3e rapport ; sur un ovale à longues lignes droites, le joueur gagnait 99 % des courses, même face
   à une Facile équipée de pièces. Le Petit anneau a des lignes droites courtes et de longs virages à 1 arrêt, et la Facile part en pneus tendres
   (+1 au maximum du dé) : environ 84 % de victoires.
2. **Challenger** : sur l'ovale de test (un virage à 3 arrêts), le joueur abandonnait dans plus de 25 % des courses. L'Ovale du lac garde deux virages
   à 2 arrêts et les averses (seuils 7/13), sans virage à 3 arrêts : environ 40 % de victoires, 20 % d'abandons.
3. **Champion** : face à un Difficile, un Moyen et un Facile, sur 3 tours, plus le circuit est simple plus le Difficile gagne, plus il est dur plus le joueur abandonne.
   Recherche systématique (longueur des lignes droites et des virages, ordre des arrêts) : l'Ovale des épingles (lignes droites de 18 cases, virages de 7, arrêts 2-3-2-3,
   pluie rare, seuils 3/10) est le seul tracé testé qui tient les deux bornes, avec le Difficile et le Moyen partis en pneus pluie (un pari sur la météo qui use
   leurs gommes au sec) : environ 35 % de victoires, 24 % d'abandons, au bord de la borne.

Les niveaux restent ordonnés par difficulté : le taux de victoire de l'IA Moyen baisse du Débutant au Champion.
