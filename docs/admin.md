# Administration et outils de test

Deux menus, **Admin** et **Testeur**, sont à côté de la version du jeu dans la fenêtre du profil (clic sur l'avatar, en haut à gauche). Ils n'apparaissent que si le serveur dit que le compte a le bon rôle ;
le navigateur ne fait que cacher les boutons, **chaque action est vérifiée par le serveur**.

## Rôles

| Rôle | Menu Testeur | Menu Admin |
|---|---|---|
| Joueur, VIP | non | non |
| Testeur | oui | non |
| Admin | oui | oui |

Le rôle est dans `profiles.role`. On ne le change que dans le menu Admin (onglet Joueurs, fiche du joueur) : jamais par un pseudo écrit dans le code.
Le **tout premier administrateur** se nomme une seule fois par une ligne SQL, lancée par le propriétaire du projet dans l'éditeur SQL de Supabase (remplacer le pseudo) :

```sql
update public.profiles set role = 'admin' where lower(pseudo) = lower('MonPseudo');
```

Le dernier administrateur ne peut pas perdre son rôle, un administrateur ne peut pas être suspendu ni réduit au silence (il faut d'abord lui retirer son rôle), et personne ne peut se suspendre lui-même.

## Menu Admin (migration `20261022200000_admin_tools.sql`)

- **Chiffres** : comptes, nouveaux comptes (24 h), joueurs en ligne, signalements à traiter, suspensions, silences, messages et actions de la dernière heure.
- **Joueurs** : les plus récents, ou ceux dont le pseudo commence par la recherche ; fiche du joueur : changer le rôle, réduire au silence (10 min, 1 h, 24 h, 7 jours), suspendre (avec une raison),
  lever l'un ou l'autre, voir ses 20 dernières actions de jeu (pour juger d'une triche ou d'un bogue). Suspendre sort aussi le joueur de la file et ferme sa partie publique.
- **Signalements** : les messages signalés (à traiter d'abord) ; masquer ou réafficher, écarter les signalements, ouvrir la fiche de l'auteur.
- **Mots** : la liste des mots refusés du chat, modifiable sans redéploiement.
- **Journal** : ce que les administrateurs ont fait (`admin_audit_log`) ; chaque action y est inscrite avec son auteur et sa cible.

## Menu Testeur (actions `tester_grant` et `tester_reset` de la fonction `game`)

Tout ne touche que **le compte du testeur** ; chaque appel est inscrit au journal des actions (`action_log`, résumé `tester: true`).

- **Ressources** : or, gemmes, fragments, expérience (jusqu'à 100 000 or, 10 000 gemmes, 10 000 fragments, 100 000 XP par appel).
- **Coffres** prêts à ouvrir, de la qualité choisie.
- **Pièce ou objet** du catalogue, au niveau choisi pour une pièce.
- **Cases numérotées en course** : le bouton « Cases » de la barre de course (numéro, rang, case de grille), gardé pour les courses suivantes.
- **Copier l'état du compte** (pour un rapport de bogue), **relire le compte** depuis le serveur, **remettre le compte à zéro** (avec confirmation).
