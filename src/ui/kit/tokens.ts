/**
 * Design tokens: the single source of the palette. They are written to CSS custom properties at
 * start-up (applyTokens) and checked for contrast by tests, so a colour cannot drift.
 */
export const COLORS = {
  /** Page background (the frame behind everything). */
  bg: '#12307a',
  bgDeep: '#0b1f55',
  /** Panels sit on the background. */
  panel: '#1d3f94',
  panelDark: '#122b6b',
  line: '#0a1c4a',
  lineLight: '#5b86e6',
  text: '#ffffff',
  textMuted: '#c3d2fa',
  gold: '#ffd23f',
  gem: '#5fdcff',
  xp: '#c58cff',
  danger: '#ff9a95',
  success: '#7df0a0',
  yellow: '#ffcc1a',
  yellowEdge: '#c98a00',
  yellowText: '#4a2d00',
  blue: '#2468d8',
  blueEdge: '#12409a',
  green: '#17803a',
  greenEdge: '#0d4f23',
  red: '#d03a38',
  redEdge: '#8a1c1b',
  ghost: '#27498f',
  ghostEdge: '#142d66',
  common: '#c3cbdc',
  rare: '#7cbfff',
  epic: '#d08cff',
  legendary: '#ffb020',
  /** Race board: cells that wear the car (orange) and cells that can break it (red), with their ink. */
  wear: '#f2780c',
  wearInk: '#1f0f00',
  crash: '#d03a38',
  crashInk: '#ffffff',
  /** Plain playable cell and its ink. */
  cell: '#dfe5f1',
  cellInk: '#10151c',
  /** The six dice of the gears (one colour and one shape each) and the d20 of the start, with their ink. */
  dice1: '#4ade80',
  dice2: '#5fdcff',
  dice3: '#ffd23f',
  dice4: '#ff9f43',
  dice5: '#ff7ab8',
  dice6: '#b388ff',
  diceStart: '#e8edf7',
  diceInk: '#10151c',
} as const;

export type ColorName = keyof typeof COLORS;

const cssName = (k: string) => `--${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/** Writes the palette as CSS variables (--bg-deep, --yellow-edge, ...). */
export function applyTokens(root: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(COLORS)) root.style.setProperty(cssName(k), v);
}

/** WCAG relative luminance of a #rrggbb colour. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = [16, 8, 0].map((s) => ((n >> s) & 255) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG contrast ratio between two #rrggbb colours (1 to 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Text colour on top of each surface: every pair must reach AA (4.5) for normal text. */
export const TEXT_PAIRS: [text: ColorName, surface: ColorName][] = [
  ['text', 'bg'],
  ['text', 'bgDeep'],
  ['text', 'panel'],
  ['text', 'panelDark'],
  ['textMuted', 'bg'],
  ['textMuted', 'panel'],
  ['textMuted', 'panelDark'],
  ['gold', 'panel'],
  ['gold', 'panelDark'],
  ['gem', 'panel'],
  ['gem', 'panelDark'],
  ['xp', 'panelDark'],
  ['danger', 'panel'],
  ['danger', 'panelDark'],
  ['success', 'panel'],
  ['yellowText', 'yellow'],
  ['text', 'blue'],
  ['text', 'green'],
  ['text', 'red'],
  ['text', 'ghost'],
  ['textMuted', 'ghost'],
  ['gold', 'ghost'],
  ['common', 'panel'],
  ['rare', 'panel'],
  ['epic', 'panelDark'],
  ['legendary', 'panel'],
  ['wearInk', 'wear'],
  ['crashInk', 'crash'],
  ['cellInk', 'cell'],
  ['diceInk', 'dice1'],
  ['diceInk', 'dice2'],
  ['diceInk', 'dice3'],
  ['diceInk', 'dice4'],
  ['diceInk', 'dice5'],
  ['diceInk', 'dice6'],
  ['diceInk', 'diceStart'],
];
