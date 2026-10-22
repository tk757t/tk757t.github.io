import { AI_LABELS } from '../../ai';
import { LEVELS, goalText, opponentLook, type CampaignLevel } from '../../data/campaign';
import { assets } from '../../data/assets';
import { TRACKS, trackInfo } from '../../data/tracks';
import { trackThumbUrl } from '../trackThumb';
import { Badge, Button, Modal, Panel, ProgressBar } from '../../ui/kit';
import { el } from '../../ui/dom';
import type { AppContext, Dispose } from '../context';
import type { Controller } from '../setup';
import { MAX_STARS, levelStatus, starsOf, totalStars, type LevelStatus } from '../../storage/campaign';
import { getProfile, onProfileChange } from '../profile';

const PACK_LABELS = { common: 'paquet commun', rare: 'paquet rare', epic: 'paquet épique' } as const;

const trackOf = (level: CampaignLevel) => trackInfo(level.trackId);

/** Chance (in %) that the first d20 of the race gives rain, from the weather thresholds of the circuit. */
export const rainChance = (level: CampaignLevel): number => Math.round(((trackOf(level)?.weather.rain ?? 1) - 1) * 5);

const starRow = (earned: number, testid?: string): HTMLElement =>
  el(
    'span',
    { class: 'stars stars--small', ...(testid ? { 'data-testid': testid } : {}), 'data-stars': String(earned), role: 'img', 'aria-label': `${earned} étoile${earned > 1 ? 's' : ''} sur ${MAX_STARS}` },
    ...Array.from({ length: MAX_STARS }, (_, i) => el('span', { class: `star${i < earned ? ' star--on' : ''}`, text: i < earned ? '★' : '☆' })),
  );

function weatherText(level: CampaignLevel): string {
  return level.weather === 'sun' ? '☀️ Soleil toute la course' : `🌦️ Variable · ${rainChance(level)} % de pluie au départ`;
}

function thumb(level: CampaignLevel, status: LevelStatus): HTMLElement {
  const info = trackOf(level);
  const frame = el('div', { class: `thumb thumb--${status}`, 'data-testid': 'thumb' });
  const def = TRACKS[level.trackId];
  if (info?.thumb) frame.append(el('img', { class: 'thumb__img', src: `${import.meta.env.BASE_URL}${info.thumb}`, alt: `Plateau de ${info.name}`, loading: 'lazy' }));
  else if (def) frame.append(el('img', { class: 'thumb__img', src: trackThumbUrl(def), alt: `Tracé de ${def.name}` }));
  else frame.append(el('span', { class: 'thumb__none', text: info?.name ?? level.trackId }));
  if (status === 'locked') frame.append(el('span', { class: 'thumb__lock', 'aria-hidden': 'true', text: '🔒' }));
  return frame;
}

function opponentRow(o: CampaignLevel['opponents'][number]): HTMLElement {
  const look = opponentLook(o);
  const car = look.car === null ? null : assets.carSprite(look.car);
  const face = look.portrait === null ? null : assets.driverPortrait(look.portrait);
  return el(
    'li',
    { class: 'rival', 'data-testid': 'rival' },
    face ? el('img', { class: 'portrait', src: face, alt: '' }) : null,
    el('span', { class: 'rival__name', text: `${look.driver} · ${look.team}` }),
    car ? el('img', { class: 'rival__car', src: car, alt: '' }) : null,
    Badge({ text: AI_LABELS[o.ai], tone: o.ai === 'hard' ? 'red' : o.ai === 'medium' ? 'gold' : 'green' }),
  );
}

