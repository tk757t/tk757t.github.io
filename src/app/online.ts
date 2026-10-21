import { getAccount } from './account';
import { devParam, secureToken } from './devParams';
import { TRACK_LIST } from '../data/tracks';
import { Session, isRoomCode, newRoomCode, MAX_CARS, MAX_HUMANS, type RoomSettings } from '../net/session';
import { transportFor } from '../net/transport';
import { Badge, Button, Modal, type ModalHandle } from '../ui/kit';
import { el } from '../ui/dom';

const NAME_KEY = '4mules.name';
const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;

/**
 * The name the others see: the pseudo of the account. Without an account (offline, development: ?name=) a guest name made
 * once and kept in this browser. Nobody types a pseudo here.
 */
function playerName(): string {
  const pseudo = getAccount()?.pseudo ?? devParam('name');
  if (pseudo) return pseudo.slice(0, 16);
  try {
    const kept = localStorage.getItem(NAME_KEY);
    if (kept) return kept;
    const made = `Invité${secureToken(3, '0123456789')}`;
    localStorage.setItem(NAME_KEY, made);
    return made;
  } catch {
    return `Invité${secureToken(3, '0123456789')}`;
  }
}

/** One id per room and tab, kept across reloads of the tab so a player gets their seat back. */
function clientId(code: string): string {
  const key = `4mules.net.${code}`;
  try {
    const known = sessionStorage.getItem(key);
    if (known) return known;
    const id = secureToken(10);
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return secureToken(10);
  }
}

/** The link a friend opens to join the room. */
export const inviteLink = (code: string): string => {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('join', code);
  const net = devParam('net');
  if (net) url.searchParams.set('net', net);
  return url.toString();
};

/**
 * "Jouer en ligne": create a room (and get a code and a link to send) or join one with its code; the host picks the
 * circuit, the laps and the AIs, then starts. `onSession` is called with the connected session: the app follows it
 * into the races.
 */
