import { Button, Modal } from '../ui/kit';
import { el } from '../ui/dom';

export interface TabItem {
  id: string;
  label: string;
}

/** A strip of tabs (one pressed at a time) that tells which one was picked; `badge` puts a count on a tab. */
export function tabStrip(items: TabItem[], initial: string, onPick: (id: string) => void): { el: HTMLElement; set(id: string): void; badge(id: string, n: number): void } {
  const root = el('div', { class: 'stafftabs', role: 'tablist' });
  const buttons = new Map<string, HTMLElement>();
  const counts = new Map<string, HTMLElement>();
  const set = (id: string): void => {
    for (const [k, b] of buttons) {
      b.classList.toggle('is-active', k === id);
      b.setAttribute('aria-selected', String(k === id));
    }
  };
  for (const it of items) {
    const count = el('span', { class: 'stafftabs__count', 'aria-hidden': 'true' });
    count.hidden = true;
    const b = el('button', { type: 'button', class: 'stafftabs__tab', role: 'tab', 'data-tab': it.id, 'data-testid': `staff-tab-${it.id}` }, it.label, count);
    b.addEventListener('click', () => {
      set(it.id);
      onPick(it.id);
    });
    buttons.set(it.id, b);
    counts.set(it.id, count);
    root.append(b);
  }
  set(initial);
  return {
    el: root,
    set,
    badge(id, n) {
      const c = counts.get(id);
      if (!c) return;
      c.hidden = n <= 0;
      c.textContent = n > 99 ? '99+' : String(n);
    },
  };
}

/** Asks before something that cannot be undone with one tap: resolves true on the confirm button, false on anything else. */
export function confirmAction(o: { title: string; message: string; confirm: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    const done = (v: boolean): void => {
      if (answered) return;
      answered = true;
      resolve(v);
    };
    const modal = Modal({
      title: o.title,
      testid: 'staff-confirm',
      children: [el('p', { class: 'staff__confirm', text: o.message })],
      actions: [
        Button({
          text: o.confirm,
          variant: o.danger ? 'red' : 'green',
          size: 'lg',
          block: true,
          attrs: { 'data-testid': 'staff-confirm-yes' },
          onClick: () => {
            done(true);
            modal.close();
          },
        }),
        Button({ text: 'Annuler', variant: 'ghost', block: true, attrs: { 'data-testid': 'staff-confirm-no' }, onClick: () => modal.close() }),
      ],
      onClose: () => done(false),
    });
  });
}

const FR = 'fr-FR';
/** "21/10 23:05". */
export const when = (ms: number): string => new Date(ms).toLocaleString(FR, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** "il y a 5 min". */
export function ago(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86_400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86_400)} j`;
}

/** A debounced function: only the last call of a burst runs. */
export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): (...a: A) => void {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...a) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
