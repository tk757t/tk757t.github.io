import {
  MAX_CHAT_CHARS,
  REPORT_REASONS,
  blockPlayer,
  blockedPlayers,
  chatError,
  chatProblem,
  reportMessage,
  sendMessage,
  unblockPlayer,
  type BlockedPlayer,
  type ChatMessage,
} from '../net/chat';
import { fetchMyPlace, ordinal } from '../net/leaderboard';
import { LOBBY_STATS_MS, fetchLobbyStats, onlineLabel } from '../net/lobby';
import { Badge, Button, Modal, type ModalHandle } from '../ui/kit';
import { el } from '../ui/dom';
import { chatPrefs, onChatPrefsChange, setChatPrefs } from './chatPrefs';
import { chatLastError, chatMessages, chatWatch, dropMessagesOf, onChatChange, refreshChat } from './chatStore';
import { toast } from './toast';

const time = (ms: number): string => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** The bell of the notifications: one button, shown wherever a chat is (`destroy` stops it following the choice). */
export function notifyToggle(): { el: HTMLElement; destroy(): void } {
  const btn = Button({
    text: '',
    variant: 'ghost',
    silent: true,
    attrs: { 'data-testid': 'chat-notify-toggle' },
    onClick: () => setChatPrefs({ notify: !chatPrefs().notify }),
  });
  btn.classList.add('chat__bell');
  const paint = (): void => {
    const on = chatPrefs().notify;
    btn.textContent = on ? '🔔 Notifications' : '🔕 Notifications';
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Notifications du chat activées : les couper' : 'Notifications du chat coupées : les activer');
  };
  paint();
  const off = onChatPrefsChange(paint);
  return { el: btn, destroy: off };
}

export interface ChatView {
  el: HTMLElement;
  /** The chat is on screen or no more: it reads faster, and what it shows is not unread. */
  setVisible(on: boolean): void;
  focusInput(): void;
  destroy(): void;
}

/**
 * The chat of the general channel as a block to put anywhere (the chat window, the dock of a large screen): the people online, the place
 * of the player, the list, the form. Everything a person wrote is put in the page as TEXT (never as markup). The messages come from the
 * app's chat store; this block only shows them and sends.
 */
