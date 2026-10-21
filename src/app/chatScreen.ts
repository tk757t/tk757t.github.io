import { Button, Modal, type ModalHandle } from '../ui/kit';
import { el } from '../ui/dom';
import { chatPrefs, onChatPrefsChange, setChatPrefs } from './chatPrefs';
import { createChatPanel } from './chatPanel';
import type { ChatTab } from './chatNotice';
import { isDockLayout } from './layout';

let open: { modal: ModalHandle; show(tab: ChatTab): void } | null = null;

/**
 * The chat window (narrow screens, and wherever there is no docked chat): the general channel, and during an online race the chat of the race
 * as a second tab. The messages come from the app's chat store, which also feeds the notifications.
 */
export function openChat(tab: ChatTab = 'general'): ModalHandle {
  if (open) {
    open.show(tab);
    return open.modal;
  }
  const panel = createChatPanel({ journal: false });
  // the floating bubble can be closed: this brings it back
  const bubble = Button({ text: 'Afficher la bulle de chat', variant: 'ghost', block: true, attrs: { 'data-testid': 'chat-bubble-show' }, onClick: () => setChatPrefs({ bubbleHidden: false }) });
  const paint = (): void => {
    bubble.hidden = isDockLayout() || !chatPrefs().bubbleHidden;
  };
  paint();
  const offPrefs = onChatPrefsChange(paint);
  const modal: ModalHandle = Modal({
    title: 'Chat',
    testid: 'chat',
    variant: 'sheet',
    onClose: () => {
      panel.destroy();
      offPrefs();
      open = null;
    },
    children: [panel.el, el('div', { class: 'chat__tools' }, bubble)],
  });
  open = { modal, show: (t) => panel.show(t) };
  panel.setActive(true);
  if (tab !== 'general') panel.show(tab);
  return modal;
}
