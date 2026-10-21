import { TRACK_LIST, trackName } from '../data/tracks';
import { LOBBIES_POLL_MS, createLobby, closeLobby, joinLobby, listLobbies, touchLobby, type Lobby } from '../net/lobbies';
import { serverError } from '../net/chat';
import { Button, Modal, type ModalHandle } from '../ui/kit';
import { el } from '../ui/dom';
import { getAccount } from './account';
import type { OpenRoomOptions, RoomSource } from './openRoomLobby';

export interface LobbiesOptions {
  /** Circuit and laps the « Créer une partie » form starts with. */
  trackId: string;
  laps: number;
  /** Opens the room of a game (the one this player created, or the one they joined). */
  enter(options: OpenRoomOptions, source: RoomSource): void;
  /** The offline race of the setup window (hot-seat and AIs). */
  offline(): void;
}

const seatsText = (l: Lobby): string => `${l.seats}/${l.maxSeats}`;

/** The room source of a game of the list: the guest takes the seat the server gave, the host owns the code the server created. */
function sourceOf(join: () => Promise<{ room: string; host: boolean }>): RoomSource {
  return { title: 'Course perso', testid: 'lobby-room', join, close: closeLobby, touch: touchLobby, auto: false };
}

/**
 * « Course perso »: the public games already created, to join, and a button to create one. A player without an account (or without a
 * pseudo) can only play offline: the list lives on the server. The list is read again every few seconds while the window is open.
 */
