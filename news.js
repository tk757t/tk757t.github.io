// Version du site et nouveautés affichées dans la fenêtre « Nouveautés » (la plus récente en premier).
// Règle de version :
//  - petit changement ou correction : seulement +0.0.1 sur TIER_VERSION (aucune entrée, aucun pop-up) ;
//  - vraie nouveauté : nouvelle version x.y.0 + une entrée en HAUT de TIER_NEWS (le pop-up s'ouvre alors une fois pour chaque membre).
window.TIER_VERSION = "1.12.0";
window.TIER_NEWS = [
  {
    v: "1.12.0", date: "25/11/2026", title: "Historique des mises à jour de WoW",
    items: [
      { t: "📰 Nouvel onglet « Maj WoW »", d: "Toutes les mises à jour et correctifs de WoW: Forever depuis le lancement (4 novembre), classés par date en menus déroulants, avec le détail par catégorie (classes, donjons, objets, métiers, quêtes…)." },
    ],
  },
  {
    v: "1.11.0", date: "23/11/2026", title: "BroForever devient TierTrack",
    items: [
      { t: "🌍 Ouvert à tous les joueurs", d: "Le site s'appelle maintenant TierTrack et s'adresse à tous les joueurs de WoW Forever, sans notion de guilde. Le classement compare désormais tous les joueurs du site." },
    ],
  },
  {
    v: "1.10.0", date: "23/11/2026", title: "Où trouver chaque objet BiS",
    items: [
      { t: "🗺 Comment obtenir chaque objet (onglet BiS)", d: "Chaque BiS et chaque alternative indique maintenant comment l'obtenir : boss et donjon avec le % de drop, quête, métier, réputation, JcJ, drop en monde ou set de tier. Les sources viennent des données du jeu Forever." },
    ],
  },
  {
    v: "1.9.0", date: "23/11/2026", title: "Le Profil en page d'accueil",
    items: [
      { t: "🏠 Le Profil devient la page d'accueil", d: "Il est maintenant en haut du menu et s'ouvre en premier." },
    ],
  },
  {
    v: "1.8.0", date: "23/11/2026", title: "Préparations de raids : Onyxia",
    items: [
      { t: "🐉 Nouvel onglet « Préparations raids »", d: "Suis ta chaîne d'attunement pour entrer dans le repaire d'Onyxia : toutes les quêtes jusqu'à l'Amulette drakefeu, adaptées à ta faction (Alliance ou Horde)." },
      { t: "📖 Détail de chaque quête", d: "Clique sur une étape pour voir le texte officiel (Wowhead Forever, en français), le lieu, le donjon à prévoir et des astuces. Coche les étapes au fur et à mesure : elles sont sauvegardées avec ton personnage." },
      { t: "➕ D'autres raids bientôt", d: "On ajoutera les préparations des prochains raids au même endroit." },
    ],
  },
  {
    v: "1.7.0", date: "22/11/2026", title: "Chaîne de quêtes détaillée",
    items: [
      { t: "📖 Clique sur une étape pour la dérouler", d: "Texte officiel de la quête (Wowhead Forever, en français) adapté à ta classe et à ta faction, objets à apporter, lieu, échange des pièces T0 → T0.5 et astuces." },
      { t: "☑ Case à cocher séparée", d: "La case à gauche marque l'étape comme terminée ; un clic ailleurs sur l'étape déroule ou replie son détail." },
      { t: "✅ 3e seigneur du feu confirmé", d: "L'étape « Les trois rois des flammes » demande la Cendre d'Asharell : la contradiction entre les guides est levée." },
    ],
  },
  {
    v: "1.6.0", date: "22/11/2026", title: "Alerte de mise à jour",
    items: [
      { t: "🔔 Nouvelle version disponible", d: "Si tu gardes le site ouvert, une petite bulle te prévient dès qu'une mise à jour est en ligne, avec un bouton pour recharger (ta progression est sauvegardée avant)." },
      { t: "✨ Nouveautés et version", d: "Cette fenêtre s'ouvre à chaque mise à jour. Le numéro de version et le lien « Nouveautés » sont en bas de page." },
    ],
  },
  {
    v: "1.5.0", date: "22/11/2026", title: "Profil, BiS et nouveau look",
    items: [
      { t: "👤 Nouvelle page Profil", d: "Gère tous tes personnages au même endroit : ajoute-en, passe de l'un à l'autre et indique la spécialisation de chacun (les BiS en dépendent)." },
      { t: "⚔ Page BiS", d: "Les meilleurs objets de chaque emplacement selon ta spécialisation, avec leurs alternatives. Coche-les au fur et à mesure." },
      { t: "🎭 Portraits de classe", d: "L'icône de ta classe s'affiche à côté de ton nom, dans le classement et sur les fiches." },
      { t: "🧭 Menu à gauche", d: "Navigation en colonne avec icônes, et un design plus clair et plus lisible." },
      { t: "🏆 Fiches du classement", d: "Clique sur un pseudo du classement pour voir la progression d'un membre." },
    ],
  },
];
