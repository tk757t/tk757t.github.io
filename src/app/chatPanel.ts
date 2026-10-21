import { el } from '../ui/dom';
import { createChatView, type ChatView } from './chatView';
import { onRaceChatUnread, onRaceLinkChange, raceChatUnread, raceLink } from './chatRace';
import { chatUnread, onChatChange } from './chatStore';
import { createRaceChatView, type RaceChatView } from './raceChatView';
import type { ChatTab } from './chatNotice';

export type PanelTab = ChatTab | 'journal';

export interface ChatPanel {
  el: HTMLElement;
  /** The panel is on screen (true) or hidden (false): the chat shown reads faster and counts nothing as unread. */
  setActive(on: boolean): void;
  show(tab: PanelTab): void;
  current(): PanelTab;
  destroy(): void;
}

interface Options {
  /** Offers the journal of the race as a third tab during a race (the docked panel of a large screen). */
  journal: boolean;
}

const LABELS: Record<PanelTab, string> = { general: 'Général', race: 'Course', journal: 'Journal' };

/**
 * The chat as tabs: « Général » (the channel of everybody), « Course » (the chat of the players of the race in progress, only for an online
 * race) and, on a large screen, « Journal » (what happens in the race). The tabs of a race appear when a race starts and go when it ends.
 */
export function createChatPanel(o: Options): ChatPanel {
  let active = false;
  let tab: PanelTab = 'general';
  let alive = true;
  const general: ChatView = createChatView();
  let race: RaceChatView | null = null;
  let raceFor: unknown = null;
  let stopJournal: (() => void) | null = null;
  const tabs = el('div', { class: 'chatpanel__tabs', role: 'tablist', 'aria-label': 'Chats' });
  const body = el('div', { class: 'chatpanel__body' });
  const root = el('div', { class: 'chatpanel', 'data-testid': 'chat-panel' }, tabs, body);

  const available = (): PanelTab[] => {
    const link = raceLink();
    const out: PanelTab[] = ['general'];
    if (link?.session) out.push('race');
    if (o.journal && link) out.push('journal');
    return out;
  };

  function badge(n: number): HTMLElement | null {
    return n > 0 ? el('span', { class: 'chatpanel__badge', 'aria-label': `${n} non lu${n > 1 ? 's' : ''}`, 'data-testid': 'chat-tab-badge', text: n > 99 ? '99+' : String(n) }) : null;
  }

  function drawTabs(): void {
    const list = available();
    if (!list.includes(tab)) tab = 'general';
    // with nothing but the general channel there is nothing to choose: no tab strip
    tabs.hidden = list.length === 1;
    tabs.replaceChildren(
      ...list.map((t) => {
        const b = el(
          'button',
          { type: 'button', class: `chatpanel__tab${t === tab ? ' is-active' : ''}`, role: 'tab', 'aria-selected': String(t === tab), 'data-tab': t, 'data-testid': `chat-tab-${t}` },
          LABELS[t],
          badge(t === 'general' ? chatUnread() : t === 'race' ? raceChatUnread() : 0),
        );
        b.addEventListener('click', () => show(t));
        return b;
      }),
    );
  }

  function drawBody(): void {
    stopJournal?.();
    stopJournal = null;
    general.setVisible(false);
    race?.setVisible(false);
    if (tab === 'general') {
      body.replaceChildren(general.el);
      general.setVisible(active);
    } else if (tab === 'race') {
      const session = raceLink()?.session ?? null;
      if (!session) return show('general');
      if (!race || raceFor !== session) {
        race?.destroy();
        race = createRaceChatView(session);
        raceFor = session;
      }
      body.replaceChildren(race.el);
      race.setVisible(active);
    } else {
      const host = el('div', { class: 'journal chatpanel__journal' });
      body.replaceChildren(host);
      const link = raceLink();
      if (link) stopJournal = link.mountJournal(host);
    }
  }

  function show(next: PanelTab): void {
    if (!alive || !available().includes(next)) next = 'general';
    tab = next;
    drawTabs();
    drawBody();
  }

  const offLink = onRaceLinkChange(() => {
    if (!raceLink()?.session && race) {
      race.destroy();
      race = null;
      raceFor = null;
    }
    const was = tab;
    drawTabs(); // falls back to the general channel when the tab on screen is gone
    // the tab on screen disappeared, or the journal must follow the new race
    if (was !== tab || tab === 'journal') drawBody();
  });
  const offUnread = [onChatChange(drawTabs), onRaceChatUnread(drawTabs)];

  drawTabs();
  drawBody();

  return {
    el: root,
    setActive(on) {
      if (on === active || !alive) return;
      active = on;
      if (tab === 'general') general.setVisible(on);
      else if (tab === 'race') race?.setVisible(on);
    },
    show,
    current: () => tab,
    destroy() {
      if (!alive) return;
      alive = false;
      offLink();
      offUnread.forEach((off) => off());
      stopJournal?.();
      general.destroy();
      race?.destroy();
    },
  };
}
