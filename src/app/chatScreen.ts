import {
  CHAT_POLL_MS,
  MAX_CHAT_CHARS,
  REPORT_REASONS,
  blockPlayer,
  blockedPlayers,
  chatError,
  chatProblem,
  fetchMessages,
  reportMessage,
  sendMessage,
  unblockPlayer,
  type BlockedPlayer,
  type ChatMessage,
} from '../net/chat';
import { fetchMyPlace, ordinal } from '../net/leaderboard';
import { Badge, Button, Modal, type ModalHandle } from '../ui/kit';
import { el } from '../ui/dom';
import { toast } from './toast';

const time = (ms: number): string => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/**
 * The chat window of the general channel. Everything a person wrote is put in the page as TEXT (never as markup), and the list is
 * read again every few seconds while the window is open and the page is visible.
 */
export function openChat(): ModalHandle {
  let messages: ChatMessage[] = [];
  let lastId: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let busy = false;

  const list = el('ul', { class: 'chat__list', role: 'log', 'aria-live': 'polite', 'aria-label': 'Messages du chat', 'data-testid': 'chat-list' });
  const place = el('p', { class: 'chat__place', 'data-testid': 'chat-place' });
  const status = el('p', { class: 'chat__status', role: 'status', 'data-testid': 'chat-status' });
  const input = el('input', { type: 'text', maxlength: MAX_CHAT_CHARS, autocomplete: 'off', 'aria-label': 'Votre message', placeholder: 'Votre message', 'data-testid': 'chat-input' });
  const count = el('small', { class: 'chat__count', 'aria-hidden': 'true', text: `0/${MAX_CHAT_CHARS}` });
  const sendBtn = Button({ text: 'Envoyer', variant: 'green', attrs: { 'data-testid': 'chat-send' }, onClick: () => void send() });
  const blockedBtn = Button({ text: 'Joueurs bloqués', variant: 'ghost', attrs: { 'data-testid': 'chat-blocked-open' }, onClick: () => void openBlocked() });

  const modal: ModalHandle = Modal({
    title: 'Chat',
    testid: 'chat',
    variant: 'sheet',
    onClose: () => {
      closed = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    },
    children: [
      el('p', { class: 'muted chat__rules', text: 'Soyez respectueux : ni insultes ni liens. Les messages de plus de 30 jours sont effacés.' }),
      place,
      list,
      status,
      el('form', { class: 'chat__form', 'data-testid': 'chat-form' }, input, count, sendBtn),
      blockedBtn,
    ],
  });
  const form = modal.el.querySelector<HTMLFormElement>('.chat__form')!;
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
  }

  async function refresh(first = false): Promise<void> {
    if (closed || busy) return;
    busy = true;
    try {
      const fresh = await fetchMessages(first ? null : lastId);
      if (closed) return;
      if (first) messages = fresh;
      else if (fresh.length) messages = [...messages, ...fresh.filter((m) => !messages.some((x) => x.id === m.id))].slice(-200);
      if (fresh.length) lastId = Math.max(lastId ?? 0, ...fresh.map((m) => m.id));
      if (first || fresh.length) draw();
      if (first) list.scrollTop = list.scrollHeight;
      if (status.dataset.error) {
        delete status.dataset.error;
        say('');
      }
    } catch (e) {
      status.dataset.error = '1';
      say(chatError(e));
    } finally {
      busy = false;
    }
  }

  function schedule(): void {
    if (closed) return;
    timer = setTimeout(async () => {
      if (!document.hidden) await refresh();
      schedule();
    }, CHAT_POLL_MS);
  }
  const onVisible = (): void => {
    if (!document.hidden) void refresh();
  };
  document.addEventListener('visibilitychange', onVisible);

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
      delete status.dataset.error;
      await refresh();
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
              messages = messages.filter((x) => x.sender !== m.sender);
              draw();
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
    const sub: ModalHandle = Modal({ title: 'Joueurs bloqués', testid: 'chat-blocked', children: [box] });
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
                      await refresh(true);
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
    void sub;
  }

  // the rank of the person, always in view
  void fetchMyPlace().then(
    (p) => {
      if (!closed) place.textContent = p ? `Votre classement : ${ordinal(p.rank)} sur ${p.total} · ligue ${p.league.label}` : 'Pas encore classé : jouez une course classée.';
    },
    () => undefined,
  );
  draw();
  void refresh(true).then(() => {
    schedule();
    input.focus();
  });
  return modal;
}
