import { COSMETICS, getCosmetic } from '../data/parts/catalogue';
import type { Loadout } from '../data/parts/types';

export const DEFAULT_PAINT = 0xe53935;
export const DEFAULT_HELMET = 0xf2f4f7;

export const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

export interface CarLook {
  paint: number;
  number: number | null;
  helmet: number;
}

/** Colours and number of the equipped cosmetics (defaults when nothing is equipped). */
export function lookOf(loadout: Loadout): CarLook {
  const paint = loadout.paint ? getCosmetic(loadout.paint) : undefined;
  const number = loadout.number ? getCosmetic(loadout.number) : undefined;
  const helmet = loadout.helmet ? getCosmetic(loadout.helmet) : undefined;
  return { paint: paint?.value ?? DEFAULT_PAINT, number: number?.value ?? null, helmet: helmet?.value ?? DEFAULT_HELMET };
}

/** Top-down race car, drawn as inline SVG (nose up). */
export function carSvg(look: CarLook): string {
  const body = hex(look.paint);
  const helmet = hex(look.helmet);
  const dark = '#1b2027';
  const num = look.number === null ? '' : `<text x="60" y="138" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="26" fill="#10151c" stroke="#fff" stroke-width="1.2" paint-order="stroke">${look.number}</text>`;
  return `<svg viewBox="0 0 120 220" role="img" aria-label="Voiture" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="20" width="108" height="14" rx="4" fill="${dark}"/>
  <rect x="6" y="20" width="108" height="5" rx="2" fill="${body}" opacity=".85"/>
  <rect x="14" y="52" width="20" height="38" rx="6" fill="${dark}"/>
  <rect x="86" y="52" width="20" height="38" rx="6" fill="${dark}"/>
  <rect x="12" y="140" width="24" height="44" rx="7" fill="${dark}"/>
  <rect x="84" y="140" width="24" height="44" rx="7" fill="${dark}"/>
  <rect x="36" y="64" width="48" height="12" fill="${dark}"/>
  <path d="M60 14 C70 14 76 40 80 70 C84 100 84 150 82 190 L38 190 C36 150 36 100 40 70 C44 40 50 14 60 14 Z" fill="${body}" stroke="${dark}" stroke-width="2"/>
  <rect x="22" y="192" width="76" height="16" rx="4" fill="${dark}"/>
  <rect x="22" y="192" width="76" height="6" rx="3" fill="${body}" opacity=".85"/>
  <ellipse cx="60" cy="96" rx="11" ry="15" fill="#10151c" stroke="#566175" stroke-width="1.5"/>
  <circle cx="60" cy="94" r="8.5" fill="${helmet}" stroke="#10151c" stroke-width="1.5"/>
  <rect x="53" y="91" width="14" height="5" rx="2" fill="#10151c" opacity=".8"/>
  ${num}
</svg>`;
}

export const paintOptions = () => COSMETICS.filter((c) => c.cosmetic === 'paint');