export function openLobbies(o: LobbiesOptions): ModalHandle {
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const online = !!getAccount()?.pseudo;
  const list = el('ul', { class: 'lobbies__list', 'aria-label': 'Parties en attente', 'aria-live': 'polite', 'data-testid': 'lobby-list' });
  const status = el('p', { class: 'muted lobbies__status', role: 'status', 'data-testid': 'lobby-status' });

  const modal: ModalHandle = Modal({
    title: 'Course perso',
    testid: 'lobbies',
    variant: 'sheet',
    onClose: () => {
      closed = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    },
    children: online
      ? [
          el('p', { class: 'muted', text: 'Rejoignez une partie ou créez la vôtre : vous choisissez le circuit, les tours et les places. Rien n’est gagné ni perdu.' }),
          Button({ text: 'Créer une partie', variant: 'yellow', size: 'lg', block: true, attrs: { 'data-testid': 'lobby-create' }, onClick: () => openCreate() }),
          el('h3', { class: 'lobbies__h', text: 'Parties en attente' }),
          list,
          status,
          Button({ text: 'Jouer hors ligne', variant: 'ghost', block: true, attrs: { 'data-testid': 'offline-race' }, onClick: () => leaveFor(o.offline) }),
        ]
      : [
          el('p', { class: 'muted', 'data-testid': 'lobby-need-account', text: 'Pour rejoindre ou créer une partie en ligne, il faut un compte avec un pseudo. Hors ligne, réglez votre course avec des amis sur le même écran ou contre des IA.' }),
          Button({ text: 'Jouer hors ligne', variant: 'yellow', size: 'lg', block: true, attrs: { 'data-testid': 'offline-race' }, onClick: () => leaveFor(o.offline) }),
        ],
  });

  const say = (text: string, from: 'list' | 'join'): void => {
    status.textContent = text;
    status.dataset.from = from;
  };

  /** Closes the window, then does what the player asked. */
  function leaveFor(then: () => void): void {
    modal.close();
    then();
  }

  function draw(lobbies: Lobby[]): void {
    list.replaceChildren(
      ...(lobbies.length === 0
        ? [el('li', { class: 'lobbies__empty muted', 'data-testid': 'lobby-empty', text: 'Aucune partie pour le moment. Créez la vôtre !' })]
        : lobbies.map((l) =>
            el(
              'li',
              { class: 'lobbies__row', 'data-lobby': l.code },
              el('div', { class: 'lobbies__info' }, el('b', { text: l.host }), el('small', { text: `${trackName(l.trackId)} · ${l.laps} tour${l.laps > 1 ? 's' : ''} · ${seatsText(l)} joueurs` })),
              Button({ text: 'Rejoindre', variant: 'green', attrs: { 'data-testid': 'lobby-join', 'aria-label': `Rejoindre la partie de ${l.host}` }, onClick: () => void join(l) }),
            ),
          )),
    );
  }

  async function refresh(): Promise<void> {
    if (closed) return;
    try {
      const lobbies = await listLobbies();
      if (closed) return;
      draw(lobbies);
      if (status.dataset.from === 'list') say('', 'list'); // a refusal of a join stays until the next try
    } catch (e) {
      if (closed) return;
      say(serverError(e, 'Les parties ne répondent pas. Réessayez.'), 'list');
    }
  }

  function schedule(): void {
    if (closed) return;
    timer = setTimeout(async () => {
      if (!document.hidden) await refresh();
      schedule();
    }, LOBBIES_POLL_MS);
  }
  const onVisible = (): void => {
    if (!document.hidden) void refresh();
  };

  let joining = false;
  async function join(l: Lobby): Promise<void> {
    if (joining) return;
    joining = true;
    say('', 'join');
    try {
      const got = await joinLobby(l.code);
      leaveFor(() => o.enter({ trackId: got.trackId, laps: got.laps, maxSeats: got.maxSeats }, sourceOf(async () => ({ room: got.code, host: false }))));
    } catch (e) {
      say(serverError(e, 'Impossible de rejoindre cette partie.'), 'join');
      void refresh(); // the game may be full or gone: the list says so
    } finally {
      joining = false;
    }
  }

  /** The form of a new game: circuit, laps, seats. */
  function openCreate(): void {
    let trackId = o.trackId;
    let laps = Math.min(3, Math.max(1, o.laps));
    let seats = 4;
    const error = el('p', { class: 'online__error', role: 'alert', 'data-testid': 'lobby-create-error' });
    error.hidden = true;
    const track = el('select', { id: 'lobby-track', 'aria-label': 'Circuit', onchange: () => (trackId = track.value) });
    for (const t of TRACK_LIST) track.append(el('option', { value: t.id, text: `${t.name} · ${t.cells} cases` }));
    track.value = trackId;
    const segment = (label: string, values: number[], get: () => number, set: (n: number) => void): HTMLElement => {
      const group = el('div', { class: `seg${values.length === 3 ? ' seg--3' : ''}`, role: 'group', 'aria-label': label });
      const paint = (): void => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(values[i] === get())));
      const buttons = values.map((n) =>
        Button({
          text: String(n),
          variant: 'ghost',
          attrs: { 'aria-label': `${label} : ${n}` },
          onClick: () => {
            set(n);
            paint();
          },
        }),
      );
      group.append(...buttons);
      paint();
      return group;
    };
    let busy = false;
    const sub: ModalHandle = Modal({
      title: 'Créer une partie',
      testid: 'lobby-create-modal',
      children: [
        el('label', { class: 'field' }, el('span', { text: 'Circuit' }), track),
        el('fieldset', {}, el('legend', { text: 'Tours' }), segment('Tours', [1, 2, 3], () => laps, (n) => (laps = n))),
        el('fieldset', {}, el('legend', { text: 'Places (IA comprises)' }), segment('Places', [2, 3, 4], () => seats, (n) => (seats = n))),
        error,
        Button({
          text: 'Créer la partie',
          variant: 'yellow',
          size: 'lg',
          block: true,
          attrs: { 'data-testid': 'lobby-create-confirm' },
          onClick: async () => {
            if (busy) return;
            busy = true;
            error.hidden = true;
            try {
              const code = await createLobby(trackId, laps, seats);
              sub.close();
              leaveFor(() => o.enter({ trackId, laps, maxSeats: seats }, sourceOf(async () => ({ room: code, host: true }))));
            } catch (e) {
              error.textContent = serverError(e, 'La partie n’a pas pu être créée. Réessayez.');
              error.hidden = false;
            } finally {
              busy = false;
            }
          },
        }),
      ],
    });
  }

  if (online) {
    void refresh();
    schedule();
    document.addEventListener('visibilitychange', onVisible);
  }
  return modal;
}
