import {
  AUDIT_LABELS,
  ROLES,
  ROLE_LABELS,
  addWord,
  adminActions,
  adminAudit,
  adminPlayers,
  adminReports,
  adminStats,
  adminWords,
  dismissReports,
  hideMessage,
  mute,
  removeWord,
  setRole,
  staffError,
  suspend,
  unmute,
  unsuspend,
  type AdminPlayer,
  type AdminReport,
  type Role,
} from '../net/staff';
import { Badge, Button, Modal, type ModalHandle } from '../ui/kit';
import { el } from '../ui/dom';
import { ago, confirmAction, debounce, tabStrip, when } from './staffUi';
import { toast } from './toast';

const MUTE_CHOICES: { label: string; minutes: number }[] = [
  { label: '10 min', minutes: 10 },
  { label: '1 h', minutes: 60 },
  { label: '24 h', minutes: 1440 },
  { label: '7 jours', minutes: 10_080 },
];

const ROLE_TONE: Record<Role, 'red' | 'gold' | 'blue' | 'green'> = { admin: 'red', tester: 'green', vip: 'gold', player: 'blue' };

type Page = { el: HTMLElement; load(): Promise<void>; stop?(): void };

/** Runs a call of the staff tools: the error of the server is shown to the person, and true is returned when it worked. */
async function attempt(fn: () => Promise<unknown>, done: string): Promise<boolean> {
  try {
    await fn();
    toast(done);
    return true;
  } catch (e) {
    toast(staffError(e), 'bad');
    return false;
  }
}

function emptyLine(text: string): HTMLElement {
  return el('p', { class: 'muted staff__empty', text });
}

/** The badges that tell what is going on with a player. */
function playerBadges(p: AdminPlayer): HTMLElement[] {
  const out = [Badge({ text: ROLE_LABELS[p.role], tone: ROLE_TONE[p.role], attrs: { 'data-role': p.role } })];
  if (p.suspension) out.push(Badge({ text: 'Suspendu', tone: 'red', attrs: { 'data-flag': 'suspended' } }));
  if (p.mutedUntil) out.push(Badge({ text: `Muet jusqu’à ${when(p.mutedUntil)}`, tone: 'gold', attrs: { 'data-flag': 'muted' } }));
  if (p.reports > 0) out.push(Badge({ text: `${p.reports} signalement${p.reports > 1 ? 's' : ''}`, tone: 'gold', attrs: { 'data-flag': 'reports' } }));
  return out;
}

