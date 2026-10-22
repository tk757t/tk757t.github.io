export const PUBLISHER = 'FenrirT';

export interface PrivacySection {
  title: string;
  lines: string[];
}

/** The privacy notice shown in the game. Lines starting with "• " are list items. Kept exact: see supabase/migrations for what is stored. */
export const PRIVACY: PrivacySection[] = [
  {
    title: 'Qui édite le jeu',
    lines: [`4 Mules est édité par ${PUBLISHER}. Pour toute question sur vos données, écrivez à ${PUBLISHER}.`],
  },
  {
    title: 'Ce que le jeu garde',
    lines: [
      '• Votre pseudo, visible par les autres joueurs.',
      '• Un identifiant de compte interne, généré au hasard.',
      '• Votre progression : or, gemmes, voitures, pièces, trophées, courses.',
      '• Vos messages dans le chat, vos blocages et vos signalements.',
      '• Un journal technique des actions du jeu (pour empêcher la triche) et votre présence en ligne.',
      'Aucun nom, adresse, téléphone ni position n’est demandé. Une partie est aussi sauvegardée dans votre navigateur.',
    ],
  },
  {
    title: 'Si vous liez Discord',
    lines: [
      'Le jeu garde votre identifiant Discord. Discord transmet aussi l’adresse e-mail de votre compte Discord : elle est conservée par notre service de comptes (Supabase, base hébergée à Paris), mais le jeu ne la lit jamais, ne l’affiche à personne et ne s’en sert pas.',
      'Le jeu n’a accès ni à vos serveurs, ni à vos messages Discord, ni à vos amis.',
    ],
  },
  {
    title: 'Supprimer votre compte',
    lines: [
      'Profil → « Supprimer mon compte », puis confirmation en deux étapes. La suppression est immédiate et définitive : compte, pseudo (libéré aussitôt), progression, messages et identité Discord sont effacés du serveur, et les données de cet appareil aussi.',
      'Discord garde de son côté l’autorisation donnée au jeu. Pour la retirer : Discord → Paramètres utilisateur → Applications autorisées → 4 Mules → Désautoriser.',
    ],
  },
];

/** The sentence the player types to confirm the deletion (their pseudo, compared without regard to case). */
export const deleteConfirmed = (typed: string, pseudo: string): boolean => typed.trim().length > 0 && typed.trim().toLowerCase() === pseudo.trim().toLowerCase();
