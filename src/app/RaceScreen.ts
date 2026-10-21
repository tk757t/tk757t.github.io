import { devParam } from './devParams';
import { AI_LABELS, chooseAction, plans, type AiLevel } from '../ai';
import { loadTrack, toTrack, type TrackDef } from '../data/tracks';
import {
  allowedGears,
  createGame,
  currentCar,
  enumerateMoves,
  movementOf,
  nextFloat,
  potentialCells,
  reducer,
  slipstreamAvailable,
  TIRE_TYPES,
  weatherOf,
} from '../engine';
import type { Action, CarMods, CarState, GameEvent, RaceState, TireType, Weather, WearCategory } from '../engine';
import { CHESTS } from '../data/chests';
import { levelProgress, loadoutMods, type RaceRewards } from '../data/profile/ops';
import { EMPTY_STATS, LEVELS, goalText, opponentLook, opponentMods, starsFor, trackStats, type CampaignLevel, type RaceStats } from '../data/campaign';
import { assets, type IconName } from '../data/assets';
import { CAR_COLORS, RaceRenderer, type CarStyle } from '../render';
import { lookOf } from './carSvg';
import { toast } from './toast';
import { Button, LevelBadge, Modal, ProgressBar, setButtonText, setProgress, type ModalHandle } from '../ui/kit';
import { getProfile } from './profile';
import { onSoundChange, playSound, setSoundEnabled, soundEnabled } from './sound';
import { explosionFor, playRaceEvents } from './raceSounds';
import { showPackReveal } from './packReveal';
import { profilePortraitIndex } from './portrait';
import { el, prefersReducedMotion, sleep } from './dom';
import {
  TIRE_LABELS,
  WEAR_LABELS,
  WEAR_SHORT_LABELS,
  cornerStatus,
  describeEvent,
  downshiftWarning,
  gearLabel,
  plural,
  playerName,
  rankingRows,
  statusLine,
  wearLevel,
} from './messages';
import type { RaceConfig } from './setup';

const ROLL_ANIMATION_MS = 700;
const WEAR_ORDER: WearCategory[] = ['tires', 'brakes', 'gearbox', 'body', 'engine', 'handling'];
const REPAIRABLE: WearCategory[] = ['engine', 'body', 'brakes', 'gearbox', 'handling'];
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

export interface RaceScreenHandlers {
  onReplay(cfg: RaceConfig): void;
  onMenu(): void;
  /** Called once when the race is over; returns what the profile earned (shown in the ranking), at once or once the game server answered. */
  onFinished?(info: { rank: number; retired: boolean; stats: RaceStats; players: number; vsBots: boolean; soloVsAi: boolean; clean: boolean }): RaceRewards | null | Promise<RaceRewards | null>;
}

/**
 * An online race (src/net/session.ts): this device drives one seat, the others' actions arrive in order.
 * Every device runs the same race from the same seed; the host also drives the AIs and the cars of absent players.
 */
export interface OnlineLink {
  mySeat: number;
  host: boolean;
  /** The name of each seat. */
  names: string[];
  /** Actions already played, replayed at once (a player coming back). */
  log: Action[];
  send(seq: number, action: Action): void;
  onAction(fn: (seq: number, action: Action) => void): () => void;
  /** True when the player of a seat has gone silent. */
  isGone(seat: number): boolean;
  onPeers(fn: () => void): () => void;
  /** Gives up the race (tells the room, leaves it). */
  forfeit(): void;
  /** Another player gave up (their seat). */
  onForfeit(fn: (seat: number) => void): () => void;
}

export class RaceScreen {
  private state: RaceState;
  /** Actions applied so far (the sequence number of the next one, online). */
  private seq = 0;
  private replaying = false;
  private offNet: (() => void)[] = [];
  private renderer!: RaceRenderer;
  private pendingGear = 1;
  private turnCar: string | null = null;
  private readyFor: string | null = null;
  private rolling = false;
  private notices: string[] = [];
  private aiTimer: ReturnType<typeof setTimeout> | null = null;
  private aiRng: number;
  private destroyed = false;
  private rewards: RaceRewards | null | undefined = undefined;
  private passModal: ModalHandle | null = null;
  private endModal: ModalHandle | null = null;
  private pitModal: ModalHandle | null = null;
  private settingsModal: ModalHandle | null = null;
  private abandonModal: ModalHandle | null = null;
  private forfeitModal: ModalHandle | null = null;
  private forfeitedSeats = new Set<number>();
  private pitChoice: { tires: TireType; repairs: Partial<Record<WearCategory, number>> } = { tires: 'hard', repairs: {} };
  private carStyles: Record<string, CarStyle> = {};

  private stage = el('div', { id: 'stage' });
  private chip = el('div', { class: 'chip', 'data-testid': 'turn-chip' });
  private hud!: HTMLElement;
  private debugButton: HTMLElement | null = null;
  private lastWeather: Weather;
  /** The campaign level being played, if any. */
  private lvl: CampaignLevel | null;
  private stats: RaceStats = EMPTY_STATS;
  private framedFor: string | null = null;
  private statusText = el('p', { class: 'status-line', 'data-testid': 'status-line' });
  private message = el('p', { class: 'msg', role: 'status', 'aria-live': 'polite', 'data-testid': 'message' });
  private gearTitle = el('b');
  private gearDetail = el('span');
  private gearDown = Button({ text: '−', variant: 'ghost', size: 'lg', attrs: { 'aria-label': 'Rapport inférieur' }, onClick: () => this.stepGear(-1) });
  private gearUp = Button({ text: '+', variant: 'ghost', size: 'lg', attrs: { 'aria-label': 'Rapport supérieur' }, onClick: () => this.stepGear(1) });
  private gearRow = el('div', { class: 'gear-row' });
  // adjustments after the roll (§3, §13)
  private brakesValue = el('output', { 'data-testid': 'brakes-used', 'aria-live': 'polite' });
  private brakesLess = Button({ text: '−', variant: 'ghost', attrs: { 'aria-label': 'Moins de freins' }, onClick: () => this.adjustBy(-1) });
  private brakesMore = Button({ text: '+', variant: 'ghost', attrs: { 'aria-label': 'Plus de freins' }, onClick: () => this.adjustBy(1) });
  private boostBtn = Button({ text: '', variant: 'ghost', attrs: { 'data-testid': 'boost' }, onClick: () => this.toggle('boost') });
  private slipBtn = Button({ text: '', variant: 'ghost', attrs: { 'data-testid': 'slipstream' }, onClick: () => this.toggle('slipstream') });
  private adjustPanel = el('div', { class: 'adjust' });
  private rerollBtn = Button({ text: '', variant: 'blue', block: true, attrs: { 'data-testid': 'reroll' }, onClick: () => this.reroll() });
  private gauges = new Map<WearCategory, { box: HTMLElement; bar: HTMLElement; value: HTMLElement }>();
  private die = el('div', { class: 'die', 'data-testid': 'die', 'aria-live': 'polite' });
  private act = Button({ text: '', variant: 'yellow', size: 'lg', block: true, onClick: () => void this.onAct() });

