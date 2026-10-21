import { getAccount } from './account';
import { currentRanked, gridOrder, rankedTrack } from '../data/ranked';
import { TRACK_LIST, trackName } from '../data/tracks';
import { QUEUE_POLL_MS, joinQueue, leaveQueue, myAccountId, pollQueue, type QueuePlayer } from '../net/matchmaking';
import { serverError } from '../net/chat';
import { Session } from '../net/session';
import { transportFor } from '../net/transport';
import { Badge, Button, Modal, type ModalHandle } from '../ui/kit';
import { el } from '../ui/dom';
import { getProfile } from './profile';
import { serverNow } from './serverGame';

/** How long the host waits for the others to reach the room, and a guest for the start, before the group is given up. */
const ROOM_WAIT_MS = 15_000;

const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** The ranked queue, or the unranked one (same waiting and same groups, but trophies count for nothing and are not moved; the circuit is the one of the player's settings). */
export type QueueMode = { ranked: true } | { ranked: false; trackId: string; laps: number };

/**
 * "Course classée" and "Course non classée": the matchmaking window. The player waits in the queue of the server, which forms the group and gives the
 * room; the room is then the one of the friends' games, and the race starts at once. `onSession` follows the room into the race.
 */
export function openRankedQueue(onSession: (s: Session) => void, mode: QueueMode = { ranked: true }): ModalHandle {
  let alive = true;
  let session: Session | null = null;
  let poll: ReturnType<typeof setInterval> | null = null;
  let tick: ReturnType<typeof setInterval> | null = null;
  let waitTimer: ReturnType<typeof setTimeout> | null = null;
  let offLobby: (() => void) | null = null;
  let queued = false;
  const body = el('div', { class: 'ranked-queue' });
  const stop = (): void => {
    if (poll) clearInterval(poll);
    if (tick) clearInterval(tick);
    if (waitTimer) clearTimeout(waitTimer);
    poll = tick = waitTimer = null;
  };
  const modal = Modal({
    title: mode.ranked ? 'Course classée' : 'Course non classée',
    testid: mode.ranked ? 'ranked-queue' : 'unranked-queue',
    children: [body],
    onClose: () => {
      alive = false;
      stop();
      offLobby?.();
      if (queued) void leaveQueue().catch(() => undefined);
      if (session && session.status !== 'racing') session.leave();
    },
  });

  const me = currentRanked(getProfile().ranked, serverNow());
  const status = el('p', { class: 'ranked-queue__status', role: 'status', 'data-testid': 'ranked-status' });
  const detail = el('p', { class: 'muted', 'data-testid': 'ranked-detail' });
  let startedAt = Date.now();

  function drawSearch(): void {
    body.replaceChildren(
      ...(mode.ranked ? [el('p', { class: 'ranked-queue__you', 'data-testid': 'ranked-me' }, 'Vous : ', el('b', { text: `${me.trophies} trophées` }), ' · ', Badge({ text: me.league.label, tone: 'blue' }))] : []),
      status,
      detail,
      Button({ text: 'Annuler', variant: 'ghost', block: true, attrs: { 'data-testid': 'ranked-cancel' }, onClick: () => modal.close() }),
    );
  }

  function drawError(text: string): void {
    stop();
    queued = false;
    body.replaceChildren(
      el('p', { class: 'online__error', role: 'alert', 'data-testid': 'ranked-error', text }),
      Button({ text: 'Réessayer', variant: 'yellow', block: true, attrs: { 'data-testid': 'ranked-retry' }, onClick: () => void search() }),
      Button({ text: 'Fermer', variant: 'ghost', block: true, onClick: () => modal.close() }),
    );
  }

  async function search(): Promise<void> {
    stop();
    drawSearch();
    status.textContent = 'Connexion…';
    startedAt = Date.now();
    try {
      await joinQueue(mode.ranked ? me.trophies : 0, mode.ranked);
    } catch (e) {
      return drawError(serverError(e, 'La file d’attente ne répond pas. Réessayez.'));
    }
    queued = true;
    tick = setInterval(() => {
      if (status.dataset.state === 'waiting') detail.textContent = `Attente : ${clock((Date.now() - startedAt) / 1000)}`;
    }, 1000);
    const run = async (): Promise<void> => {
      try {
        const q = await pollQueue();
        if (!alive || !queued) return;
        if (q.status === 'none') return drawError('Vous avez été retiré de la file (inactivité). Réessayez.');
        if (q.status === 'waiting') {
          status.dataset.state = 'waiting';
          status.textContent = q.found > 1 ? `${q.found} joueurs trouvés…` : 'Recherche d’adversaires…';
          detail.textContent = mode.ranked ? `Attente : ${clock(q.waitedS)} · écart de trophées accepté : ±${q.gap}` : `Attente : ${clock(q.waitedS)}`;
          return;
        }
        stop();
        queued = false;
        await enterRoom(q.room, q.host, q.ais, q.players);
      } catch (e) {
        if (alive) drawError(serverError(e, 'La file d’attente ne répond pas. Réessayez.'));
      }
    };
    poll = setInterval(() => void run(), QUEUE_POLL_MS);
    void run();
  }

  async function enterRoom(code: string, host: boolean, ais: number, group: QueuePlayer[]): Promise<void> {
    const id = await myAccountId();
    const name = getAccount()?.pseudo ?? 'Pilote';
    if (!id || !alive) return;
    const trophiesOf = new Map(group.map((p) => [p.id, p.trophies]));
    const s = new Session({
      transport: transportFor(code),
      code,
      id,
      name,
      host,
      settings: mode.ranked ? { trackId: rankedTrack(TRACK_LIST.map((t) => t.id), serverNow()), laps: 1, ais } : { trackId: mode.trackId, laps: mode.laps, ais },
      // ranked: the fewest trophies in pole, to even things out; unranked: the order of arrival
      ...(mode.ranked ? { order: (players: { id: string; name: string }[]) => gridOrder(players.map((p) => ({ ...p, trophies: trophiesOf.get(p.id) ?? 0 }))).map(({ id: pid, name: pname }) => ({ id: pid, name: pname })) } : {}),
    });
    s.ranked = mode.ranked;
    session = s;
    status.dataset.state = 'room';
    body.replaceChildren(
      el('p', { class: 'ranked-queue__found', 'data-testid': 'ranked-found', text: 'Adversaires trouvés !' }),
      el(
        'ul',
        { class: 'online__players', 'data-testid': 'ranked-players' },
        ...group.map((p) => el('li', {}, el('span', { text: p.pseudo }), ...(mode.ranked ? [Badge({ text: p.league.label, tone: 'blue' }), el('small', { class: 'muted', text: `🏆 ${p.trophies}` })] : []))),
        ...Array.from({ length: ais }, (_, i) => el('li', {}, el('span', { text: `IA ${i + 1}` }), Badge({ text: 'IA', tone: 'gold' }))),
      ),
      el('p', { class: 'muted', 'data-testid': 'ranked-track', text: mode.ranked ? `${trackName(s.settings.trackId)} · 1 tour · météo aléatoire` : `${trackName(s.settings.trackId)} · ${s.settings.laps} tour${s.settings.laps > 1 ? 's' : ''}` }),
      el('p', { class: 'muted', text: 'Départ dans un instant…' }),
    );
    offLobby = s.onLobby(() => {
      if (host && alive && s.status === 'lobby' && s.players.length >= group.length) launch(s);
    });
    try {
      await s.connect();
    } catch (e) {
      return drawError(`Connexion impossible : ${(e as Error).message}.`);
    }
    void leaveQueue().catch(() => undefined); // the room is known: the queue is done with this player
    onSession(s); // the app follows the room into the race
    if (host && s.players.length >= group.length) launch(s);
    waitTimer = setTimeout(() => {
      if (!alive || s.status === 'racing') return;
      if (host && s.players.length + ais >= 2) return launch(s); // the missing ones did not come: race with the others
      s.leave();
      session = null;
      drawError('Le groupe n’a pas pu se réunir. Relancez la recherche.');
    }, ROOM_WAIT_MS);
  }

  function launch(s: Session): void {
    if (s.status === 'racing') return;
    s.launch((Date.now() % 900_000) + 1);
  }

  void search();
  return modal;
}
