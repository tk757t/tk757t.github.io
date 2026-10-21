import { el } from '../dom';
import { feedback } from './feedback';

type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | boolean | number>;

const attrProps = (attrs?: Attrs) => attrs ?? {};

// ---------------------------------------------------------------- Button

export type ButtonVariant = 'yellow' | 'blue' | 'green' | 'red' | 'ghost';
export type ButtonSize = 'md' | 'lg' | 'xl';

export interface ButtonOptions {
  text?: string;
  children?: Child[];
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full width. */
  block?: boolean;
  disabled?: boolean;
  /** No tap sound (used where a screen plays its own). */
  silent?: boolean;
  attrs?: Attrs;
  /** A handler that returns a promise (a call to the server) puts the button in a busy state until it settles. */
  onClick?: (e: MouseEvent) => unknown;
}

/** Thick, embossed button with a press animation. Always at least 44x44. */
export function Button(o: ButtonOptions): HTMLButtonElement {
  const b = el('button', {
    type: 'button',
    class: ['kit-btn', `kit-btn--${o.variant ?? 'blue'}`, `kit-btn--${o.size ?? 'md'}`, o.block ? 'kit-btn--block' : ''].filter(Boolean).join(' '),
    ...attrProps(o.attrs),
  });
  if (o.text !== undefined) b.append(el('span', { class: 'kit-btn__label', text: o.text }));
  for (const c of o.children ?? []) if (c) b.append(c);
  if (o.disabled) b.disabled = true;
  b.addEventListener('pointerdown', () => b.classList.add('is-pressed'));
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel'] as const) b.addEventListener(ev, () => b.classList.remove('is-pressed'));
  b.addEventListener('click', (e) => {
    if (b.disabled || b.getAttribute('aria-busy') === 'true') return;
    b.classList.remove('pop');
    void b.offsetWidth; // restart the CSS animation
    b.classList.add('pop');
    if (!o.silent) feedback('tap');
    const pending = o.onClick?.(e);
    if (pending instanceof Promise) {
      // answer at once: the player sees the tap was taken while the server thinks
      b.setAttribute('aria-busy', 'true');
      b.classList.add('is-busy');
      void pending.finally(() => {
        b.removeAttribute('aria-busy');
        b.classList.remove('is-busy');
      });
    }
  });
  b.addEventListener('animationend', () => b.classList.remove('pop'));
  return b;
}

/** Changes the text of a Button made with `text`. */
export function setButtonText(b: HTMLButtonElement, text: string): void {
  const label = b.querySelector('.kit-btn__label');
  if (label) label.textContent = text;
  else b.textContent = text;
}

// ----------------------------------------------------------------- Panel

export type PanelTone = 'blue' | 'dark' | 'gold';

export interface PanelOptions {
  title?: string;
  tone?: PanelTone;
  children?: Child[];
  className?: string;
  attrs?: Attrs;
}

export function Panel(o: PanelOptions = {}): HTMLElement {
  const p = el('section', { class: `kit-panel kit-panel--${o.tone ?? 'blue'} ${o.className ?? ''}`.trim(), ...attrProps(o.attrs) });
  if (o.title) p.append(el('h2', { class: 'kit-panel__title', text: o.title }));
  for (const c of o.children ?? []) if (c) p.append(c);
  return p;
}

// ----------------------------------------------------------------- Badge

export type BadgeTone = 'red' | 'gold' | 'blue' | 'green';

/** Small pill: a counter on a tab, a level, a currency amount. */
export function Badge(o: { text: string; tone?: BadgeTone; label?: string; icon?: string; attrs?: Attrs }): HTMLElement {
  return el(
    'span',
    { class: `kit-badge kit-badge--${o.tone ?? 'red'}`, ...(o.label ? { 'aria-label': o.label } : {}), ...attrProps(o.attrs) },
    o.icon ? el('span', { class: 'kit-badge__icon', 'aria-hidden': 'true', text: o.icon }) : null,
    el('span', { class: 'kit-badge__text', text: o.text }),
  );
}

// ------------------------------------------------------------ LevelBadge

/** Account level pill (top bar, profile, end of race, later chat messages). */
export function LevelBadge(level: number, o: { attrs?: Attrs } = {}): HTMLElement {
  const b = Badge({ text: String(level), tone: 'blue', label: `Niveau ${level}`, attrs: o.attrs });
  b.classList.add('kit-levelbadge');
  return b;
}

export function setLevelBadge(b: HTMLElement, level: number): void {
  const t = b.querySelector('.kit-badge__text');
  if (t) t.textContent = String(level);
  b.setAttribute('aria-label', `Niveau ${level}`);
}

// ------------------------------------------------------------ ProgressBar

