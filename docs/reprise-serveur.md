# Reprise d'éléments d'un projet de référence

Copie locale, hors versionnage : `ref-externe/` (supabase/, tools/, .github/, web/). Elle sert de modèle pour le serveur et le chat ; rien de son contenu propre (données, images, guides) n'est repris.

## Réutilisable
- Serveur qui fait foi : Edge Function `game` (CORS par liste d'origines, limite de débit, cache d'authentification, actions admin). Pour 4 Mules, elle applique `src/engine`.
- Migrations modèles : profils, état de partie, journal d'actions, RLS en lecture seule ; unicité du pseudo insensible à la casse ; chat (anti-spam, amis, recherche de joueurs) ; rôles, silence, niveau dans le chat ; suspensions, liste de joueurs paginée ; verrous de fonctions ; arène avec application d'un combat côté serveur, comme base de l'Elo.
- Workflows GitHub : migrations et déploiement de la fonction.

## À adapter
- Couleurs du chat par rôle : Joueur bleu, Admin rouge, Tester vert, VIP orange (ajouter le rôle `vip`).
- Aucun pseudo écrit en dur pour attribuer un rôle ; rôles via le panneau Admin.
- Vie privée : ne jamais copier le nom Discord dans `display_name`.
- Chat : filtre de mots, signalement, blocage, purge à 30 jours.
- Workflow : nouvelles références de projet et secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`.
