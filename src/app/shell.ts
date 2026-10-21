import { passClaimableCount } from '../data/pass';
import { claimableCount } from '../data/quests';
import { levelProgress, readyPacks } from '../data/profile/ops';
import { Badge, Button, LevelBadge, Modal, ProgressBar, setLevelBadge, setProgress } from '../ui/kit';
import { el } from '../ui/dom';
import { carSvg, lookOf } from './carSvg';
import { TAB_ORDER, type AppContext, type Dispose, type TabId } from './context';
import { getProfile, onProfileChange } from './profile';
import { assets } from '../data/assets';
import { profilePortraitIndex } from './portrait';
import { LEVEL_COUNT } from '../data/campaign/levels';
import { MAX_STARS, totalStars } from '../storage/campaign';
import { CHANGELOG } from '../data/changelog';
import { currentBuild } from './updater';
import { getAccount, linkDiscord, accountError } from './account';
import { toast } from './toast';
import { openChat } from './chatScreen';
import { openLeaderboard } from './leaderboardScreen';
import { currentRanked } from '../data/ranked';
import { onSoundChange, playSound, setSoundEnabled, soundEnabled } from './sound';

const TAB_INFO: Record<TabId, { label: string; icon: string }> = {
  shop: { label: 'Boutique', icon: '🛒' },
  garage: { label: 'Garage', icon: '🔧' },
  race: { label: 'Course', icon: '🏁' },
  campaign: { label: 'Campagne', icon: '🗺️' },
  quests: { label: 'Quêtes', icon: '📜' },
};

export type TabMounter = (container: HTMLElement, ctx: AppContext) => Dispose;

export interface Shell {
  setTab(tab: TabId): void;
  tab(): TabId;
  destroy(): void;
}

const SWIPE_DISTANCE = 56;

/**
 * Menu frame: top bar (avatar, level, gold, gems, XP), five swipeable pages and the tab bar with
 * the big COURSE button in the middle.
 */
