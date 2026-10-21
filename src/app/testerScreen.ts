import { ITEMS } from '../data/parts/catalogue';
import { COSMETIC_LABELS, MAX_LEVEL, RARITY_LABELS, SLOT_LABELS } from '../data/parts/types';
import { CHESTS, CHEST_TIERS, type ChestTier } from '../data/chests';
import { ROLE_LABELS, knownRole } from '../net/staff';
import { Button, Modal, type ModalHandle } from '../ui/kit';
import { el } from '../ui/dom';
import { getAccount } from './account';
import { getProfile } from './profile';
import { callGame, serverAction } from './serverGame';
import { confirmAction } from './staffUi';
import { currentBuild } from './updater';
import { toast } from './toast';

const DEBUG_KEY = '4mules.tester.debug';

/** The tester asked for the cells of the circuit to be numbered during the races (a button « Cases » in the race top bar). */
export function testerDebugOn(): boolean {
  try {
    return localStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

function setTesterDebug(on: boolean): void {
  try {
    localStorage.setItem(DEBUG_KEY, on ? '1' : '0');
  } catch {
    /* the choice holds for this visit only */
  }
}

const fmt = (n: number): string => n.toLocaleString('fr-FR');

type Granted = Extract<NonNullable<Awaited<ReturnType<typeof serverAction<'tester_grant'>>>>, { action: 'tester_grant' }>['granted'];

/** One sentence that tells what was given. */
export function grantedText(g: Granted): string {
  const parts: string[] = [];
  if (g.gold) parts.push(`${fmt(g.gold)} or`);
  if (g.gems) parts.push(`${fmt(g.gems)} gemmes`);
  if (g.fragments) parts.push(`${fmt(g.fragments)} fragments`);
  if (g.xp) parts.push(`${fmt(g.xp)} XP${g.levelUp ? ` (niveau ${g.levelUp} !)` : ''}`);
  if (g.chest) parts.push(`un coffre ${CHESTS[g.chest].label.toLowerCase()} prêt à ouvrir`);
  if (g.item) parts.push(`« ${ITEMS.find((i) => i.id === g.item)?.name ?? g.item} »`);
  return `Reçu : ${parts.join(', ')}.`;
}

/**
 * The test tools: resources, a chest or a part for one's own account, the numbered cells of the circuit during the races, a copy of the
 * account to show a bug, and a restart from zero. The server checks the role of the account for every one of them.
 */
export function openTester(): ModalHandle {
  const role = knownRole();
  const grant = async (params: Record<string, unknown>): Promise<void> => {
    const r = await serverAction('tester_grant', params);
    if (r) toast(grantedText(r.granted));
  };
  const give = (label: string, params: Record<string, unknown>, key: string): HTMLElement => Button({ text: label, variant: 'blue', attrs: { 'data-give': key }, onClick: () => grant(params) });

  // a part (or a cosmetic) at the level asked
  const itemSelect = el('select', { 'aria-label': 'Pièce ou objet', 'data-testid': 'tester-item' });
  for (const it of ITEMS) {
    const where = it.kind === 'part' ? SLOT_LABELS[it.slot] : COSMETIC_LABELS[it.cosmetic];
    itemSelect.append(el('option', { value: it.id, text: `${where} · ${it.name} (${RARITY_LABELS[it.rarity]})` }));
  }
  const levelSelect = el('select', { 'aria-label': 'Niveau de la pièce', 'data-testid': 'tester-item-level' });
  for (let l = 1; l <= MAX_LEVEL; l++) levelSelect.append(el('option', { value: String(l), text: `Niveau ${l}` }));

  const debug = Button({
    text: '',
    variant: 'ghost',
    block: true,
    attrs: { 'data-testid': 'tester-debug' },
    onClick: () => {
      setTesterDebug(!testerDebugOn());
      paintDebug();
    },
  });
  const paintDebug = (): void => {
    const on = testerDebugOn();
    debug.textContent = on ? '🔢 Cases numérotées en course : activé' : '🔢 Cases numérotées en course : coupé';
    debug.setAttribute('aria-pressed', String(on));
  };
  paintDebug();

  const info = el(
    'dl',
    { class: 'profile-stats', 'data-testid': 'tester-info' },
    ...(
      [
        ['Rôle', role ? ROLE_LABELS[role] : '—'],
        ['Version', currentBuild().version],
        ['Pseudo', getAccount()?.pseudo ?? '—'],
      ] as [string, string][]
    ).flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]),
  );

  const body = el(
    'div',
    { class: 'tester' },
    el('p', { class: 'muted', text: 'Ces outils ne touchent que votre propre compte. Tout ce que vous recevez est inscrit au journal des actions.' }),
    info,

    el('h3', { class: 'staff__h', text: 'Ressources' }),
    el(
      'div',
      { class: 'tester__grid' },
      give('+1 000 🪙', { gold: 1000 }, 'gold-1000'),
      give('+10 000 🪙', { gold: 10_000 }, 'gold-10000'),
      give('+100 💎', { gems: 100 }, 'gems-100'),
      give('+1 000 💎', { gems: 1000 }, 'gems-1000'),
      give('+200 🔷', { fragments: 200 }, 'fragments-200'),
      give('+2 000 🔷', { fragments: 2000 }, 'fragments-2000'),
      give('+500 XP', { xp: 500 }, 'xp-500'),
      give('+5 000 XP', { xp: 5000 }, 'xp-5000'),
    ),

    el('h3', { class: 'staff__h', text: 'Coffres (prêts à ouvrir)' }),
    el('div', { class: 'tester__grid' }, ...CHEST_TIERS.map((t: ChestTier) => give(CHESTS[t].label, { chest: t }, `chest-${t}`))),

    el('h3', { class: 'staff__h', text: 'Pièce ou objet' }),
    el(
      'div',
      { class: 'tester__item' },
      itemSelect,
      levelSelect,
      Button({
        text: 'Donner',
        variant: 'green',
        attrs: { 'data-testid': 'tester-item-give' },
        onClick: () => {
          const id = itemSelect.value;
          const isPart = ITEMS.find((i) => i.id === id)?.kind === 'part';
          return grant(isPart ? { item: id, itemLevel: Number(levelSelect.value) } : { item: id });
        },
      }),
    ),

    el('h3', { class: 'staff__h', text: 'Outils' }),
    debug,
    Button({
      text: '📋 Copier l’état de mon compte',
      variant: 'ghost',
      block: true,
      attrs: { 'data-testid': 'tester-copy' },
      onClick: async () => {
        const text = JSON.stringify(getProfile(), null, 1);
        try {
          await navigator.clipboard.writeText(text);
          toast('État du compte copié : collez-le dans votre rapport.');
        } catch {
          toast('Copie impossible sur cet appareil.', 'bad');
        }
      },
    }),
    Button({
      text: '↻ Relire mon compte depuis le serveur',
      variant: 'ghost',
      block: true,
      attrs: { 'data-testid': 'tester-sync' },
      onClick: async () => {
        try {
          await callGame('sync');
          toast('Compte relu.');
        } catch {
          toast('Le serveur ne répond pas.', 'bad');
        }
      },
    }),

    el('h3', { class: 'staff__h', text: 'Zone dangereuse' }),
    Button({
      text: 'Remettre mon compte à zéro',
      variant: 'red',
      block: true,
      attrs: { 'data-testid': 'tester-reset' },
      onClick: async () => {
        const ok = await confirmAction({ title: 'Tout recommencer ?', message: 'Votre compte redevient celui d’un nouveau joueur : garage vide, niveau 1, campagne à refaire, trophées à zéro. Votre pseudo et votre rôle restent.', confirm: 'Tout effacer', danger: true });
        if (!ok) return;
        const r = await serverAction('tester_reset', { confirm: true });
        if (r) toast('Compte remis à zéro.');
      },
    }),
  );
  return Modal({ title: 'Outils de test', testid: 'tester', variant: 'sheet', children: [body] });
}
