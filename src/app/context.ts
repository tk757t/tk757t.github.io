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
  /** The offline race settings window. */
  openSetup(): void;
  /** « Course perso »: the public games to join, create one, or play offline. */
  openLobbies(): void;
  /** The "Jouer en ligne" window (create or join a room). */
  openOnline(joinCode?: string): void;
  /** The ranked matchmaking window. */
  openRanked(): void;
  /** The unranked matchmaking window: the same queue as the ranked race, without trophies. */
  openUnranked(): void;
  /** Subscribe to changes of the race settings (the Course tab shows a summary). */
  onConfigChange(fn: () => void): () => void;
  /** Subscribe to the 1 s tick that refreshes countdowns. */
  onTick(fn: () => void): () => void;
}

/** A mounted tab: call to remove its listeners. */
export type Dispose = () => void;
