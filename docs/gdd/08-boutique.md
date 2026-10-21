# 8. Boutique

Contenu et organisation de l'onglet Boutique au lancement. Les prix de référence sont ceux de [05-economie.md](05-economie.md)
(5.5 et 5.6) ; ce document dit **quoi afficher, où, et comment ça se renouvelle**. **Codé (étapes 3a à 3c)** : les offres du catalogue (8.3, dont le coffre épique et le prix de 400 or) et les
3 offres du jour (8.4), achetées une fois par jour, côté serveur et en local (`src/data/shop.ts`), le cadeau du jour avec sa série (8.5) et le pack de bienvenue offert (8.7, comptes seulement : peinture rare `paint-lime`, 72 h dès la création du compte). **Pas encore codée** : la sélection hebdomadaire de cosmétiques. L'écran (`src/app/tabs/shop.ts`) affiche les offres du jour avec leur compte à rebours, puis les offres permanentes.

## 8.1 Principes

1. **Une seule action évidente par carte** : prix, ce que l'on reçoit, un bouton. Le solde est toujours visible en haut.
2. **Tout achat passe par le serveur** : il vérifie le solde, débite et attribue dans une seule transaction (jamais de calcul
   côté navigateur pour un compte connecté). Sans compte ou hors ligne, la boutique reste en mode local comme aujourd'hui.
3. **Aucun achat avec de l'argent réel tant que le paiement n'existe pas** : les paliers de gemmes sont affichés grisés avec
   « Bientôt ». Pas de faux bouton qui ne fait rien.
4. **Règles anti « payer pour gagner »** : celles de 5.6 s'appliquent. En particulier, les pièces de voiture ne se vendent
   pas directement (on achète des coffres, des fragments en or, des cosmétiques) et rien ne s'achète pendant une course.
5. **Taux affichés** : toute carte qui vend un contenu aléatoire (coffre) ouvre la fenêtre « Contenu des coffres ».

## 8.2 Organisation de l'écran (de haut en bas)

| Zone | Contenu | Renouvellement |
|---|---|---|
| Solde | or, gemmes (déjà dans la barre du haut) | — |
| Offre du moment | une grande carte : pack de bienvenue au début, puis offre d'événement | 72 h pour le pack de bienvenue (une fois), puis par événement |
| Cadeau du jour | un coffre gratuit (or et fragments, sans pièce) | une fois par jour serveur, bouton grisé avec le temps restant |
| Offres du jour | 3 cartes tournantes, payables en or | chaque jour à minuit (heure de Paris), tirage fixé par la date du serveur |
| Coffres | commun, lot de 3, rare express (gemmes) | permanent |
| Cosmétiques | peintures, numéros, casques, en gemmes | une sélection de 6 qui change chaque semaine |
| Gemmes | six paliers (5.5), « Bientôt » tant que le paiement n'est pas branché | permanent |

## 8.3 Offres au lancement (en or et en gemmes)

Les offres déjà en place sont conservées. Les valeurs changées sont marquées **→**.

| Offre | Contenu | Prix |
|---|---|---|
| Coffre commun | 1 coffre commun (prêt en 30 min) | 120 or |
| Lot de 3 coffres communs | 3 coffres communs | 300 or |
| 40 fragments | 40 fragments | 150 or |
| Coffre rare express | 1 coffre rare, prêt tout de suite | 8 gemmes |
| 400 pièces d'or | 400 or | **→ 24 gemmes** (aujourd'hui 10 : incohérent avec 5.5, qui donne 1 000 or pour 60 gemmes) |
| Coffre épique | 1 coffre épique, prêt dans 8 h | **nouveau** : 60 gemmes |
| Accélérer un coffre | coût proportionnel au temps restant (1 gemme par 10 minutes) | à l'écran des coffres, pas en boutique |

## 8.4 Offres du jour (3 cartes tournantes)

Chaque jour le serveur tire 3 offres dans la liste ci-dessous, avec une graine dérivée de la date (même tirage pour tous),
sans doublon et en garantissant au moins une offre à moins de 200 or.

| Offre | Contenu | Prix en or | Poids de tirage |
|---|---|---|---|
| Petit lot de fragments | 25 fragments | 100 | 3 |
| Lot de fragments | 80 fragments | 280 | 3 |
| Gros lot de fragments | 200 fragments | 650 | 1 |
| Coffre commun à prix réduit | 1 coffre commun | 90 | 3 |
| Coffre rare | 1 coffre rare (3 h) | 450 | 2 |
| Numéro de course | 1 numéro commun au choix du jour | 600 | 2 |
| Casque du jour | 1 casque commun | 600 | 2 |

Chaque offre du jour est achetable **une seule fois par jour** et par joueur. Le prix en or est toujours inférieur d'au moins
15 % au prix équivalent d'un achat standard : c'est la raison de revenir tous les jours.

## 8.5 Cadeau du jour

Un coffre gratuit par jour serveur, contenu de la ligne « Gratuit » de 5.2 : 20 or et 8 fragments, aucune pièce. Série de
connexion : le 7e jour consécutif, le cadeau est un coffre commun. Une série interrompue repart de 1 sans pénalité.

## 8.6 Cosmétiques

Prix en gemmes de 5.5 (commun 80, rare 200, épique 500, légendaire 1 200). La sélection de la semaine contient 2 communs,
2 rares, 1 épique et 1 légendaire, tirés dans le catalogue (`src/data/parts/catalogue.ts`) parmi ceux que le joueur ne possède pas.
Un cosmétique déjà possédé n'est jamais proposé. Les cosmétiques n'ont aucun effet sur les règles.

## 8.7 Pack de bienvenue

**Décision : offert.** Le pack de bienvenue est donné gratuitement à la première connexion avec un compte (invité ou Discord),
une seule fois par compte : 300 gemmes, 2 000 or, une peinture rare (le contenu prévu en 5.5 pour 1,99 €). Il apparaît dans la
carte « Offre du moment » pendant 72 heures et se récupère d'un bouton. Une vente à 1,99 € pourra être ajoutée plus tard pour
un pack distinct, sans toucher à celui-ci.

## 8.8 Points de données pour le serveur

| Donnée | Rôle |
|---|---|
| `offer_id` | identifiant stable d'une offre du catalogue |
| `purchases(user_id, offer_id, day, price, currency, at)` | historique ; clé unique `(user_id, offer_id, day)` pour les offres du jour |
| Graine du jour | `hash(date serveur à Paris)` ; aucun tirage demandé par le client |
| Série de connexion | `streak` et dernier jour de cadeau dans l'état du joueur |

## 8.9 Décisions

1. **Pack de bienvenue offert** (8.7).
2. **Pas de plafond quotidien de dépenses en gemmes** pour l'instant. À réexaminer quand le paiement réel sera branché
   (obligations de protection des mineurs selon les pays).
3. **Certains cosmétiques seulement** peuvent s'acheter en or : les communs et les rares de la sélection hebdomadaire, à
   2 000 or (communs) et 5 000 or (rares). Les épiques et les légendaires restent en gemmes uniquement.
4. **Visuels modernes sur le thème de la course** : cartes d'offres illustrées (asphalte, bandes de piste, lumières de
   circuit), icônes cohérentes, aucune image reprise d'ailleurs. À produire avec le guide de style visuel
   (`docs/style-visuel.md`, à créer) avant de généraliser : d'abord un lot pilote (offre du moment, cadeau du jour, 3 cartes
   d'offres, 1 icône de gemme et d'or).
