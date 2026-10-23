export interface ChangelogEntry {
  version: string;
  date: string;
  notes: string[];
}

/** What changed, told to players. Most recent first; the first entry is the current version (tested). */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.6.2',
    date: '2026-10-23',
    notes: [
      'Nouvelle police, plus ronde et plus facile à lire, partout dans le jeu.',
      'Les textes du jeu, du guide et des infobulles ont été réécrits pour être plus simples et plus directs.',
    ],
  },
  {
    version: '0.6.1',
    date: '2026-10-23',
    notes: [
      'Les circuits sont plus longs : de 46 à 55 cases par tour, même pour ceux à 2 et 3 tours. Comptez environ 5 minutes par tour.',
      'Chaque circuit a maintenant son propre tracé : deux grands virages aux Dunes d’Ocre, des rues serrées au Port, des virages enchaînés à la Corniche, une chicane risquée aux Pins, des lacets à deux voies au Col des Neiges et un anneau rapide au Cratère.',
    ],
  },
  {
    version: '0.6.0',
    date: '2026-10-22',
    notes: [
      'Six nouveaux circuits : Dunes d’Ocre et Rues du Port (1 tour), Corniche d’Azur et Boucle des Pins (2 tours), Col des Neiges et Tour du Cratère (3 tours).',
      'En course classée et non classée, le circuit est tiré au hasard, avec son nombre de tours.',
      'En course perso et entre amis, vous choisissez le circuit et vous pouvez changer le nombre de tours.',
    ],
  },
  {
    version: '0.5.1',
    date: '2026-10-22',
    notes: [
      'Nouvel écran Confidentialité, dans le Profil : ce que le jeu garde, ce que Discord ajoute, et qui s’occupe du jeu.',
      'Vous pouvez supprimer votre compte, en deux étapes. Le compte, le pseudo, la progression, les messages et le lien Discord sont effacés tout de suite, et le pseudo redevient libre.',
      'Avec Discord, le service de comptes garde l’adresse e-mail de votre compte Discord. Le jeu, lui, ne la lit jamais.',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-10-22',
    notes: [
      'En course, les six dés des rapports sont alignés, chacun avec sa forme et sa couleur. Touchez un dé pour le choisir, les cases atteintes s’allument, puis touchez-le encore pour lancer.',
      'Survolez ou touchez une caractéristique de la voiture, au garage comme en course : une bulle explique ce qu’elle fait.',
      'Nouveau Guide du jeu dans l’onglet Course, avec les règles page par page. En course, le bouton ❓ affiche un rappel court de ce qu’il faut faire.',
      'Votre voiture, avec ses couleurs et son numéro, apparaît sur la piste et à côté de votre nom.',
    ],
  },
  {
    version: '0.4.1',
    date: '2026-10-22',
    notes: [
      'Dans le Profil, à côté de la version, les menus Admin et Testeur apparaissent pour les comptes qui ont ce rôle.',
      'Le menu Admin montre les chiffres du jeu, les joueurs (rôle, silence, suspension), les messages signalés, les mots refusés du chat et le journal des actions.',
      'Le menu Testeur donne des ressources, des coffres et des pièces à son propre compte, numérote les cases en course et copie l’état du compte.',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-10-22',
    notes: [
      'Sur ordinateur, le chat reste à droite, dans le menu comme en course, avec les onglets Général, Course et Journal. Pendant une course, le journal s’y affiche.',
      'Chat de course : une conversation réservée aux joueurs de la course en cours.',
      'Sur mobile, le chat devient une bulle que vous pouvez déplacer ou fermer. Le bouton du haut reste là.',
      'Un petit signal à chaque nouveau message, que vous coupez avec la cloche 🔔 du chat.',
    ],
  },
  {
    version: '0.3.9',
    date: '2026-10-22',
    notes: [
      'La course non classée utilise la même file d’attente que la classée : groupes de 2 à 4 joueurs, avec des IA pour compléter au bout de 20 secondes. Les trophées ne comptent pas, tout le monde peut se rencontrer, et on ne gagne ni ne perd rien.',
    ],
  },
  {
    version: '0.3.8',
    date: '2026-10-22',
    notes: [
      'Course perso : une page liste les parties créées par les autres joueurs (Rejoindre) et propose un bouton Créer une partie, avec circuit, tours et places. Hors ligne, vous pouvez toujours jouer entre amis sur le même écran ou contre des IA.',
      'Le chat indique combien de joueurs sont en ligne. La page Course montre combien attendent en course classée et non classée.',
      'L’éditeur de circuits est ouvert à tous, avec un bouton « Éditeur de circuits » sous « Jouer avec des amis ».',
    ],
  },
  {
    version: '0.3.7',
    date: '2026-10-22',
    notes: [
      'Les cases des circuits sont plus larges et se touchent comme sur un plateau, ce qui les rend plus faciles à toucher.',
      'Chaque case d’arrivée a sa couleur, avec son coût écrit dessus : vert (rien à payer), jaune (pneus), violet (freins), rose (une voiture bloque la route, carrosserie) et rouge (le mur).',
      'Pour doubler, on peut changer de voie à chaque case des lignes droites.',
    ],
  },
  {
    version: '0.3.6',
    date: '2026-10-22',
    notes: [
      'Le bouton 📋 ouvre le journal de la course, manche par manche : dés, déplacements, dépassements, incidents, stands et tours. Il a des filtres et reste disponible à la fin de la course.',
    ],
  },
  {
    version: '0.3.5',
    date: '2026-10-22',
    notes: [
      'Garage : le bouton « Équiper le meilleur » choisit, parmi vos pièces, la combinaison qui donne le plus de Puissance.',
    ],
  },
  {
    version: '0.3.4',
    date: '2026-10-22',
    notes: [
      'Course non classée : l’hôte de la salle ajoute ou enlève des IA avec − et +, et lance la course quand il veut.',
    ],
  },
  {
    version: '0.3.3',
    date: '2026-10-22',
    notes: [
      'Le gros bouton COURSE ! lance une course classée contre des joueurs de votre niveau.',
      'Course non classée : vous rejoignez une salle ouverte, ou vous en créez une. Elle se remplit jusqu’à 4 joueurs, puis la course part. On ne gagne ni ne perd rien.',
      'Course perso : les réglages (joueurs, IA, circuit, tours) pour jouer seul, hors ligne ou contre des IA.',
      'Les salons à code pour jouer entre amis restent disponibles en dessous.',
    ],
  },
  {
    version: '0.3.2',
    date: '2026-10-22',
    notes: [
      'Chat : un canal général pour discuter, avec signalement, blocage et silence pour les joueurs gênants. Bouton 💬 en haut.',
      'Classement : le bouton 🏆, à droite des gemmes, montre les meilleurs de la saison. Votre ligue s’affiche aussi dans le chat.',
      'Course classée : trophées, ligues (de Paddock à Légende) et saisons de 4 semaines. À la fin d’une course, vous voyez ce que vous gagnez ou perdez, et votre ligue est dans votre profil.',
      'Le bouton 🏆 Course classée vous trouve des adversaires de votre niveau, avec une grille inversée : le moins bien classé part en pole.',
    ],
  },
  {
    version: '0.3.1',
    date: '2026-10-22',
    notes: [
      'En ligne, vous jouez sous le pseudo de votre compte, sans rien avoir à saisir.',
      'Les pneus s’usent à chaque tour : tous les tours pour les tendres, un tour sur deux pour les durs. Le dernier tour ne coûte rien.',
      'Garage : la fiche de la voiture montre six stats et une Puissance, avec l’aperçu avant et après d’une pièce, et les séries de famille (Vitesse, Endurance, Précision).',
      'Chaque niveau d’une pièce apporte quelque chose, et les pièces épiques et légendaires ont un inconvénient à surveiller.',
      'En course, des puces montrent les effets de vos pièces (relances, arrêts gratuits, bonus de dé). Les messages les nomment, et le bilan de fin dit ce qu’elles ont rapporté.',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-10-21',
    notes: [
      'Une voiture qui bloque la route vous coûte 1 point de Carrosserie, plus de freins ni de pneus.',
      'Le mur : sortir d’un virage avec 2 arrêts manquants ou plus fait abandonner. La case est rouge avant que vous jouiez, et celles qui coûtent de la carrosserie sont jaunes.',
      'Connexion Discord : les erreurs sont expliquées, et un compte invité lié à Discord est reconnu.',
      'Campagne, niveau Débutant : la rivale va un peu plus vite.',
      'La course ne redessine plus l’écran quand rien ne bouge, donc le téléphone chauffe moins.',
    ],
  },
  {
    version: '0.2.2',
    date: '2026-10-21',
    notes: ['Les achats, cadeaux, équipements et récompenses s’affichent tout de suite, sans attendre le serveur.', 'Un bouton qui attend le serveur affiche une petite roue, pour ne plus se demander si le toucher a marché.', 'Le serveur répond plus vite : environ 350 ms au lieu de 800 à 3000 ms.'],
  },
  {
    version: '0.2.1',
    date: '2026-10-21',
    notes: ['Le serveur de jeu est maintenant à Paris, donc les achats et les récompenses répondent plus vite.', 'Après la mise à jour, recréez votre pseudo en invité : votre progression est reprise.'],
  },
  {
    version: '0.2.0',
    date: '2026-10-21',
    notes: [
      'Nouveau : le passe de saison gratuit, avec 30 paliers de récompenses et une saison toutes les deux semaines (onglet Quêtes).',
      'Boutique : trois offres du jour, un cadeau du jour avec une série de 7 jours, et le coffre épique.',
      'Les nouveaux comptes reçoivent un pack de bienvenue : 300 gemmes, 2000 pièces d’or et une peinture rare.',
      'Course solo contre l’IA : 10 pièces d’or par course, et 5 courses payées par heure.',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-10-21',
    notes: ['Le jeu vous prévient quand une nouvelle version est disponible.', 'Le numéro de version et les nouveautés sont dans votre profil.'],
  },
];
