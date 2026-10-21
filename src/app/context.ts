import type { RaceConfig } from './setup';

export type TabId = 'shop' | 'garage' | 'race' | 'campaign' | 'quests';

export const TAB_ORDER: TabId[] = ['shop', 'garage', 'race', 'campaign', 'quests'];

/** What the tab screens may ask of the app. */
export interface AppContext {
  /** Current time in ms (the clock tests can control). */
  now(): number;
  /** Overrides every chest's unlock time (dev and tests only). */
  unlockMs: number | undefined;
  config(): RaceConfig;
  setConfig(cfg: RaceConfig): void;
  startRace(cfg: RaceConfig): void;
  goTab(tab: TabId): void;
  openSetup(): void;
  /** The "Jouer en ligne" window (create or join a room). */
  openOnline(joinCode?: string): void;
  /** The ranked matchmaking window. */
  openRanked(): void;
  /** The open rooms of the unranked race. */
  openOpenRoom(): void;
  /** Subscribe to changes of the race settings (the Course tab shows a summary). */
  onConfigChange(fn: () => void): () => void;
  /** Subscribe to the 1 s tick that refreshes countdowns. */
  onTick(fn: () => void): () => void;
}

/** A mounted tab: call to remove its listeners. */
export type Dispose = () => void;
