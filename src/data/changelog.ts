export interface ChangelogEntry {
  version: string;
  date: string;
  notes: string[];
}

/** What changed, told to players. Most recent first; the first entry is the current version (tested). */
export const CHANGELOG: ChangelogEntry[] = [
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
