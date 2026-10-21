import { CHAT_POLL_MS, fetchMessages, type ChatMessage } from '../net/chat';
import { getAccount } from './account';

/**
 * The messages of the general channel, read from the server by one place for the whole app: the chat window, the docked chat of a
 * large screen and the notifications all use it. It asks every few seconds while a chat is on screen and more slowly in the background,
 * and counts the messages of others that nobody has seen yet.
 */
export const CHAT_BACKGROUND_POLL_MS = 8_000;
const KEEP = 200;

type Fn = () => void;

let messages: ChatMessage[] = [];
let lastId: number | null = null;
let loaded = false;
let started = false;
let busy = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let watchers = 0;
let unread = 0;
let lastError: unknown = null;
const changeFns = new Set<Fn>();
const newFns = new Set<(fresh: ChatMessage[]) => void>();

const emit = (): void => changeFns.forEach((f) => f());

export const chatMessages = (): readonly ChatMessage[] => messages;
export const chatUnread = (): number => unread;
/** True while a chat is on screen: its messages are seen as they come. */
export const chatWatched = (): boolean => watchers > 0;
/** The last error of the server, or null when the last reading worked. */
export const chatLastError = (): unknown => lastError;
export const onChatChange = (fn: Fn): (() => void) => {
  changeFns.add(fn);
  return () => changeFns.delete(fn);
};
/** The messages of others that arrived since the last reading, as they come (never the first reading, never one's own). */
export const onChatNew = (fn: (fresh: ChatMessage[]) => void): (() => void) => {
  newFns.add(fn);
  return () => newFns.delete(fn);
};

/** A chat is on screen (true) or no more (false): the reading is faster while one is, and what it shows is no longer unread. */
export function chatWatch(on: boolean): void {
  watchers = Math.max(0, watchers + (on ? 1 : -1));
  if (on && unread > 0) {
    unread = 0;
    emit();
  }
  if (on && started) void refreshChat();
}

/** Reads the channel again now (`first`: from the start, as the window does when it opens or after an unblocking). */
export async function refreshChat(first = false): Promise<void> {
  if (busy || !getAccount()?.pseudo) return;
  busy = true;
  try {
    const fresh = await fetchMessages(first || !loaded ? null : lastId);
    const recovered = lastError !== null;
    lastError = null;
    if (first || !loaded) {
      messages = fresh.slice(-KEEP);
      loaded = true;
      if (fresh.length) lastId = Math.max(lastId ?? 0, ...fresh.map((m) => m.id));
      emit();
      return;
    }
    const added = fresh.filter((m) => !messages.some((x) => x.id === m.id));
    if (fresh.length) lastId = Math.max(lastId ?? 0, ...fresh.map((m) => m.id));
    if (added.length === 0) {
      if (recovered) emit(); // the views clear their error
      return;
    }
    messages = [...messages, ...added].slice(-KEEP);
    const others = added.filter((m) => !m.mine);
    if (others.length && watchers === 0) unread += others.length;
    emit();
    if (others.length) newFns.forEach((f) => f(others));
  } catch (e) {
    lastError = e;
    emit();
  } finally {
    busy = false;
  }
}

/** The messages of a blocked player disappear at once. */
export function dropMessagesOf(sender: string): void {
  messages = messages.filter((m) => m.sender !== sender);
  emit();
}

function schedule(): void {
  if (!started) return;
  timer = setTimeout(
    async () => {
      if (!document.hidden) await refreshChat();
      schedule();
    },
    watchers > 0 ? CHAT_POLL_MS : CHAT_BACKGROUND_POLL_MS,
  );
}

/** Starts reading the channel for the whole visit (nothing happens without an account that has a pseudo). */
export function startChatStore(): void {
  if (started) return;
  started = true;
  void refreshChat(true);
  schedule();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && started) void refreshChat();
  });
}

/** Tests: forget everything. */
export function resetChatStore(): void {
  started = false;
  if (timer) clearTimeout(timer);
  timer = null;
  messages = [];
  lastId = null;
  loaded = false;
  busy = false;
  watchers = 0;
  unread = 0;
  lastError = null;
}