  private constructor(
    private root: HTMLElement,
    private cfg: RaceConfig,
    private handlers: RaceScreenHandlers,
    private def: TrackDef,
    private online: OnlineLink | null = null,
  ) {
    this.aiRng = (cfg.seed * 2654435761) >>> 0;
    // the garage equipment is player 1's, and only when they play themselves
    const geared = cfg.useGear && cfg.controllers[0] === 'human';
    const profile = getProfile();
    if (geared) {
      const look = lookOf(profile.loadout);
      this.carStyles.p1 = { color: look.paint, label: look.number === null ? undefined : String(look.number), ring: look.helmet };
    }
    this.lvl = cfg.level === undefined ? null : (LEVELS[cfg.level] ?? null);
    // the picture of each car (when the asset registry has one): the garage cosmetics keep priority for colours
    for (let i = 0; i < cfg.players; i++) {
      const sprite = assets.carSprite(this.seatCar(i));
      if (sprite) this.carStyles[`p${i + 1}`] = { ...this.carStyles[`p${i + 1}`], sprite, nose: assets.carNose };
    }
    const mods: Record<string, CarMods> = {};
    if (geared) mods.p1 = loadoutMods(profile);
    const tires: Record<string, TireType> = {};
    this.lvl?.opponents.forEach((o, i) => {
      mods[`p${i + 2}`] = opponentMods(o);
      tires[`p${i + 2}`] = o.tires;
    });
    this.state = createGame({
      seed: cfg.seed,
      cars: Array.from({ length: cfg.players }, (_, i) => `p${i + 1}`),
      track: toTrack(def),
      config: { laps: cfg.laps, maxRounds: 400, weather: this.lvl ? (this.lvl.weather === 'sun' ? 'sun' : 'random') : (cfg.weather ?? 'random') },
      mods,
      tires,
    });
    this.lastWeather = weatherOf(this.state.wetness);
  }

  static async create(root: HTMLElement, cfg: RaceConfig, handlers: RaceScreenHandlers, online: OnlineLink | null = null): Promise<RaceScreen> {
    const screen = new RaceScreen(root, cfg, handlers, await loadTrack(cfg.trackId), online);
    await screen.mount();
    return screen;
  }

  private async mount(): Promise<void> {
    const def = this.def;
    const gaugeBox = el('div', { class: 'gauges', 'aria-label': 'Points de la voiture' });
    for (const cat of WEAR_ORDER) {
      const value = el('span');
      const bar = ProgressBar({ value: 0, max: 1, tone: 'green', label: WEAR_LABELS[cat], small: true });
      const box = el('div', { class: 'gauge', 'data-cat': cat }, el('div', { class: 'label', title: WEAR_LABELS[cat] }, el('span', { text: WEAR_SHORT_LABELS[cat] }), value), bar);
      this.gauges.set(cat, { box, bar, value });
      gaugeBox.append(box);
    }
    this.gearRow.append(this.gearDown, el('div', { class: 'gear' }, this.gearTitle, this.gearDetail), this.gearUp);
    this.adjustPanel.append(
      el('div', { class: 'adjust__row' }, el('span', { class: 'adjust__label', text: 'Freins' }), el('div', { class: 'stepper' }, this.brakesLess, this.brakesValue, this.brakesMore), this.boostBtn, this.slipBtn),
    );
    const fitBtn = Button({ text: 'Voir', variant: 'ghost', attrs: { 'aria-label': 'Tout voir' }, onClick: () => this.renderer.fitAll() });
    const followBtn = Button({ text: 'Suivre', variant: 'ghost', onClick: () => this.renderer.follow() });
    const hud = (this.hud = el(
      'section',
      { class: 'hud', 'aria-label': 'Commandes' },
      this.statusText,
      this.message,
      this.gearRow,
      this.adjustPanel,
      gaugeBox,
      this.rerollBtn,
      el('div', { class: 'action-row' }, this.die, this.act),
    ));
    // "debug cases" (?debug=cases): row, grid slot and id written on every cell, to check a circuit against its picture
    const debugBtn = devParam('debug') !== null
      ? [Button({ text: 'Cases', variant: 'ghost', attrs: { 'data-testid': 'debug-cases', 'aria-pressed': 'false' }, onClick: () => this.toggleDebug() })]
      : [];
    this.debugButton = debugBtn[0] ?? null;
    const settingsBtn = Button({ text: '⚙', variant: 'ghost', attrs: { 'data-testid': 'race-settings', 'aria-label': 'Réglages' }, onClick: () => this.openSettings() });
    this.root.replaceChildren(this.stage, el('div', { class: 'topbar' }, this.chip, el('span', { class: 'spacer' }), ...debugBtn, fitBtn, followBtn, settingsBtn), hud);

    this.renderer = await RaceRenderer.create(this.stage, def, Object.values(this.carStyles).flatMap((s) => (s.sprite ? [s.sprite] : [])));
    this.renderer.carStyles = this.carStyles;
    this.renderer.onCellTap = (id) => this.onCellTap(id);
    if (devParam('debug') === 'cases') this.toggleDebug(true);
    const online = this.online;
    if (online) {
      // the race so far (a player coming back), then the actions of the others as they come
      this.replaying = true;
      for (const action of online.log) this.apply(action, false);
      this.replaying = false;
      this.offNet.push(
        online.onAction((seq, action) => {
          if (seq === this.seq && !this.destroyed) this.apply(action, false);
        }),
        online.onPeers(() => {
          if (!this.destroyed) this.refresh();
        }),
        online.onForfeit((seat) => this.onOpponentForfeit(seat)),
      );
      this.rescueBlockedRoll();
    }
    this.syncTurn();
    this.refresh();
    this.renderer.settle();
    this.exposeDebug();
  }

  // ------------------------------------------------------- settings and giving up

