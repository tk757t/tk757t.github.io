import { CHESTS } from '../data/chests';
import { getItem } from '../data/parts/catalogue';
import { PASS_TIERS, TIER_POINTS, passView, type PassReward } from '../data/pass';
import { Badge, Button, Modal, ProgressBar, type ModalHandle } from '../ui/kit';
import { el } from '../ui/dom';
import type { AppContext } from './context';
import { claimPass } from './economy';
import { getProfile, onProfileChange } from './profile';
import { playSound } from './sound';
import { toast } from './toast';

const COSMETIC_ICON = { paint: '🎨', number: '🔢', helmet: '⛑️' } as const;

/** What a pass reward looks like: an icon and a short French text. */
export function rewardInfo(r: PassReward): { icon: string; text: string } {
  switch (r.kind) {
    case 'gold':
      return { icon: '🪙', text: `${r.amount} or` };
    case 'gems':
      return { icon: '💎', text: `${r.amount} gemmes` };
    case 'fragments':
      return { icon: '🔷', text: `${r.amount} fragments` };
    case 'chest':
      return { icon: '🎁', text: `Coffre ${CHESTS[r.tier].label.toLowerCase()}` };
    case 'item': {
      const item = getItem(r.itemId);
      return { icon: item?.kind === 'cosmetic' ? COSMETIC_ICON[item.cosmetic] : '🎁', text: item?.name ?? r.itemId };
    }
  }
}

/** "9 j 4 h", "5 h 12 min", "12 min". */
export function formatSeasonLeft(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  if (d > 0) return `${d} j ${h} h`;
  return h > 0 ? `${h} h ${String(minutes % 60).padStart(2, '0')} min` : `${minutes} min`;
}

/** Points inside the current tier, and the size of a tier (the pass bar fills tier by tier). */
export function tierBar(points: number, reached: number): { value: number; max: number } {
  return reached >= PASS_TIERS ? { value: TIER_POINTS, max: TIER_POINTS } : { value: points - reached * TIER_POINTS, max: TIER_POINTS };
}

/** The season pass window: progress, the 30 tiers of the free track, and the locked premium track. */
export function openSeasonPass(ctx: AppContext): ModalHandle {
  let off = (): void => undefined;
  const modal = Modal({ title: 'Passe de saison', testid: 'pass-modal', onClose: () => off() });

  function draw(): void {
    const v = passView(getProfile(), ctx.now());
    const bar = tierBar(v.points, v.reached);
    const progress = ProgressBar({
      value: bar.value,
      max: bar.max,
      tone: 'xp',
      label: 'Progression vers le palier suivant',
      text: v.reached >= PASS_TIERS ? 'Passe terminé !' : `${bar.value} / ${bar.max}`,
      attrs: { 'data-testid': 'pass-progress' },
    });
    const top = modal.body.scrollTop;
    modal.body.replaceChildren(
      el(
        'div',
        { class: 'pass-head' },
        el('p', { class: 'pass-head__line', 'data-testid': 'pass-season', text: `Saison ${v.season + 1} · se termine dans ${formatSeasonLeft(v.endsAt - ctx.now())}` }),
        el('p', { class: 'pass-head__line', 'data-testid': 'pass-tier', text: `Palier ${v.reached} / ${PASS_TIERS} · ${v.points} points` }),
        progress,
        el('p', { class: 'muted', text: v.reached >= PASS_TIERS ? 'Tout est gagné cette saison. Revenez à la prochaine !' : `Encore ${v.toNext} points pour le palier ${v.reached + 1}. Course : 10 points, victoire : 30, quête : 20.` }),
      ),
      el('div', { class: 'pass-premium', 'data-testid': 'pass-premium' }, el('span', { 'aria-hidden': 'true', text: '🔒' }), el('span', { text: 'Piste premium : bientôt disponible' })),
      el(
        'ol',
        { class: 'pass-tiers', 'data-testid': 'pass-tiers' },
        ...v.tiers.map((t) => {
          const info = rewardInfo(t.reward);
          const claimable = t.reached && !t.claimed;
          return el(
            'li',
            { class: `pass-tier${claimable ? ' pass-tier--ready' : ''}${t.claimed ? ' pass-tier--done' : ''}`, 'data-tier': String(t.tier), 'data-state': t.claimed ? 'claimed' : claimable ? 'ready' : 'locked' },
            el('span', { class: 'pass-tier__n', text: String(t.tier) }),
            el('span', { class: 'pass-tier__icon', 'aria-hidden': 'true', text: info.icon }),
            el('span', { class: 'pass-tier__text', text: info.text }),
            t.claimed
              ? Badge({ text: '✓', tone: 'green', label: `Palier ${t.tier} récupéré` })
              : Button({
                  text: claimable ? 'Récupérer' : `🔒 ${t.tier * TIER_POINTS}`,
                  variant: claimable ? 'green' : 'ghost',
                  disabled: !claimable,
                  attrs: { 'data-claim-tier': String(t.tier), 'aria-label': claimable ? `Récupérer la récompense du palier ${t.tier} : ${info.text}` : `Palier ${t.tier} : ${t.tier * TIER_POINTS} points nécessaires` },
                  onClick: async () => {
                    const r = await claimPass(t.tier, ctx);
                    if (!r) return;
                    playSound('coin');
                    const got = rewardInfo(r.reward);
                    toast(r.fragments ? `Palier ${t.tier} : déjà possédé, +${r.fragments} 🔷` : `Palier ${t.tier} : ${got.icon} ${got.text}`);
                  },
                }),
          );
        }),
      ),
    );
    modal.body.scrollTop = top; // a collected reward redraws the list: stay where the player was
  }

  draw();
  off = onProfileChange(draw);
  return modal;
}
