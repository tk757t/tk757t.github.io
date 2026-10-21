import { MAX_CHAT_CHARS, chatProblem } from '../net/chat';
import { ROOM_CHAT_GAP_MS, type RoomChatMessage, type Session } from '../net/session';
import { Button } from '../ui/kit';
import { el } from '../ui/dom';
import { raceChatWatch } from './chatRace';

const time = (ms: number): string => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export interface RaceChatView {
  el: HTMLElement;
  setVisible(on: boolean): void;
  focusInput(): void;
  destroy(): void;
}

/**
 * The chat of the race: what the players of the race write to each other, seen by nobody else. It goes through the room of the race
 * (no server keeps it), so each player decides alone what they see: a message with a link is refused on the way out, and a player can be
 * hidden for the rest of the race.
 */
export function createRaceChatView(session: Session): RaceChatView {
  let alive = true;
  let visible = false;
  const hidden = new Set<string>();
  const list = el('ul', { class: 'chat__list', role: 'log', 'aria-live': 'polite', 'aria-label': 'Messages de la course', 'data-testid': 'race-chat-list' });
  const status = el('p', { class: 'chat__status', role: 'status', 'data-testid': 'race-chat-status' });
  const input = el('input', { type: 'text', maxlength: MAX_CHAT_CHARS, autocomplete: 'off', 'aria-label': 'Votre message aux joueurs de la course', placeholder: 'Un mot aux autres pilotes', 'data-testid': 'race-chat-input' });
  const sendBtn = Button({ text: 'Envoyer', variant: 'green', attrs: { 'data-testid': 'race-chat-send' }, onClick: () => send() });
  const form = el('form', { class: 'chat__form', 'data-testid': 'race-chat-form' }, input, sendBtn);
  const root = el(
    'div',
    { class: 'chat chat--race' },
    el('p', { class: 'muted chat__rules', text: 'Ce chat n’est vu que par les joueurs de cette course. Ni insultes ni liens.' }),
    list,
    status,
    form,
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    send();
  });

  function draw(): void {
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
    const shown = session.chat.filter((m) => m.mine || !hidden.has(m.from));
    list.replaceChildren(
      ...(shown.length === 0
        ? [el('li', { class: 'chat__empty muted', 'data-testid': 'race-chat-empty', text: 'Personne n’a encore écrit. Lancez la conversation !' })]
        : shown.map((m: RoomChatMessage) =>
            el(
              'li',
              { class: `chat__msg${m.mine ? ' chat__msg--mine' : ''}`, 'data-from': m.from },
              el('div', { class: 'chat__meta' }, el('b', { class: 'chat__who', text: m.name }), el('small', { text: time(m.at) })),
              el('p', { class: 'chat__body', text: m.body }),
              m.mine ? null : Button({ text: 'Masquer', variant: 'ghost', silent: true, attrs: { 'aria-label': `Masquer ${m.name} pour cette course`, 'data-testid': 'race-chat-hide' }, onClick: () => {
                hidden.add(m.from);
                draw();
              } }),
            ),
          )),
    );
    if (nearBottom) list.scrollTop = list.scrollHeight;
  }

  let coolDown = false;
  function send(): void {
    const text = input.value;
    const problem = chatProblem(text);
    if (problem) return void (status.textContent = problem);
    if (coolDown) return void (status.textContent = 'Doucement : un message à la fois.');
    if (!session.sendChat(text)) return void (status.textContent = 'Le message n’a pas pu partir : la salle est fermée.');
    status.textContent = '';
    input.value = '';
    coolDown = true;
    setTimeout(() => {
      coolDown = false;
    }, ROOM_CHAT_GAP_MS + 100);
    input.focus();
  }

  const off = session.onChat(() => {
    if (alive) draw();
  });
  draw();

  return {
    el: root,
    setVisible(on) {
      if (on === visible || !alive) return;
      visible = on;
      raceChatWatch(on);
      if (on) {
        draw();
        list.scrollTop = list.scrollHeight;
      }
    },
    focusInput: () => input.focus(),
    destroy() {
      if (!alive) return;
      alive = false;
      if (visible) raceChatWatch(false);
      visible = false;
      off();
    },
  };
}