export function createShell(root: HTMLElement, ctx: AppContext, mounters: Record<TabId, TabMounter>, initial: TabId = 'race'): Shell {
  // ------------------------------------------------------------ top bar
  const avatar = el('button', { type: 'button', class: 'avatar', 'aria-label': 'Profil', 'data-testid': 'avatar' });
  const levelBadge = LevelBadge(1, { attrs: { 'data-testid': 'level' } });
  levelBadge.classList.add('avatar__level');
  const goldPill = Badge({ text: '0', tone: 'gold', icon: '🪙', label: 'Or', attrs: { 'data-testid': 'gold' } });
  const gemPill = Badge({ text: '0', tone: 'gold', icon: '💎', label: 'Gemmes', attrs: { 'data-testid': 'gems' } });
  const xpBar = ProgressBar({ value: 0, max: 100, tone: 'xp', label: 'Expérience', small: false, attrs: { 'data-testid': 'xp' } });
  const levelText = el('span', { class: 'topbar__level', 'data-testid': 'level-text', text: 'Niv. 1' });
  const soundBtn = Button({ text: '', variant: 'ghost', silent: true, attrs: { 'data-testid': 'sound-toggle' }, onClick: () => {
    const on = !soundEnabled();
    setSoundEnabled(on);
    if (on) playSound('confirm');
  } });
  soundBtn.classList.add('topbar__sound');
  // the ranking and the chat are read on the server: they need an account with a pseudo; the ranking sits right of the gems
  const boardBtn = Button({ text: '🏆', variant: 'ghost', silent: true, attrs: { 'data-testid': 'board-open', 'aria-label': 'Classement' }, onClick: () => void openLeaderboard() });
  boardBtn.classList.add('topbar__sound');
  // the chat needs an account with a pseudo (the server decides who writes): without one the button is hidden
  const chatBtn = Button({ text: '💬', variant: 'ghost', silent: true, attrs: { 'data-testid': 'chat-open', 'aria-label': 'Chat' }, onClick: () => void openChat() });
  chatBtn.classList.add('topbar__sound');

  const top = el(
    'header',
    { class: 'topbar-ui' },
    el('div', { class: 'avatar-wrap' }, avatar, levelBadge),
    el('div', { class: 'topbar-ui__right' }, el('div', { class: 'topbar-ui__pills' }, goldPill, gemPill, boardBtn, chatBtn, soundBtn), el('div', { class: 'topbar-ui__xp' }, levelText, xpBar)),
  );

  function drawTop(): void {
    const p = getProfile();
    const lp = levelProgress(p.xp);
    avatar.innerHTML = carSvg(lookOf(p.loadout));
    setLevelBadge(levelBadge, lp.level);
    goldPill.querySelector('.kit-badge__text')!.textContent = String(p.gold);
    gemPill.querySelector('.kit-badge__text')!.textContent = String(p.gems);
    levelText.textContent = `Niv. ${lp.level}`;
    setProgress(xpBar, lp.into, lp.span, `${lp.into} / ${lp.span} XP`);
    chatBtn.hidden = boardBtn.hidden = !getAccount()?.pseudo;
    const on = soundEnabled();
    soundBtn.textContent = on ? '🔊' : '🔇';
    soundBtn.setAttribute('aria-label', on ? 'Son activé' : 'Son coupé');
    soundBtn.setAttribute('aria-pressed', String(on));
  }

  function openChangelog(): void {
    Modal({
      title: 'Nouveautés',
      testid: 'changelog-modal',
      children: CHANGELOG.map((e) =>
        el('section', { class: 'changelog__entry' }, el('h3', { text: `Version ${e.version}` }), el('ul', {}, ...e.notes.map((n) => el('li', { text: n })))),
      ),
    });
  }

  avatar.addEventListener('click', () => {
    const p = getProfile();
    const lp = levelProgress(p.xp);
    const account = getAccount();
    const ranked = currentRanked(p.ranked, Date.now());
    const rows: [string, string][] = [
      ...(account?.pseudo ? ([['Pseudo', account.pseudo]] as [string, string][]) : []),
      ['Niveau', String(lp.level)],
      ...(account?.pseudo ? ([['Ligue', ranked.league.label], ['Trophées', String(ranked.trophies)]] as [string, string][]) : []),
      ['Courses', String(p.races)],
      ['Victoires', String(p.wins)],
      ['Paquets ouverts', String(p.packsOpened)],
      ['Campagne', `${totalStars(p.campaign)}/${LEVEL_COUNT * MAX_STARS} étoiles`],
    ];
    // the driver's portrait, chosen from the race number of the loadout (the same number gives the same driver)
    const face = assets.driverPortrait(profilePortraitIndex(p));
    const portrait = face ? [el('img', { class: 'portrait portrait--big', src: face, alt: 'Pilote', 'data-testid': 'profile-portrait' })] : [];
    Modal({
      title: 'Profil',
      testid: 'profile-modal',
      children: [
        ...portrait,
        el('div', { class: 'profile-level' }, LevelBadge(lp.level, { attrs: { 'data-testid': 'profile-level' } }), ProgressBar({ value: lp.into, max: lp.span, tone: 'xp', label: 'Expérience', text: lp.into + ' / ' + lp.span + ' XP', attrs: { 'data-testid': 'profile-xp' } })),
        el('dl', { class: 'profile-stats' }, ...rows.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])),
        ...(account?.guest
          ? [
              el('p', { class: 'account__hint', text: 'Compte invité : liez-le à Discord pour le retrouver sur un autre appareil. Seul votre identifiant est utilisé, jamais votre nom ni votre e-mail.' }),
              Button({
                text: 'Lier à Discord',
                variant: 'blue',
                block: true,
                attrs: { 'data-testid': 'link-discord' },
                onClick: () => {
                  linkDiscord().catch((e) => toast(accountError(e), 'bad'));
                },
              }),
            ]
          : []),
        el(
          'div',
          { class: 'profile-version' },
          el('span', { class: 'profile-version__text', 'data-testid': 'app-version', text: `Version ${currentBuild().version}` }),
          Button({ text: 'Nouveautés', variant: 'blue', attrs: { 'data-testid': 'open-changelog' }, onClick: openChangelog }),
        ),
      ],
    });
  });

  // ------------------------------------------------------------- pages
  const pager = el('div', { class: 'pager', 'data-testid': 'pager' });
  const pages = el('main', { class: 'pages' }, pager);
  const disposers: Dispose[] = [];
  const pageEls = new Map<TabId, HTMLElement>();
  for (const id of TAB_ORDER) {
    const page = el('section', { class: 'page', id: `page-${id}`, role: 'tabpanel', 'aria-label': TAB_INFO[id].label, 'data-tab': id });
    pageEls.set(id, page);
    pager.append(page);
    disposers.push(mounters[id](page, ctx));
  }

  // ----------------------------------------------------------- tab bar
  const tabButtons = new Map<TabId, HTMLButtonElement>();
  const badges = new Map<TabId, HTMLElement>();
  const bar = el('nav', { class: 'tabbar', role: 'tablist', 'aria-label': 'Navigation' });
  for (const id of TAB_ORDER) {
    const badge = Badge({ text: '0', tone: 'red', attrs: { class: 'kit-badge kit-badge--red tab-badge', hidden: true } });
    badges.set(id, badge);
    const b = Button({
      variant: id === 'race' ? 'yellow' : 'ghost',
      size: id === 'race' ? 'lg' : 'md',
      silent: true,
      attrs: { role: 'tab', 'data-tab-button': id, 'aria-label': TAB_INFO[id].label, 'aria-controls': `page-${id}` },
      children: [el('span', { class: 'tab-icon', 'aria-hidden': 'true', text: TAB_INFO[id].icon }), el('span', { class: 'tab-label', text: TAB_INFO[id].label }), badge],
      onClick: () => setTab(id),
    });
    b.classList.add('tab');
    if (id === 'race') b.classList.add('tab--center');
    tabButtons.set(id, b);
    bar.append(b);
  }

  const frame = el('div', { class: 'frame' }, top, pages, bar);
  root.replaceChildren(el('div', { class: 'shell' }, el('div', { class: 'shell__bg', 'aria-hidden': 'true' }), frame));

  let current: TabId = initial;
  function setTab(tab: TabId, silent = false): void {
    const changed = tab !== current;
    current = tab;
    const index = TAB_ORDER.indexOf(tab);
    pager.style.setProperty('--i', String(index));
    pager.style.setProperty('--drag', '0px');
    pager.classList.remove('dragging');
    pager.dataset.tab = tab;
    for (const [id, page] of pageEls) {
      page.toggleAttribute('inert', id !== tab);
      page.setAttribute('aria-hidden', String(id !== tab));
    }
    for (const [id, b] of tabButtons) {
      b.setAttribute('aria-selected', String(id === tab));
      b.classList.toggle('tab--active', id === tab);
    }
    if (changed && !silent) playSound('tap');
  }

  function drawBadges(): void {
    const p = getProfile();
    const counts: Partial<Record<TabId, number>> = { race: readyPacks(p, ctx.now()), quests: claimableCount(p) + passClaimableCount(p, ctx.now()) };
    for (const [id, badge] of badges) {
      const n = counts[id] ?? 0;
      badge.hidden = n <= 0;
      badge.querySelector('.kit-badge__text')!.textContent = String(n);
      badge.setAttribute('aria-label', id === 'quests' ? `${n} récompenses à récupérer` : `${n} paquets prêts`);
    }
  }

  // ------------------------------------------------------------- swipe
  let start: { x: number; y: number; id: number; horizontal: boolean | null } | null = null;
  const onDown = (e: PointerEvent) => {
    if (e.button > 0 || (e.target as HTMLElement).closest('select, input, [data-no-swipe]')) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId, horizontal: null };
  };
  const onMove = (e: PointerEvent) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (start.horizontal === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      start.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
      if (start.horizontal) {
        try {
          pages.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic pointer */
        }
        pager.classList.add('dragging');
      }
    }
    if (start.horizontal) {
      const i = TAB_ORDER.indexOf(current);
      // resist when dragging past the first / last page
      const blocked = (dx > 0 && i === 0) || (dx < 0 && i === TAB_ORDER.length - 1);
      pager.style.setProperty('--drag', `${blocked ? dx / 4 : dx}px`);
    }
  };
  const onUp = (e: PointerEvent) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    const horizontal = start.horizontal;
    start = null;
    if (!horizontal) return;
    const i = TAB_ORDER.indexOf(current);
    const next = dx <= -SWIPE_DISTANCE ? i + 1 : dx >= SWIPE_DISTANCE ? i - 1 : i;
    setTab(TAB_ORDER[Math.min(TAB_ORDER.length - 1, Math.max(0, next))]);
  };
  pages.addEventListener('pointerdown', onDown);
  pages.addEventListener('pointermove', onMove);
  pages.addEventListener('pointerup', onUp);
  pages.addEventListener('pointercancel', onUp);
  // keyboard: left / right arrows on the tab bar
  bar.addEventListener('keydown', (e) => {
    const i = TAB_ORDER.indexOf(current);
    if (e.key === 'ArrowRight' && i < TAB_ORDER.length - 1) setTab(TAB_ORDER[i + 1]);
    if (e.key === 'ArrowLeft' && i > 0) setTab(TAB_ORDER[i - 1]);
    tabButtons.get(current)?.focus();
  });

  const refresh = () => {
    drawTop();
    drawBadges();
  };
  const offProfile = onProfileChange(refresh);
  const offSound = onSoundChange(drawTop);
  const offTick = ctx.onTick(drawBadges);
  refresh();
  setTab(initial, true);

  return {
    setTab: (t) => setTab(t),
    tab: () => current,
    destroy() {
      offProfile();
      offSound();
      offTick();
      disposers.forEach((d) => d());
      pages.removeEventListener('pointerdown', onDown);
      pages.removeEventListener('pointermove', onMove);
      pages.removeEventListener('pointerup', onUp);
      pages.removeEventListener('pointercancel', onUp);
    },
  };
}