  /** Settings window: the race goes on behind it (online, the shared race is never paused). */
  private openSettings(): void {
    if (this.settingsModal || this.destroyed) return;
    const soundBtn = Button({ text: '', variant: 'blue', block: true, silent: true, attrs: { 'data-testid': 'settings-sound' }, onClick: () => setSoundEnabled(!soundEnabled()) });
    const paint = () => {
      soundBtn.textContent = soundEnabled() ? '🔊 Son : activé' : '🔇 Son : coupé';
      soundBtn.setAttribute('aria-pressed', String(soundEnabled()));
    };
    paint();
    const off = onSoundChange(paint);
    const modal = Modal({
      title: 'Réglages',
      testid: 'race-settings-modal',
      children: [soundBtn, this.cellLegend()],
      actions: [
        Button({ text: 'Reprendre', variant: 'green', size: 'lg', block: true, attrs: { 'data-testid': 'settings-resume' }, onClick: () => modal.close() }),
        Button({ text: 'Abandonner', variant: 'red', block: true, attrs: { 'data-testid': 'settings-abandon' }, onClick: () => this.confirmAbandon() }),
      ],
      onClose: () => {
        off();
        this.settingsModal = null;
      },
    });
    this.settingsModal = modal;
  }

  /** What the colours and shapes of the cells mean (the shape tells it without the colour). */
  private cellLegend(): HTMLElement {
    const row = (cls: string, mark: string, title: string, text: string) =>
      el('li', { class: 'legend__row' }, el('span', { class: `legend__cell ${cls}`, 'aria-hidden': 'true', text: mark }), el('span', {}, el('b', { text: `${title} : ` }), text));
    return el(
      'div',
      { class: 'legend', 'data-testid': 'cell-legend' },
      el('h3', { class: 'legend__title', text: 'Les cases' }),
      el(
        'ul',
        { class: 'legend__list' },
        row('legend__cell--neutral', '', 'Case claire', 'rien de spécial.'),
        row('legend__cell--wear', '', 'Orange rayée', "virage : les pneus s'usent si on n'y fait pas ses arrêts."),
        row('legend__cell--break', '✕', 'Rouge à croix', 'case à risque : un jet peut coûter de la tenue de route, et sous 0 on abandonne.'),
        row('legend__cell--reach', '', 'Halo bleu ou jaune', 'case où vous pouvez aller (jaune : elle coûte de la carrosserie, des freins ou des pneus).'),
        row('legend__cell--wall', '', 'Halo rouge', 'le mur : la voiture qui y va abandonne.'),
      ),
    );
  }

  private confirmAbandon(): void {
    if (this.abandonModal || this.destroyed) return;
    const online = !!this.online;
    const modal = Modal({
      title: 'Abandonner la course ?',
      testid: 'abandon-modal',
      children: [
        el('p', {
          class: 'muted',
          text: online ? 'Vous quittez la course : votre adversaire gagne par forfait.' : this.lvl ? 'Le niveau ne sera pas réussi et vous ne gagnerez aucune récompense.' : 'Vous ne gagnerez aucune récompense.',
        }),
      ],
      actions: [
        Button({ text: 'Continuer', variant: 'green', size: 'lg', block: true, attrs: { 'data-testid': 'abandon-cancel' }, onClick: () => modal.close() }),
        Button({ text: 'Abandonner', variant: 'red', block: true, attrs: { 'data-testid': 'abandon-confirm' }, onClick: () => this.abandon() }),
      ],
      onClose: () => {
        this.abandonModal = null;
      },
    });
    this.abandonModal = modal;
  }

  /** Back to the menu with no reward and no progress (the campaign level stays unfinished). Online, the room is told first. */
  private abandon(): void {
    this.online?.forfeit();
    this.handlers.onMenu();
  }

  /** Online: a player gave up. If no other human is left in the race, this device wins by forfeit. */
  private onOpponentForfeit(seat: number): void {
    if (this.destroyed || !this.online) return;
    this.forfeitedSeats.add(seat);
    const name = this.online.names[seat] ?? 'Un joueur';
    const others = this.cfg.controllers.filter((c, i) => c === 'human' && i !== this.online?.mySeat && !this.forfeitedSeats.has(i)).length;
    if (others > 0) {
      this.notices.push(`${name} a abandonné.`);
      this.refresh();
      return;
    }
    if (this.state.status !== 'racing' || this.forfeitModal) return;
    this.settingsModal?.close();
    this.abandonModal?.close();
    playSound('win');
    this.forfeitModal = Modal({
      title: 'Victoire par forfait',
      dismissible: false,
      testid: 'forfeit-win',
      children: [el('p', { text: `${name} a abandonné la course : vous êtes déclaré vainqueur par forfait.` })],
      actions: [Button({ text: 'Menu', variant: 'blue', size: 'lg', block: true, attrs: { 'data-testid': 'forfeit-menu' }, onClick: () => this.handlers.onMenu() })],
    });
  }

  private toggleDebug(on = !this.renderer.debug): void {
    this.renderer.setDebug(on);
    this.debugButton?.setAttribute('aria-pressed', String(on));
  }

  // ----------------------------------------------------------------- who plays

  /** Index of the car picture of a seat in the asset registry: the level's own cars in the campaign, else the seat number. */
  private seatCar(i: number): number {
    if (!this.lvl) return i;
    if (i === 0) return this.lvl.playerCar;
    const op = this.lvl.opponents[i - 1];
    return (op && opponentLook(op).car) ?? i;
  }

  /** What a seat is called: its driver in the campaign ("Vous" for the player), else "Joueur n". */
  private seatName(carId: string): string {
    const i = this.state.cars.findIndex((c) => c.id === carId);
    if (this.online) return this.online.names[i] ?? playerName(this.state, carId);
    if (!this.lvl) return playerName(this.state, carId);
    if (i === 0) return 'Vous';
    const op = this.lvl.opponents[i - 1];
    return op ? opponentLook(op).driver : playerName(this.state, carId);
  }

  private level(carId: string): AiLevel | null {
    const i = this.state.cars.findIndex((c) => c.id === carId);
    const c = this.cfg.controllers[i] ?? 'human';
    return c === 'human' ? null : c;
  }

  private label(carId: string): string {
    const level = this.level(carId);
    if (level) return `${this.seatName(carId)} (IA ${AI_LABELS[level]})`;
    return this.isAbsent(carId) ? `${this.seatName(carId)} (absent, l’IA conduit)` : this.seatName(carId);
  }

  private seatOf(carId: string): number {
    return this.state.cars.findIndex((c) => c.id === carId);
  }

  /** The car this device drives: its own seat online, every human seat otherwise. */
  private isMine(carId: string): boolean {
    return this.online ? this.seatOf(carId) === this.online.mySeat : this.level(carId) === null;
  }

