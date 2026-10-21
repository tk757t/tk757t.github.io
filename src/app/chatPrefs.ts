/**
 * What the player chose about the chat, kept in this browser: the small notification of each new message (on by default) and
 * the floating bubble of the narrow layout (shown by default, where the player left it).
 */
const KEY = '4mules.chat.prefs';

export interface BubblePlace {
  /** Position of the bubble's centre as a share of the window (0 to 1), so that it stays in view when the window changes. */
  x: number;
  y: number;
}

export interface ChatPrefs {
  notify: boolean;
  bubbleHidden: boolean;
  bubble: BubblePlace | null;
}

const DEFAULTS: ChatPrefs = { notify: true, bubbleHidden: false, bubble: null };

const share = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null);

/** Reads what is stored, keeping only what is well formed (the storage can be empty, blocked or edited by hand). */
export function parsePrefs(raw: string | null): ChatPrefs {
  if (!raw) return { ...DEFAULTS };
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const bubble = typeof v.bubble === 'object' && v.bubble !== null ? (v.bubble as Record<string, unknown>) : null;
    const x = share(bubble?.x);
    const y = share(bubble?.y);
    return {
      notify: v.notify !== false,
      bubbleHidden: v.bubbleHidden === true,
      bubble: x !== null && y !== null ? { x, y } : null,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

let current: ChatPrefs | null = null;
const listeners = new Set<() => void>();

export function chatPrefs(): ChatPrefs {
  if (!current) {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch {
      /* storage blocked: defaults */
    }
    current = parsePrefs(raw);
  }
  return current;
}

export function setChatPrefs(patch: Partial<ChatPrefs>): void {
  current = { ...chatPrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* the choice holds for this visit only */
  }
  listeners.forEach((l) => l());
}

export function onChatPrefsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
