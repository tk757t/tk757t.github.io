import { chatWatched, onChatNew } from './chatStore';
import { chatPrefs } from './chatPrefs';
import { onRaceLinkChange, raceChatArrived, raceChatWatched, raceLink } from './chatRace';
import { el } from '../ui/dom';

export type ChatTab = 'general' | 'race';

/** How long a notification stays, and the longest text it shows. */
export const NOTICE_MS = 5_000;
export const NOTICE_CHARS = 90;

let opener: (tab: ChatTab) => void = () => undefined;
/** The screen that shows the chat (the docked panel of a large screen, or the chat window): a tap on a notification opens it there. */
export function setChatOpener(fn: (tab: ChatTab) => void): void {
  opener = fn;
}
export const openChatTab = (tab: ChatTab): void => opener(tab);

export const shortText = (text: string, max = NOTICE_CHARS): string => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

let timer: ReturnType<typeof setTimeout> | null = null;

/** A small notification at the corner of the screen: who wrote, and what. One at a time, the newest replaces the one on screen. */
export function showChatNotice(who: string, text: string, tab: ChatTab): void {
  let box = document.getElementById('chat-notice');
  if (!box) {
    box = el('div', { id: 'chat-notice', class: 'chat-notice', role: 'status', 'aria-live': 'polite', 'data-testid': 'chat-notice' });
    document.body.append(box);
  }
  const note = box;
  const hide = (): void => {
    note.hidden = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const open = el('button', { type: 'button', class: 'chat-notice__open', 'aria-label': `Message de ${who} : ${shortText(text)}. Ouvrir le chat` }, el('b', { text: tab === 'race' ? `${who} (course)` : who }), el('span', { text: shortText(text) }));
  open.addEventListener('click', () => {
    hide();
    openChatTab(tab);
  });
  const close = el('button', { type: 'button', class: 'chat-notice__close', 'aria-label': 'Fermer la notification', text: '×' });
  close.addEventListener('click', hide);
  note.replaceChildren(open, close);
  note.hidden = false;
  if (timer) clearTimeout(timer);
  timer = setTimeout(hide, NOTICE_MS);
}

let started = false;
let offSession: (() => void) | null = null;

/**
 * One small notification for each new message of the general channel, and for each message of the race chat, unless the player cut
 * them (the bell) or that chat is on screen already.
 */
export function startChatNotices(): void {
  if (started) return;
  started = true;
  onChatNew((fresh) => {
    if (!chatPrefs().notify || chatWatched()) return;
    for (const m of fresh) showChatNotice(m.pseudo, m.body, 'general');
  });
  const follow = (): void => {
    offSession?.();
    offSession = null;
    const session = raceLink()?.session;
    if (!session) return;
    offSession = session.onChat((m) => {
      if (m.mine) return;
      const watched = raceChatWatched();
      raceChatArrived();
      if (chatPrefs().notify && !watched) showChatNotice(m.name, m.body, 'race');
    });
  };
  onRaceLinkChange(follow);
  follow();
}
