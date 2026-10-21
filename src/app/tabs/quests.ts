import { PASS_TIERS, passClaimableCount, passView } from '../../data/pass';
import { QUESTS, isClaimable, isClaimed, questProgress, type Quest } from '../../data/quests';
import { Badge, Button, Panel, ProgressBar } from '../../ui/kit';
import { el } from '../../ui/dom';
import type { AppContext, Dispose } from '../context';
import { claim } from '../economy';
import { openSeasonPass, tierBar } from '../seasonPass';
import { getProfile, onProfileChange } from '../profile';
import { playSound } from '../sound';
import { toast } from '../toast';

const rewardText = (q: Quest): string =>
  [q.reward.gold ? `🪙 ${q.reward.gold}` : '', q.reward.gems ? `💎 ${q.reward.gems}` : '', q.reward.xp ? `${q.reward.xp} XP` : ''].filter(Boolean).join(' · ');

/** Quests tab: goals with progress bars and rewards to collect. */
export function mountQuests(page: HTMLElement, ctx: AppContext): Dispose {
  const root = el('div', { class: 'tab-quests' });
  page.append(root);

  /** The season pass: progress and a way into the 30 tiers. */
  function passCard(): HTMLElement {
    const now = ctx.now();
    const v = passView(getProfile(), now);
    const bar = tierBar(v.points, v.reached);
    const waiting = passClaimableCount(getProfile(), now);
    return Panel({
      tone: 'gold',
      className: 'pass-card',
      attrs: { 'data-testid': 'pass-card' },
      children: [
        el('div', { class: 'quest__head' }, el('h2', { text: 'Passe de saison' }), el('span', { class: 'quest__reward', 'data-testid': 'pass-card-tier', text: `Palier ${v.reached} / ${PASS_TIERS}` })),
        ProgressBar({ value: bar.value, max: bar.max, tone: 'xp', label: 'Progression vers le palier suivant', text: v.reached >= PASS_TIERS ? 'Terminé !' : `${bar.value} / ${bar.max}` }),
        Button({
          text: waiting > 0 ? `Récupérer (${waiting})` : 'Voir les récompenses',
          variant: waiting > 0 ? 'green' : 'yellow',
          block: true,
          attrs: { 'data-open-pass': '' },
          onClick: () => openSeasonPass(ctx),
        }),
      ],
    });
  }

  function draw(): void {
    const p = getProfile();
    // collectable first, then in progress, collected at the end
    const rank = (q: Quest) => (isClaimable(p, q) ? 0 : isClaimed(p, q) ? 2 : 1);
    const sorted = [...QUESTS].sort((a, b) => rank(a) - rank(b));
    root.replaceChildren(
      el('h1', { class: 'tab-title', text: 'Quêtes' }),
      passCard(),
      ...sorted.map((q) => {
        const done = isClaimed(p, q);
        const progress = questProgress(p, q);
        return Panel({
          tone: isClaimable(p, q) ? 'gold' : 'blue',
          className: 'quest',
          attrs: { 'data-quest': q.id, 'data-state': done ? 'claimed' : isClaimable(p, q) ? 'claimable' : 'open' },
          children: [
            el('div', { class: 'quest__head' }, el('h2', { text: q.title }), el('span', { class: 'quest__reward', text: rewardText(q) })),
            ProgressBar({ value: progress, max: q.target, tone: done ? 'green' : 'gold', label: q.title, text: `${progress} / ${q.target}`, small: false }),
            done
              ? Badge({ text: '✓ Récupérée', tone: 'green' })
              : Button({
                  text: 'Récupérer',
                  variant: 'yellow',
                  block: true,
                  disabled: !isClaimable(p, q),
                  attrs: { 'data-claim': q.id, 'aria-label': `Récupérer la récompense : ${q.title}` },
                  onClick: async () => {
                    const r = await claim(q.id, ctx);
                    if (r) {
                      playSound(r.levelUp ? 'levelup' : 'coin');
                      toast(r.levelUp ? `Niveau ${r.levelUp} atteint !` : `Récompense récupérée : ${rewardText(q)}`);
                    }
                  },
                }),
          ],
        });
      }),
    );
  }

  draw();
  return onProfileChange(draw);
}
