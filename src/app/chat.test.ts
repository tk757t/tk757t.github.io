// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clampBubble, BUBBLE_SIZE } from './chatBubble';
import { parsePrefs } from './chatPrefs';
import { setRaceLink, raceChatArrived, raceChatUnread, raceChatWatch, raceLink } from './chatRace';
import { NOTICE_CHARS, NOTICE_MS, shortText, showChatNotice, setChatOpener } from './chatNotice';
import { createChatPanel } from './chatPanel';
import { Session } from '../net/session';
import { memoryHub } from '../net/transport';

describe('chat preferences', () => {
  it('start with notifications on, the bubble shown and no place', () => {
    expect(parsePrefs(null)).toEqual({ notify: true, bubbleHidden: false, bubble: null });
    expect(parsePrefs('pas du json')).toEqual({ notify: true, bubbleHidden: false, bubble: null });
  });
  it('keep what was chosen, and only what is well formed', () => {
    expect(parsePrefs('{"notify":false,"bubbleHidden":true,"bubble":{"x":0.2,"y":0.4}}')).toEqual({ notify: false, bubbleHidden: true, bubble: { x: 0.2, y: 0.4 } });
    expect(parsePrefs('{"notify":"non","bubble":{"x":"a","y":1}}')).toEqual({ notify: true, bubbleHidden: false, bubble: null });
    expect(parsePrefs('{"bubble":{"x":5,"y":-2}}').bubble).toEqual({ x: 1, y: 0 });
  });
});

describe('floating bubble', () => {
  it('stays fully on screen whatever the finger does', () => {
    const half = BUBBLE_SIZE / 2;
    const p = clampBubble({ x: -3, y: 9 }, 390, 844);
    expect(p.x * 390).toBeCloseTo(half, 5);
    expect(p.y * 844).toBeCloseTo(844 - half, 5);
    expect(clampBubble({ x: 0.5, y: 0.5 }, 390, 844)).toEqual({ x: 0.5, y: 0.5 });
  });
  it('copes with a window smaller than the bubble', () => {
    expect(clampBubble({ x: 0.9, y: 0.1 }, 40, 40)).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe('notifications', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('shorten a long message', () => {
    expect(shortText('court')).toBe('court');
    const long = shortText('x'.repeat(300));
    expect(long.length).toBeLessThanOrEqual(NOTICE_CHARS);
    expect(long.endsWith('…')).toBe(true);
  });

  it('show who wrote and what, as text, one at a time, and go by themselves', () => {
    showChatNotice('Leo_9', '<b>gras</b>', 'general');
    const box = document.getElementById('chat-notice')!;
    expect(box.hidden).toBe(false);
    expect(box.querySelector('b')!.textContent).toBe('Leo_9');
    expect(box.querySelectorAll('b')).toHaveLength(1); // the markup of the message is text, not an element
    expect(box.textContent).toContain('<b>gras</b>');
    showChatNotice('Zoe_12', 'bonjour', 'race');
    expect(document.querySelectorAll('#chat-notice')).toHaveLength(1);
    expect(box.textContent).toContain('Zoe_12 (course)');
    vi.advanceTimersByTime(NOTICE_MS + 10);
    expect(box.hidden).toBe(true);
  });

  it('open the chat on the right tab when tapped', () => {
    const opened: string[] = [];
    setChatOpener((tab) => opened.push(tab));
    showChatNotice('Leo_9', 'salut', 'race');
    (document.querySelector('.chat-notice__open') as HTMLElement).click();
    expect(opened).toEqual(['race']);
    expect((document.getElementById('chat-notice') as HTMLElement).hidden).toBe(true);
  });
});

describe('the chat of the race', () => {
  it('counts what nobody has seen, and forgets it when the race chat is on screen or the race changes', () => {
    setRaceLink(null);
    raceChatArrived();
    raceChatArrived();
    expect(raceChatUnread()).toBe(2);
    raceChatWatch(true);
    expect(raceChatUnread()).toBe(0);
    raceChatArrived(); // seen as it comes
    expect(raceChatUnread()).toBe(0);
    raceChatWatch(false);
    raceChatArrived();
    expect(raceChatUnread()).toBe(1);
    setRaceLink(null);
    expect(raceChatUnread()).toBe(0);
  });
});

describe('chat panel tabs', () => {
  const session = async () => {
    const hub = memoryHub();
    const s = new Session({ transport: hub.create('ABCDE'), code: 'ABCDE', id: 'h', name: 'Hôte', host: true });
    await s.connect(false);
    return s;
  };

  it('offer only the general channel outside a race', () => {
    setRaceLink(null);
    const panel = createChatPanel({ journal: true });
    expect(panel.el.querySelector('.chatpanel__tabs')!.hasAttribute('hidden')).toBe(true);
    expect(panel.current()).toBe('general');
    panel.destroy();
  });

  it('add Course for an online race and Journal on a large screen, and drop them when the race ends', async () => {
    const panel = createChatPanel({ journal: true });
    const stops = vi.fn();
    setRaceLink({ session: await session(), mountJournal: () => stops });
    const tabs = () => [...panel.el.querySelectorAll('[role=tab]')].map((t) => t.getAttribute('data-tab'));
    expect(tabs()).toEqual(['general', 'race', 'journal']);
    panel.show('journal');
    expect(panel.current()).toBe('journal');
    setRaceLink(null);
    expect(raceLink()).toBeNull();
    expect(tabs()).toEqual(['general']);
    expect(panel.current()).toBe('general');
    expect(stops).toHaveBeenCalled();
    panel.destroy();
  });

  it('give a window without the journal tab, and Course only for an online race', async () => {
    const panel = createChatPanel({ journal: false });
    setRaceLink({ session: null, mountJournal: () => () => undefined });
    expect([...panel.el.querySelectorAll('[role=tab]')].map((t) => t.getAttribute('data-tab'))).toEqual(['general']); // a race alone: just the general channel (the strip is hidden)
    setRaceLink({ session: await session(), mountJournal: () => () => undefined });
    expect([...panel.el.querySelectorAll('[role=tab]')].map((t) => t.getAttribute('data-tab'))).toEqual(['general', 'race']);
    setRaceLink(null);
    panel.destroy();
  });
});
