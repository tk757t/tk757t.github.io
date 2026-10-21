import { getAccount } from '../account';
import { openGuide } from '../guideScreen';
import { LOBBY_STATS_MS, fetchLobbyStats, waitingLabel } from '../../net/lobby';
import { skipCost, slotState, unlockMsOf } from '../../data/profile/ops';
import { CHESTS, PITY_CHESTS } from '../../data/chests';
import { Badge, Button, Modal, Panel, ProgressBar, RarityFrame, setProgress } from '../../ui/kit';
import { showChestInfo } from '../chestInfo';
import { el } from '../../ui/dom';
import { trackName as nameOfTrack } from '../../data/tracks';
import type { AppContext, Dispose } from '../context';
import { openChest, skipChest } from '../economy';
import { getProfile, isServerBacked, onProfileChange } from '../profile';
import { showPackReveal } from '../packReveal';
import { toast } from '../toast';

export const formatTime = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const two = (n: number): string => String(n).padStart(2, '0');
  if (s >= 3600) {
    const m = Math.ceil(s / 60);
    return `${Math.floor(m / 60)}h${two(m % 60)}`;
  }
  return `${two(Math.floor(s / 60))}:${two(s % 60)}`;
};

/** Course tab: arena, the big COURSE button and the four pack slots with their timers. */
export function mountCourse(page: HTMLElement, ctx: AppContext): Dispose {
  const root = el('div', { class: 'tab-course' });
  page.append(root);

  const summary = el('p', { class: 'muted', 'data-testid': 'race-summary' });
  // who is waiting in the ranked queue and the open rooms: read from the server every few seconds, nothing shown without an account or an answer
  const waiting = el('p', { class: 'muted arena__waiting', role: 'status', 'data-testid': 'queue-stats' });
  waiting.hidden = true;
  const trackName = el('h2', { class: 'arena__name' });
  // the ranked queue and the open rooms are on the server: they need an account with a pseudo
  const needAccount = (): boolean => {
    if (getAccount()?.pseudo) return false;
    toast('Il faut un compte avec un pseudo (et une connexion) pour jouer en ligne. « Course perso » se joue hors ligne.', 'bad');
    return true;
  };
  const start = Button({ text: 'COURSE !', variant: 'yellow', size: 'xl', block: true, attrs: { 'data-testid': 'start-ranked' }, onClick: () => needAccount() || ctx.openRanked() });
  const open = Button({ text: 'Course non classée', variant: 'green', block: true, attrs: { 'data-testid': 'start-unranked' }, onClick: () => needAccount() || ctx.openUnranked() });
  const setup = Button({ text: 'Course perso', variant: 'blue', block: true, attrs: { 'data-testid': 'open-setup' }, onClick: () => ctx.openLobbies() });
  const online = Button({ text: 'Jouer avec des amis', variant: 'ghost', block: true, attrs: { 'data-testid': 'open-online' }, onClick: () => ctx.openOnline() });
  const editor = Button({ text: 'Éditeur de circuits', variant: 'ghost', block: true, attrs: { 'data-testid': 'open-editor' }, onClick: () => location.assign(`${import.meta.env.BASE_URL}?editor=1`) });
  const guide = Button({ text: '❓ Guide du jeu', variant: 'ghost', block: true, attrs: { 'data-testid': 'open-guide' }, onClick: () => openGuide() });
  const arena = Panel({
    tone: 'blue',
    className: 'arena',
    children: [
      el('div', { class: 'arena__banner' }, el('span', { class: 'arena__flag', 'aria-hidden': 'true', text: '🏁' }), el('div', {}, el('p', { class: 'arena__label', text: 'Arène 1' }), trackName)),
      start,
      open,
      waiting,
      summary,
      setup,
      online,
      editor,
      guide,
    ],
  });

  const slotsBox = el('div', { class: 'slots-grid', 'data-testid': 'pack-slots' });
  const reserve = el('p', { class: 'muted reserve', 'data-testid': 'reserve' });
  const pity = el('p', { class: 'muted', 'data-testid': 'pity' });
  const info = Button({ text: 'Contenu des coffres', variant: 'blue', block: true, attrs: { 'data-testid': 'open-chest-info' }, onClick: () => showChestInfo() });
  const packs = Panel({ tone: 'dark', title: 'Mes coffres', children: [slotsBox, reserve, pity, info] });
  root.append(arena, packs);

  type SlotView = { btn: HTMLElement; progress: HTMLElement | null; time: HTMLElement | null; kind: string };
  const views: SlotView[] = [];

  function openModalFor(index: number): void {
    const p = getProfile();
    const state = slotState(p, index, ctx.now());
    if (state.kind !== 'locked') return;
    const cost = skipCost(state.remainingMs);
    const timeText = el('p', { class: 'big-time', 'data-testid': 'unlock-time', text: formatTime(state.remainingMs) });
    const modal = Modal({
      title: `Coffre ${CHESTS[state.tier].label}`,
      testid: 'unlock-modal',
      children: [el('p', { class: 'muted', text: 'Ce coffre s’ouvre dans' }), timeText],
      actions: [
        Button({
          text: `Ouvrir maintenant · 💎 ${cost}`,
          variant: 'green',
          size: 'lg',
          attrs: { 'data-testid': 'skip-slot' },
          disabled: p.gems < cost,
          onClick: async () => {
            modal.close();
            if (await skipChest(index, ctx)) await openIt(index);
            else if (!isServerBacked()) toast('Pas assez de gemmes', 'bad'); // the server's refusal is already shown
          },
        }),
        Button({ text: 'Plus tard', variant: 'ghost', onClick: () => modal.close() }),
      ],
    });
    const off = ctx.onTick(() => {
      const s = slotState(getProfile(), index, ctx.now());
      if (!modal.el.isConnected) return off();
      timeText.textContent = s.kind === 'locked' ? formatTime(s.remainingMs) : '00:00';
    });
  }

  let opening = false;
  async function openIt(index: number): Promise<void> {
    if (opening) return; // one chest at a time (a double tap must not send two requests)
    opening = true;
    try {
      const opened = await openChest(index, ctx);
      if (opened) showPackReveal(opened, () => undefined);
    } finally {
      opening = false;
    }
  }

  function draw(): void {
    const p = getProfile();
    const now = ctx.now();
    views.length = 0;
    slotsBox.replaceChildren(
      ...p.slots.map((_, i) => {
        const s = slotState(p, i, now);
        const icon = el('span', { class: 'slot-card__icon', 'aria-hidden': 'true', text: s.kind === 'empty' ? '＋' : '🎁' });
        const time = el('span', { class: 'slot-card__time', text: s.kind === 'locked' ? formatTime(s.remainingMs) : s.kind === 'ready' ? 'OUVRIR' : 'Vide' });
        let progress: HTMLElement | null = null;
        if (s.kind === 'locked') {
          const total = unlockMsOf(s.tier, ctx.unlockMs);
          progress = ProgressBar({ value: total - s.remainingMs, max: total, tone: 'gold', label: `Coffre ${i + 1}`, small: true });
        }
        const tier = s.kind === 'empty' ? null : s.tier;
        const btn = Button({
          variant: s.kind === 'ready' ? 'green' : 'ghost',
          silent: s.kind === 'empty',
          disabled: s.kind === 'empty',
          attrs: {
            'data-slot-index': i,
            'data-state': s.kind,
            'data-tier': tier ?? '',
            'aria-label': `Coffre ${i + 1}${tier ? ` ${CHESTS[tier].label}` : ''} : ${s.kind === 'ready' ? 'prêt à ouvrir' : s.kind === 'locked' ? `prêt dans ${formatTime(s.remainingMs)}` : 'vide'}`,
          },
          children: [icon, time, progress],
          onClick: () => (s.kind === 'ready' ? openIt(i) : openModalFor(i)),
        });
        btn.classList.add('slot-card');
        const frame = tier ? RarityFrame(tier, [el('span', { class: 'slot-tier', 'data-testid': 'slot-tier', text: CHESTS[tier].label }), btn], { className: 'slot-frame' }) : el('div', { class: 'slot-frame slot-frame--empty' }, btn);
        views.push({ btn: frame, progress, time, kind: s.kind });
        return frame;
      }),
    );
    const cfg = ctx.config();
    trackName.textContent = nameOfTrack(cfg.trackId);
    const humans = cfg.controllers.slice(0, cfg.players).filter((c) => c === 'human').length;
    summary.textContent = `${cfg.players} joueur${cfg.players > 1 ? 's' : ''}${cfg.players - humans > 0 ? ` dont ${cfg.players - humans} IA` : ''} · ${cfg.laps} tour${cfg.laps > 1 ? 's' : ''}`;
    reserve.replaceChildren(el('span', { text: 'Les coffres se débloquent avec le temps. Terminez des courses pour en recevoir, plus haut vous finissez, meilleure est leur qualité.' }), ...(p.packs.length > 0 ? [Badge({ text: `+${p.packs.length} en réserve`, tone: 'blue', attrs: { 'data-testid': 'reserve-badge' } })] : []));
    pity.textContent = `Pitié : ${Math.min(p.pity, PITY_CHESTS - 1)}/${PITY_CHESTS - 1} coffres sans carte légendaire`;
  }

  /** Once a second: refresh the countdowns, or redraw when a timer ran out. */
  function tick(): void {
    statsAge += 1000;
    if (statsAge >= LOBBY_STATS_MS) void refreshStats();
    const p = getProfile();
    const now = ctx.now();
    let stale = false;
    p.slots.forEach((_, i) => {
      const s = slotState(p, i, now);
      const v = views[i];
      if (!v || v.kind !== s.kind) stale = true;
      else if (s.kind === 'locked' && v.time) {
        v.time.textContent = formatTime(s.remainingMs);
        if (v.progress) setProgress(v.progress, unlockMsOf(s.tier, ctx.unlockMs) - s.remainingMs, unlockMsOf(s.tier, ctx.unlockMs));
      }
    });
    if (stale) draw();
  }

  let statsAge = Infinity;
  let statsBusy = false;
  async function refreshStats(): Promise<void> {
    if (statsBusy || !getAccount()?.pseudo || document.hidden) return;
    statsBusy = true;
    try {
      const stats = await fetchLobbyStats();
      statsAge = 0;
      if (!root.isConnected) return;
      waiting.hidden = stats === null;
      if (stats) waiting.textContent = waitingLabel(stats);
    } finally {
      statsBusy = false;
    }
  }
  void refreshStats();

  draw();
  const offProfile = onProfileChange(draw);
  const offConfig = ctx.onConfigChange(draw);
  const offTick = ctx.onTick(tick);
  return () => {
    offProfile();
    offConfig();
    offTick();
  };
}
