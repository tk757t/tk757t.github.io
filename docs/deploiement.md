# Déploiement

## Où est quoi

- **Site** : https://tk757t.github.io (dépôt public `tk757t/tk757t.github.io`, branche `main`, construit par GitHub Actions). Il ne contient que 4 Mules et jamais `docs/audit-securite.md`.
- **Base et fonction de jeu** : projet Supabase `npaunxotjhkjzoxfpqgq` (région `eu-west-3`, Paris). L'adresse et la clé publique sont dans `src/net/config.ts`.
  L'ancien projet `voaxslsjhylgvymxcrco` (Irlande) n'est plus utilisé : à mettre en pause quand la reprise des parties est vérifiée.
- **Région** : la base et la fonction doivent rester dans la même région (la latence d'une action tombait de 800-3 300 ms à ~400 ms quand elles l'ont été).

## Fonction `game`

1. `npm run build:edge`, puis réduire avec esbuild (`minify`, `external: npm:*`) : `supabase/functions/game/index.js` (git-ignoré).
2. Déployer avec `verify_jwt = true`. **Ne jamais le désactiver** : la fonction lit l'identifiant du joueur dans le jeton sans rappeler le service d'authentification (`src/server/jwt.ts`), elle compte sur la passerelle pour vérifier la signature.
3. Contrôler en direct : `node tools/smoke-game.mjs` (crée un compte invité jetable, vérifie les actions et qu'un jeton falsifié reçoit un 401). Supprimer ensuite le compte de test par son identifiant exact.
4. Réglage du projet (tableau de bord, Authentication) : connexions anonymes activées, fournisseur e-mail désactivé.

## Site

`npm run verify` doit être vert, puis : cloner le dépôt public dans un dossier temporaire, y remplacer tout sauf `.git` et `.github` par `git archive HEAD`, supprimer `docs/audit-securite.md`, commit et push sur `main`. Attendre le run Actions, puis contrôler `/version.json`.

## Reprise d'une partie d'un projet à l'autre

Les comptes invités n'ont ni mot de passe ni e-mail : changer de projet les déconnecte. La partie reste dans `game_state` (clé `user_id`). Après la première connexion du joueur sur le nouveau projet, copier `state` de l'ancien `user_id` vers le nouveau (même structure), puis supprimer les comptes de test.
