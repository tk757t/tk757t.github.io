import { describeEffect } from '../data/parts/effects';
import { COSMETIC_LABELS, RARITY_LABELS, SLOT_LABELS, type ItemDef, type Slot } from '../data/parts/types';
import { el } from './dom';
import { hex } from './carSvg';

export const SLOT_ICONS: Record<Slot, string> = { engine: '⚙️', gearbox: '🔩', brakes: '🛑', tires: '⭕', wing: '🪽', chassis: '🛡️' };
const COSMETIC_ICONS = { paint: '🎨', number: '🔢', helmet: '⛑️' } as const;

export const itemIcon = (item: ItemDef): string => (item.kind === 'part' ? SLOT_ICONS[item.slot] : COSMETIC_ICONS[item.cosmetic]);

export const itemKindLabel = (item: ItemDef): string => (item.kind === 'part' ? SLOT_LABELS[item.slot] : COSMETIC_LABELS[item.cosmetic]);

/** One line per effect, or the cosmetic's look. */
export function itemLines(item: ItemDef, level = 1): string[] {
  if (item.kind === 'part') return item.effects.map((e) => describeEffect(e, level));
  return [item.cosmetic === 'number' ? `Numéro ${item.value}` : 'Cosmétique, sans effet sur la course'];
}

/** Small colour / number sample for a cosmetic. */
export function cosmeticSwatch(item: ItemDef): HTMLElement | null {
  if (item.kind !== 'cosmetic') return null;
  if (item.cosmetic === 'number') return el('span', { class: 'swatch num', text: String(item.value) });
  return el('span', { class: 'swatch', style: `background:${hex(item.value)}` });
}

/** Full-size card used by the pack reveal and the summary. */
export function cardFace(item: ItemDef, extra?: { badge?: string; level?: number }): HTMLElement {
  return el(
    'div',
    { class: `face rarity-${item.rarity}` },
    el('div', { class: 'rarity-tag', text: RARITY_LABELS[item.rarity] }),
    el('div', { class: 'icon', 'aria-hidden': 'true', text: itemIcon(item) }),
    el('h3', { text: item.name }),
    el('div', { class: 'kind', text: itemKindLabel(item) }),
    cosmeticSwatch(item),
    el('ul', { class: 'lines' }, ...itemLines(item, extra?.level ?? 1).map((l) => el('li', { text: l }))),
    extra?.badge ? el('div', { class: 'badge-line', text: extra.badge }) : null,
  );
}
