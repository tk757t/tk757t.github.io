# Orchestration du travail

## Rôles des modèles
- **Haiku** : petites tâches cadrées (un champ, un test, un texte, un composant simple).
- **Sonnet** : fonctionnalités (interface, jeu, économie).
- **Opus** : architecture, sécurité, audit, validation finale, tout ce qui touche `supabase/`, `src/net`, rôles, paiement.

## Règles
1. Un seul écrivain par zone de fichiers. Chaque tâche a sa branche dans son propre worktree.
2. Chaque brief donne : fichiers concernés, comportement attendu, critère de fin vérifiable.
3. En worktree, lancer les e2e avec un port propre : `E2E_PORT=5200 npx playwright test <fichiers>` (5300, 5400… pour les autres). Ne jamais réutiliser le port d'un autre agent.
4. Avant de rendre la main : `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run check:origin`, e2e ciblés + captures 390x844 et 1440x900 regardées. `npm run verify` complet est lancé par l'orchestrateur après fusion.
5. Jamais de test désactivé. Commit clair sur la branche, pas de push.
6. Les fichiers sensibles (`supabase/migrations`, `src/net`, rôles, paiement) sont relus par Opus avant fusion.

## Rapport de fin de tâche
Branche et commit, ce qui marche, ce qui a été vérifié (chemins des captures), ce qui reste, fichiers partagés touchés.
