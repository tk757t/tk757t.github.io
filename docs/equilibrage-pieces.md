# Équilibrage des pièces

Généré par "npm run balance:parts" (scripts/balance-parts.ts). Contrôlé à chaque "npm test" par src/ai/partsBalance.test.ts.

## Méthode

Une voiture équipée d'une seule pièce (niveau 1, 3 ou 5) affronte la voiture de série, toutes deux pilotées par l'IA Moyen, en duel de 2 tours
avec météo variable, sur 3 circuits (anneau, lac, epingles), 150 graines par circuit, chaque graine jouée deux fois avec les places échangées :
900 duels par pièce et par niveau. Un double abandon compte pour moitié. Les garde-fous sont ceux du chapitre 10 du document
de design (§ 10.8), lus avec une marge de 4 points pour le hasard de l'échantillon.

| Garde-fou | Seuil (avec la marge) |
|---|---|
| Aucune pièce n'est un piège | jamais sous 44 % |
| Aucune pièce n'écrase | jamais au-dessus de 66 % |
| Série de 5 pièces d'une famille, niveau 5 | au plus 74 % |

Le duel ne voit que ce que l'IA sait utiliser (cases de dé, relances, jauges) : les pièces qui protègent (arrêts gratuits, remises) pèsent
peu face à une IA prudente. La hiérarchie des raretés se contrôle donc par la **Puissance** de la fiche (src/data/parts/stats.ts, test
src/data/parts/rarity.test.ts), pas par le duel.

## Pièces

| Pièce | Rareté | Famille | Niveau 1 | Niveau 3 | Niveau 5 | Garde-fous |
|---|---|---|---|---|---|---|
| Bloc de série renforcé | Commune | Endurance | 50,0 % | 50,0 % | 50,0 % | ok |
| Radiateur surdimensionné | Commune | Précision | 50,0 % | 50,0 % | 50,0 % | ok |
| Turbo calibré | Rare | Vitesse | 50,0 % | 50,0 % | 50,0 % | ok |
| V8 Sport | Épique | Vitesse | 49,6 % | 49,6 % | 49,6 % | ok |
| Hybride prototype | Légendaire | Vitesse | 49,6 % | 49,6 % | 49,6 % | ok |
| Carter renforcé | Commune | Endurance | 53,1 % | 53,1 % | 53,1 % | ok |
| Huile racing | Commune | Vitesse | 53,1 % | 53,1 % | 53,1 % | ok |
| Embrayage souple | Rare | Précision | 52,9 % | 53,1 % | 53,1 % | ok |
| Séquentielle | Épique | Précision | 53,1 % | 53,1 % | 53,1 % | ok |
| Double embrayage | Légendaire | Précision | 53,0 % | 53,0 % | 53,0 % | ok |
| Plaquettes durcies | Commune | Endurance | 50,0 % | 50,0 % | 50,0 % | ok |
| Disques ventilés | Commune | Endurance | 50,0 % | 50,0 % | 50,0 % | ok |
| ABS de course | Rare | Précision | 51,0 % | 50,9 % | 50,9 % | ok |
| Carbone-céramique | Épique | Précision | 50,1 % | 50,1 % | 50,1 % | ok |
| Freinage régénératif | Légendaire | Précision | 51,0 % | 51,0 % | 51,0 % | ok |
| Gommes tendres | Commune | Vitesse | 50,0 % | 50,0 % | 50,0 % | ok |
| Mixtes polyvalents | Commune | Précision | 50,0 % | 50,0 % | 50,0 % | ok |
| Slicks adhérents | Rare | Précision | 50,1 % | 50,1 % | 50,1 % | ok |
| Slicks pro | Épique | Endurance | 50,1 % | 50,1 % | 50,1 % | ok |
| Gommes prototype | Légendaire | Endurance | 50,1 % | 50,1 % | 50,1 % | ok |
| Aileron fixe | Commune | Précision | 50,0 % | 50,0 % | 50,0 % | ok |
| Volet additionnel | Commune | Vitesse | 51,1 % | 51,1 % | 51,1 % | ok |
| Aileron mobile | Rare | Précision | 57,7 % | 57,7 % | 57,7 % | ok |
| Aérodynamique active | Épique | Vitesse | 57,7 % | 57,7 % | 57,7 % | ok |
| Soufflerie parfaite | Légendaire | Précision | 59,4 % | 59,4 % | 59,4 % | ok |
| Cage renforcée | Commune | Endurance | 51,4 % | 51,4 % | 51,4 % | ok |
| Panneaux allégés | Commune | Vitesse | 51,1 % | 51,4 % | 51,4 % | ok |
| Monocoque alu | Rare | Endurance | 51,4 % | 51,4 % | 51,4 % | ok |
| Titane usiné | Épique | Endurance | 51,2 % | 51,3 % | 51,3 % | ok |
| Monocoque carbone | Légendaire | Endurance | 55,0 % | 55,0 % | 55,0 % | ok |

## Séries de 5

| Famille | Pièces (niveau 5) | Victoires | Garde-fous |
|---|---|---|---|
| Vitesse | Hybride prototype, Huile racing, Gommes tendres, Aérodynamique active, Panneaux allégés | 72,6 % | ok |
| Endurance | Bloc de série renforcé, Carter renforcé, Plaquettes durcies, Gommes prototype, Monocoque carbone | 54,9 % | ok |
| Précision | Radiateur surdimensionné, Double embrayage, Freinage régénératif, Slicks adhérents, Soufflerie parfaite | 68,2 % | ok |

Garde-fous respectés : **oui**.
