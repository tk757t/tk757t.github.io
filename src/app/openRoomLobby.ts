import { getAccount } from './account';
import { LOBBY_TOUCH_MS } from '../net/lobbies';
import { serverError } from '../net/chat';
import { myAccountId } from '../net/matchmaking';
import { MAX_CARS, Session } from '../net/session';
import { transportFor } from '../net/transport';
import { trackName } from '../data/tracks';
import { Badge, Button, Modal, type ModalHandle } from '../ui/kit';
import { el } from '../ui/dom';

export interface OpenRoomOptions {
  trackId: string;
  laps: number;
  /** Seats of the room, AIs included. */
  maxSeats?: number;
}

/** Where the room comes from: a public game of « Course perso » (the server gives the code and who is host). */
export interface RoomSource {
  title: string;
  testid: string;
  join(): Promise<{ room: string; host: boolean }>;
  /** The host's race starts, or the host leaves: nobody else may come in. */
  close(room: string): Promise<void>;
  /** The host says it is still there and how many players it has: the list shows the game for as long as it does. */
  touch(room: string, seats: number): Promise<void>;
}

/**
 * The room of a public game: the room is the one of the friends' games; the host adds or removes AIs for the free seats and starts the race when
 * they want (alone, with at least one AI). A guest waits for the start. Nothing is won or lost.
 */
export function openOpenRoom(options: OpenRoomOptions, onSession: (s: Session) => void, source: RoomSource): ModalHandle {
  let alive = true;
  let session: Session | null = null;
  let offLobby: (() => void) | null = null;
  let roomCode: string | null = null;
  let amHost = false;
  let touchTimer: ReturnType<typeof setInterval> | null = null;
  const maxSeats = Math.min(MAX_CARS, options.maxSeats ?? MAX_CARS);
  const body = el('div', { class: 'ranked-queue' });
  const modal = Modal({
    title: source.title,
    testid: source.testid,
    children: [body],
    onClose: () => {
      alive = false;
      offLobby?.();
      if (touchTimer) clearInterval(touchTimer);
      // a public game of a host that leaves disappears from the list
      if (amHost && roomCode && !launching) void source.close(roomCode).catch(() => undefined);
      if (session && session.status !== 'racing') session.leave();
    },
  });

  function drawError(text: string): void {
    body.replaceChildren(
      el('p', { class: 'online__error', role: 'alert', 'data-testid': 'open-room-error', text }),
      Button({ text: 'Réessayer', variant: 'yellow', block: true, attrs: { 'data-testid': 'open-room-retry' }, onClick: () => void join() }),
      Button({ text: 'Fermer', variant: 'ghost', block: true, onClick: () => modal.close() }),
    );
  }

  /** The AIs the host asked for, within the free seats. */
  const freeSeats = (s: Session): number => Math.max(0, maxSeats - s.players.length);
  const aisOf = (s: Session): number => Math.min(s.settings.ais, freeSeats(s));

  function drawRoom(s: Session, host: boolean): void {
    const humans = s.players.length;
    const ais = aisOf(s);
    const setAis = (n: number): void => s.setSettings({ ...s.settings, ais: Math.max(0, Math.min(n, freeSeats(s))) });
    const aiRow = host
      ? el(
          'div',
          { class: 'open-room__ais', 'data-testid': 'open-room-ais' },
          Button({ text: '−', variant: 'blue', disabled: ais <= 0, attrs: { 'data-testid': 'open-room-ai-minus', 'aria-label': 'Enlever une IA' }, onClick: () => setAis(ais - 1) }),
          el('output', { class: 'open-room__count', 'aria-live': 'polite', 'data-testid': 'open-room-ai-count', text: ais ? `${ais} IA` : 'Aucune IA' }),
          Button({ text: '+', variant: 'blue', disabled: ais >= freeSeats(s), attrs: { 'data-testid': 'open-room-ai-plus', 'aria-label': 'Ajouter une IA' }, onClick: () => setAis(ais + 1) }),
        )
      : el('p', { class: 'muted', 'data-testid': 'open-room-ai-count', text: ais ? `${ais} IA` : 'Sans IA' });
    body.replaceChildren(
      el('p', { class: 'ranked-queue__status', role: 'status', 'data-testid': 'open-room-status', text: humans >= maxSeats ? 'Salle complète !' : `Salle ouverte : ${humans}/${maxSeats} joueurs` }),
      el(
        'ul',
        { class: 'online__players', 'data-testid': 'open-room-players' },
        ...s.players.map((p, i) => el('li', {}, el('span', { text: p.name }), ...(i === 0 ? [Badge({ text: 'hôte', tone: 'gold' })] : []), ...(p.id === s.id ? [Badge({ text: 'vous', tone: 'blue' })] : []))),
        ...Array.from({ length: ais }, (_, i) => el('li', {}, el('span', { text: `IA ${i + 1}` }), Badge({ text: 'IA', tone: 'gold' }))),
      ),
      aiRow,
      el('p', { class: 'muted', 'data-testid': 'open-room-track', text: `${trackName(s.settings.trackId)} · ${s.settings.laps} tour${s.settings.laps > 1 ? 's' : ''}` }),
      el('p', { class: 'muted', text: host ? 'La course part quand vous la lancez : attendez des joueurs ou ajoutez des IA.' : 'En attente du départ…' }),
      ...(host ? [Button({ text: 'Démarrer maintenant', variant: 'yellow', size: 'lg', block: true, attrs: { 'data-testid': 'open-room-start' }, onClick: () => launch(s) })] : []),
      Button({ text: 'Quitter', variant: 'ghost', block: true, attrs: { 'data-testid': 'open-room-leave' }, onClick: () => modal.close() }),
    );
  }

  let launching = false;
  function launch(s: Session): void {
    if (s.status === 'racing' || !alive || launching) return;
    launching = true; // setSettings below redraws the lobby, which must not start the race a second time
    if (roomCode) void source.close(roomCode).catch(() => undefined);
    // the AIs the host chose; alone, at least one, so that there is a race
    s.setSettings({ ...s.settings, ais: Math.max(aisOf(s), 2 - s.players.length) });
    s.launch((Date.now() % 900_000) + 1);
  }

  async function join(): Promise<void> {
    body.replaceChildren(el('p', { class: 'ranked-queue__status', role: 'status', 'data-testid': 'open-room-status', text: 'Ouverture de la salle…' }));
    let found;
    let id: string | null;
    try {
      found = await source.join();
      id = await myAccountId();
    } catch (e) {
      return drawError(serverError(e, 'Les salles ne répondent pas. Réessayez.'));
    }
    if (!alive || !id) return;
    roomCode = found.room;
    amHost = found.host;
    const s = new Session({
      transport: transportFor(found.room),
      code: found.room,
      id,
      name: getAccount()?.pseudo ?? 'Pilote',
      host: found.host,
      settings: { trackId: options.trackId, laps: options.laps, ais: 0 },
    });
    session = s;
    offLobby = s.onLobby(() => {
      if (!alive || s.status === 'racing') return;
      if (s.status === 'closed') return drawError(s.closedReason ?? 'La salle s’est fermée.');
      drawRoom(s, found.host);
    });
    drawRoom(s, found.host);
    try {
      await s.connect();
    } catch (e) {
      return drawError(`Connexion impossible : ${(e as Error).message}.`);
    }
    onSession(s); // the app follows the room into the race
    // a public game stays open until its host starts it; the list shows it for as long as its host signals
    if (found.host) touchTimer = setInterval(() => void source.touch(found.room, s.players.length).catch(() => undefined), LOBBY_TOUCH_MS);
  }

  void join();
  return modal;
}
