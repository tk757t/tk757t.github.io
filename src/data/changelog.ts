export interface ChangelogEntry {
  version: string;
  date: string;
  notes: string[];
}

/** What changed, told to players. Most recent first; the first entry is the current version (tested). */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.6.1',
    date: '2026-10-23',
    notes: [
      'Circuits refaits, plus longs : chaque tour compte de 46 à 55 cases, aussi pour les circuits à 2 et 3 tours. Une course dure donc environ 5 minutes par tour.',
      'Chaque circuit a son propre tracé et ses défis : Dunes d’Ocre (deux grands virages), Rues du Port (rues serrées), Corniche d’Azur (virages enchaînés), Boucle des Pins (chicane risquée), Col des Neiges (lacets à deux voies), Tour du Cratère (anneau rapide).',
    ],
  },
  {
    version: '0.6.0',
    date: '2026-10-22',
    notes: [
      'Six nouveaux circuits : Dunes d’Ocre et Rues du Port (1 tour), Corniche d’Azur et Boucle des Pins (2 tours), Col des Neiges et Tour du Cratère (3 tours). Plus il y a de tours, plus le tour est court : une course dure environ 5 minutes, quel que soit le circuit.',
      'Course classée et course non classée : le circuit est tiré au hasard, avec son nombre de tours.',
      'Course perso et parties entre amis : vous choisissez toujours le circuit et le nombre de tours (qui part de celui du circuit).',
    ],
  },
  {
    version: '0.5.1',
    date: '2026-10-22',
    notes: [
      'Nouveau : Confidentialité (dans le Profil) dit ce que le jeu garde, ce que Discord ajoute, et qui édite le jeu.',
      'Nouveau : « Supprimer mon compte », en deux étapes. Compte, pseudo, progression, messages et lien Discord sont effacés tout de suite, et le pseudo est libéré.',
      'Texte corrigé : avec Discord, l’adresse e-mail de votre compte Discord est conservée par le service de comptes, mais le jeu ne la lit jamais.',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-10-22',
    notes: [
      'Course : plus de + et −. Les six dés des rapports sont alignés, chacun avec sa forme et sa couleur : touchez un dé pour le choisir (les cases atteintes s’allument), touchez-le encore pour lancer.',
      'Au survol (ou au toucher) d’une caractéristique de la voiture, dans le garage comme en course, une bulle explique son effet.',
      'Nouveau Guide du jeu, dans l’onglet Course : les règles page par page. En course, le bouton ❓ ouvre une aide courte qui dit quoi faire maintenant.',
      'Votre voiture, avec ses couleurs et son numéro, est maintenant visible sur la piste et à côté de votre nom.',
    ],
  },
  {
    version: '0.4.1',
    date: '2026-10-22',
    notes: [
      'Profil : à côté de la version, les menus Admin et Testeur apparaissent pour les comptes qui ont ce rôle.',
      'Menu Admin : chiffres du jeu, joueurs (rôle, silence, suspension), messages signalés, mots refusés du chat et journal des actions.',
      'Menu Testeur : ressources, coffres et pièces pour son propre compte, cases numérotées en course, copie de l’état du compte.',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-10-22',
    notes: [
      'Sur ordinateur, le chat reste affiché à droite, dans le menu comme en course, avec les onglets Général, Course et Journal : le journal de course s’y affiche pendant la course.',
      'Chat de course : une conversation entre les joueurs de la course en cours, que personne d’autre ne voit.',
      'Sur mobile, une bulle de chat que l’on déplace et que l’on ferme ; le bouton du haut reste.',
      'Une petite notification à chaque nouveau message du chat, que l’on coupe avec la cloche 🔔 du chat.',
    ],
  },
  {
    version: '0.3.9',
    date: '2026-10-22',
    notes: [
      'Course non classée : elle fonctionne comme COURSE ! (même file d’attente, groupes de 2 à 4 joueurs, IA pour compléter après 20 secondes) mais sans tenir compte des trophées : tout le monde peut s’affronter, et rien n’est gagné ni perdu.',
    ],
  },
  {
    version: '0.3.8',
    date: '2026-10-22',
    notes: [
      'Course perso : une page avec les parties déjà créées par les autres joueurs (Rejoindre) et un bouton Créer une partie (circuit, tours, places). Hors ligne, la course avec des amis sur le même écran ou contre des IA reste disponible.',
      'Le chat indique combien de joueurs sont en ligne, et la page Course combien attendent en course classée et non classée.',
      'L’éditeur de circuits est ouvert à tous : bouton « Éditeur de circuits » sous « Jouer avec des amis ».',
    ],
  },
  {
    version: '0.3.7',
    date: '2026-10-22',
    notes: [
      'Circuits : des cases larges qui se touchent comme sur un plateau, faciles à toucher au doigt.',
      'Chaque case d’arrivée a sa couleur : vert (rien perdu), jaune (pneus), violet (freins), rose (une voiture barre la route : carrosserie), rouge (le mur), avec ce que ça coûte écrit dessus.',
      'Dépassements sur les côtés : on peut changer de voie à chaque case des lignes droites pour doubler une voiture qui barre la route.',
    ],
  },
  {
    version: '0.3.6',
    date: '2026-10-22',
    notes: [
      'Journal de course : le bouton 📋 raconte la course manche par manche (dé, déplacements, dépassements, incidents, stands, tours), avec des filtres. Aussi disponible à la fin de la course.',
    ],
  },
  {
    version: '0.3.5',
    date: '2026-10-22',
    notes: [
      'Garage : le bouton « Équiper le meilleur » choisit, parmi tes pièces, la combinaison qui donne le plus de Puissance.',
    ],
  },
  {
    version: '0.3.4',
    date: '2026-10-22',
    notes: [
      'Course non classée : l’hôte de la salle ajoute ou enlève des IA avec − et +, et peut démarrer la course quand il veut.',
    ],
  },
  {
    version: '0.3.3',
    date: '2026-10-22',
    notes: [
      'Le gros bouton COURSE ! lance une course classée contre des joueurs de ton niveau.',
      'Course non classée : tu rejoins une salle ouverte (ou tu en crées une), elle se remplit jusqu’à 4 joueurs puis la course part. Rien n’est gagné ni perdu.',
      'Course perso : les réglages de course (joueurs, IA, circuit, tours) pour jouer seul, hors ligne ou contre des IA.',
      'Jouer avec des amis : les salons à code restent disponibles en dessous.',
    ],
  },
  {
    version: '0.3.2',
    date: '2026-10-22',
    notes: [
      'Chat : un canal général pour discuter, avec signalement, blocage et silence des joueurs gênants. Bouton 💬 en haut.',
      'Classement : le bouton 🏆 (à droite des gemmes) montre les meilleurs de la saison ; ta ligue s’affiche aussi dans le chat.',
      'Course classée : trophées, ligues (de Paddock à Légende) et saisons de 4 semaines. À la fin d’une course, tu vois ce que tu gagnes ou perds, et ta ligue est dans ton profil.',
      'Mise en relation : le bouton 🏆 Course classée te trouve des adversaires de ton niveau, avec une grille inversée (le moins classé en pole).',
    ],
  },
  {
    version: '0.3.1',
    date: '2026-10-22',
    notes: [
      'Jouer en ligne : plus de pseudo à saisir, tu joues sous le pseudo de ton compte.',
      'Les pneus s’usent à chaque tour : les tendres tous les tours, les durs tous les 2 tours. Le dernier tour est gratuit.',
      'Garage : la fiche de ta voiture montre six stats et une Puissance, avec l’aperçu avant/après d’une pièce et les séries de famille (Vitesse, Endurance, Précision).',
      'Pièces : chaque niveau apporte quelque chose, et les pièces épiques et légendaires ont une contrepartie à surveiller.',
      'En course : des puces montrent les effets de tes pièces (relances, arrêts gratuits, bonus de dé), les messages les nomment, et le bilan de fin dit ce qu’elles ont rapporté.',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-10-21',
    notes: [
      'Une voiture qui barre la route te coûte 1 point de Carrosserie, plus de freins ni de pneus.',
      'Le mur : sortir d’un virage avec 2 arrêts manquants ou plus fait abandonner. La case est rouge avant de jouer ; les cases qui coûtent de la carrosserie sont jaunes.',
      'Connexion Discord : les erreurs sont expliquées, et un compte invité lié à Discord est reconnu.',
      'Niveau Débutant de la campagne : la rivale est un peu plus rapide.',
      'La course ne redessine plus l’écran quand rien ne bouge : moins de chauffe sur téléphone.',
    ],
  },
  {
    version: '0.2.2',
    date: '2026-10-21',
    notes: ['Les achats, cadeaux, équipements et récompenses s’affichent tout de suite, sans attendre le serveur.', 'Un bouton qui attend le serveur affiche une petite roue : plus de doute sur le tap.', 'Le serveur répond plus vite (environ 350 ms au lieu de 800 à 3000 ms).'],
  },
  {
    version: '0.2.1',
    date: '2026-10-21',
    notes: ['Le serveur de jeu est maintenant à Paris : les achats et les récompenses répondent plus vite.', 'Après la mise à jour, recréez votre pseudo en invité : votre progression est reprise.'],
  },
  {
    version: '0.2.0',
    date: '2026-10-21',
    notes: [
      'Nouveau : le passe de saison gratuit, 30 paliers de récompenses, une saison toutes les deux semaines (onglet Quêtes).',
      'Boutique : trois offres du jour, un cadeau du jour avec série de 7 jours, et le coffre épique.',
      'Pack de bienvenue offert pour les nouveaux comptes : 300 gemmes, 2000 or et une peinture rare.',
      'Courses solo contre l’IA : 10 or par course, 5 courses payées par heure.',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-10-21',
    notes: ['Le jeu te prévient quand une nouvelle version est disponible.', 'Le numéro de version et les nouveautés sont dans ton profil.'],
  },
];