  /** Online: the player of this car has gone silent. */
  private isAbsent(carId: string): boolean {
    return !!this.online && this.level(carId) === null && this.online.isGone(this.seatOf(carId));
  }

  /** The AI that drives a car on this device, if any: the AIs (online, on the host only), and absent players' cars. */
  private aiFor(carId: string): AiLevel | null {
    if (this.online && !this.online.host) return null;
    return this.level(carId) ?? (this.isAbsent(carId) ? 'medium' : null);
  }

  /** True when the active car is driven from this device by a person (the UI controls are theirs). */
  isHumanTurn(): boolean {
    const car = currentCar(this.state);
    return this.state.status === 'racing' && !!car && this.isMine(car.id);
  }

  private humanCount(): number {
    return this.state.cars.filter((c) => this.isMine(c.id)).length;
  }

  /** Plays the AI's next action after the configured pause (one action per tick: gear, adjustment, destination, pit). */
  private scheduleAi(): void {
    if (this.destroyed || this.aiTimer || this.state.status !== 'racing') return;
    const car = currentCar(this.state);
    const level = car ? this.aiFor(car.id) : null;
    if (!car || !level) return;
    this.aiTimer = setTimeout(() => {
      this.aiTimer = null;
      if (this.destroyed || this.state.status !== 'racing') return;
      const now = currentCar(this.state);
      const lv = now ? this.aiFor(now.id) : null;
      if (!lv) return;
      const rand = () => {
        const [v, n] = nextFloat(this.aiRng);
        this.aiRng = n;
        return v;
      };
      this.dispatch(chooseAction(lv, this.state, rand));
    }, this.cfg.aiDelay);
  }

  destroy(): void {
    this.destroyed = true;
    this.passModal?.close();
    this.endModal?.close();
    this.pitModal?.close();
    this.settingsModal?.close();
    this.abandonModal?.close();
    this.forfeitModal?.close();
    
    if (this.aiTimer) clearTimeout(this.aiTimer);
    this.offNet.forEach((off) => off());
    this.renderer.destroy();
  }

  // ------------------------------------------------------------------ actions

  /** An action played on this device: online, the other players receive it. */
  private dispatch(action: Action): GameEvent[] {
    return this.apply(action, true);
  }

  private apply(action: Action, local: boolean): GameEvent[] {
    if (local && this.online) this.online.send(this.seq, action);
    this.seq++;
    const before = currentCar(this.state)?.id;
    const wasAt = new Map(this.state.cars.map((c) => [c.id, c.position]));
    const prev = this.state;
    const r = reducer(this.state, action);
    this.state = r.state;
    if (this.lvl) this.stats = trackStats(this.stats, 'p1', prev, this.state, r.events);
    if (this.replaying) return r.events; // catching up: no sound, no redraw until the end
    this.react(r.events, wasAt);
    const current = currentCar(this.state);
    this.notices = r.events
      .map((e) => {
        const text = describeEvent(e, this.state, (id) => this.seatName(id));
        const actor = 'carId' in e ? e.carId : null;
        return text && actor && actor !== current?.id ? `${this.seatName(actor)} : ${text}` : text;
      })
      .filter((m): m is string => m !== null);
    if (before && before !== current?.id) this.renderer?.follow();
    this.rescueBlockedRoll();
    this.syncTurn();
    this.refresh();
    return r.events;
  }

  /** Sounds and explosions for what just happened. A weather report only counts when the weather changed. */
  react(events: GameEvent[], wasAt: Map<string, string | null>): void {
    const heard = events.filter((e) => {
      if (e.type !== 'WEATHER') return true;
      const changed = e.weather !== this.lastWeather;
      this.lastWeather = e.weather;
      return changed;
    });
    playRaceEvents(heard);
    for (const e of events) {
      if (e.type !== 'CAR_RETIRED') continue;
      const at = wasAt.get(e.carId);
      const url = assets.icon(explosionFor(e.reason));
      const p = at ? this.renderer?.screenOf(at) : null;
      if (!url || !p || !this.renderer) continue;
      const size = Math.max(40, this.renderer.cellPixels * 4);
      const boom = el('img', { class: 'boom', src: url, alt: '', 'data-testid': 'explosion', style: `left:${p.x - size / 2}px;top:${p.y - size / 2}px;width:${size}px;height:${size}px` });
      this.root.append(boom);
      setTimeout(() => boom.remove(), 1400);
    }
  }

  /** Weather, tires and repairs, with the pictures of the asset registry when it has them. */
  private drawStatus(s: RaceState, car: CarState): void {
    const w = weatherOf(s.wetness);
    const icon = (name: IconName) => {
      const src = assets.icon(name);
      return src ? [el('img', { class: 'status-icon', src, alt: '' })] : [];
    };
    const weather = w === 'rain' ? icon('rain') : w === 'sun' ? icon('sun') : [];
    const tires = icon(car.tires === 'hard' ? 'tires-hard' : car.tires === 'rain' ? 'tires-rain' : 'tires-soft');
    this.statusText.replaceChildren(...weather, ...tires, el('span', { text: statusLine(s, car, weather.length === 0) }));
  }

  /**
   * A roll can have no playable destination as it stands (the missing steps cost more brakes than the car has).
   * The player is then given the first adjustment that works, and told about it.
   */
  private rescueBlockedRoll(): void {
    const s = this.state;
    const car = currentCar(s);
    if (this.replaying || s.status !== 'racing' || s.phase !== 'adjust' || !car || !this.isMine(car.id)) return;
    if (enumerateMoves(s).some((o) => o.playable)) return;
    const first = plans(s)[0];
    if (!first) return;
    // played as an action, so that online the other players apply it too
    const kept = this.notices;
    this.dispatch({ type: 'ADJUST', brakes: first.brakes, boost: first.boost, slipstream: first.slipstream });
    this.notices = [...kept, `Aucune case jouable : freins −${first.brakes}${first.boost ? ', boîte +1' : ''} appliqués pour avancer.`];
    this.refresh();
  }


  /** At the start of a turn the gear picker begins on the current gear (or the closest one the car can afford). */
  private syncTurn(): void {
    const car = currentCar(this.state);
    if (car && this.state.phase === 'gear' && car.id !== this.turnCar) {
      this.turnCar = car.id;
      this.pendingGear = this.defaultGear(car);
    }
  }

  private defaultGear(car: CarState): number {
    if (!car.started) return 1;
    const gears = allowedGears(car, this.state.config);
    return gears.includes(car.gear) ? car.gear : (gears.filter((g) => g < car.gear).at(-1) ?? gears[0]);
  }