/** The page of one player: role, silence, suspension and their last actions. `onChange` tells the list to read again. */
function openPlayer(first: AdminPlayer, onChange: () => void): ModalHandle {
  let p = first;
  const body = el('div', { class: 'staffplayer' });
  const actionsBox = el('div', { class: 'staff__log', 'data-testid': 'staff-player-actions' });

  async function reload(): Promise<void> {
    const found = (await adminPlayers(p.pseudo, 5)).find((x) => x.id === p.id);
    if (found) p = found;
    draw();
    onChange();
  }

  function draw(): void {
    const reasonSuspend = el('input', { type: 'text', maxlength: 140, placeholder: 'Raison (affichée au journal)', 'aria-label': 'Raison de la suspension', 'data-testid': 'staff-suspend-reason' });
    const reasonMute = el('input', { type: 'text', maxlength: 140, placeholder: 'Raison (facultatif)', 'aria-label': 'Raison du silence', 'data-testid': 'staff-mute-reason' });
    body.replaceChildren(
      el('div', { class: 'staffplayer__badges' }, ...playerBadges(p)),
      el('p', { class: 'muted', text: `Compte créé le ${when(p.createdAt)} · dernière action ${p.lastAction ? ago(p.lastAction) : 'jamais'}` }),
      p.suspension ? el('p', { class: 'staff__flag', 'data-testid': 'staff-suspension', text: `Suspendu : ${p.suspension}` }) : '',

      el('h3', { class: 'staff__h', text: 'Rôle' }),
      el(
        'div',
        { class: 'seg seg--4 staff__roles', role: 'group', 'aria-label': 'Rôle' },
        ...ROLES.map((r) =>
          Button({
            text: ROLE_LABELS[r],
            variant: 'ghost',
            attrs: { 'aria-pressed': String(p.role === r), 'data-role-pick': r },
            onClick: async () => {
              if (r === p.role) return;
              const ok = await confirmAction({ title: `Rôle de ${p.pseudo}`, message: `${p.pseudo} passera de « ${ROLE_LABELS[p.role]} » à « ${ROLE_LABELS[r]} ».`, confirm: 'Changer le rôle', danger: r === 'admin' });
              if (ok && (await attempt(() => setRole(p.id, r), `${p.pseudo} est maintenant ${ROLE_LABELS[r]}.`))) await reload();
            },
          }),
        ),
      ),

      el('h3', { class: 'staff__h', text: 'Chat' }),
      p.mutedUntil
        ? Button({ text: 'Rendre la parole', variant: 'green', block: true, attrs: { 'data-testid': 'staff-unmute' }, onClick: async () => {
            if (await attempt(() => unmute(p.id), `${p.pseudo} peut de nouveau écrire.`)) await reload();
          } })
        : el(
            'div',
            { class: 'staff__box' },
            reasonMute,
            el(
              'div',
              { class: 'staff__row' },
              ...MUTE_CHOICES.map((c) =>
                Button({
                  text: `Muet ${c.label}`,
                  variant: 'blue',
                  attrs: { 'data-mute': String(c.minutes) },
                  onClick: async () => {
                    if (await attempt(() => mute(p.id, c.minutes, reasonMute.value), `${p.pseudo} est muet (${c.label}).`)) await reload();
                  },
                }),
              ),
            ),
          ),

      el('h3', { class: 'staff__h', text: 'Suspension' }),
      p.suspension
        ? Button({ text: 'Lever la suspension', variant: 'green', block: true, attrs: { 'data-testid': 'staff-unsuspend' }, onClick: async () => {
            if (await attempt(() => unsuspend(p.id), `${p.pseudo} n’est plus suspendu.`)) await reload();
          } })
        : el(
            'div',
            { class: 'staff__box' },
            el('p', { class: 'muted', text: 'Un joueur suspendu garde sa partie et peut la lire, mais ne peut plus ni jouer, ni écrire, ni faire la file.' }),
            reasonSuspend,
            Button({
              text: 'Suspendre',
              variant: 'red',
              block: true,
              attrs: { 'data-testid': 'staff-suspend' },
              onClick: async () => {
                if (reasonSuspend.value.trim() === '') return void toast('Écrivez la raison de la suspension.', 'bad');
                const ok = await confirmAction({ title: `Suspendre ${p.pseudo} ?`, message: `Raison : ${reasonSuspend.value.trim()}`, confirm: 'Suspendre', danger: true });
                if (ok && (await attempt(() => suspend(p.id, reasonSuspend.value), `${p.pseudo} est suspendu.`))) await reload();
              },
            }),
          ),

      el('h3', { class: 'staff__h', text: 'Dernières actions' }),
      Button({ text: 'Voir ses 20 dernières actions', variant: 'ghost', block: true, attrs: { 'data-testid': 'staff-load-actions' }, onClick: async () => {
        try {
          const list = await adminActions(p.id, 20);
          actionsBox.replaceChildren(
            ...(list.length === 0
              ? [emptyLine('Aucune action enregistrée.')]
              : list.map((a) => el('div', { class: 'staff__logline' }, el('b', { text: a.action }), el('small', { text: when(a.at) }), el('code', { text: a.summary })))),
          );
        } catch (e) {
          toast(staffError(e), 'bad');
        }
      } }),
      actionsBox,
    );
  }
  draw();
  return Modal({ title: p.pseudo, testid: 'staff-player', children: [body] });
}

// ------------------------------------------------------------------------------------------------ pages
function statsPage(): Page {
  const grid = el('div', { class: 'staffstats', 'data-testid': 'staff-stats' });
  const error = el('p', { class: 'online__error', role: 'alert' });
  error.hidden = true;
  return {
    el: el('div', {}, error, grid),
    async load() {
      try {
        const s = await adminStats();
        error.hidden = true;
        const card = (label: string, value: number, key: string, alert = false): HTMLElement =>
          el('div', { class: `staffstats__card${alert && value > 0 ? ' is-alert' : ''}`, 'data-stat': key }, el('b', { text: String(value) }), el('span', { text: label }));
        grid.replaceChildren(
          card('Comptes', s.accounts, 'accounts'),
          card('Avec pseudo', s.withPseudo, 'with_pseudo'),
          card('Nouveaux (24 h)', s.new24h, 'new_24h'),
          card('En ligne', s.online, 'online'),
          card('Signalements à traiter', s.reportsPending, 'reports_pending', true),
          card('Comptes suspendus', s.suspended, 'suspended'),
          card('Joueurs muets', s.muted, 'muted'),
          card('Messages (1 h)', s.messagesHour, 'messages_hour'),
          card('Actions de jeu (1 h)', s.actionsHour, 'actions_hour'),
        );
      } catch (e) {
        error.textContent = staffError(e);
        error.hidden = false;
      }
    },
  };
}

