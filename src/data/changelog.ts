export interface ChangelogEntry {
  version: string;
  date: string;
  notes: string[];
}

/** What changed, told to players. Most recent first; the first entry is the current version (tested). */
export const CHANGELOG: ChangelogEntry[] = [
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
