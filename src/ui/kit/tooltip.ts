import { el } from '../dom';

/** What a tooltip says: a title, then paragraphs; `extra` lines are shown in a smaller, muted style. */
export interface TipContent {
  title: string;
  lines: string[];
  extra?: string[];
}

const ID = 'kit-tooltip';
const GAP = 10;
const MARGIN = 8;
/** A tap on a touch screen shows the tooltip for this long. */
export const TOUCH_MS = 5000;

let box: HTMLElement | null = null;
let owner: HTMLElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function ensure(): HTMLElement {
  if (box && box.isConnected) return box;
  box = el('div', { id: ID, class: 'kit-tooltip', role: 'tooltip', 'data-testid': 'tooltip' });
  box.hidden = true;
  document.body.append(box);
  return box;
}

/** Where the tooltip goes: centred above the target (below when there is no room above), kept inside the window. */
export function tipPosition(target: DOMRect, tip: { width: number; height: number }, view: { width: number; height: number }): { left: number; top: number; below: boolean } {
  const below = target.top - tip.height - GAP < MARGIN;
  const top = below ? Math.min(view.height - tip.height - MARGIN, target.bottom + GAP) : target.top - tip.height - GAP;
  const left = Math.max(MARGIN, Math.min(view.width - tip.width - MARGIN, target.left + target.width / 2 - tip.width / 2));
  return { left, top: Math.max(MARGIN, top), below };
}

export function hideTooltip(): void {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = null;
  if (box) box.hidden = true;
  owner?.removeAttribute('aria-describedby');
  owner = null;
}

function show(target: HTMLElement, content: TipContent): void {
  const tip = ensure();
  if (owner && owner !== target) owner.removeAttribute('aria-describedby');
  owner = target;
  tip.replaceChildren(el('b', { class: 'kit-tooltip__title', text: content.title }), ...content.lines.map((l) => el('p', { text: l })), ...(content.extra ?? []).map((l) => el('p', { class: 'kit-tooltip__extra', text: l })));
  tip.hidden = false;
  tip.style.left = '0px';
  tip.style.top = '0px';
  const p = tipPosition(target.getBoundingClientRect(), { width: tip.offsetWidth, height: tip.offsetHeight }, { width: window.innerWidth, height: window.innerHeight });
  tip.style.left = `${Math.round(p.left)}px`;
  tip.style.top = `${Math.round(p.top)}px`;
  tip.dataset.below = String(p.below);
  target.setAttribute('aria-describedby', ID);
}

/**
 * A tooltip on `target`: it shows on hover with a mouse, on focus with the keyboard, and on a tap with a finger (for a few seconds, or until the
 * next tap elsewhere). `content` is read every time it shows, so it can tell the current values. Returns what removes it.
 */
export function attachTooltip(target: HTMLElement, content: () => TipContent): () => void {
  if (!target.hasAttribute('tabindex')) target.tabIndex = 0;
  const open = (): void => show(target, content());
  const onEnter = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') open();
  };
  const onLeave = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && owner === target) hideTooltip();
  };
  const onDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') return;
    if (owner === target && box && !box.hidden) return hideTooltip();
    open();
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(hideTooltip, TOUCH_MS);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && owner === target) hideTooltip();
  };
  const onBlur = (): void => {
    if (owner === target) hideTooltip();
  };
  target.addEventListener('pointerenter', onEnter);
  target.addEventListener('pointerleave', onLeave);
  target.addEventListener('pointerdown', onDown);
  target.addEventListener('focus', open);
  target.addEventListener('blur', onBlur);
  target.addEventListener('keydown', onKey);
  return () => {
    target.removeEventListener('pointerenter', onEnter);
    target.removeEventListener('pointerleave', onLeave);
    target.removeEventListener('pointerdown', onDown);
    target.removeEventListener('focus', open);
    target.removeEventListener('blur', onBlur);
    target.removeEventListener('keydown', onKey);
    if (owner === target) hideTooltip();
  };
}

// a tap anywhere else, a scroll or a resize closes the tooltip of a touch screen
if (typeof document !== 'undefined') {
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (owner && e.target instanceof Node && !owner.contains(e.target)) hideTooltip();
    },
    true,
  );
  window.addEventListener('scroll', hideTooltip, true);
  window.addEventListener('resize', hideTooltip);
}
