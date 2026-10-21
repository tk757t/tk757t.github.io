# 4 Mules

**Une course de voitures où l'on ne pilote pas avec les pouces, mais avec la tête.**
À chaque tour, on choisit un rapport ; chaque rapport lance son propre dé, du petit 1-2 de la première au 21-30 de la sixième.
Trop vite dans un virage et les pneus, les freins ou la boîte trinquent : il faut gérer le risque, les arrêts au stand, la météo et
les adversaires. Parties courtes, de 1 à 4 voitures, jouables seul contre l'IA, en campagne ou en ligne.

Le jeu est gratuit : l'économie (or, gemmes, coffres, boutique du jour, passe de saison) se gagne en jouant.

**Jouer :** <https://tk757t.github.io/> (navigateur, mobile ou ordinateur)

## Ce que contient le jeu

- Course au tour par tour sur plateau : rapports et dés, usure (pneus, freins, boîte, carrosserie, moteur, tenue), virages avec
  arrêts, aspiration, contacts, stands, météo.
- Modes : course rapide contre l'IA, campagne par niveaux et étoiles, course en ligne.
- Progression : niveau et expérience, coffres à 4 qualités, pièces de voiture, garage, quêtes, passe de saison gratuit de 30 paliers.
- Boutique : offres du jour, cadeau quotidien avec série de 7 jours, pack de bienvenue.
- Comptes : pseudo choisi, jeu en invité ou connexion Discord, aucune donnée personnelle demandée.

## Pile technique

TypeScript, [Pixi](https://pixijs.com/) pour le plateau, Vite, Vitest et Playwright pour les tests, Supabase pour les comptes et le
serveur de jeu (Edge Function), GitHub Pages pour la publication. Une version mobile native est prévue (Capacitor).

## Démarrer

Prérequis : Node.js 22 ou plus récent.

```bash
npm install
npm run dev        # serveur de développement
```

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Vérification des types puis build de production dans `dist/` |
| `npm run typecheck` / `npm run lint` | Types et règles de code |
| `npm test` | Tests unitaires (moteur, économie, serveur, interface) |
| `npm run e2e` | Tests de bout en bout dans un vrai navigateur (Playwright), avec captures dans `e2e/screenshots/` |
| `npm run verify` | Tout enchaîner : types, lint, tests, build, contrôle du build, e2e |
| `npm run sim` | Simule des courses d'IA pour équilibrer les règles |
| `npm run check:gdd` | Vérifie que le document de design suit les constantes du moteur |
| `npm run build:edge` | Génère le paquet de la fonction serveur `game` |

## Structure

```
src/engine    règles de course pures (aucune dépendance au navigateur)
src/ai        joueurs automatiques
src/data      circuits, pièces, coffres, boutique, quêtes, passe, profil
src/server    règles d'économie exécutées côté serveur, partagées avec le client
src/net       comptes, parties en ligne, configuration Supabase
src/render    plateau et pions (Pixi), caméra, saisie
src/app       écrans, navigation par onglets, course
src/ui        kit d'interface (Button, Panel, Badge, ProgressBar, RarityFrame, Modal)
supabase/     migrations et fonction serveur
e2e/          scénarios joueur et captures
docs/         document de design (docs/gdd), règles du moteur, déploiement
tools/        contrôles automatiques
```

## Principes

- Le serveur fait foi pour l'économie des comptes connectés : le navigateur lit, la fonction serveur écrit.
- Les règles vivent dans `src/engine` et se lisent dans [`docs/regles.md`](docs/regles.md) et
  [`docs/gdd/02-regles.md`](docs/gdd/02-regles.md) ; `npm test` vérifie que les deux restent cohérents avec le code.
- Les écrans utilisent le kit `src/ui/kit` et ses couleurs (contraste AA vérifié).
- Les ressources de développement locales (`src/dev-only/`, `public/dev-only/`, `e2e/dev-only/`, `tools/dev-only/`,
  `docs/dev-only/`) ne sont jamais versionnées ni incluses dans un build ; `npm run check:origin` le vérifie quand la liste locale est présente.

## Documentation

- [Vision et document de design](docs/gdd/01-vision.md)
- [Règles de course](docs/regles.md)
- [Déploiement](docs/deploiement.md)
- [Nos circuits](docs/circuits.md)

## Licence

© 2026 — Tous droits réservés.
