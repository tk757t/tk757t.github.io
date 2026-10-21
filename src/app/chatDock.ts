import { el } from '../ui/dom';
import { getAccount } from './account';
import { createChatPanel, type ChatPanel, type PanelTab } from './chatPanel';
import { isDockLayout, onLayoutChange } from './layout';

/** Width of the docked chat, in px (the stylesheet reads it from this variable too). */
export const DOCK_WIDTH = 340;

let aside: HTMLElement | null = null;
let panel: ChatPanel | null = null;

/** True when the chat is docked at the right of the screen: a large screen and a player with a pseudo. */
export const dockShown = (): boolean => aside !== null && !aside.hidden;

/** Brings a tab of the docked chat to the front (false when there is no dock on this screen). */
export function showInDock(tab: PanelTab): boolean {
  if (!dockShown() || !panel) return false;
  panel.show(tab);
  return true;
}

/**
 * The chat docked at the right of the screen, always in view, in the menu and during a race: « Général », « Course » (the players of the race)
 * and « Journal » (the race, as it goes). Only on a large screen, for a player with a pseudo (the server decides who writes). The page
 * makes room for it (`has-dock` on the body); the race screen and the menu are laid out in what is left.
 */
export function mountChatDock(): void {
  if (aside) return;
  aside = el('aside', { class: 'chatdock', 'aria-label': 'Chat', 'data-testid': 'chat-dock' });
  aside.hidden = true;
  document.body.append(aside);
  document.documentElement.style.setProperty('--dock-w', `${DOCK_WIDTH}px`);
  const sync = (): void => {
    if (!aside) return;
    const shown = isDockLayout() && !!getAccount()?.pseudo;
    if (shown && !panel) {
      panel = createChatPanel({ journal: true });
      aside.replaceChildren(el('h2', { class: 'chatdock__title', text: '💬 Chat' }), panel.el);
    }
    aside.hidden = !shown;
    document.body.classList.toggle('has-dock', shown);
    panel?.setActive(shown && !document.hidden);
  };
  sync();
  onLayoutChange(sync);
  document.addEventListener('visibilitychange', sync);
}
