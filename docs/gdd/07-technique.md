# 7. Technique

## 7.1 Vue d'ensemble

```
 Appareil (Capacitor : iOS, Android ; web pour le développement)
 ┌───────────────────────────────────────────────┐
 │ Interface (DOM + kit src/ui/kit) · Rendu Pixi │
 │ Moteur pur src/engine  ◄── même code ──┐      │
 │ IA src/ai (hors ligne, aperçus)        │      │
 │ Cache local (profil, courses en cours) │      │
 └──────────────┬─────────────────────────┼──────┘
                │ HTTPS (actions)  ▲ Realtime (événements)
 ┌──────────────▼─────────────────────────┼──────┐
 │ Supabase                               │      │
 │  Edge Functions (Deno) : moteur ───────┘      │
 │   race-create, race-action, race-timeout,     │
 │   matchmake, chest-*, shop-buy, revenuecat    │
 │  Postgres (RLS) · Auth · Realtime · Storage   │
 │  pg_cron (minuteurs, échéances asynchrones)   │
 └──────────────┬────────────────────────────────┘
                │ webhooks
       RevenueCat (App Store, Google Play)   Analytique   Notifications (APNs, FCM)
```

## 7.2 Moteur pur partagé

- `src/engine` est **pur** : `createGame(options)` puis `reducer(state, action) → { state, events }`, sans accès au DOM, à
  l'horloge ni au réseau. C'est déjà le cas ; une règle de lint interdira les imports DOM dans ce dossier.
- Le **même code** tourne sur l'appareil (aperçus, IA, parties hors ligne, rediffusions) et dans les Edge Functions (Deno).
  Le dossier `supabase/functions/_shared/engine` est produit par un script de build (esbuild, une seule sortie ESM) à partir
  de `src/engine` ; jamais modifié à la main.
- **Test d'or** : une série de courses (graine + actions) est rejouée sous Node et sous Deno ; le hachage de l'état final doit
  être identique. Il tourne dans la CI à chaque changement du moteur.
- Les constantes de règles sont dans `DEFAULT_CONFIG` ; le GDD les décrit et `tools/check-gdd.ts` vérifie qu'ils concordent.
  Les valeurs d'équilibrage des ajouts (cartes, plafonds, réglages) passent par la configuration à distance (7.8) et sont
  copiées dans l'état de la course à sa création, pour qu'une rediffusion reste exacte même après un changement de réglage.

## 7.3 Serveur autoritaire et dés

- En multijoueur et pour tout ce qui rapporte (classé, asynchrone, championnat, coffres), **le serveur tient l'état de la
  course et tire les dés**. Le client envoie des intentions (`SHIFT_GEAR`, `ADJUST`, `MOVE_TO`, `PIT_STOP`, cartes…) à
  l'Edge Function `race-action`, qui vérifie le tour, applique le réducteur et diffuse les événements par Supabase Realtime.
- **Le générateur ne doit jamais être prévisible côté client.** Aujourd'hui l'état contient l'état 32 bits du générateur
  (mulberry32) : le transmettre permettrait de prévoir tous les dés, et même sans lui, quelques dés observés suffiraient à
  retrouver l'état par force brute (2³² possibilités). Donc :
  - le moteur reçoit son tirage par une **source injectée** (interface `Rng`) ; le générateur actuel reste la source des
    parties locales et des tests ;
  - le serveur utilise une graine secrète de 256 bits et tire chaque valeur par HMAC-SHA-256(graine, numéro du tirage) ;
  - l'état envoyé aux clients est **expurgé** (pas de graine) ; les aperçus du client (cases atteignables, coûts) n'utilisent
    pas le hasard et restent calculés localement ;
  - à la création, le serveur publie le **hachage de la graine** ; à la fin, il révèle la graine : chacun peut vérifier que les
    dés n'ont pas été truqués et la rediffusion devient publique.
- Les parties hors ligne (campagne, course rapide) tournent sur l'appareil. Pour qu'elles rapportent, le client demande un
  **jeton de course** (graine fournie par le serveur, configuration figée), joue, puis envoie son journal ; le serveur rejoue
  et paie selon le résultat recalculé. Risque accepté : un tricheur qui lit la graine sur l'appareil peut optimiser sa campagne
  (gains bornés, aucun effet sur les autres joueurs).

