import { GIFT_FRAGMENTS, GIFT_GOLD, GIFT_STREAK_DAYS, WELCOME_GEMS, WELCOME_GOLD, giftStatus, welcomeAvailable } from '../../data/gift';
import { OFFERS, canAfford, dailyView, msUntilNextDay, type Offer } from '../../data/shop';
import { Button, Panel } from '../../ui/kit';
import { el } from '../../ui/dom';
import type { AppContext, Dispose } from '../context';
import { buy, claimGiftOfDay, claimWelcomePack } from '../economy';
import { getProfile, isServerBacked, onProfileChange } from '../profile';
import { playSound } from '../sound';
import { toast } from '../toast';

/** "5 h 12 min", or "12 min" under the hour. */
export function formatReset(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const h = Math.floor(minutes / 60);
  return h > 0 ? `${h} h ${String(minutes % 60).padStart(2, '0')} min` : `${minutes} min`;
}

/** Shop tab: the offers of the day (new ones every day), then the permanent offers; spend gold and gems. */
export function mountShop(page: HTMLElement, ctx: AppContext): Dispose {
  const root = el('div', { class: 'tab-shop' });
  page.append(root);
  let shownDay = '';
  let reset: HTMLElement | null = null;
  let welcomeLeft: HTMLElement | null = null;
  let shownWelcome = false;
  let shownGift = false;

  function card(offer: Offer, bought = false, daily = false): HTMLElement {
    const p = getProfile();
    const unit = offer.currency === 'gold' ? 'or' : 'gemmes';
    return Panel({
      tone: bought ? 'dark' : daily ? 'gold' : 'blue',
      className: bought ? 'offer offer--bought' : 'offer',
      attrs: { 'data-offer': offer.id },
      children: [
        el('span', { class: 'offer__icon', 'aria-hidden': 'true', text: offer.icon }),
        el('div', { class: 'offer__text' }, el('h2', { text: offer.title }), el('p', { class: 'muted', text: offer.detail })),
        Button({
          text: bought ? '✓ Acheté' : `${offer.currency === 'gold' ? '🪙' : '💎'} ${offer.price}`,
          variant: bought ? 'ghost' : offer.currency === 'gold' ? 'yellow' : 'green',
          disabled: bought || !canAfford(p, offer),
          attrs: { 'aria-label': bought ? `${offer.title} : déjà acheté aujourd’hui` : `Acheter ${offer.title} pour ${offer.price} ${unit}`, 'data-buy': offer.id },
          onClick: async () => {
            if (await buy(offer.id, ctx)) {
              playSound('coin');
              toast(`${offer.title} acheté !`);
            } else if (!isServerBacked()) toast('Pas assez de ressources', 'bad'); // the server's refusal is already shown
          },
        }),
      ],
    });
  }

  /** The welcome pack on offer (accounts, 72 hours from the first connection). */
  function welcomeCard(now: number): HTMLElement {
    welcomeLeft = el('p', { class: 'muted', 'data-testid': 'welcome-left', text: `Encore ${formatReset(getProfile().welcomeUntil - now)}` });
    return Panel({
      tone: 'gold',
      className: 'offer',
      attrs: { 'data-testid': 'welcome-pack' },
      children: [
        el('span', { class: 'offer__icon', 'aria-hidden': 'true', text: '🏁' }),
        el('div', { class: 'offer__text' }, el('h2', { text: 'Pack de bienvenue' }), el('p', { class: 'muted', text: `${WELCOME_GEMS} 💎 · ${WELCOME_GOLD} 🪙 · une peinture rare` }), welcomeLeft),
        Button({
          text: 'Récupérer',
          variant: 'green',
          attrs: { 'aria-label': 'Récupérer le pack de bienvenue', 'data-claim': 'welcome' },
          onClick: async () => {
            const r = await claimWelcomePack();
            if (r) {
              playSound('coin');
              toast(`Bienvenue ! +${r.gems} 💎 +${r.gold} 🪙`);
            }
          },
        }),
      ],
    });
  }

  /** The free gift of the day, with the streak: the 7th consecutive day it is a chest. */
  function giftCard(now: number): HTMLElement {
    const g = giftStatus(getProfile(), now);
    const what = g.chest ? 'Un coffre commun' : `${GIFT_GOLD} 🪙 + ${GIFT_FRAGMENTS} 🔷`;
    const days = g.available ? `Jour ${g.cycleDay} sur ${GIFT_STREAK_DAYS}` : `Série : ${g.streak} jour${g.streak > 1 ? 's' : ''}`;
    return Panel({
      tone: g.available ? 'gold' : 'dark',
      className: g.available ? 'offer' : 'offer offer--bought',
      attrs: { 'data-testid': 'daily-gift' },
      children: [
        el('span', { class: 'offer__icon', 'aria-hidden': 'true', text: '🎁' }),
        el('div', { class: 'offer__text' }, el('h2', { text: 'Cadeau du jour' }), el('p', { class: 'muted', text: g.available ? what : 'Revenez demain !' }), el('p', { class: 'muted', text: `${days} · le ${GIFT_STREAK_DAYS}e jour : un coffre` })),
        Button({
          text: g.available ? 'Récupérer' : '✓ Pris',
          variant: g.available ? 'green' : 'ghost',
          disabled: !g.available,
          attrs: { 'aria-label': g.available ? 'Récupérer le cadeau du jour' : 'Cadeau du jour déjà récupéré', 'data-claim': 'gift' },
          onClick: async () => {
            const r = await claimGiftOfDay(ctx);
            if (r) {
              playSound('coin');
              toast(r.chest ? 'Cadeau du jour : un coffre commun !' : `Cadeau du jour : +${r.gold} 🪙 +${r.fragments} 🔷`);
            } else if (!isServerBacked()) toast('Cadeau déjà récupéré', 'bad');
          },
        }),
      ],
    });
  }

  function draw(): void {
    const now = ctx.now();
    const daily = dailyView(getProfile(), now);
    shownDay = daily.day;
    shownWelcome = welcomeAvailable(getProfile(), now);
    shownGift = giftStatus(getProfile(), now).available;
    welcomeLeft = null;
    reset = el('span', { class: 'muted', 'data-testid': 'daily-reset', text: `Nouvelles offres dans ${formatReset(msUntilNextDay(now))}` });
    root.replaceChildren(
      el('h1', { class: 'tab-title', text: 'Boutique' }),
      el('p', { class: 'muted', text: 'Or et gemmes se gagnent en course, en campagne et avec les quêtes.' }),
      ...(shownWelcome ? [el('div', { class: 'shop-head' }, el('h2', { text: 'Offre du moment' })), welcomeCard(now)] : []),
      giftCard(now),
      el('div', { class: 'shop-head' }, el('h2', { text: 'Offres du jour' }), reset),
      el('div', { class: 'offer-list', 'data-testid': 'daily-offers' }, ...daily.offers.map((o) => card(o.offer, o.bought, true))),
      el('div', { class: 'shop-head' }, el('h2', { text: 'Coffres et ressources' })),
      ...OFFERS.map((offer) => card(offer)),
    );
  }

  draw();
  const offProfile = onProfileChange(draw);
  // the countdown runs every second; at midnight (Paris) the offers are drawn again
  const offTick = ctx.onTick(() => {
    const now = ctx.now();
    const changed = dailyView(getProfile(), now).day !== shownDay || welcomeAvailable(getProfile(), now) !== shownWelcome || giftStatus(getProfile(), now).available !== shownGift;
    if (changed) draw();
    else if (welcomeLeft) welcomeLeft.textContent = `Encore ${formatReset(getProfile().welcomeUntil - now)}`;
    if (!changed && reset) reset.textContent = `Nouvelles offres dans ${formatReset(msUntilNextDay(now))}`;
  });
  return () => {
    offProfile();
    offTick();
  };
}
