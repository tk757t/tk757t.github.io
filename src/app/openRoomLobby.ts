import { getAccount } from './account';
import { closeOpenRoom, joinOpenRoom } from '../net/openRooms';
import { serverError } from '../net/chat';
import { myAccountId } from '../net/matchmaking';
import { MAX_CARS, Session } from '../net/session';
import { transportFor } from '../net/transport';
import { trackName } from '../data/tracks';
import { Badge, Button, Modal, type ModalHandle } from '../ui/kit';
import { el } from '../ui/dom';

/** The host starts with whoever is there after this wait (the room is completed with AIs), a guest gives up after the longer one. */
const HOST_WAIT_MS = 20_000;
const GUEST_WAIT_MS = 45_000;

export interface OpenRoomOptions {
  trackId: string;
  laps: number;
}

/**
 * "Course non classée": the player joins the open room that still has a seat, or creates one. The room is the one of the friends'
 * games; the race starts when it is full, or after a short wait with AIs for the empty seats. Nothing is won or lost.
 */
export function openOpenRoom(options: OpenRoomOptions, onSession: (s: Session) => void): ModalHandle {
  let alive = true;
  let session: Session | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let offLobby: (() => void) | null = null;
  let roomCode: string | null = null;
  const body = el('div', { class: 'ranked-queue' });
  const modal = Modal({
    title: 'Course non classée',
    testid: 'open-room',
    children: [body],
    onClose: () => {
      alive = false;
      if (timer) clearTimeout(timer);
      offLobby?.();
      if (session && session.status !== 'racing') session.leave();
    },
  });

  function drawError(text: string): void {
    if (timer) clearTimeout(timer);
    timer = null;
    body.replaceChildren(
      el('p', { class: 'online__error', role: 'alert', 'data-testid': 'open-room-error', text }),
      Button({ text: 'Réessayer', variant: 'yellow', block: true, attrs: { 'data-testid': 'open-room-retry' }, onClick: () => void join() }),
      Button({ text: 'Fermer', variant: 'ghost', block: true, onClick: () => modal.close() }),
    );
  }

  function drawRoom(s: Session, host: boolean): void {
    const humans = s.players.length;
    body.replaceChildren(
      el('p', { class: 'ranked-queue__status', role: 'status', 'data-testid': 'open-room-status', text: humans >= MAX_CARS ? 'Salle complète !' : `Salle ouverte : ${humans}/${MAX_CARS} joueurs` }),
      el(
        'ul',
        { class: 'online__players', 'data-testid': 'open-room-players' },
        ...s.players.map((p, i) => el('li', {}, el('span', { text: p.name }), ...(i === 0 ? [Badge({ text: 'hôte', tone: 'gold' })] : []), ...(p.id === s.id ? [Badge({ text: 'vous', tone: 'blue' })] : []))),
      ),
      el('p', { class: 'muted', 'data-testid': 'open-room-track', text: `${trackName(options.trackId)} · ${options.laps} tour${options.laps > 1 ? 's' : ''}` }),
      el('p', { class: 'muted', text: host ? 'La course part quand la salle est pleine (ou dans un instant, avec des IA pour les places libres).' : 'En attente du départ…' }),
      Button({ text: 'Quitter', variant: 'ghost', block: true, attrs: { 'data-testid': 'open-room-leave' }, onClick: () => modal.close() }),
    );
  }

  function launch(s: Session): void {
    if (s.status === 'racing' || !alive) return;
    if (roomCode) void closeOpenRoom(roomCode).catch(() => undefined);
    // the empty seats are driven by AIs, so a race of one is possible
    s.setSettings({ ...s.settings, ais: Math.max(0, MAX_CARS - s.players.length) });
    s.launch((Date.now() % 900_000) + 1);
  }

  async function join(): Promise<void> {
    body.replaceChildren(el('p', { class: 'ranked-queue__status', role: 'status', 'data-testid': 'open-room-status', text: 'Recherche d’une salle…' }));
    let found;
    let id: string | null;
    try {
      found = await joinOpenRoom();
      id = await myAccountId();
    } catch (e) {
      return drawError(serverError(e, 'Les salles ne répondent pas. Réessayez.'));
    }
    if (!alive || !id) return;
    roomCode = found.room;
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
      if (found.host && s.players.length >= MAX_CARS) launch(s); // full: off we go
    });
    drawRoom(s, found.host);
    try {
      await s.connect();
    } catch (e) {
      return drawError(`Connexion impossible : ${(e as Error).message}.`);
    }
    onSession(s); // the app follows the room into the race
    timer = setTimeout(() => {
      if (!alive || s.status === 'racing') return;
      if (found.host) return launch(s);
      s.leave();
      session = null;
      drawError('La partie n’a pas démarré. Réessayez.');
    }, found.host ? HOST_WAIT_MS : GUEST_WAIT_MS);
  }

  void join();
  return modal;
}