  private stepGear(dir: -1 | 1): void {
    const car = currentCar(this.state);
    if (!car || this.rolling || !this.isHumanTurn() || !car.started) return;
    const gears = allowedGears(car, this.state.config);
    const next = dir > 0 ? gears.find((g) => g > this.pendingGear) : [...gears].reverse().find((g) => g < this.pendingGear);
    if (next !== undefined) this.pendingGear = next;
    this.refresh();
  }

  private async onAct(): Promise<void> {
    if (this.rolling || !this.isHumanTurn() || this.state.phase !== 'gear') return;
    const car = currentCar(this.state)!;
    this.rolling = true;
    this.refresh();
    const faces = car.started ? this.state.config.dice[this.pendingGear - 1] : Array.from({ length: 20 }, (_, i) => i + 1);
    if (!prefersReducedMotion()) {
      this.die.classList.add('rolling');
      const end = performance.now() + ROLL_ANIMATION_MS;
      while (performance.now() < end) {
        this.die.replaceChildren(el('b', { text: String(faces[Math.floor(Math.random() * faces.length)]) }), el('small', { text: car.started ? 'dé' : 'd20' }));
        await sleep(70);
      }
      this.die.classList.remove('rolling');
    }
    this.rolling = false;
    this.dispatch({ type: 'SHIFT_GEAR', gear: this.pendingGear });
  }

  private adjustBy(delta: number): void {
    const car = currentCar(this.state);
    const turn = this.state.turn;
    if (!car || !turn || this.state.phase !== 'adjust' || !this.isHumanTurn()) return;
    const brakes = Math.min(Math.min(turn.roll ?? 0, car.wear.brakes), Math.max(0, turn.brakes + delta));
    this.dispatch({ type: 'ADJUST', brakes, boost: turn.boost, slipstream: turn.slipstream });
  }

  private toggle(which: 'boost' | 'slipstream'): void {
    const turn = this.state.turn;
    if (!turn || this.state.phase !== 'adjust' || !this.isHumanTurn()) return;
    this.dispatch({ type: 'ADJUST', brakes: turn.brakes, boost: which === 'boost' ? !turn.boost : turn.boost, slipstream: which === 'slipstream' ? !turn.slipstream : turn.slipstream });
  }

  private reroll(): void {
    if (this.rolling || !this.isHumanTurn()) return;
    this.dispatch({ type: 'REROLL' });
  }

  private onCellTap(cellId: string): void {
    if (this.state.phase !== 'adjust' || this.rolling || !this.isHumanTurn()) return;
    const option = enumerateMoves(this.state).find((o) => o.cellId === cellId);
    if (!option || !option.playable) {
      this.notices = [option ? (option.reason === 'brakes' ? 'Pas assez de freins pour cette case.' : 'Pas assez de pneus pour cette case.') : "Choisissez une case en surbrillance : c'est votre case d'arrivée."];
      this.refresh();
      return;
    }
    this.dispatch({ type: 'MOVE_TO', cellId });
  }

  // ------------------------------------------------------------------- drawing

  /** The cells to highlight: where the chosen gear could take the car, or the destinations after the roll. */
  private marks(): Map<string, 'free' | 'costly' | 'crash'> {
    const s = this.state;
    const out = new Map<string, 'free' | 'costly' | 'crash'>();
    if (s.status !== 'racing') return out;
    if (s.phase === 'gear' && this.isHumanTurn()) {
      const car = currentCar(s)!;
      if (car.started) for (const id of potentialCells({ ...s, cars: s.cars.map((c) => (c === car ? { ...c } : c)) }, this.pendingGear).keys()) out.set(id, 'free');
    } else if (s.phase === 'adjust') {
      for (const o of enumerateMoves(s)) if (o.playable) out.set(o.cellId, o.crash ? 'crash' : o.cost > 0 ? 'costly' : 'free');
    }
    return out;
  }