### Économie : Edge Function `game` (en place)

- Pour un compte (invité ou Discord), toute action qui change l'économie passe par `supabase/functions/game` : le client
  (`src/app/serverGame.ts`, `src/app/economy.ts`) envoie `{ action, params }` avec son jeton de session, le serveur applique
  `applyAction` (`src/server/actions.ts`), qui appelle les règles pures de `src/data` avec **son** horloge et **son** aléa,
  et renvoie le profil à afficher. Sans compte ou hors ligne, les mêmes règles tournent sur l'appareil.
- Actions : `sync`, `import_save` (une fois, bornée), `start_race`, `finish_race` (paie aussi la campagne : étoiles et
  récompense de niveau), `open_slot`, `skip_slot`, `buy_offer`, `upgrade_part`, `equip`, `unequip`, `claim_quest`.
- État serveur (`game_state.state`) : `{ v, profile, race, finishes, soloFinishes, importedAt, createdAt }` ; écriture par
  `game_create` / `game_commit` (verrou optimiste sur `version`, journal dans la même transaction).
- Construction : `npm run build:edge` produit `supabase/functions/game/index.js` (un seul fichier, esbuild ; seul import :
  `npm:@supabase/supabase-js`), non versionné. Un test vérifie que le paquet se construit sans autre import.
- Limite connue : le rang de fin de course est déclaré par le client (non vérifié) jusqu'au rejeu serveur décrit ci-dessus.

## 7.4 Journal d'actions et graine

- Une course = `race` (configuration figée, circuit, joueurs, hachage de graine, statut) + `race_actions` (numéro, joueur,
  action, horodatage) + instantané de l'état toutes les 20 actions (reprise rapide).
- **L'état se reconstruit en rejouant** les actions depuis la création (ou le dernier instantané) : c'est ainsi que se font la
  reprise après redémarrage d'une fonction, la reconnexion et les rediffusions.
