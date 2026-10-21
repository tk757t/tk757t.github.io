import { DEFAULT_CONFIG, startPointsFor } from '../engine/config';
import { getItem, getPart, ITEMS } from '../data/parts/catalogue';
import { modsForLoadout, statRows, type StatRow } from '../data/parts/effects';
import { upgradeCost } from '../data/parts/packs';
import { COSMETIC_LABELS, MAX_LEVEL, RARITIES, RARITY_LABELS, SLOT_LABELS, type CosmeticKind, type ItemDef, type Slot } from '../data/parts/types';
import { equip } from '../data/profile/ops';
import type { Profile } from '../data/profile/profile';
import { Button, Modal, Panel, type ModalHandle } from '../ui/kit';
import { el } from '../ui/dom';
import { carSvg, lookOf } from './carSvg';
import type { Dispose } from './context';
import { SLOT_ICONS, cosmeticSwatch, itemIcon, itemLines } from './itemView';
import { equipItem, unequip, upgrade } from './economy';
import { getProfile, onProfileChange } from './profile';
import { playSound } from './sound';

type Target = { type: 'slot'; slot: Slot } | { type: 'cosmetic'; kind: CosmeticKind };

const COSMETIC_KINDS: CosmeticKind[] = ['paint', 'number', 'helmet'];
const rarityRank = (i: ItemDef) => RARITIES.indexOf(i.rarity);

const statsOf = (p: Profile): StatRow[] => statRows(modsForLoadout(p.loadout, p.owned), startPointsFor(DEFAULT_CONFIG));

/** Rows whose value changes between two profiles, with before and after. */
export function statDiff(before: Profile, after: Profile): { label: string; from: number; to: number }[] {
  const a = statsOf(before);
  const b = statsOf(after);
  return a.flatMap((row, i) => (row.value === b[i].value ? [] : [{ label: row.label, from: row.value, to: b[i].value }]));
}

const equippedId = (p: Profile, t: Target): string | undefined => (t.type === 'slot' ? p.loadout.parts[t.slot] : p.loadout[t.kind]);