  private refresh(): void {
    const s = this.state;
    this.renderer?.update(s, this.marks());
    if (s.status === 'finished') {
      this.message.textContent = 'Course terminée !';
      setButtonText(this.act, 'Terminé');
      this.act.disabled = true;
      this.gearRow.hidden = false;
      this.adjustPanel.hidden = true;
      this.gearDown.disabled = true;
      this.gearUp.disabled = true;
      this.pitModal?.close();
      this.pitModal = null;
      void this.showEnd();
      return;
    }
    const car = currentCar(s)!;
    const turn = s.turn!;
    const idx = s.cars.indexOf(car);
    const human = this.isMine(car.id);
    // online: another player's turn (an AI's has its own wording)
    const other = !human && this.level(car.id) === null ? this.seatName(car.id) : null;
    this.chip.replaceChildren(
      el('span', { class: 'dot', style: `background:${hex(this.carStyles[car.id]?.color ?? CAR_COLORS[idx % CAR_COLORS.length])}` }),
      el(
        'span',
        { class: 'who2' },
        el('b', { text: this.seatName(car.id) }),
        el('small', { text: [this.level(car.id) ? `IA ${AI_LABELS[this.level(car.id) as AiLevel]}` : this.isAbsent(car.id) ? 'absent' : null, `Tour ${Math.max(1, Math.min(car.laps + 1, s.config.laps))}/${s.config.laps}`].filter(Boolean).join(' · ') }),
      ),
    );
    this.drawStatus(s, car);

    // gear picker (before the roll) or adjustments (after it)
    if (!human) this.pendingGear = car.gear || 1;
    const gearPhase = s.phase === 'gear';
    this.gearRow.hidden = !gearPhase && s.phase !== 'pit';
    this.adjustPanel.hidden = s.phase !== 'adjust';
    const label = gearLabel(s.config, car, this.pendingGear);
    this.gearTitle.textContent = car.started ? label.title : 'Départ arrêté';
    this.gearDetail.textContent = car.started ? label.detail : 'd20 : 20 super départ, 1 calage';
    const gears = allowedGears(car, s.config);
    const canShift = gearPhase && !this.rolling && human && car.started;
    this.gearDown.disabled = !canShift || !gears.some((g) => g < this.pendingGear);
    this.gearUp.disabled = !canShift || !gears.some((g) => g > this.pendingGear);
    (this.gearTitle.parentElement as HTMLElement).dataset.gear = String(this.pendingGear);

    // adjustments
    if (s.phase === 'adjust' && turn.roll !== null) {
      const maxBrakes = Math.min(turn.roll, car.wear.brakes);
      this.brakesValue.textContent = `${turn.brakes}/${maxBrakes}`;
      const control = human && !turn.fixed;
      this.brakesLess.disabled = !control || turn.brakes <= 0;
      this.brakesMore.disabled = !control || turn.brakes >= maxBrakes;
      this.boostBtn.disabled = !control || (car.wear.gearbox < 1 && !turn.boost);
      this.boostBtn.setAttribute('aria-pressed', String(turn.boost));
      this.boostBtn.textContent = `Boîte +1${turn.boost ? ' ✓' : ''}`;
      const slip = !turn.fixed && slipstreamAvailable(s, car);
      this.slipBtn.hidden = !slip;
      this.slipBtn.setAttribute('aria-pressed', String(turn.slipstream));
      this.slipBtn.disabled = !control;
      this.slipBtn.textContent = `Aspiration +${s.config.slipstreamBonus}${turn.slipstream ? ' ✓' : ''}`;
    }

    // wear
    for (const cat of WEAR_ORDER) {
      const g = this.gauges.get(cat)!;
      const max = car.maxWear[cat];
      const v = car.wear[cat];
      g.value.textContent = `${v}/${max}`;
      const level = wearLevel(v, max);
      g.box.className = `gauge ${level}`;
      g.bar.className = `kit-progress kit-progress--small kit-progress--${level === 'ok' ? 'green' : level === 'warn' ? 'gold' : 'red'}`;
      setProgress(g.bar, v, max);
    }

    // die
    if (!this.rolling) {
      if (gearPhase) {
        const r = car.started ? gearLabel(s.config, car, this.pendingGear).detail.replace(' cases', '').replace(' à ', '-') : '20';
        this.die.replaceChildren(el('b', { text: '?' }), el('small', { text: car.started ? r : 'd20' }));
      } else if (turn.face !== null) {
        this.die.replaceChildren(el('b', { text: String(turn.face) }), el('small', { text: turn.start ? 'd20' : turn.fixed ? 'stand' : 'dé' }));
      }
    }

    // reroll (equipment)
    const canReroll = human && car.rerolls > 0 && s.phase === 'adjust' && !turn.fixed && !turn.start;
    this.rerollBtn.hidden = !canReroll;
    setButtonText(this.rerollBtn, `Relancer le dé (${car.rerolls} restante${car.rerolls > 1 ? 's' : ''})`);

    // action button + message
    const msgs: string[] = [...this.notices];
    if (s.phase === 'adjust') {
      setButtonText(this.act, human ? `${plural(movementOf(s.config, turn), 'case')} : touchez l'arrivée` : other ? `${other} choisit sa case…` : 'IA : choisit sa case…');
      this.act.disabled = true;
      if (human) {
        const options = enumerateMoves(s).filter((o) => o.playable);
        if (options.some((o) => !o.crash && o.cost > 0)) msgs.push('Jaune : la case coûte de la carrosserie, des freins ou des pneus.');
        if (options.some((o) => o.crash)) msgs.push('Rouge : le mur, la voiture abandonne.');
      }
    } else if (s.phase === 'pit') {
      setButtonText(this.act, human ? 'Au stand…' : other ? `${other} est au stand…` : 'IA : au stand…');
      this.act.disabled = true;
    } else {
      setButtonText(this.act, human ? (car.started ? 'Lancer' : 'Départ') : other ? `Au tour de ${other}…` : 'IA : réfléchit…');
      this.act.disabled = this.rolling || !human;
    }
    const warn = gearPhase && human && car.started ? downshiftWarning(s, this.pendingGear) : null;
    if (warn) msgs.push(warn);
    const corner = cornerStatus(s);
    if (corner) msgs.push(corner);
    if (gearPhase && msgs.length === 0) msgs.push(human ? 'Choisissez un rapport : le dé est lancé tout de suite.' : `${this.label(car.id)} réfléchit…`);
    this.message.textContent = msgs.join(' ');
    this.message.classList.toggle('hint', s.phase === 'adjust');

    if (this.renderer) {
      this.renderer.bottomInset = this.hud.offsetHeight;
      // once per roll, show the car and where it can go
      const key = s.phase === 'adjust' ? `${car.id}:${s.round}:${turn.roll}:${turn.face}` : null;
      if (key && key !== this.framedFor) this.renderer.frame([...this.marks().keys()]);
      if (!key && this.framedFor) this.renderer.follow(); // the roll is played: back to the follow camera
      this.framedFor = key;
    }
    this.syncPassScreen();
    this.syncPit();
    this.scheduleAi();
  }

  // ------------------------------------------------------------- hot-seat pass

  private syncPassScreen(): void {
    const s = this.state;
    const car = currentCar(s);
    const needed = this.humanCount() > 1 && car && this.level(car.id) === null && s.phase === 'gear' && this.readyFor !== car.id && !this.rolling;
    if (!needed || !car) {
      if (s.status === 'racing' && this.passModal) {
        this.passModal.close();
        this.passModal = null;
      }
      return;
    }
    if (this.passModal) return;
    const idx = s.cars.indexOf(car);
    const name = this.seatName(car.id);
    this.passModal = Modal({
      title: `Au tour de ${name}`,
      dismissible: false,
      testid: 'pass-screen',
      children: [
        el('div', { class: 'badge-dot', style: `background:${hex(this.carStyles[car.id]?.color ?? CAR_COLORS[idx % CAR_COLORS.length])}` }),
        el('p', { class: 'muted', text: `Passez l'appareil à ${name}.` }),
        ...this.notices.map((n) => el('p', { class: 'muted', text: n })),
      ],
      actions: [
        Button({
          text: 'Je suis prêt',
          variant: 'yellow',
          size: 'lg',
          onClick: () => {
            this.readyFor = car.id;
            this.passModal?.close();
            this.passModal = null;
            this.renderer.follow();
            this.refresh();
          },
        }),
      ],
    });
  }

  // ---------------------------------------------------------------- pit stop (§10)

  private syncPit(): void {
    const s = this.state;
    const car = currentCar(s);
    const needed = s.status === 'racing' && s.phase === 'pit' && !!car && this.isMine(car.id);
    if (!needed) {
      if (this.pitModal) {
        this.pitModal.close();
        this.pitModal = null;
      }
      return;
    }
    if (this.pitModal) return;
    this.pitChoice = { tires: s.wetness >= 3 ? 'rain' : 'hard', repairs: {} };
    this.openPitModal(car as CarState);
  }

