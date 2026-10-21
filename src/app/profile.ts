import { SAVE_KEY, loadProfile, newProfile, parseProfile, saveProfile, serializeProfile, type KeyValueStore, type LoadStatus, type Profile } from '../data/profile/profile';

function browserStore(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null; // blocked storage: the game still works, nothing is saved
  }
}

let store: KeyValueStore | null = null;
let current: Profile = newProfile(1);
let status: LoadStatus = 'new';
let seed = 1;
/** True while the profile on screen is the game server's (signed-in accounts): nothing is decided here any more. */
let serverBacked = false;
const listeners = new Set<() => void>();

/** Loads the save once at start-up. `seed` only matters for a brand new profile (pack rng). */
export function initProfile(newSeed: number): LoadStatus {
  seed = newSeed;
  store = browserStore();
  const r = loadProfile(store, seed);
  current = r.profile;
  status = r.status;
  if (status !== 'loaded') saveProfile(store, current);
  expose();
  return status;
}

export const getProfile = (): Profile => current;
export const profileStatus = (): LoadStatus => status;
export const isServerBacked = (): boolean => serverBacked;

const notify = (): void => listeners.forEach((l) => l());

/**
 * Applies a pure update (null = refused) and saves. Returns whether the update happened. Local play only: when the
 * profile comes from the game server, every change goes through it (src/app/economy.ts) and this refuses.
 */
export function updateProfile(fn: (p: Profile) => Profile | null): boolean {
  if (serverBacked) return false;
  const next = fn(current);
  if (!next) return false;
  current = next;
  saveProfile(store, current);
  notify();
  return true;
}

/** The text of the local save of this device (sent once to the server when an account connects). */
export function localSaveText(): string {
  try {
    const text = store?.getItem(SAVE_KEY);
    if (text) return text;
  } catch {
    /* blocked storage: send what is in memory */
  }
  return serializeProfile(serverBacked ? newProfile(seed) : current);
}

/**
 * Shows the profile the game server sent. It replaces the local one on screen and is kept under `cacheKey` as a
 * read-only copy (never under the local save, which stays the progress of this device without an account).
 */
export function setServerProfile(p: Profile, cacheKey: string): void {
  serverBacked = true;
  current = p;
  confirmed = p;
  try {
    store?.setItem(cacheKey, serializeProfile(p));
  } catch {
    /* the cache is only a convenience */
  }
  notify();
}

/** What the server last sent: where a refused action goes back to. */
let confirmed: Profile | null = null;

/** Accounts: shows the expected result of an action at once. The server's answer replaces it (setServerProfile). */
export function showOptimistic(next: Profile): void {
  if (!serverBacked) return;
  current = next;
  notify();
}

/** The server refused (or could not be reached): back to what it last sent. */
export function rollbackOptimistic(): void {
  if (!serverBacked || !confirmed) return;
  current = confirmed;
  notify();
}

/** The last profile the server sent to this device for this account, if any. */
export function cachedServerProfile(cacheKey: string): Profile | null {
  try {
    const text = store?.getItem(cacheKey);
    return text ? (parseProfile(text)?.profile ?? null) : null;
  } catch {
    return null;
  }
}

/** Back to the local save of this device (the server could not be reached). */
export function useLocalProfile(): void {
  if (!serverBacked) return;
  serverBacked = false;
  current = loadProfile(store, seed).profile;
  notify();
}

export function onProfileChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function expose(): void {
  if (!import.meta.env.DEV) return;
  Object.assign(window, { __profile: { get: () => current, status: () => status, server: () => serverBacked } });
}