function playersPage(): Page {
  const input = el('input', { type: 'search', placeholder: 'Pseudo (le début suffit)', 'aria-label': 'Chercher un joueur', 'data-testid': 'staff-search', autocomplete: 'off', maxlength: 16 });
  const list = el('ul', { class: 'stafflist', 'data-testid': 'staff-players' });
  const status = el('p', { class: 'muted staff__status', role: 'status' });
  let seq = 0;
  async function load(): Promise<void> {
    const mine = ++seq;
    try {
      const rows = await adminPlayers(input.value.trim());
      if (mine !== seq) return; // a newer search is on its way
      status.textContent = input.value.trim() ? `${rows.length} joueur${rows.length > 1 ? 's' : ''}` : `${rows.length} derniers joueurs inscrits`;
      list.replaceChildren(
        ...(rows.length === 0
          ? [el('li', {}, emptyLine('Aucun joueur ne correspond.'))]
          : rows.map((p) =>
              el(
                'li',
                { class: 'stafflist__row', 'data-player': p.pseudo },
                el('div', { class: 'stafflist__main' }, el('b', { text: p.pseudo }), el('div', { class: 'stafflist__badges' }, ...playerBadges(p))),
                Button({ text: 'Gérer', variant: 'blue', attrs: { 'data-testid': 'staff-manage', 'aria-label': `Gérer ${p.pseudo}` }, onClick: () => void openPlayer(p, () => void load()) }),
              ),
            )),
      );
    } catch (e) {
      if (mine === seq) status.textContent = staffError(e);
    }
  }
  input.addEventListener('input', debounce(() => void load(), 300));
  return { el: el('div', {}, input, status, list), load };
}

function reportsPage(onCount: (n: number) => void): Page {
  const list = el('ul', { class: 'stafflist', 'data-testid': 'staff-reports' });
  const status = el('p', { class: 'muted staff__status', role: 'status' });
  async function load(): Promise<void> {
    let rows: AdminReport[];
    try {
      rows = await adminReports();
    } catch (e) {
      status.textContent = staffError(e);
      return;
    }
    const pending = rows.filter((r) => !r.hidden).length;
    onCount(pending);
    status.textContent = rows.length === 0 ? '' : `${pending} à traiter, ${rows.length - pending} déjà masqué${rows.length - pending > 1 ? 's' : ''}`;
    list.replaceChildren(
      ...(rows.length === 0
        ? [el('li', {}, emptyLine('Aucun message signalé. 🎉'))]
        : rows.map((r) =>
            el(
              'li',
              { class: `stafflist__row stafflist__row--col${r.hidden ? ' is-hidden' : ''}`, 'data-message': String(r.messageId) },
              el('p', { class: 'staff__quote', text: r.body }),
              el('div', { class: 'staff__meta' }, el('b', { text: r.authorPseudo }), el('small', { text: `${r.reports} signalement${r.reports > 1 ? 's' : ''} · ${r.reasons} · ${ago(r.lastAt)}` }), r.hidden ? Badge({ text: 'Masqué', tone: 'blue' }) : null),
              el(
                'div',
                { class: 'staff__row' },
                Button({ text: r.hidden ? 'Réafficher' : 'Masquer', variant: r.hidden ? 'ghost' : 'red', attrs: { 'data-testid': 'staff-hide' }, onClick: async () => {
                  if (await attempt(() => hideMessage(r.messageId, !r.hidden), r.hidden ? 'Message réaffiché.' : 'Message masqué.')) await load();
                } }),
                Button({ text: 'Écarter', variant: 'ghost', attrs: { 'data-testid': 'staff-dismiss', 'aria-label': 'Écarter les signalements' }, onClick: async () => {
                  if (await attempt(() => dismissReports(r.messageId), 'Signalements écartés.')) await load();
                } }),
                Button({ text: `Voir ${r.authorPseudo}`, variant: 'blue', attrs: { 'data-testid': 'staff-open-author' }, onClick: async () => {
                  try {
                    const found = (await adminPlayers(r.authorPseudo, 5)).find((p) => p.id === r.author);
                    if (found) openPlayer(found, () => void load());
                    else toast('Joueur introuvable.', 'bad');
                  } catch (e) {
                    toast(staffError(e), 'bad');
                  }
                } }),
              ),
            ),
          )),
    );
  }
  return { el: el('div', {}, status, list), load };
}