export function openOnlineLobby(onSession: (s: Session) => void, joinCode?: string): ModalHandle {
  let session: Session | null = null;
  let offLobby: (() => void) | null = null;
  const body = el('div', { class: 'online' });
  const modal = Modal({
    title: 'Jouer en ligne',
    testid: 'online-lobby',
    children: [body],
    onClose: () => {
      offLobby?.();
      // closing the window before the race leaves the room
      if (session && session.status !== 'racing') session.leave();
    },
  });

  const name = playerName();
  const error = el('p', { class: 'online__error', role: 'alert', 'data-testid': 'online-error' });

  async function enter(code: string, host: boolean, name: string): Promise<void> {
    const s = new Session({
      transport: transportFor(code),
      code,
      id: clientId(code),
      name,
      host,
      settings: { trackId: 'anneau', laps: 1, ais: 0 },
    });
    session = s;
    offLobby = s.onLobby(() => drawRoom(s));
    drawRoom(s);
    try {
      await s.connect();
    } catch (e) {
      error.textContent = `Connexion impossible : ${(e as Error).message}.`;
      body.replaceChildren(error, Button({ text: 'Réessayer', variant: 'blue', block: true, onClick: () => drawChoice() }));
      return;
    }
    // a guest who reloads the page comes back into the room (the host keeps the race: reloading ends it)
    if (!host) setJoinParam(code);
    onSession(s);
  }

  function drawChoice(): void {
    const codeInput = el('input', {
      type: 'text',
      maxlength: 5,
      value: joinCode ?? '',
      'aria-label': 'Code de la partie',
      'data-testid': 'online-code',
      placeholder: 'CODE',
      autocapitalize: 'characters',
      class: 'online__code-input',
    });
    body.replaceChildren(
      el('p', { class: 'muted', text: 'Créez une partie et envoyez le lien à vos amis, ou rejoignez-en une avec son code. Chacun joue sur son appareil.' }),
      el('p', { class: 'online__you', 'data-testid': 'online-name' }, 'Vous jouez sous le pseudo ', el('b', { text: name }), '.'),
      Button({
        text: 'Créer une partie',
        variant: 'yellow',
        size: 'lg',
        block: true,
        attrs: { 'data-testid': 'online-create' },
        onClick: () => void enter(newRoomCode(), true, name),
      }),
      el('div', { class: 'online__join' }, codeInput, Button({
        text: 'Rejoindre',
        variant: 'blue',
        attrs: { 'data-testid': 'online-join' },
        onClick: () => {
          const code = codeInput.value.trim().toUpperCase();
          if (!isRoomCode(code)) {
            error.textContent = 'Le code a 5 lettres (sans I ni O).';
            return;
          }
          void enter(code, false, name);
        },
      })),
      error,
    );
  }

  function settingsView(s: Session): HTMLElement {
    const set = (patch: Partial<RoomSettings>) => s.setSettings({ ...s.settings, ...patch });
    const select = (label: string, options: [string, string][], value: string, onChange: (v: string) => void, testid: string) => {
      const sel = el('select', { 'aria-label': label, 'data-testid': testid });
      for (const [v, text] of options) sel.append(el('option', { value: v, text }));
      sel.value = value;
      sel.addEventListener('change', () => onChange(sel.value));
      return el('label', { class: 'online__field' }, el('span', { text: label }), sel);
    };
    const room = Math.max(0, MAX_CARS - s.players.length);
    return el(
      'div',
      { class: 'online__settings' },
      select('Circuit', TRACK_LIST.map((t) => [t.id, t.name]), s.settings.trackId, (v) => set({ trackId: v }), 'online-track'),
      el(
        'div',
        { class: 'online__row' },
        select('Tours', [1, 2, 3].map((n) => [String(n), plural(n, 'tour')]), String(s.settings.laps), (v) => set({ laps: Number(v) }), 'online-laps'),
        select('IA', Array.from({ length: room + 1 }, (_, n) => [String(n), n ? plural(n, 'IA') : 'Aucune']), String(Math.min(s.settings.ais, room)), (v) => set({ ais: Number(v) }), 'online-ais'),
      ),
    );
  }

  function drawRoom(s: Session): void {
    if (s.status === 'closed') {
      body.replaceChildren(
        el('p', { class: 'online__error', 'data-testid': 'online-closed', text: s.closedReason ?? 'Vous avez quitté la partie.' }),
        Button({ text: 'Retour', variant: 'blue', block: true, onClick: () => drawChoice() }),
      );
      return;
    }
    if (s.status === 'connecting') {
      body.replaceChildren(el('p', { class: 'muted', 'data-testid': 'online-connecting', text: `Connexion à la partie ${s.code}…` }));
      return;
    }
    if (s.status === 'racing') return;
    const link = inviteLink(s.code);
    const copy = Button({
      text: 'Copier le lien',
      variant: 'blue',
      attrs: { 'data-testid': 'online-copy' },
      onClick: () => {
        void navigator.clipboard?.writeText(link).then(
          () => (copied.textContent = 'Lien copié : envoyez-le à vos amis.'),
          () => (copied.textContent = link),
        );
      },
    });
    const share = typeof navigator.share === 'function' ? [Button({ text: 'Partager', variant: 'blue', onClick: () => void navigator.share({ title: '4 Mules', text: `Rejoins ma course : code ${s.code}`, url: link }).catch(() => undefined) })] : [];
    const copied = el('p', { class: 'muted online__link', 'data-testid': 'online-link', text: link });
    const list = el('ul', { class: 'online__players', 'data-testid': 'online-players' });
    s.players.forEach((p, i) =>
      list.append(el('li', {}, el('span', { text: p.name }), ...(i === 0 ? [Badge({ text: 'hôte', tone: 'gold' })] : []), ...(p.id === s.id ? [Badge({ text: 'vous', tone: 'blue' })] : []))),
    );
    const cars = s.players.length + Math.min(s.settings.ais, MAX_CARS - s.players.length);
    const track = TRACK_LIST.find((t) => t.id === s.settings.trackId)?.name ?? s.settings.trackId;
    body.replaceChildren(
      el('p', { class: 'muted', text: 'Code de la partie' }),
      el('p', { class: 'online__code', 'data-testid': 'room-code', text: s.code }),
      el('div', { class: 'online__row' }, copy, ...share),
      copied,
      el('h3', { class: 'online__title', text: `Joueurs (${s.players.length}/${MAX_HUMANS})` }),
      list,
      s.host ? settingsView(s) : el('p', { class: 'muted', 'data-testid': 'online-summary', text: `${track} · ${plural(s.settings.laps, 'tour')} · ${s.settings.ais ? plural(s.settings.ais, 'IA') : 'sans IA'}. En attente de l’hôte…` }),
      ...(s.host
        ? [Button({
            text: cars < 2 ? 'En attente d’un adversaire…' : 'Démarrer la course',
            variant: 'yellow',
            size: 'lg',
            block: true,
            disabled: cars < 2,
            attrs: { 'data-testid': 'online-start' },
            onClick: () => s.launch((Date.now() % 900_000) + 1),
          })]
        : []),
      Button({
        text: 'Quitter la partie',
        variant: 'ghost',
        block: true,
        attrs: { 'data-testid': 'online-leave' },
        onClick: () => {
          s.leave();
          setJoinParam(null);
          session = null;
          offLobby?.();
          drawChoice();
        },
      }),
    );
  }

  drawChoice();
  // a player coming back (reload) or a friend with an invitation link: straight into the room under their own pseudo
  if (joinCode && isRoomCode(joinCode)) void enter(joinCode, false, name);
  return modal;
}

/** Puts ?join=CODE in the address (null removes it). */
export function setJoinParam(code: string | null): void {
  const url = new URL(location.href);
  if (code) url.searchParams.set('join', code);
  else url.searchParams.delete('join');
  history.replaceState(null, '', url);
}
