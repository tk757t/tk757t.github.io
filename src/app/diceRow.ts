import { el } from '../ui/dom';

/**
 * The dice of the gears, side by side: one die per gear, each with its own shape and colour (a triangle for the gentlest, up to a ten-sided
 * figure for the longest jump), the gear in the middle and the cells it gives below. The player touches the die they want.
 */
export const GEAR_SIDES = [3, 4, 5, 6, 8, 10] as const;

const VIEW = 56;
const MID = VIEW / 2;

/** The corners of a regular polygon with `sides` corners inside a square of VIEW, one corner pointing up (squares sit on a corner too). */
export function polygonPoints(sides: number, radius = 25, cx = MID, cy = MID): string {
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    pts.push(`${(cx + radius * Math.cos(a)).toFixed(1)},${(cy + radius * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

/** One die as an inline SVG: the shape, in the colour of its gear (`sides` 0 = a round d20 for the start). */
export function dieShape(sides: number, colorVar: string, label: string): string {
  const shape = sides === 0 ? `<circle cx="${MID}" cy="${MID}" r="25"/>` : `<polygon points="${polygonPoints(sides)}" stroke-linejoin="round"/>`;
  const size = label.length > 2 ? 17 : 26;
  // the number is drawn in the shape: it always sits on the colour of its die
  return `<svg class="gdie__shape" viewBox="0 0 ${VIEW} ${VIEW}" aria-hidden="true" focusable="false"><g class="gdie__fill" fill="var(${colorVar})" stroke="var(--line)" stroke-width="3">${shape}</g><text class="gdie__n" x="${MID}" y="${MID + 1}" text-anchor="middle" dominant-baseline="central" font-size="${size}">${label}</text></svg>`;
}

export interface DieState {
  gear: number;
  /** "7-12", the cells this die gives. */
  range: string;
  /** The gear can be chosen now. */
  allowed: boolean;
  selected: boolean;
  /** Why it cannot be chosen, or what choosing it costs ("Rétrograder coûte : boîte −1, freins −1"); null when nothing to say. */
  note: string | null;
  /** The gear costs something to reach (a downshift): a small mark on the die. */
  costly: boolean;
}

export interface DiceRowState {
  dice: DieState[];
  /** A roll is on its way or it is not the player's turn: nothing can be chosen. */
  locked: boolean;
}

export interface DiceRow {
  el: HTMLElement;
  update(state: DiceRowState): void;
}

const GEAR_COLORS = ['--dice1', '--dice2', '--dice3', '--dice4', '--dice5', '--dice6'];

export const dieLabel = (d: DieState): string => `Rapport ${d.gear} : ${d.range.replace('-', ' à ')} cases${d.note ? `. ${d.note}` : ''}${d.selected ? '. Choisi : touchez encore pour lancer' : ''}`;

/**
 * Builds the row. `onPick` is called with the gear of the die touched: the screen selects it, and rolls when it was already selected.
 */
export function createDiceRow(onPick: (gear: number) => void): DiceRow {
  const root = el('div', { class: 'dice-row', role: 'radiogroup', 'aria-label': 'Choisissez votre rapport', 'data-testid': 'dice-row' });
  const buttons: HTMLButtonElement[] = [];
  GEAR_SIDES.forEach((sides, i) => {
    const gear = i + 1;
    const b = el('button', { type: 'button', class: 'gdie', role: 'radio', 'data-gear-pick': String(gear), 'data-testid': `die-${gear}` });
    b.innerHTML = `<span class="gdie__face">${dieShape(sides, GEAR_COLORS[i], String(gear))}</span><span class="gdie__range" aria-hidden="true"></span><span class="gdie__cost" aria-hidden="true">▼</span>`;
    b.addEventListener('click', () => {
      if (b.getAttribute('aria-disabled') === 'true') return;
      onPick(gear);
    });
    buttons.push(b);
    root.append(b);
  });
  return {
    el: root,
    update(state) {
      root.setAttribute('aria-disabled', String(state.locked));
      state.dice.forEach((d, i) => {
        const b = buttons[i];
        const usable = d.allowed && !state.locked;
        b.setAttribute('aria-checked', String(d.selected));
        b.setAttribute('aria-disabled', String(!usable));
        b.setAttribute('aria-label', dieLabel(d));
        b.title = d.note ?? '';
        b.classList.toggle('is-selected', d.selected);
        b.classList.toggle('is-off', !d.allowed);
        b.classList.toggle('is-costly', d.costly);
        b.querySelector('.gdie__range')!.textContent = d.range;
        // a roving tab stop: the arrows move between the dice that can be chosen
        b.tabIndex = d.selected || (!state.dice.some((x) => x.selected) && i === 0) ? 0 : -1;
      });
    },
  };
}

/** The die of a car still on the grid: one round d20 for the start, always chosen. */
export function createStartDie(onPick: () => void): { el: HTMLElement; update(locked: boolean): void } {
  const b = el('button', { type: 'button', class: 'gdie gdie--start is-selected', 'data-testid': 'die-start', 'aria-label': 'Départ arrêté : lancer le d20 (20 super départ, 1 calage)' });
  b.innerHTML = `<span class="gdie__face">${dieShape(0, '--dice-start', 'd20')}</span><span class="gdie__range" aria-hidden="true">Départ</span>`;
  b.addEventListener('click', () => {
    if (b.getAttribute('aria-disabled') !== 'true') onPick();
  });
  return {
    el: el('div', { class: 'dice-row dice-row--start', 'data-testid': 'dice-row' }, b),
    update(locked) {
      b.setAttribute('aria-disabled', String(locked));
    },
  };
}

/** Arrow keys move between the dice that can be chosen. */
export function attachDiceKeys(root: HTMLElement): void {
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const usable = [...root.querySelectorAll<HTMLButtonElement>('.gdie')].filter((b) => b.getAttribute('aria-disabled') !== 'true');
    const at = usable.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0 || usable.length === 0) return;
    e.preventDefault();
    usable[(at + (e.key === 'ArrowRight' ? 1 : usable.length - 1)) % usable.length].focus();
  });
}
