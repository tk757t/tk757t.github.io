import { el } from '../ui/dom';
import { getAccount } from './account';
import { chatPrefs, onChatPrefsChange, setChatPrefs } from './chatPrefs';
import { raceChatUnread, onRaceChatUnread } from './chatRace';
import { chatUnread, onChatChange } from './chatStore';
import { isDockLayout, onLayoutChange } from './layout';
import { openChat } from './chatScreen';

/** Size of the bubble in px, the share of the window kept free around its centre, and how far a finger moves before it is a drag and not a tap. */
export const BUBBLE_SIZE = 56;
const DRAG_PX = 6;

/** Where the bubble sits at first: the lower right, above the tab bar. */
export const DEFAULT_BUBBLE = { x: 0.88, y: 0.72 };

/** Keeps the bubble fully on screen: its centre as a share of the window, clamped by the half size of the bubble. */
export function clampBubble(p: { x: number; y: number }, w: number, h: number, size = BUBBLE_SIZE): { x: number; y: number } {
  const mx = Math.min(0.5, size / 2 / Math.max(1, w));
  const my = Math.min(0.5, size / 2 / Math.max(1, h));
  return { x: Math.min(1 - mx, Math.max(mx, p.x)), y: Math.min(1 - my, Math.max(my, p.y)) };
}

let bubble: HTMLElement | null = null;

/**
 * The floating chat bubble of the narrow layout (a phone): it opens the chat, shows the messages not read yet, can be dragged anywhere
 * and closed (the chat window then offers to bring it back). It stays over the race, where the top bar has no chat button.
 */
export function mountChatBubble(): void {
  if (bubble) return;
  const badge = el('span', { class: 'chatbubble__badge', 'data-testid': 'chat-bubble-badge', 'aria-hidden': 'true' });
  const main = el('button', { type: 'button', class: 'chatbubble__main', 'aria-label': 'Ouvrir le chat', 'data-testid': 'chat-bubble-open' }, '💬', badge);
  const close = el('button', { type: 'button', class: 'chatbubble__close', 'aria-label': 'Fermer la bulle de chat', 'data-testid': 'chat-bubble-close' }, el('span', { class: 'chatbubble__x', 'aria-hidden': 'true', text: '×' }));
  const root = el('div', { class: 'chatbubble', 'data-testid': 'chat-bubble' }, main, close);
  bubble = root;
  document.body.append(root);

  const place = (): void => {
    const p = clampBubble(chatPrefs().bubble ?? DEFAULT_BUBBLE, window.innerWidth, window.innerHeight);
    root.style.left = `${p.x * window.innerWidth}px`;
    root.style.top = `${p.y * window.innerHeight}px`;
  };
  const paintBadge = (): void => {
    const n = chatUnread() + raceChatUnread();
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.hidden = n === 0;
  };
  const sync = (): void => {
    const shown = !isDockLayout() && !!getAccount()?.pseudo && !chatPrefs().bubbleHidden;
    root.hidden = !shown;
    place();
    paintBadge();
  };

  // a tap opens the chat; a finger that moves more than a few px drags the bubble, which stays where it is dropped
  let drag: { id: number; dx: number; dy: number; x0: number; y0: number; moved: boolean } | null = null;
  main.addEventListener('pointerdown', (e) => {
    const r = root.getBoundingClientRect();
    drag = { id: e.pointerId, dx: e.clientX - (r.left + r.width / 2), dy: e.clientY - (r.top + r.height / 2), x0: e.clientX, y0: e.clientY, moved: false };
    main.setPointerCapture(e.pointerId);
  });
  main.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < DRAG_PX) return;
    drag.moved = true;
    const p = clampBubble({ x: (e.clientX - drag.dx) / window.innerWidth, y: (e.clientY - drag.dy) / window.innerHeight }, window.innerWidth, window.innerHeight);
    root.style.left = `${p.x * window.innerWidth}px`;
    root.style.top = `${p.y * window.innerHeight}px`;
  });
  const end = (e: PointerEvent): void => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null;
    if (moved) {
      const r = root.getBoundingClientRect();
      setChatPrefs({ bubble: clampBubble({ x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight }, window.innerWidth, window.innerHeight) });
    } else openChat();
  };
  main.addEventListener('pointerup', end);
  main.addEventListener('pointercancel', () => {
    drag = null;
    place();
  });
  // from the keyboard a click opens the chat (a pointer click is handled above: pointerup does it)
  main.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openChat();
    }
  });
  close.addEventListener('click', () => setChatPrefs({ bubbleHidden: true }));

  window.addEventListener('resize', place);
  onLayoutChange(sync);
  onChatPrefsChange(sync);
  onChatChange(paintBadge);
  onRaceChatUnread(paintBadge);
  sync();
}