  private openPitModal(car: CarState): void {
    const modal = Modal({ title: 'Stand', label: 'Arrêt au stand', dismissible: false, testid: 'pit-modal' });
    this.pitModal = modal;
    const draw = () => {
      const used = Object.values(this.pitChoice.repairs).reduce((a, b) => a + (b ?? 0), 0);
      const left = car.repairLeft - used;
      const tires = el(
        'div',
        { class: 'seg seg--3', role: 'group', 'aria-label': 'Pneus' },
        ...TIRE_TYPES.map((t) =>
          Button({
            text: TIRE_LABELS[t],
            variant: 'ghost',
            attrs: { 'aria-pressed': String(this.pitChoice.tires === t), 'data-tires': t },
            onClick: () => {
              this.pitChoice.tires = t;
              draw();
            },
          }),
        ),
      );
      const rows = REPAIRABLE.map((cat) => {
        const n = this.pitChoice.repairs[cat] ?? 0;
        const room = car.maxWear[cat] - car.wear[cat];
        return el(
          'div',
          { class: 'repair-row', 'data-repair': cat },
          el('span', { class: 'repair-row__name', text: `${WEAR_LABELS[cat]} ${car.wear[cat]}/${car.maxWear[cat]}` }),
          el(
            'div',
            { class: 'stepper' },
            Button({ text: '−', variant: 'ghost', disabled: n <= 0, attrs: { 'aria-label': `Moins de réparation : ${WEAR_LABELS[cat]}` }, onClick: () => { this.pitChoice.repairs[cat] = n - 1; draw(); } }),
            el('output', { text: String(n) }),
            Button({ text: '+', variant: 'ghost', disabled: left <= 0 || n >= room, attrs: { 'aria-label': `Plus de réparation : ${WEAR_LABELS[cat]}` }, onClick: () => { this.pitChoice.repairs[cat] = n + 1; draw(); } }),
          ),
        );
      });
      const repairs = Object.fromEntries(Object.entries(this.pitChoice.repairs).filter(([, n]) => (n ?? 0) > 0)) as Partial<Record<WearCategory, number>>;
      modal.body.replaceChildren(
        el('p', { class: 'muted', text: `Pneus neufs à chaque arrêt. Il reste ${plural(left, 'point')} de réparation pour toute la course.` }),
        el('fieldset', {}, el('legend', { text: 'Pneus' }), tires),
        el('fieldset', {}, el('legend', { text: 'Réparations' }), ...rows),
        el('p', { class: 'muted', text: used === 0 ? 'Sans réparation : arrêt rapide. Un d20 sous 11 et vous repartez tout de suite, sinon le tour est perdu.' : 'Avec réparations : arrêt long, le tour est perdu.' }),
      );
      const actions = modal.el.querySelector('.kit-modal') as HTMLElement;
      actions.querySelector('.kit-modal__actions')?.remove();
      actions.append(
        el(
          'footer',
          { class: 'kit-modal__actions' },
          Button({ text: used === 0 ? 'Arrêt rapide' : 'Arrêt long', variant: 'yellow', size: 'lg', attrs: { 'data-testid': 'pit-go' }, onClick: () => this.dispatch({ type: 'PIT_STOP', tires: this.pitChoice.tires, repairs }) }),
          Button({ text: 'Ne pas s’arrêter', variant: 'ghost', attrs: { 'data-testid': 'pit-skip' }, onClick: () => this.dispatch({ type: 'SKIP_PIT' }) }),
        ),
      );
    };
    draw();
  }

  // --------------------------------------------------------------- end of race

  /** The portrait of a seat's driver, when the asset registry has one. */
  private portrait(seat: number): HTMLElement[] {
    let index: number | null = seat;
    if (this.lvl) {
      const op = this.lvl.opponents[seat - 1];
      index = seat === 0 ? profilePortraitIndex(getProfile()) : op ? opponentLook(op).portrait : null;
    }
    const src = index === null ? null : assets.driverPortrait(index);
    return src ? [el('img', { class: 'portrait', src, alt: '', 'data-testid': 'portrait' })] : [];
  }

  /** The stars of a campaign level, what each objective asked, and the reward pack to open. */
  private campaignResult(r: RaceRewards | null | undefined): HTMLElement[] {
    if (!this.lvl) return [];
    const mine = this.state.results?.find((x) => x.carId === 'p1');
    const result = starsFor(this.lvl, { rank: mine?.rank ?? this.state.cars.length, retired: mine ? mine.retired !== null : true, stats: this.stats });
    const stars = el(
      'div',
      { class: 'stars', 'data-testid': 'stars', 'data-stars': String(result.stars), role: 'img', 'aria-label': `${result.stars} étoile${result.stars > 1 ? 's' : ''} sur 3` },
      ...result.met.map((ok, i) => el('span', { class: `star${ok ? ' star--on' : ''}`, style: `animation-delay:${i * 0.35}s`, text: ok ? '★' : '☆' })),
    );
    const goals = el(
      'ul',
      { class: 'goals', 'data-testid': 'goals' },
      ...this.lvl.goals.map((g, i) => el('li', { class: result.met[i] ? 'goal goal--met' : 'goal', 'data-met': String(result.met[i]) }, el('span', { text: result.met[i] ? '✓' : '✗' }), el('span', { text: goalText(g) }))),
    );
    const cards = r?.campaign?.cards ?? [];
    const open = Button({ text: 'Ouvrir la récompense', variant: 'yellow', size: 'lg', block: true, attrs: { 'data-testid': 'open-reward' } });
    open.onclick = () => {
      open.disabled = true;
      showPackReveal({ cards }, () => setButtonText(open, 'Récompense ouverte'));
    };
    return [stars, goals, ...(cards.length ? [open] : [])];
  }

  /** "+N XP" and the account level bar after the race. */
  private xpBlock(r: RaceRewards): HTMLElement {
    const lp = levelProgress(r.xpAfter);
    const before = levelProgress(r.xpBefore);
    const startInto = before.level === lp.level ? before.into : 0; // the bar fills from where it was
    const bar = ProgressBar({ value: startInto, max: lp.span, tone: 'xp', label: 'Expérience', text: lp.into + ' / ' + lp.span + ' XP', attrs: { 'data-testid': 'end-xp' } });
    requestAnimationFrame(() => requestAnimationFrame(() => setProgress(bar, lp.into, lp.span, lp.into + ' / ' + lp.span + ' XP')));
    return el(
      'div',
      { class: 'xp-gain', 'data-testid': 'xp-gain' },
      el('p', { class: 'xp-gain__text', 'data-testid': 'xp-gain-text', text: '+' + r.xp + ' XP' }),
      el(
        'div',
        { class: 'profile-level' },
        LevelBadge(lp.level, { attrs: { 'data-testid': 'end-level' } }),
        bar,
      ),
    );
  }

