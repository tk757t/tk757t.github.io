import { devParam } from './devParams';
import { DEFAULT_TRACK } from '../data/tracks';
import { LEVELS, starsFor } from '../data/campaign';
import { createShell, type Shell } from './shell';
import { mountCampaign } from './tabs/campaign';
import { mountCourse } from './tabs/course';
import { mountQuests } from './tabs/quests';
import { mountShop } from './tabs/shop';
import { mountGarage } from './garage';
import type { AppContext, TabId } from './context';
import { getProfile } from './profile';
import { beginRace, finishRace } from './economy';
import { serverNow } from './serverGame';
import { RaceScreen } from './RaceScreen';
import { openOnlineLobby, setJoinParam } from './online';
import { openRankedQueue } from './rankedLobby';
import { openOpenRoom } from './openRoomLobby';
import { toast } from './toast';
import type { Session, StartInfo } from '../net/session';
import type { Action } from '../engine';
import { openSetup, type RaceConfig } from './setup';
import { openLobbies } from './lobbiesScreen';

function defaultConfig(): RaceConfig {
  const seed = Number(devParam('seed'));
  const delay = devParam('aiDelay');
  return {
    players: 3,
    controllers: ['human', 'medium', 'easy', 'human'],
    aiDelay: delay !== null && Number.isFinite(Number(delay)) ? Number(delay) : 600,
    trackId: DEFAULT_TRACK,
    laps: 2,
    seed: Number.isFinite(seed) && seed > 0 ? seed : (Date.now() % 900_000) + 1,
    useGear: true,
    // development only (?ranked=1): the next race is a ranked one, to try the screens without the matchmaking
    ...(devParam('ranked') === '1' ? { ranked: true, laps: 1 } : {}),
  };
}

/** Owns the screens: the menu shell (5 tabs) and the full-screen race. */
export class App {
  private race: RaceScreen | null = null;
  /** A race is being started (waiting for the server's token). */
  private starting = false;
  private shell: Shell | null = null;
  private config = defaultConfig();
  private tickers = new Set<() => void>();
  private configListeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly unlockMs: number | undefined;
  /** The online room this player is in, if any. */
  private session: Session | null = null;
  private offSession: (() => void)[] = [];

  readonly ctx: AppContext;

  constructor(private root: HTMLElement) {
    const unlock = Number(devParam('unlockMs'));
    this.unlockMs = Number.isFinite(unlock) && unlock > 0 ? unlock : undefined;
    this.ctx = {
      now: () => serverNow(),
      unlockMs: this.unlockMs,
      config: () => this.config,
      setConfig: (cfg) => this.setConfig(cfg),
      startRace: (cfg) => void this.startRace(cfg),
      goTab: (tab) => this.shell?.setTab(tab),
      openSetup: () => this.openSetup(),
      openLobbies: () => this.openLobbies(),
      openOnline: (code) => this.openOnline(code),
      openRanked: () => this.openRanked(),
      openOpenRoom: () => this.openOpenRoom(),
      onConfigChange: (fn) => {
        this.configListeners.add(fn);
        return () => this.configListeners.delete(fn);
      },
      onTick: (fn) => {
        this.tickers.add(fn);
        return () => this.tickers.delete(fn);
      },
    };
  }

  private setConfig(cfg: RaceConfig): void {
    this.config = cfg;
    this.configListeners.forEach((l) => l());
  }

  private openSetup(): void {
    openSetup(
      this.config,
      { equipped: Object.keys(getProfile().loadout.parts).length },
      (cfg) => this.setConfig(cfg),
      (cfg) => void this.startRace(cfg),
    );
  }

  showShell(tab: TabId = 'race'): void {
    this.leave();
    this.shell = createShell(
      this.root,
      this.ctx,
      { shop: mountShop, garage: mountGarage, race: mountCourse, campaign: mountCampaign, quests: mountQuests },
      tab,
    );
    this.timer = setInterval(() => this.tickers.forEach((t) => t()), 1000);
  }

  private leave(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.shell?.destroy();
    this.shell = null;
    this.race?.destroy();
    this.race = null;
  }

  openLobbies(): void {
    openLobbies({
      trackId: this.config.trackId,
      laps: this.config.laps,
      offline: () => this.openSetup(),
      enter: (options, source) => {
        const lobby = openOpenRoom(options, (s) => this.follow(s, () => lobby.close()), source);
      },
    });
  }

  openOpenRoom(): void {
    const lobby = openOpenRoom({ trackId: this.config.trackId, laps: this.config.laps }, (s) => this.follow(s, () => lobby.close()));
  }

  openRanked(): void {
    const lobby = openRankedQueue((s) => this.follow(s, () => lobby.close()));
  }

