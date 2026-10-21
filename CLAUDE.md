# 4 Mules

## Autonomie

1. Tu travailles seul, de bout en bout. Ne demande jamais à l'utilisateur de tester, lancer ou vérifier quelque chose à ta place. Ne t'arrête que si tu es réellement bloqué.
2. Définition de « terminé » pour chaque tâche, toutes les conditions requises :
   - `npm run typecheck` passe sans erreur
   - `npm run lint` passe
   - `npm test` passe (écris les tests en même temps que le code)
   - `npm run build` passe
   - Test visuel réel : lance le serveur de dev en arrière-plan, ouvre le jeu dans un vrai navigateur headless (Playwright), joue un scénario, prends des captures en 390x844 et 1440x900, regarde-les toi-même, corrige ce qui est cassé ou moche.
3. Playwright (`@playwright/test`, chromium) est installé ; `/e2e` contient des tests qui simulent un vrai joueur (cliquer, lancer les dés, finir une course) et vérifient l'absence d'erreur console. Captures dans `e2e/screenshots/`.
4. `npm run verify` enchaîne typecheck, lint, tests unitaires, build et e2e. Lance-le avant de déclarer une tâche finie.
5. Boucle : si quelque chose échoue, lis l'erreur, corrige, relance jusqu'à tout vert. Jamais de test désactivé ou supprimé pour faire passer.
6. Mode debug : `window.__game` (dev uniquement) expose l'état et pilote une partie (`roll`, `advance(n)`, `seed(s)` ; à étendre avec le choix de rapport) pour des e2e rapides et déterministes.
7. À la fin de chaque tâche : commit git avec un message clair, puis résumé court : ce qui marche, ce qui a été vérifié (chemins des captures), ce qui reste.

## Interface

- Les écrans se construisent avec le design system `src/ui/kit` (Button, Panel, Badge, ProgressBar, RarityFrame, Modal) : pas de `<button>` ni de fenêtre faits à la main. Les couleurs viennent de `src/ui/kit/tokens.ts` (testées en contraste AA) ; le CSS n'utilise que les variables.
- Menu : cadre mobile (≤ 520 px) avec barre du haut, 5 onglets swipables (`src/app/tabs`, `garage.ts`) et barre d'onglets. La course (`RaceScreen`) est plein écran.
- Chaque nouvel écran doit passer `expectUsableLayout`, `expectNoHorizontalOverflow` et `expectContrast` (`e2e/helpers.ts`) et avoir des captures inspectées.

## Ressources de développement locales

- Aucun contenu tiers (nom, plateaux, circuits, images, sons, code) ni nom réel (championnat, écuries, pilotes, circuits) dans le code versionné ni dans un build : tout ce qui en dérive va dans `src/dev-only/`, `public/dev-only/`, `e2e/dev-only/`, `tools/dev-only/` ou `docs/dev-only/` (git-ignorés, chargés seulement par `npm run dev:origin`).
- `npm run check:origin` (dans `verify`) contrôle `dist/` avec la liste locale `tools/dev-only/forbidden-terms.json` (ignoré s'il est absent). Les règles du moteur sont dans `docs/regles.md`.
