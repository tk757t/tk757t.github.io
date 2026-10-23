import { getItem } from '../data/parts/catalogue';
import type { Card } from '../data/parts/packs';
import { CHESTS, type ChestTier } from '../data/chests';
import { Button, Modal, RarityFrame, setButtonText } from '../ui/kit';
import { el, prefersReducedMotion } from '../ui/dom';
import { cardFace, itemIcon } from './itemView';
import { playSound, type Sfx } from './sound';

const badgeOf = (c: Card): string => (c.isNew ? 'NOUVEAU' : `Doublon · +${c.fragments} fragments`);

/** Reveals the five cards of an opened pack one by one, then shows the loot summary. */
export function showPackReveal(loot: { cards: Card[]; gold?: number; gems?: number; tier?: ChestTier; pityTriggered?: boolean }, onDone: () => void): void {
  const { cards } = loot;
  const modal = Modal({ title: loot.tier ? `Coffre ${CHESTS[loot.tier].label}` : 'Paquet', label: 'Ouverture du coffre', dismissible: false, testid: 'pack-reveal' });

  function reveal(index: number): void {
    const card = cards[index];
    const item = getItem(card.itemId);
    if (!item) return summary();
    const reduced = prefersReducedMotion();
    const last = index === cards.length - 1;
    const flipper = el(
      'div',
      { class: 'card3d', 'data-testid': 'reveal-card', 'data-rarity': card.rarity },
      el(
        'div',
        { class: 'inner' },
        el('div', { class: 'back' }, el('span', { text: '4' }), el('small', { text: 'MULES' })),
        el('div', { class: 'front' }, cardFace(item, { badge: badgeOf(card) })),
      ),
    );
    const action = Button({ text: 'Révéler', variant: 'yellow', size: 'lg', block: true, silent: true });
    const skip = Button({ text: 'Tout révéler', variant: 'ghost', block: true, onClick: summary });
    let revealed = false;
    action.onclick = () => {
      if (!revealed) {
        revealed = true;
        flipper.classList.add('flipped');
        playSound(`reveal-${card.rarity}` as Sfx);
        setButtonText(action, last ? 'Terminer' : 'Suivant');
        if (!reduced) {
          action.disabled = true;
          setTimeout(() => (action.disabled = false), 650); // let the flip finish
        }
      } else if (last) summary();
      else reveal(index + 1);
    };
    modal.body.replaceChildren(el('p', { class: 'reveal__progress', 'data-testid': 'reveal-progress', text: `Carte ${index + 1}/${cards.length}` }), flipper, action, skip);
  }

  function summary(): void {
    const fragments = cards.reduce((s, c) => s + c.fragments, 0);
    const news = cards.filter((c) => c.isNew).length;
    modal.body.replaceChildren(
      el(
        'ul',
        { class: 'loot', 'data-testid': 'loot' },
        ...cards.map((c) => {
          const item = getItem(c.itemId);
          return el(
            'li',
            { 'data-item': c.itemId },
            RarityFrame(c.rarity, [
              el('span', { class: 'icon', 'aria-hidden': 'true', text: item ? itemIcon(item) : '?' }),
              el('span', { class: 'name', text: item?.name ?? c.itemId }),
              el('span', { class: 'tag', text: badgeOf(c) }),
            ], { className: 'loot__row' }),
          );
        }),
      ),
      el('p', { class: 'muted', text: `${news} nouveauté${news > 1 ? 's' : ''} · +${fragments} fragments` }),
      ...(loot.gold !== undefined
        ? [el('p', { class: 'loot__currency', 'data-testid': 'loot-currency', text: `🪙 +${loot.gold} or${loot.gems ? ` · 💎 +${loot.gems} gemmes` : ''}` })]
        : []),
      ...(loot.pityTriggered ? [el('p', { class: 'muted', text: 'Une carte légendaire était garantie dans ce coffre !' })] : []),
      Button({
        text: 'Continuer',
        variant: 'green',
        size: 'lg',
        block: true,
        onClick: () => {
          modal.close();
          onDone();
        },
      }),
    );
  }

  reveal(0);
}