  private async showEnd(): Promise<void> {
    if (this.endModal) return;
    this.endModal = Modal({ title: 'Classement', dismissible: false, testid: 'end-screen', children: [] }); // claim the slot before awaiting
    if (!prefersReducedMotion()) await sleep(800);
    if (this.destroyed) return;
    const rows = rankingRows(this.state, (id) => this.label(id));
    setButtonText(this.act, 'Terminé');
    this.act.disabled = true;
    // the profile owner (player 1, when human) earns rewards once per race
    if (this.rewards === undefined) {
      const me = this.online ? this.state.cars[this.online.mySeat]?.id : this.cfg.controllers[0] === 'human' ? 'p1' : undefined;
      const mine = me ? this.state.results?.find((r) => r.carId === me) : undefined;
      const earned = mine && this.handlers.onFinished ? this.handlers.onFinished({ rank: mine.rank, retired: mine.retired !== null, stats: this.stats, players: this.state.cars.length, vsBots: this.cfg.controllers.slice(0, this.state.cars.length).some((c) => c !== 'human'), soloVsAi: this.cfg.controllers.slice(0, this.state.cars.length).filter((c) => c === 'human').length === 1 && this.cfg.controllers.slice(0, this.state.cars.length).some((c) => c !== 'human'), clean: mine.retired === null && Object.values(this.state.cars.find((c) => c.id === me)?.wear ?? { x: 0 }).every((w) => w > 0) }) : null;
      this.rewards = null; // claimed: never paid twice, even while the server is answering
      this.rewards = earned instanceof Promise ? await earned : earned;
      if (this.destroyed) return;
      if (this.rewards?.levelUp) {
        playSound('levelup');
        toast('Niveau ' + this.rewards.levelUp + ' atteint !');
      }
      else if (mine && mine.rank === 1 && mine.retired === null) playSound('win');
    }
    const r = this.rewards;
    const rewardLines = r
      ? [
          r.packs ? `+${r.packs} coffre${r.packs > 1 ? 's' : ''} gagné${r.packs > 1 ? 's' : ''} : ${r.chests.map((t) => CHESTS[t].label).join(', ')}` : null,
          `🪙 +${r.gold}`,
          r.gems ? `💎 +${r.gems}` : null,
          r.pass ? `🏁 +${r.pass} points de passe` : null,
          r.levelUp ? `Niveau ${r.levelUp} atteint !` : null,
          r.stageCleared ? 'Niveau terminé !' : null,
        ].filter((x): x is string => x !== null)
      : [];
    this.endModal.body.replaceChildren(
      el(
        'ol',
        { class: 'ranking', 'data-testid': 'ranking' },
        ...rows.map((row) => {
          const idx = this.state.cars.findIndex((c) => c.id === row.carId);
          const out = this.state.cars[idx].retired !== null;
          return el(
            'li',
            { class: out ? 'out' : '', 'data-car': row.carId },
            el('span', { class: 'rank', text: String(row.rank) }),
            el('span', { class: 'who' }, ...this.portrait(idx), el('span', { class: 'dot', style: `background:${hex(this.carStyles[row.carId]?.color ?? CAR_COLORS[idx % CAR_COLORS.length])}` }), row.name),
            el('span', { class: 'status', text: row.status }),
          );
        }),
      ),
      ...this.campaignResult(r),
      el(
        'ul',
        { class: 'rewards', 'data-testid': 'rewards', hidden: rewardLines.length === 0 },
        ...rewardLines.map((l, i) => el('li', i === 0 && r?.packs ? { 'data-testid': 'reward', text: l } : { text: l })),
      ),
      ...(r ? [this.xpBlock(r)] : []),
      el(
        'div',
        { class: 'row' },
        // online, the host starts the next race for everyone
        this.online && !this.online.host
          ? el('p', { class: 'muted', text: 'L’hôte peut relancer une course.' })
          : Button({ text: 'Rejouer', variant: 'green', size: 'lg', onClick: () => this.handlers.onReplay({ ...this.cfg, seed: this.cfg.seed + 1 }) }),
        Button({ text: this.lvl ? 'Carte' : 'Menu', variant: 'blue', size: 'lg', onClick: () => this.handlers.onMenu() }),
      ),
    );
  }

  private exposeDebug(): void {
    if (!import.meta.env.DEV) return;
    const r = this.renderer;
    Object.assign(window, {
      __game: {
        get state() {
          return (window as unknown as { __screen: RaceScreen }).__screen.state;
        },
        dispatch: (a: Action) => this.dispatch(a),
        /** Tests only: replaces the race state (to reach a situation without playing for it). */
        setState: (s: RaceState) => {
          this.state = s;
          this.turnCar = null;
          this.refresh();
        },
        isHumanTurn: () => this.isHumanTurn(),
        /** Tests only: plays the whole race at once; the human seat is driven by an AI of this level. */
        autoplay: (me: AiLevel = 'hard') => {
          for (let i = 0; i < 20000 && this.state.status === 'racing'; i++) {
            const car = currentCar(this.state);
            if (!car) break;
            const rand = () => {
              const [v, n] = nextFloat(this.aiRng);
              this.aiRng = n;
              return v;
            };
            this.dispatch(chooseAction(this.level(car.id) ?? me, this.state, rand));
          }
        },
        stats: () => this.stats,
        destinations: () => enumerateMoves(this.state).filter((o) => o.playable).map((o) => o.cellId),
        /** Tests only: every option of the roll, with what it costs (bodywork, brakes, tires) and whether it ends in the wall. */
        options: () => enumerateMoves(this.state).map((o) => ({ cellId: o.cellId, playable: o.playable, blocked: o.blocked, bodyLoss: o.bodyLoss, brakesLoss: o.brakesLoss, tiresLoss: o.tiresLoss, crash: o.crash })),
      },
      __screen: this,
      __render: {
        ready: true,
        camera: () => ({ cx: r.camera.cx, cy: r.camera.cy, zoom: r.camera.zoom, w: r.camera.w, h: r.camera.h }),
        following: () => r.following,
        settle: () => r.settle(),
        fitAll: () => r.fitAll(),
        setDebug: (on: boolean) => r.setDebug(on),
        cellScreen: (id: string) => {
          const c = this.def.cells.find((x) => x.id === id)!;
          const p = r.camera.worldToScreen(c.x, c.y);
          const b = r.canvas.getBoundingClientRect();
          return { x: p.x + b.left, y: p.y + b.top };
        },
      },
    });
  }
}