export function createChatView(): ChatView {
  let alive = true;
  let visible = false;
  let statsTimer: ReturnType<typeof setInterval> | null = null;

  const list = el('ul', { class: 'chat__list', role: 'log', 'aria-live': 'polite', 'aria-label': 'Messages du chat', 'data-testid': 'chat-list' });
  const place = el('p', { class: 'chat__place', 'data-testid': 'chat-place' });
  const online = el('p', { class: 'chat__online muted', role: 'status', 'data-testid': 'chat-online' });
  const status = el('p', { class: 'chat__status', role: 'status', 'data-testid': 'chat-status' });
  const input = el('input', { type: 'text', maxlength: MAX_CHAT_CHARS, autocomplete: 'off', 'aria-label': 'Votre message', placeholder: 'Votre message', 'data-testid': 'chat-input' });
  const count = el('small', { class: 'chat__count', 'aria-hidden': 'true', text: `0/${MAX_CHAT_CHARS}` });
  const sendBtn = Button({ text: 'Envoyer', variant: 'green', attrs: { 'data-testid': 'chat-send' }, onClick: () => void send() });
  const blockedBtn = Button({ text: 'Joueurs bloqués', variant: 'ghost', attrs: { 'data-testid': 'chat-blocked-open' }, onClick: () => void openBlocked() });
  const bell = notifyToggle();
  const form = el('form', { class: 'chat__form', 'data-testid': 'chat-form' }, input, count, sendBtn);
  const root = el(
    'div',
    { class: 'chat' },
    el('p', { class: 'muted chat__rules', text: 'Soyez respectueux : ni insultes ni liens. Les messages de plus de 30 jours sont effacés.' }),
    online,
    place,
    list,
    status,
    form,
    el('div', { class: 'chat__tools' }, bell.el, blockedBtn),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void send();
  });
  input.addEventListener('input', () => {
    count.textContent = `${input.value.length}/${MAX_CHAT_CHARS}`;
  });

  const say = (text: string): void => {
    status.textContent = text;
  };

  function draw(): void {
    const messages = chatMessages();
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
    list.replaceChildren(
      ...(messages.length === 0
        ? [el('li', { class: 'chat__empty muted', text: 'Aucun message pour le moment. Dites bonjour !' })]
        : messages.map((m) =>
            el(
              'li',
              { class: `chat__msg${m.mine ? ' chat__msg--mine' : ''}`, 'data-msg': String(m.id) },
              el('div', { class: 'chat__meta' }, el('b', { class: 'chat__who', text: m.pseudo }), m.league ? Badge({ text: m.league.label, tone: 'blue', label: `Ligue ${m.league.label}`, attrs: { 'data-league': m.league.id } }) : null, el('small', { text: time(m.createdAt) })),
              el('p', { class: 'chat__body', text: m.body }),
              m.mine ? null : Button({ text: '⋯', variant: 'ghost', silent: true, attrs: { 'aria-label': `Options du message de ${m.pseudo}`, 'data-testid': 'chat-options' }, onClick: () => openOptions(m) }),
            ),
          )),
    );
    if (nearBottom) list.scrollTop = list.scrollHeight;
    const error = chatLastError();
    if (error) {
      status.dataset.error = '1';
      say(chatError(error));
    } else if (status.dataset.error) {
      delete status.dataset.error;
      say('');
    }
  }

  async function refreshOnline(): Promise<void> {
    const stats = await fetchLobbyStats();
    if (!alive) return;
    online.textContent = stats ? `● ${onlineLabel(stats.online)}` : '';
  }

  async function send(): Promise<void> {
    const text = input.value;
    const problem = chatProblem(text);
    if (problem) return say(problem);
    sendBtn.disabled = true;
    say('');
    try {
      await sendMessage(text);
      input.value = '';
      count.textContent = `0/${MAX_CHAT_CHARS}`;
      await refreshChat();
    } catch (e) {
      say(chatError(e));
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }

  /** What one can do with the message of someone else: report it, or block its author. */
  function openOptions(m: ChatMessage): void {
    const sub: ModalHandle = Modal({
      title: `Message de ${m.pseudo}`,
      testid: 'chat-options-modal',
      children: [
        el('p', { class: 'chat__quote', text: m.body }),
        el('h3', { class: 'chat__h', text: 'Signaler pour…' }),
        el(
          'div',
          { class: 'chat__reasons' },
          ...REPORT_REASONS.map((r) =>
            Button({
              text: r.label,
              variant: 'blue',
              attrs: { 'data-reason': r.id },
              onClick: async () => {
                try {
                  await reportMessage(m.id, r.id);
                  toast('Merci, le signalement est envoyé.');
                  sub.close();
                } catch (e) {
                  toast(chatError(e), 'bad');
                }
              },
            }),
          ),
        ),
        el('h3', { class: 'chat__h', text: 'Ne plus voir ce joueur' }),
        Button({
          text: `Bloquer ${m.pseudo}`,
          variant: 'red',
          block: true,
          attrs: { 'data-testid': 'chat-block' },
          onClick: async () => {
            try {
              await blockPlayer(m.sender);
              dropMessagesOf(m.sender);
              toast(`${m.pseudo} est bloqué.`);
              sub.close();
            } catch (e) {
              toast(chatError(e), 'bad');
            }
          },
        }),
      ],
    });
  }

  /** The players this person blocked, each with a button to unblock. */
  async function openBlocked(): Promise<void> {
    let blocked: BlockedPlayer[];
    try {
      blocked = await blockedPlayers();
    } catch (e) {
      return toast(chatError(e), 'bad');
    }
    const box = el('ul', { class: 'chat__blocked', 'data-testid': 'chat-blocked-list' });
    Modal({ title: 'Joueurs bloqués', testid: 'chat-blocked', children: [box] });
    const draw2 = (): void => {
      box.replaceChildren(
        ...(blocked.length === 0
          ? [el('li', { class: 'muted', text: 'Vous n’avez bloqué personne.' })]
          : blocked.map((b) =>
              el(
                'li',
                {},
                el('span', { text: b.pseudo }),
                Button({
                  text: 'Débloquer',
                  variant: 'ghost',
                  attrs: { 'aria-label': `Débloquer ${b.pseudo}`, 'data-unblock': b.id },
                  onClick: async () => {
                    try {
                      await unblockPlayer(b.id);
                      blocked = blocked.filter((x) => x.id !== b.id);
                      draw2();
                      toast(`${b.pseudo} est débloqué.`);
                      await refreshChat(true);
                    } catch (e) {
                      toast(chatError(e), 'bad');
                    }
                  },
                }),
              ),
            )),
      );
    };
    draw2();
  }

  const offChange = onChatChange(draw);
  // the rank of the person, always in view
  void fetchMyPlace().then(
    (p) => {
      if (alive) place.textContent = p ? `Votre classement : ${ordinal(p.rank)} sur ${p.total} · ligue ${p.league.label}` : 'Pas encore classé : jouez une course classée.';
    },
    () => undefined,
  );
  draw();
  void refreshOnline();
  statsTimer = setInterval(() => {
    if (visible && !document.hidden) void refreshOnline();
  }, LOBBY_STATS_MS);

  return {
    el: root,
    setVisible(on) {
      if (on === visible || !alive) return;
      visible = on;
      chatWatch(on);
      if (on) {
        draw();
        list.scrollTop = list.scrollHeight;
        void refreshOnline();
      }
    },
    focusInput: () => input.focus(),
    destroy() {
      if (!alive) return;
      alive = false;
      if (visible) chatWatch(false);
      visible = false;
      offChange();
      bell.destroy();
      if (statsTimer) clearInterval(statsTimer);
    },
  };
}
