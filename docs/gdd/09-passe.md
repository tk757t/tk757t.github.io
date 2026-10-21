# 9. Passe de combat (saison)

Décisions du 2026-10-21 : le jeu est **gratuit**, avec un **passe de combat gratuit** en attendant les paiements. Ce document
remplace 5.4 pour la voie gratuite (saison de 2 semaines, 30 paliers). La voie premium reste prévue (étape 11), sans contenu défini.

## 9.1 Règles

1. **Saison de 14 jours**, du lundi 00:00 au dimanche 24:00, heure de Paris. La première commence le lundi 19 octobre 2026
   (`SEASON_ANCHOR`) ; chaque saison a un numéro (0, 1, 2…) calculé depuis cette date, le même pour tous.
2. **30 paliers**, **50 points de passe par palier** (1 500 points au total). Une saison suivante repart de zéro : les points
   et les paliers non récupérés de l'ancienne saison ne comptent plus.
3. **Les récompenses se récupèrent à la main** (bouton sur le palier atteint), une seule fois, côté serveur pour un compte.
4. Un cosmétique déjà possédé devient des fragments (comme dans un coffre).
5. **Aucune carte ni pièce exclusive** : le passe ne donne que de l'or, des gemmes, des fragments, des coffres et des cosmétiques
   (règle 5.4). Aucun cosmétique légendaire sur la voie gratuite.
6. La voie premium n'est pas en vente (`PREMIUM_ENABLED = false`) : l'écran l'affichera verrouillée avec « Bientôt ».

## 9.2 Gagner des points (codé, étape P3)

Reprise de 5.4 : **10 points par course terminée, 30 pour une victoire**, plus **20 points par quête récupérée**. Un abandon ne rapporte rien. Les campagnes comptent comme des courses. Les courses solo contre IA seule
ne comptent que si elles sont payées (5 par heure, voir 5.3). Chiffres à régler après quelques semaines de jeu : un joueur
occasionnel (5 courses par jour, 1 à 2 victoires) doit finir autour du palier 26, un joueur régulier doit terminer le passe.

## 9.3 Récompenses de la voie gratuite

| Palier | Récompense | Palier | Récompense | Palier | Récompense |
|---|---|---|---|---|---|
| 1 | 150 or | 11 | Coffre commun | 21 | 10 gemmes |
| 2 | Coffre commun | 12 | 200 or | 22 | 80 fragments |
| 3 | 40 fragments | 13 | 60 fragments | 23 | 250 or |
| 4 | 150 or | 14 | 10 gemmes | 24 | Coffre rare |
| **5** | **Casque rouge** | **15** | **Peinture rose bonbon** | **25** | **Numéro 27** |
| 6 | 150 or | 16 | 200 or | 26 | 10 gemmes |
| 7 | 10 gemmes | 17 | 70 fragments | 27 | 100 fragments |
| 8 | 50 fragments | 18 | Coffre rare | 28 | Coffre épique |
| 9 | 200 or | 19 | 250 or | 29 | 20 gemmes |
| **10** | **Numéro 13** | **20** | **Casque vert** | **30** | **Casque doré** |

Total : 1 550 or, 400 fragments, 60 gemmes, 2 coffres communs, 2 rares, 1 épique, 6 cosmétiques.

**Emplacements de skins (en gras : paliers 5, 10, 15, 20, 25, 30).** Le lancement doit offrir des skins de voiture uniques.
Les skins n'existent pas encore (planche d'images à reprendre, étapes K0 à K3) : ces six paliers donnent en attendant un
cosmétique existant, qu'il suffira de remplacer par un skin dans `FREE_TRACK` (`src/data/pass.ts`). Pour avoir 30 skins, il
faudrait 30 voitures : on commence par six à douze, puis on en ajoute à chaque saison.

## 9.4 Où c'est codé

| Quoi | Où |
|---|---|
| Règles (saisons, paliers, récompenses, récupération) | `src/data/pass.ts`, `src/data/pass-constants.ts` |
| Progression sauvegardée | `profile.pass = { season, points, claimed }` (`src/data/profile/profile.ts`) |
| Action serveur | `claim_pass { tier }` (`src/server/actions.ts`) |
| Action côté appareil | `claimPass` (`src/app/economy.ts`) |
| Écran | carte « Passe de saison » en haut de l'onglet Quêtes, fenêtre des 30 paliers (`src/app/seasonPass.ts`) ; le badge de l'onglet Quêtes compte aussi les paliers à récupérer |
| Import d'une sauvegarde d'appareil | le passe repart de zéro (les points locaux ne sont pas repris) |

Les points sont ajoutés par `src/data/rewards.ts` (`awardRaceWithPass`, `claimQuestWithPass`), appelé par le serveur et par l'appareil. Étape suivante : K3 (skins sur les paliers 5, 10, 15, 20, 25 et 30).
