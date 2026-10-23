import { CHESTS, CHEST_TIERS, PITY_CHESTS, WINS_PER_RARE, tierOdds, type ChestTier } from '../data/chests';
import { RARITIES, type Rarity } from '../data/parts/types';
import { Button, Modal, RarityFrame } from '../ui/kit';
import { el } from '../ui/dom';

const RARITY_LABEL: Record<Rarity, string> = { common: 'Commune', rare: 'Rare', epic: 'Épique', legendary: 'Légendaire' };

/** "5 h", "30 min", "12 h". */
export function durationText(ms: number): string {
  const min = Math.round(ms / 60_000);
  return min >= 60 && min % 60 === 0 ? `${min / 60} h` : `${min} min`;
}

const pct = (x: number): string => `${Number.isInteger(x) ? x : x.toFixed(1).replace('.', ',')} %`;
const range = (r: [number, number]): string => (r[0] === r[1] ? String(r[0]) : `${r[0]} à ${r[1]}`);

/** The window that lists what each chest quality holds and its odds (shown to comply with the disclosure of drop rates). */
export function showChestInfo(): void {
  const rows = CHEST_TIERS.map((tier) => {
    const d = CHESTS[tier];
    return RarityFrame(
      tier,
      [
        el('h3', { class: 'chest-info__title', text: `Coffre ${d.label}` }),
        el('p', { class: 'chest-info__line', text: `Ouverture : ${durationText(d.unlockMs)} · ${d.cards} cartes` }),
        el('p', { class: 'chest-info__line', text: `🪙 ${range(d.gold)} or${d.gems[1] > 0 ? ` · 💎 ${range(d.gems)} gemmes` : ' · pas de gemmes'}` }),
        el('p', { class: 'chest-info__line', 'data-testid': `rates-${tier}`, text: `Chaque carte : ${RARITIES.map((r) => `${RARITY_LABEL[r]} ${pct(d.weights[r])}`).join(' · ')}` }),
      ],
      { className: 'chest-info__row', attrs: { 'data-tier': tier } },
    );
  });
  const first = (t: ChestTier, rank: number, players: number): string => pct(tierOdds(rank, players)[t]);
  const modal = Modal({
    title: 'Contenu des coffres',
    testid: 'chest-info',
    children: [
      ...rows,
      el('h3', { class: 'chest-info__title', text: 'Comment les obtenir' }),
      el('p', { class: 'chest-info__line', text: `Un coffre est gagné à chaque course terminée, et un second pour la victoire. Sa qualité est tirée à l’obtention selon votre place (à 4 joueurs, 1er : ${(['common', 'rare', 'epic', 'legendary'] as const).map((t) => `${CHESTS[t].label} ${first(t, 1, 4)}`).join(', ')} ; dernier : ${(['common', 'rare', 'epic', 'legendary'] as const).map((t) => `${CHESTS[t].label} ${first(t, 4, 4)}`).join(', ')}).` }),
      el('p', { class: 'chest-info__line', text: `Une victoire sur ${WINS_PER_RARE} donne au moins un coffre Rare.` }),
      el('p', { class: 'chest-info__line', text: `Si ${PITY_CHESTS - 1} coffres de suite ne contiennent aucune carte légendaire, le suivant en contient une.` }),
      el('p', { class: 'chest-info__line', text: 'Accélérer un coffre coûte 1 gemme par tranche de 10 minutes restantes, avec 1 gemme au minimum. Le contenu ne change pas.' }),
    ],
    actions: [Button({ text: 'Fermer', variant: 'ghost', onClick: () => modal.close() })],
  });
}