/** Campaign tab: a path of three levels on our circuits, each opened by finishing the one before. */
export function mountCampaign(page: HTMLElement, ctx: AppContext): Dispose {
  const root = el('div', { class: 'tab-campaign' });
  page.append(root);

  function play(index: number): void {
    const level = LEVELS[index];
    ctx.startRace({
      ...ctx.config(),
      players: 1 + level.opponents.length,
      controllers: (['human', ...level.opponents.map((o) => o.ai), 'human'] as Controller[]).slice(0, 4),
      trackId: level.trackId,
      laps: level.laps,
      level: index,
      useGear: true,
    });
  }

  function briefing(index: number): void {
    const level = LEVELS[index];
    const best = starsOf(getProfile().campaign, index);
    const modal = Modal({
      title: `${index + 1}. ${level.name}`,
      testid: 'level-briefing',
      children: [
        thumb(level, 'next'),
        el('p', { class: 'muted', text: `${trackOf(level)?.name ?? level.trackId} · ${level.laps} tours · ${weatherText(level)}` }),
        el('h3', { class: 'sub', text: 'Adversaires' }),
        el('ul', { class: 'rivals' }, ...level.opponents.map(opponentRow)),
        el('h3', { class: 'sub', text: 'Objectifs' }),
        el(
          'ul',
          { class: 'goals', 'data-testid': 'level-goals' },
          ...level.goals.map((g, i) => el('li', { class: i < best ? 'goal goal--met' : 'goal' }, el('span', { text: i < best ? '★' : '☆' }), el('span', { text: goalText(g) }))),
        ),
        el('p', { class: 'muted', text: `Première victoire : 🪙 ${level.reward.gold} · 💎 ${level.reward.gems} · ${level.reward.xp} XP · ${PACK_LABELS[level.reward.pack.tier]}${level.reward.pack.guaranteedPart ? ' + une pièce garantie' : ''}. Chaque nouvelle étoile : 💎 ${level.starGems}.` }),
      ],
      actions: [
        Button({
          text: 'Jouer',
          variant: 'green',
          size: 'lg',
          attrs: { 'data-testid': 'play-level' },
          onClick: () => {
            modal.close();
            play(index);
          },
        }),
      ],
    });
  }

  function draw(): void {
    const progress = getProfile().campaign;
    root.replaceChildren(
      el('h1', { class: 'tab-title', text: 'Campagne' }),
      ProgressBar({ value: totalStars(progress), max: LEVELS.length * MAX_STARS, tone: 'gold', label: 'Étoiles de la campagne', text: `${totalStars(progress)} / ${LEVELS.length * MAX_STARS} ★`, attrs: { 'data-testid': 'campaign-progress' } }),
      el(
        'ol',
        { class: 'road', 'data-testid': 'road' },
        ...LEVELS.map((level, i) => {
          const status = levelStatus(progress, i);
          const stars = starsOf(progress, i);
          const action =
            status === 'locked'
              ? Button({ text: '🔒 Verrouillé', variant: 'ghost', disabled: true, attrs: { 'aria-label': `Niveau ${i + 1} verrouillé` } })
              : Button({
                  text: status === 'next' ? 'Jouer' : 'Rejouer',
                  variant: status === 'next' ? 'green' : 'blue',
                  attrs: { 'data-stage': i, 'aria-label': `${status === 'next' ? 'Jouer' : 'Rejouer'} le niveau ${i + 1}, ${level.name}` },
                  onClick: () => briefing(i),
                });
          return el(
            'li',
            { class: `road__stop road__stop--${status}${i % 2 ? ' road__stop--right' : ''}`, 'data-stage-card': i, 'data-status': status },
            el('span', { class: 'road__marker', 'aria-hidden': 'true', text: status === 'locked' ? '🔒' : String(i + 1) }),
            Panel({
              tone: status === 'next' ? 'gold' : status === 'locked' ? 'dark' : 'blue',
              className: 'level',
              children: [
                thumb(level, status),
                el(
                  'div',
                  { class: 'level__text' },
                  el('h2', { text: `${i + 1}. ${level.name}` }),
                  el('p', { class: 'muted', text: `${trackOf(level)?.name ?? level.trackId} · ${level.laps} tours` }),
                  el('p', { class: 'muted', text: `${level.opponents.length} adversaire${level.opponents.length > 1 ? 's' : ''} · ${level.opponents.map((o) => AI_LABELS[o.ai]).join(', ')}` }),
                  starRow(stars, `level-stars-${i}`),
                ),
                action,
              ],
            }),
          );
        }),
      ),
    );
  }

  draw();
  return onProfileChange(draw);
}