- Contrainte d'unicité `(race_id, seq)` : deux actions concurrentes pour le même tour → la seconde échoue proprement
  (idempotence par identifiant d'action côté client).

| Table | Contenu principal |
|---|---|
| `profiles` | joueur, niveau, trophées, ligue, pays de la vitrine |
| `wallets` + `ledger` | soldes or / gemmes / fragments et **écritures** (source, montant, référence) ; le solde est la somme du registre |
| `inventory`, `loadouts`, `decks` | pièces et niveaux, cosmétiques, cartes débloquées, deck et réglage choisis |
| `chests` | emplacement, type, contenu tiré au gain, `ready_at` |
| `races`, `race_players`, `race_actions`, `race_snapshots` | courses et journaux |
| `purchases` | achats validés (identifiant d'événement RevenueCat unique) |
| `remote_config` | configuration versionnée par segment |
| `clubs`, `club_members`, `club_messages`, `donations` | clubs |

Toutes les tables sont protégées par RLS ; les écritures sur l'économie et les courses passent **uniquement** par les Edge
Functions (rôle de service), jamais directement par le client.

## 7.5 Temps réel, minuteurs, reconnexion et reprise par l'IA

- **Direct** : canal Realtime par course. Chaque tour a une échéance (`deadline`) écrite en base. Un passage `pg_cron` chaque
  seconde n'est pas raisonnable : l'échéance est vérifiée (1) à chaque action reçue et (2) par une Edge Function
  `race-timeout` appelée toutes les 5 s par `pg_cron` pour les courses en direct, toutes les 5 min pour l'asynchrone.
- **Échéance dépassée** : le serveur fait jouer l'IA (`src/ai`, niveau « prudent ») pour ce tour et le marque « joué par
  l'IA » dans le journal. Deux échéances de suite en direct (trois en asynchrone) : la voiture passe en **mode IA**.
- **Reconnexion** : le client rouvre le canal, demande l'état expurgé courant et les événements depuis son dernier numéro
  connu ; si la voiture est en mode IA, il reprend la main au tour suivant (bouton « Reprendre le volant »).
- Application en arrière-plan (Capacitor `App` : `pause` / `resume`) : la connexion est fermée en pause et rouverte au retour.

## 7.6 Achats : RevenueCat → webhooks Supabase

1. Le client achète via le SDK RevenueCat (`@revenuecat/purchases-capacitor`) ; l'identifiant RevenueCat de l'utilisateur est
   son identifiant Supabase.
2. RevenueCat valide le reçu auprès du magasin et appelle le webhook `revenuecat` (Edge Function) avec un secret partagé dans
   l'en-tête `Authorization`.
3. La fonction vérifie le secret, ignore un événement déjà traité (identifiant unique dans `purchases`), crédite le
   registre (`ledger`) ou active le Pass, dans une seule transaction.
4. Le client reçoit la mise à jour du solde par Realtime ; il ne crédite jamais lui-même.
5. Remboursements (`CANCELLATION`, `REFUND`) : écriture inverse ; un solde négatif bloque les achats en gemmes jusqu'à
   régularisation.

Le pays de la vitrine (`store_country`) alimente le drapeau `paidChests` ([05-economie.md](05-economie.md)).

## 7.7 Analytique

- Outil : PostHog (hébergement UE) ou un schéma `analytics` dans Supabase pour commencer ; même interface `track(event, props)`
  côté client, avec file d'attente hors ligne.
- **Consentement** demandé au premier lancement (RGPD) ; sans consentement, seuls les événements techniques anonymes
  (plantages, performances) sont envoyés.
- Événements clés : `install`, `tutorial_step`, `race_start` / `race_end` (mode, durée, rondes, place, abandon et cause,
  cartes jouées, réglage), `turn_timeout`, `ai_takeover`, `reconnect`, `chest_earned` / `chest_open` / `chest_skip`,
  `upgrade`, `purchase` (côté serveur, depuis le webhook), `league_change`, `quest_claim`, `club_join`, `replay_share`.
- Tableaux de bord : rétention J1 / J7 / J30, entonnoir du tutoriel, durée et rondes par course, taux de victoire par carte,
  pilote, réglage et puissance (5.6), sources et puits de chaque monnaie par jour (à comparer au modèle de 5.8).

## 7.8 Configuration à distance

- Table `remote_config` : documents JSON versionnés (`economy`, `chests`, `cards`, `league_caps`, `settings_slider`,
  `matchmaking`, `features`), avec segment (pays, version de l'application, groupe de test A/B).
- Le client charge la configuration au démarrage (Edge Function `config`, cache 1 h), garde la dernière reçue et, à défaut,
  des valeurs intégrées à l'application. Les **règles de course** n'en dépendent pas (moteur versionné) ; les ajouts oui.
- Chaque course enregistre la version de configuration utilisée.
- Indicateurs de fonctionnalité : `paidChests`, `clubs`, `async`, `championships`, `liveMatchmaking` (coupure d'urgence).

## 7.9 Capacitor et appareil

- Une base web (Vite + TypeScript + Pixi) empaquetée par **Capacitor** pour iOS et Android ; même code que la version web de
  développement.
- Greffons : `@capacitor/app` (cycle de vie, liens profonds pour rediffusions et invitations de club), `@capacitor/push-notifications`
  (APNs, FCM : tour asynchrone, championnat), `@capacitor/local-notifications` (coffre prêt), `@capacitor/haptics` (dé, contact),
  `@capacitor/preferences` (cache), RevenueCat.
- **Compte** : session anonyme Supabase au premier lancement (on joue tout de suite), liaison à Apple, Google ou un e-mail
  ensuite pour retrouver sa progression ; suppression de compte dans le jeu (exigence des magasins).
- Migration : la sauvegarde `localStorage` actuelle (`4mules.save`) est envoyée une seule fois au serveur à la première
  connexion du compte (`import_save`), nettoyée puis bornée à des valeurs plausibles (`src/server/importSave.ts`) ; une fois
  la partie créée sur le serveur, l'import est refusé.
- Cibles : 60 images/s sur un appareil de milieu de gamme de 2022, démarrage à froid sous 3 s, application sous 80 Mo.

## 7.10 Tests et vérification

`npm run verify` enchaîne typecheck, lint, tests unitaires (dont `tools/check-gdd.test.ts`), build, `check:origin` et les
e2e Playwright. À ajouter avec le serveur : tests des Edge Functions (Deno), test d'or Node / Deno (7.2), tests de charge
(1 000 courses en direct simultanées), et un test qui compare les chances affichées des coffres à la configuration du tirage.
