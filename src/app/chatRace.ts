import type { Session } from '../net/session';

/**
 * What the chat screens know about the race in progress: its online room (the chat of the race is for the players of that room only) and
 * a way to write the journal of the race in a block (the docked chat of a large screen shows it). The app sets it when a race starts and
 * clears it when it ends.
 */
export interface RaceLink {
  /** The online room of the race; null for a race on this device alone (nobody to talk to). */
  session: Session | null;
  /** Writes the journal into a block and keeps it up to date; returns what stops it. */
  mountJournal: (host: HTMLElement) => () => void;
}

let link: RaceLink | null = null;
const linkFns = new Set<() => void>();
const unreadFns = new Set<() => void>();
let unread = 0;
let watchers = 0;

export const raceLink = (): RaceLink | null => link;

export function setRaceLink(next: RaceLink | null): void {
  link = next;
  unread = 0;
  linkFns.forEach((f) => f());
}

export const onRaceLinkChange = (fn: () => void): (() => void) => {
  linkFns.add(fn);
  return () => linkFns.delete(fn);
};

/** The messages of the race chat that nobody has seen yet. */
export const raceChatUnread = (): number => unread;
export const onRaceChatUnread = (fn: () => void): (() => void) => {
  unreadFns.add(fn);
  return () => unreadFns.delete(fn);
};
export const raceChatWatched = (): boolean => watchers > 0;

/** The chat of the race is on screen (true) or no more (false). */
export function raceChatWatch(on: boolean): void {
  watchers = Math.max(0, watchers + (on ? 1 : -1));
  if (on && unread > 0) {
    unread = 0;
    unreadFns.forEach((f) => f());
  }
}

/** A message of someone else arrived in the race chat: counts as unread when no race chat is on screen. */
export function raceChatArrived(): void {
  if (watchers > 0) return;
  unread += 1;
  unreadFns.forEach((f) => f());
}