export type ProgressTone = 'gold' | 'xp' | 'green' | 'red' | 'blue';

export interface ProgressOptions {
  value: number;
  max: number;
  tone?: ProgressTone;
  label: string;
  /** Text drawn on the bar, e.g. "45 / 100". */
  text?: string;
  small?: boolean;
  attrs?: Attrs;
}

const ratio = (value: number, max: number) => (max > 0 ? Math.min(1, Math.max(0, value / max)) : 0);

export function ProgressBar(o: ProgressOptions): HTMLElement {
  const fill = el('div', { class: 'kit-progress__fill' });
  const bar = el(
    'div',
    {
      class: `kit-progress kit-progress--${o.tone ?? 'gold'}${o.small ? ' kit-progress--small' : ''}`,
      role: 'progressbar',
      'aria-label': o.label,
      ...attrProps(o.attrs),
    },
    fill,
    el('span', { class: 'kit-progress__text' }),
  );
  setProgress(bar, o.value, o.max, o.text);
  return bar;
}

export function setProgress(bar: HTMLElement, value: number, max: number, text?: string): void {
  const fill = bar.querySelector<HTMLElement>('.kit-progress__fill');
  if (fill) fill.style.width = `${Math.round(ratio(value, max) * 100)}%`;
  bar.setAttribute('aria-valuenow', String(value));
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', String(max));
  const label = bar.querySelector('.kit-progress__text');
  if (label) label.textContent = text ?? '';
}

// ----------------------------------------------------------- RarityFrame

export type FrameRarity = 'common' | 'rare' | 'epic' | 'legendary';

/** Border and glow in the colour of a rarity around any content. */
export function RarityFrame(rarity: FrameRarity, children: Child[] = [], o: { className?: string; attrs?: Attrs; glow?: boolean } = {}): HTMLElement {
  const f = el('div', { class: `kit-frame kit-frame--${rarity}${o.glow ? ' kit-frame--glow' : ''} ${o.className ?? ''}`.trim(), ...attrProps(o.attrs) });
  for (const c of children) if (c) f.append(c);
  return f;
}

// ----------------------------------------------------------------- Modal

export interface ModalOptions {
  title?: string;
  /** Accessible name (defaults to the title). */
  label?: string;
  children?: Child[];
  actions?: Child[];
  /** Backdrop click, Escape and the close button dismiss it (default true). */
  dismissible?: boolean;
  onClose?: () => void;
  testid?: string;
  /** "sheet" sticks to the bottom on phones. */
  variant?: 'center' | 'sheet';
}

export interface ModalHandle {
  el: HTMLElement;
  body: HTMLElement;
  close(): void;
}

function modalRoot(): HTMLElement {
  let root = document.getElementById('modal-root');
  if (!root) {
    root = el('div', { id: 'modal-root' });
    document.body.append(root);
  }
  return root;
}

export function Modal(o: ModalOptions): ModalHandle {
  const dismissible = o.dismissible ?? true;
  const previous = document.activeElement as HTMLElement | null;
  let closed = false;
  const body = el('div', { class: 'kit-modal__body' });
  for (const c of o.children ?? []) if (c) body.append(c);
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    wrap.remove();
    previous?.focus?.();
    feedback('close');
    o.onClose?.();
  };
  const header = el(
    'header',
    { class: 'kit-modal__header' },
    el('h2', { class: 'kit-modal__title', text: o.title ?? '' }),
    dismissible ? Button({ text: '✕', variant: 'red', attrs: { 'aria-label': 'Fermer' }, onClick: close, silent: true }) : null,
  );
  const dialog = el(
    'div',
    {
      class: 'kit-modal',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': o.label ?? o.title ?? 'Fenêtre',
      ...(o.testid ? { 'data-testid': o.testid } : {}),
    },
    o.title ? header : dismissible ? el('div', { class: 'kit-modal__floating-close' }, header.querySelector('button')) : null,
    body,
    o.actions?.length ? el('footer', { class: 'kit-modal__actions' }, ...o.actions) : null,
  );
  const wrap = el(
    'div',
    {
      class: `kit-modal-wrap kit-modal-wrap--${o.variant ?? 'center'}`,
      onpointerdown: (e: Event) => {
        if (dismissible && e.target === wrap) close();
      },
    },
    dialog,
  );
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && dismissible) {
      // only the topmost modal reacts
      const all = modalRoot().querySelectorAll('.kit-modal-wrap');
      if (all[all.length - 1] === wrap) close();
    }
  };
  document.addEventListener('keydown', onKey);
  modalRoot().append(wrap);
  feedback('open');
  (dialog.querySelector('button, [href], input, select') as HTMLElement | null)?.focus?.({ preventScroll: true });
  return { el: wrap, body, close };
}