/** Garage tab: the car in the middle, slots around it, stats below, item sheet on tap. */
export function mountGarage(page: HTMLElement): Dispose {
  const root = el('div', { class: 'tab-garage', 'data-testid': 'garage' });
  page.append(root);
  let sheet: ModalHandle | null = null;

  function draw(): void {
    const p = getProfile();
    const car = el('div', { class: 'car', 'data-testid': 'car' });
    car.innerHTML = carSvg(lookOf(p.loadout));

    const slotButton = (slot: Slot) => {
      const id = p.loadout.parts[slot];
      const part = id ? getPart(id) : undefined;
      const b = Button({
        variant: 'ghost',
        silent: false,
        attrs: { 'data-slot': slot, 'aria-label': `${SLOT_LABELS[slot]} : ${part ? part.name : 'vide'}` },
        children: [
          el('span', { class: 'slot-head' }, el('span', { class: 'slot-name', text: SLOT_LABELS[slot] }), part ? el('span', { class: 'slot-level', text: `Niv. ${p.owned[part.id]}` }) : null),
          el('span', { class: 'slot-icon', 'aria-hidden': 'true', text: SLOT_ICONS[slot] }),
          el('span', { class: 'slot-part', text: part ? part.name : 'Vide' }),
        ],
        onClick: () => openSheet({ type: 'slot', slot }),
      });
      b.classList.add('slot-btn', part ? `rarity-${part.rarity}` : 'empty');
      return b;
    };

    const cosmeticButton = (kind: CosmeticKind) => {
      const id = p.loadout[kind];
      const item = id ? getItem(id) : undefined;
      const b = Button({
        variant: 'ghost',
        attrs: { 'data-cosmetic': kind, 'aria-label': `${COSMETIC_LABELS[kind]} : ${item ? item.name : 'par défaut'}` },
        children: [el('span', { class: 'slot-name', text: COSMETIC_LABELS[kind] }), el('span', { class: 'slot-part', text: item ? item.name : 'Par défaut' })],
        onClick: () => openSheet({ type: 'cosmetic', kind }),
      });
      b.classList.add('cos-btn', item ? `rarity-${item.rarity}` : 'empty');
      return b;
    };

    const rows = statsOf(p);
    const stats = el(
      'dl',
      { class: 'stats', 'data-testid': 'stats' },
      ...rows.filter((r) => r.key.startsWith('wear-') || r.value > 0).flatMap((r) => [el('dt', { text: r.label }), el('dd', { 'data-stat': r.key, text: String(r.value) })]),
    );

    root.replaceChildren(
      el('div', { class: 'tab-head' }, el('h1', { class: 'tab-title', text: 'Garage' }), el('span', { class: 'counter', 'data-testid': 'fragments', text: `🔷 ${p.fragments} fragments` })),
      el(
        'div',
        { class: 'garage-grid' },
        el('div', { class: 'col' }, ...(['engine', 'gearbox', 'chassis'] as Slot[]).map(slotButton)),
        car,
        el('div', { class: 'col' }, ...(['brakes', 'tires', 'wing'] as Slot[]).map(slotButton)),
      ),
      el('div', { class: 'cos-row' }, ...COSMETIC_KINDS.map(cosmeticButton)),
      Panel({ tone: 'dark', title: 'Statistiques', children: [stats] }),
    );
  }

  function openSheet(target: Target): void {
    const owned = ITEMS.filter((i) => getProfile().owned[i.id] && (target.type === 'slot' ? i.kind === 'part' && i.slot === target.slot : i.kind === 'cosmetic' && i.cosmetic === target.kind)).sort(
      (a, b) => rarityRank(b) - rarityRank(a) || a.name.localeCompare(b.name, 'fr'),
    );
    let selected: string | undefined = equippedId(getProfile(), target) ?? owned[0]?.id;
    const title = target.type === 'slot' ? SLOT_LABELS[target.slot] : COSMETIC_LABELS[target.kind];
    sheet = Modal({ title, variant: 'sheet', testid: 'sheet', onClose: () => (sheet = null) });

    function render(): void {
      const p = getProfile();
      const sel = selected ? getItem(selected) : undefined;
      const isEquipped = !!sel && equippedId(p, target) === sel.id;
      const level = sel ? p.owned[sel.id] : 1;

      const list = owned.length
        ? el(
            'ul',
            { class: 'item-list', 'data-testid': 'item-list' },
            ...owned.map((item) => {
              const b = Button({
                variant: 'ghost',
                attrs: { 'data-item': item.id, 'aria-pressed': String(item.id === selected) },
                children: [
                  el('span', { class: 'icon', 'aria-hidden': 'true', text: itemIcon(item) }),
                  el(
                    'span',
                    { class: 'info' },
                    el('b', { text: item.name }),
                    el('small', { text: `${RARITY_LABELS[item.rarity]}${item.kind === 'part' ? ` · Niv. ${p.owned[item.id]}` : ''}${equippedId(p, target) === item.id ? ' · Équipé' : ''}` }),
                    el('small', { class: 'fx', text: itemLines(item, p.owned[item.id]).join(' · ') }),
                  ),
                  cosmeticSwatch(item),
                ],
                onClick: () => {
                  selected = item.id;
                  render();
                },
              });
              b.classList.add('item-row', `rarity-${item.rarity}`);
              return el('li', {}, b);
            }),
          )
        : el('p', { class: 'muted', text: 'Aucun objet pour cet emplacement. Ouvrez des paquets pour en trouver !' });

      // preview: what changes if this item replaces the current one
      let preview: HTMLElement | null = null;
      if (sel && !isEquipped) {
        const after = equip(p, sel.id);
        if (after) {
          if (sel.kind === 'part') {
            const diff = statDiff(p, after);
            preview = el(
              'div',
              { class: 'preview', 'data-testid': 'preview' },
              el('h3', { text: 'Aperçu' }),
              diff.length
                ? el('ul', {}, ...diff.map((d) => el('li', { class: d.to > d.from ? 'up' : 'down' }, el('span', { text: d.label }), el('b', { text: `${d.from} → ${d.to}` }))))
                : el('p', { class: 'muted', text: 'Aucun changement de statistiques.' }),
            );
          } else {
            const look = el('div', { class: 'car mini' });
            look.innerHTML = carSvg(lookOf(after.loadout));
            preview = el('div', { class: 'preview', 'data-testid': 'preview' }, el('h3', { text: 'Aperçu' }), look, el('p', { class: 'muted', text: 'Cosmétique : aucun effet sur la course.' }));
          }
        }
      }

      const actions: HTMLElement[] = [];
      if (sel) {
        actions.push(
          isEquipped
            ? Button({
                text: 'Retirer',
                variant: 'ghost',
                onClick: async () => {
                  await unequip(target);
                  sheet?.close();
                },
              })
            : Button({
                text: 'Équiper',
                variant: 'green',
                onClick: async () => {
                  if (!(await equipItem(sel.id))) return;
                  playSound('confirm');
                  sheet?.close();
                },
              }),
        );
        if (sel.kind === 'part') {
          const cost = upgradeCost(sel.rarity, level);
          actions.push(
            Button({
              text: cost === null ? 'Niveau maximum' : `Améliorer · 🔷 ${cost}`,
              variant: 'yellow',
              attrs: { 'data-action': 'upgrade' },
              disabled: cost === null || p.fragments < cost,
              onClick: async () => {
                await upgrade(sel.id);
                playSound('levelup');
                render();
              },
            }),
          );
        }
      }
      const next = sel && sel.kind === 'part' && level < MAX_LEVEL ? el('p', { class: 'muted', text: `Niveau ${level + 1} : ${itemLines(sel, level + 1).join(' · ')}` }) : null;

      const host = sheet!;
      host.body.replaceChildren(list, ...(preview ? [preview] : []), ...(next ? [next] : []));
      let footer = host.el.querySelector('.kit-modal__actions');
      if (!footer) {
        footer = el('footer', { class: 'kit-modal__actions' });
        host.el.querySelector('.kit-modal')!.append(footer);
      }
      footer.replaceChildren(...actions);
    }
    render();
  }

  draw();
  const off = onProfileChange(draw);
  return () => {
    off();
    sheet?.close();
  };
}
