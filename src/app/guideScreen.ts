import { GUIDE, QUICK, TIPS } from '../data/guide';
import { Button, Modal, type ModalHandle } from '../ui/kit';
import { el } from '../ui/dom';

export type GuidePhase = keyof typeof TIPS;

export interface GuideOptions {
  /** Opened from a race: the short version first, and what to do right now. */
  race?: { phase: GuidePhase };
  /** A page to start on. */
  section?: string;
}

const QUICK_ID = 'quick';

/** The lines of a page: "• ..." lines are items of a list, the others are paragraphs. */
export function pageBody(lines: readonly string[]): HTMLElement[] {
  const out: HTMLElement[] = [];
  let list: HTMLElement | null = null;
  for (const line of lines) {
    if (line.startsWith('• ')) {
      if (!list) {
        list = el('ul', { class: 'guide__list' });
        out.push(list);
      }
      list.append(el('li', { text: line.slice(2) }));
    } else {
      list = null;
      out.push(el('p', { class: /^\d\. /.test(line) ? 'guide__step' : 'guide__p', text: line }));
    }
  }
  return out;
}

let open: { modal: ModalHandle; show(id: string): void } | null = null;

/**
 * The guide of the game: the whole of it from the menu, and from a race the short version first (what to do now, then seven lines), so that
 * nobody is lost. A page is chosen in a list or with the Previous and Next buttons. The race goes on behind the window, as it does for the journal.
 */
export function openGuide(o: GuideOptions = {}): ModalHandle {
  const start = o.section ?? (o.race ? QUICK_ID : GUIDE[0].id);
  if (open) {
    open.show(start);
    return open.modal;
  }
  const items = [{ id: QUICK_ID, label: 'En bref' }, ...GUIDE.map((s) => ({ id: s.id, label: s.title }))];
  const holder = el('div', { class: 'guide__page', 'data-testid': 'guide-page', tabindex: '0' });
  const select = el('select', { class: 'guide__select', 'aria-label': 'Page du guide', 'data-testid': 'guide-select' });
  for (const it of items) select.append(el('option', { value: it.id, text: it.label }));
  select.addEventListener('change', () => show(select.value));
  const prev = Button({ text: '◀ Précédent', variant: 'ghost', attrs: { 'data-testid': 'guide-prev' }, onClick: () => step(-1) });
  const next = Button({ text: 'Suivant ▶', variant: 'ghost', attrs: { 'data-testid': 'guide-next' }, onClick: () => step(1) });

  const pages = new Map<string, () => HTMLElement[]>();
  pages.set(QUICK_ID, () => [
    ...(o.race ? [el('p', { class: 'guide__now', 'data-testid': 'guide-now', text: TIPS[o.race.phase] })] : []),
    el('ul', { class: 'guide__list guide__list--quick', 'data-testid': 'guide-quick' }, ...QUICK.map((l) => el('li', { text: l }))),
    Button({ text: 'Lire le guide complet', variant: 'blue', block: true, attrs: { 'data-testid': 'guide-more' }, onClick: () => show(GUIDE[0].id) }),
  ]);
  for (const s of GUIDE) pages.set(s.id, () => [el('h3', { class: 'guide__title', text: s.title }), ...pageBody(s.lines)]);

  let current = start;
  function step(by: number): void {
    const at = items.findIndex((it) => it.id === current);
    const to = items[Math.max(0, Math.min(items.length - 1, at + by))];
    show(to.id);
  }
  function show(id: string): void {
    current = pages.has(id) ? id : QUICK_ID;
    select.value = current;
    const at = items.findIndex((it) => it.id === current);
    prev.disabled = at <= 0;
    next.disabled = at >= items.length - 1;
    holder.replaceChildren(...pages.get(current)!());
    holder.scrollTop = 0;
  }
  const modal: ModalHandle = Modal({
    title: o.race ? 'Aide de course' : 'Guide du jeu',
    testid: 'guide',
    variant: 'sheet',
    onClose: () => {
      open = null;
    },
    children: [select, holder, el('div', { class: 'guide__nav' }, prev, next)],
    actions: [Button({ text: 'Fermer', variant: 'green', size: 'lg', block: true, onClick: () => modal.close() })],
  });
  open = { modal, show };
  show(start);
  return modal;
}
