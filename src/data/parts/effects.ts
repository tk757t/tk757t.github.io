import { NO_MODS, WEAR_CATEGORIES, type CarMods, type Wear } from '../../engine/types';
import { getPart } from './catalogue';
import { MAX_LEVEL, SLOTS, type Effect, type Loadout, type PartDef } from './types';

const DEFAULT_PER_LEVEL: Record<Effect['kind'], number> = {
  wear: 1,
  reroll: 0.25,
  freeStop: 0.25,
  downshiftDiscount: 0.25,
  overshootTireDiscount: 0.25,
  blockBrakeDiscount: 0.25,
  rollWearDiscount: 0.25,
  moveBonus: 0.25,
};

export const clampLevel = (level: number | undefined): number => Math.min(MAX_LEVEL, Math.max(1, Math.floor(level ?? 1)));

/** Value of an effect at a part level. */
export function effectValue(effect: Effect, level: number): number {
  const per = effect.perLevel ?? DEFAULT_PER_LEVEL[effect.kind];
  return Math.floor(effect.amount + per * (clampLevel(level) - 1) + 1e-9);
}

/** Folds the declarative effects of the equipped parts into the modifiers the engine reads. */
export function modsFor(parts: { part: PartDef; level: number }[]): CarMods {
  const mods: CarMods = { ...NO_MODS, wearBonus: {}, rollWearDiscount: {}, moveBonus: [] };
  for (const { part, level } of parts) {
    for (const e of part.effects) {
      const v = effectValue(e, level);
      switch (e.kind) {
        case 'wear':
          mods.wearBonus[e.category] = (mods.wearBonus[e.category] ?? 0) + v;
          break;
        case 'reroll':
          mods.rerolls += v;
          break;
        case 'freeStop':
          mods.freeStops += v;
          break;
        case 'downshiftDiscount':
          mods.downshiftDiscount += v;
          break;
        case 'overshootTireDiscount':
          mods.overshootTireDiscount += v;
          break;
        case 'blockBrakeDiscount':
          mods.blockBrakeDiscount += v;
          break;
        case 'rollWearDiscount':
          mods.rollWearDiscount[e.category] = (mods.rollWearDiscount[e.category] ?? 0) + v;
          break;
        case 'moveBonus':
          mods.moveBonus.push({ gears: e.gears === 'all' ? 'all' : [...e.gears], amount: v });
          break;
      }
    }
  }
  return mods;
}

/** Mods of a loadout given the levels of the owned parts. Unknown / unowned parts are ignored. */
export function modsForLoadout(loadout: Loadout, owned: Record<string, number>): CarMods {
  const equipped: { part: PartDef; level: number }[] = [];
  for (const slot of SLOTS) {
    const id = loadout.parts[slot];
    const part = id ? getPart(id) : undefined;
    if (part && part.slot === slot && owned[part.id]) equipped.push({ part, level: owned[part.id] });
  }
  return modsFor(equipped);
}

export interface StatRow {
  key: string;
  label: string;
  value: number;
  /** True when a higher value is better (all of them today). */
  unit?: string;
}

const CAT_LABELS = { tires: 'Pneus', brakes: 'Freins', gearbox: 'Boîte', body: 'Carrosserie', engine: 'Moteur', handling: 'Tenue de route' } as const;

/** Human readable stats of a set of mods, for the garage preview. */
export function statRows(mods: CarMods, base: Wear): StatRow[] {
  const rows: StatRow[] = WEAR_CATEGORIES.map((c) => ({
    key: `wear-${c}`,
    label: `Points · ${CAT_LABELS[c]}`,
    value: base[c] + (mods.wearBonus[c] ?? 0),
  }));
  rows.push(
    { key: 'rerolls', label: 'Relances par course', value: mods.rerolls },
    { key: 'freeStops', label: 'Arrêts gratuits en virage', value: mods.freeStops },
    { key: 'downshift', label: 'Rapports offerts à la rétrogradation', value: mods.downshiftDiscount },
    { key: 'overshoot', label: 'Pneus épargnés si virage raté', value: mods.overshootTireDiscount },
    { key: 'block', label: 'Carrosserie épargnée si une voiture barre la route', value: mods.blockBrakeDiscount },
    { key: 'strain', label: 'Jet moteur : seuil en moins', value: mods.rollWearDiscount.engine ?? 0 },
    { key: 'move', label: 'Cases bonus (rapports 1 à 6)', value: mods.moveBonus.reduce((sum, b) => sum + b.amount * (b.gears === 'all' ? 6 : b.gears.length), 0) },
  );
  return rows;
}

/** Short French sentence for one effect at a level ("+3 usure moteur"). */
export function describeEffect(e: Effect, level: number): string {
  const v = effectValue(e, level);
  switch (e.kind) {
    case 'wear':
      return `+${v} point${v > 1 ? 's' : ''} de ${CAT_LABELS[e.category].toLowerCase()}`;
    case 'reroll':
      return `${v} relance${v > 1 ? 's' : ''} par course`;
    case 'freeStop':
      return `${v} arrêt${v > 1 ? 's' : ''} gratuit${v > 1 ? 's' : ''} en virage`;
    case 'downshiftDiscount':
      return `rétrogradation : ${v} rapport${v > 1 ? 's' : ''} offert${v > 1 ? 's' : ''}`;
    case 'overshootTireDiscount':
      return `−${v} pneu perdu en virage raté`;
    case 'blockBrakeDiscount':
      return `−${v} frein quand bloqué`;
    case 'rollWearDiscount':
      return `jet moteur moins risqué (seuil −${v})`;
    case 'moveBonus':
      return `+${v} case${v > 1 ? 's' : ''} ${e.gears === 'all' ? 'à tous les rapports' : `aux rapports ${e.gears.join(', ')}`}`;
  }
}