  openOnline(joinCode?: string): void {
    const lobby = openOnlineLobby((s) => this.follow(s, () => lobby.close()), joinCode);
  }

  /** Follows an online room: its races start here, and a room that closes during a race sends back to the menu. */
  private follow(session: Session, closeLobby: () => void): void {
    this.leaveSession();
    this.session = session;
    this.offSession = [
      session.onStart((start, log) => {
        closeLobby();
        void this.startOnlineRace(session, start, log);
      }),
      session.onLobby(() => {
        if (session.status !== 'closed' || this.session !== session) return;
        if (this.race) toast(session.closedReason ?? 'La partie est terminée.', 'bad');
        this.leaveSession();
        if (this.race) this.showShell('race');
      }),
    ];
    // a player coming back finds the race already running
    if (session.status === 'racing' && session.start) {
      closeLobby();
      void this.startOnlineRace(session, session.start, session.log);
    }
  }

  private leaveSession(): void {
    this.offSession.forEach((off) => off());
    this.offSession = [];
    if (this.session && this.session.status !== 'closed') this.session.leave();
    this.session = null;
  }

  private async startOnlineRace(session: Session, start: StartInfo, log: Action[]): Promise<void> {
    // a ranked room: the server issues a token for this player's race (it pays and moves the trophies at the end); friends' rooms pay nothing
    let token: Awaited<ReturnType<typeof beginRace>> = null;
    if (session.ranked) {
      const bots = start.seats.filter((x) => x.ai).length;
      token = await beginRace({ trackId: start.trackId, laps: start.laps, players: start.seats.length, bots, ranked: true });
    }
    this.leave();
    const rawDelay = devParam('aiDelay');
    const delay = Number(rawDelay);
    const cfg: RaceConfig = {
      players: start.seats.length,
      controllers: start.seats.map((s) => s.ai ?? 'human'),
      aiDelay: rawDelay !== null && Number.isFinite(delay) ? delay : 600,
      trackId: start.trackId,
      laps: start.laps,
      seed: start.seed,
      // everyone races the same car online
      useGear: false,
    };
    this.race = await RaceScreen.create(
      this.root,
      cfg,
      {
        onReplay: () => {
          if (!session.ranked) return void session.launch((Date.now() % 900_000) + 1);
          // ranked: another opponent, so the matchmaking again
          this.leaveSession();
          this.showShell('race');
          this.openRanked();
        },
        onMenu: () => {
          this.leaveSession();
          setJoinParam(null);
          this.showShell('race');
        },
        // friends' rooms pay nothing (docs/audit-securite.md H4); a ranked race is paid by the server with its token
        onFinished: (info) => (session.ranked ? finishRace(token, info, { now: Date.now() }) : null),
      },
      {
        mySeat: session.mySeat(),
        host: session.host,
        ranked: session.ranked,
        names: start.seats.map((s) => s.name),
        log,
        send: (seq, action) => session.sendAction(seq, action),
        onAction: (fn) => session.onAction(fn),
        isGone: (seat) => session.isGone(seat),
        onPeers: (fn) => session.onPeers(fn),
        forfeit: () => {
          // leaving on purpose: no "the game is over" toast for the one who gives up
          this.offSession.forEach((off) => off());
          this.offSession = [];
          session.forfeit();
        },
        onForfeit: (fn) => session.onForfeit(fn),
      },
    );
  }

  async startRace(cfg: RaceConfig): Promise<void> {
    if (this.starting) return;
    this.starting = true;
    let token: Awaited<ReturnType<typeof beginRace>>;
    try {
      // accounts: the server issues the race token (and its seed) before the race starts
      const bots = cfg.controllers.slice(0, cfg.players).filter((c) => c !== 'human').length;
      token = await beginRace({ trackId: cfg.trackId, laps: cfg.laps, players: cfg.players, bots, level: cfg.level, ranked: cfg.ranked });
    } finally {
      this.starting = false;
    }
    // token null: the server refused or could not be reached (its message is shown), the race pays nothing
    if (token) cfg = { ...cfg, seed: token.seed };
    this.leave();
    this.config = { ...cfg, seed: cfg.seed + 1 }; // the next race gets another seed
    const level = cfg.level === undefined ? undefined : LEVELS[cfg.level];
    this.race = await RaceScreen.create(this.root, cfg, {
      onReplay: (next) => void this.startRace(next),
      onMenu: () => this.showShell(level ? 'campaign' : 'race'),
      // local play pays at once; an account waits for what the server grants
      onFinished: (info) =>
        finishRace(token, info, {
          now: Date.now(),
          unlockMs: this.unlockMs,
          campaign: level && cfg.level !== undefined ? { level: cfg.level, stars: starsFor(level, info).stars } : undefined,
        }),
    });
  }
}