function wordsPage(): Page {
  const chips = el('ul', { class: 'staffchips', 'data-testid': 'staff-words' });
  const input = el('input', { type: 'text', placeholder: 'Un mot, en minuscules, sans accent', 'aria-label': 'Mot à refuser', 'data-testid': 'staff-word', maxlength: 30, autocomplete: 'off' });
  async function load(): Promise<void> {
    try {
      const words = await adminWords();
      chips.replaceChildren(
        ...(words.length === 0
          ? [el('li', {}, emptyLine('Aucun mot dans la liste.'))]
          : words.map((w) =>
              el('li', { class: 'staffchips__chip', 'data-word': w }, el('span', { text: w }), Button({ text: '✕', variant: 'ghost', silent: true, attrs: { 'aria-label': `Retirer ${w}`, 'data-testid': 'staff-word-remove' }, onClick: async () => {
                if (await confirmAction({ title: 'Retirer ce mot ?', message: `« ${w} » ne sera plus refusé dans le chat.`, confirm: 'Retirer' }) && (await attempt(() => removeWord(w), `« ${w} » retiré.`))) await load();
              } })),
            )),
      );
    } catch (e) {
      toast(staffError(e), 'bad');
    }
  }
  const add = async (): Promise<void> => {
    const w = input.value.trim().toLowerCase();
    if (!w) return;
    if (await attempt(() => addWord(w), `« ${w} » est maintenant refusé.`)) {
      input.value = '';
      await load();
    }
  };
  const form = el('form', { class: 'staff__form' }, input, Button({ text: 'Ajouter', variant: 'green', attrs: { 'data-testid': 'staff-word-add' }, onClick: () => add() }));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void add();
  });
  return { el: el('div', {}, el('p', { class: 'muted', text: 'Les mots de cette liste sont refusés dans le chat, accents et chiffres d’argot compris (« c0nnard »). Le changement est immédiat.' }), form, chips), load };
}

function auditPage(): Page {
  const list = el('ul', { class: 'stafflist', 'data-testid': 'staff-audit' });
  return {
    el: list,
    async load() {
      try {
        const rows = await adminAudit();
        list.replaceChildren(
          ...(rows.length === 0
            ? [el('li', {}, emptyLine('Rien n’a encore été fait.'))]
            : rows.map((a) =>
                el('li', { class: 'stafflist__row stafflist__row--col' }, el('div', { class: 'staff__meta' }, el('b', { text: a.actor ?? 'compte supprimé' }), el('span', { text: ` ${AUDIT_LABELS[a.action] ?? a.action}` }), a.target ? el('b', { text: ` ${a.target}` }) : null, el('small', { text: when(a.at) })), a.payload ? el('code', { class: 'staff__payload', text: a.payload }) : null),
              )),
        );
      } catch (e) {
        list.replaceChildren(el('li', {}, emptyLine(staffError(e))));
      }
    },
  };
}

/** The administration window: the figures, the players, the reported messages, the refused words and the journal of what the admins did. */
export function openAdmin(): ModalHandle {
  const stats = statsPage();
  const players = playersPage();
  let tabs: ReturnType<typeof tabStrip> | null = null;
  const reports = reportsPage((n) => tabs?.badge('reports', n));
  const words = wordsPage();
  const audit = auditPage();
  const pages: Record<string, Page> = { stats, players, reports, words, audit };
  const holder = el('div', { class: 'staff__page' });
  let current = 'stats';
  let timer: ReturnType<typeof setInterval> | null = null;

  const show = (id: string): void => {
    current = id;
    holder.replaceChildren(pages[id].el);
    void pages[id].load();
  };
  tabs = tabStrip(
    [
      { id: 'stats', label: 'Chiffres' },
      { id: 'players', label: 'Joueurs' },
      { id: 'reports', label: 'Signalements' },
      { id: 'words', label: 'Mots' },
      { id: 'audit', label: 'Journal' },
    ],
    current,
    show,
  );
  const modal = Modal({
    title: 'Administration',
    testid: 'admin',
    variant: 'sheet',
    onClose: () => {
      if (timer) clearInterval(timer);
    },
    children: [tabs.el, holder],
  });
  show('stats');
  void reports.load(); // the count of the tab, before anyone opens it
  // the figures and the reports stay fresh while the window is open
  timer = setInterval(() => {
    if (document.hidden) return;
    if (current === 'stats' || current === 'reports') void pages[current].load();
  }, 15_000);
  return modal;
}
