import { NO_MODS, WEAR_CATEGORIES, type CarMods, type Wear, type WearCategory } from '../../engine/types';
import { getPart } from './catalogue';
import { FAMILIES, FAMILY_SECONDARY, MAX_LEVEL, SLOTS, SLOT_GAUGE, type Effect, type Family, type Loadout, type PartDef } from './types';

export const clampLevel = (level: number | undefined): number => Math.min(MAX_LEVEL, Math.max(1, Math.floor(level ?? 1)));

/**
 * Index of the main effect of a part: the first effect that is neither a gauge, nor cells of the die, nor a relance, else the first gauge it
 * raises (a drawback is never the main effect). The main effect gains 1 at level 5 (docs/gdd/10-stats-voitures.md § 10.3). Cells of the die
 * and relances never grow with the level: each is worth 7 to 10 points of victories (docs/equilibrage-pieces.md).
 */
export function mainEffectIndex(part: Pick<PartDef, 'effects'>): number {
  const special = part.effects.findIndex((e) => e.kind !== 'wear' && e.kind !== 'moveBonus' && e.kind !== 'reroll' && e.amount > 0);
  return special >= 0 ? special : part.effects.findIndex((e) => e.kind === 'wear' && e.amount > 0);
}

/** Value of an effect at a part level: its amount (a drawback stays as it is), +1 at level 5 when it is the main effect. */
export function effectValue(effect: Effect, level: number, isMain = true): number {
  const lvl = clampLevel(level);
  const grown = Math.floor(effect.amount + (effect.perLevel ?? 0) * (lvl - 1) + 1e-9);
  const grows = isMain && effect.kind !== 'moveBonus' && effect.kind !== 'reroll';
  return grown + (grows && effect.amount > 0 && lvl >= MAX_LEVEL ? 1 : 0);
}

/** A drawback found among the effects, to be eased by a series of five (§ 10.5). */
type Penalty = { kind: 'wear'; category: WearCategory; size: number } | { kind: 'move'; gears: number[] | 'all'; size: number };

function applyEffect(mods: CarMods, e: Effect, v: number, penalties: Penalty[]): void {
  switch (e.kind) {
    case 'wear':
      mods.wearBonus[e.category] = (mods.wearBonus[e.category] ?? 0) + v;
      if (v < 0) penalties.push({ kind: 'wear', category: e.category, size: -v });
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
      if (v < 0) penalties.push({ kind: 'move', gears: e.gears === 'all' ? 'all' : [...e.gears], size: -v });
      break;
  }
}

/** What a series of five parts of a family adds on top of the series of three (§ 10.5). */
function familyBonus(mods: CarMods, family: Family): void {
  if (family === 'speed') {
    // not a cell of the die: a cell is worth about 9 points of victories (docs/equilibrage-pieces.md)
    mods.wearBonus.gearbox = (mods.wearBonus.gearbox ?? 0) + 1;
  }
  else if (family === 'endurance') mods.freeStops += 1;
  else mods.rerolls += 1;
}

/**
 * Folds the declarative effects of the equipped parts into the modifiers the engine reads (§ 10.3 to § 10.5): the effects at
 * their level, the gauge points of levels 2 to 5, then the bonus of the families (three parts: a point on the secondary
 * gauge; five: the biggest drawback eased by one and a bonus of the family).
 */
export function modsFor(parts: { part: PartDef; level: number }[]): CarMods {
  const mods: CarMods = { ...NO_MODS, wearBonus: {}, rollWearDiscount: {}, moveBonus: [] };
  const penalties: Penalty[] = [];
  const addGauge = (category: WearCategory, n: number) => {
    if (n !== 0) mods.wearBonus[category] = (mods.wearBonus[category] ?? 0) + n;
  };
  const counts = new Map<Family, number>();
  for (const { part, level } of parts) {
    const lvl = clampLevel(level);
    const main = mainEffectIndex(part);
    part.effects.forEach((e, i) => applyEffect(mods, e, effectValue(e, lvl, i === main), penalties));
    // levels 2 and 4: the gauge of the slot; levels 3 and 5: the secondary gauge of the family
    addGauge(SLOT_GAUGE[part.slot], (lvl >= 2 ? 1 : 0) + (lvl >= 4 ? 1 : 0));
    addGauge(FAMILY_SECONDARY[part.family], (lvl >= 3 ? 1 : 0) + (lvl >= 5 ? 1 : 0));
    counts.set(part.family, (counts.get(part.family) ?? 0) + 1);
  }
  for (const family of FAMILIES) {
    const n = counts.get(family) ?? 0;
    if (n >= 3) addGauge(FAMILY_SECONDARY[family], 1);
    if (n >= 5) {
      const worst = penalties.reduce<Penalty | undefined>((best, p) => (!best || p.size > best.size ? p : best), undefined);
      if (worst?.kind === 'wear') addGauge(worst.category, 1);
      else if (worst) mods.moveBonus.push({ gears: worst.gears, amount: 1 });
      familyBonus(mods, family);
    }
  }
  return mods;
}

/** Which equipped part gives each effect the race can show (the engine only knows the numbers, § 10.6). */
export type EffectSources = Partial<Record<'dice' | 'freeStop' | 'reroll' | 'overshoot' | 'block' | 'downshift', string>>;

/** The first equipped part that gives each kind of effect, for the messages of the race. */
export function effectSources(parts: PartDef[]): EffectSources {
  const out: EffectSources = {};
  const kinds: [keyof EffectSources, Effect['kind']][] = [
    ['dice', 'moveBonus'],
    ['freeStop', 'freeStop'],
    ['reroll', 'reroll'],
    ['overshoot', 'overshootTireDiscount'],
    ['block', 'blockBrakeDiscount'],
    ['downshift', 'downshiftDiscount'],
  ];
  for (const [key, kind] of kinds) {
    const found = parts.find((p) => p.effects.some((e) => e.kind === kind && e.amount > 0));
    if (found) out[key] = found.name;
  }
  return out;
}

/** The parts equipped in a loadout (those that are owned and sit in their slot). */
export function equippedParts(loadout: Loadout, owned: Record<string, number>): PartDef[] {
  const out: PartDef[] = [];
  for (const slot of SLOTS) {
    const id = loadout.parts[slot];
    const part = id ? getPart(id) : undefined;
    if (part && part.slot === slot && owned[part.id]) out.push(part);
  }
  return out;
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

/** The gauge points a part's level gives on top of its effects (levels 2 to 5, § 10.3), as short French lines. */
export function levelLines(part: PartDef, level: number): string[] {
  const lvl = clampLevel(level);
  const slot = (lvl >= 2 ? 1 : 0) + (lvl >= 4 ? 1 : 0);
  const second = (lvl >= 3 ? 1 : 0) + (lvl >= 5 ? 1 : 0);
  const out: string[] = [];
  const line = (n: number, category: WearCategory) => `+${n} point${n > 1 ? 's' : ''} de ${CAT_LABELS[category].toLowerCase()} (niveau ${lvl})`;
  if (slot > 0) out.push(line(slot, SLOT_GAUGE[part.slot]));
  if (second > 0) out.push(line(second, FAMILY_SECONDARY[part.family]));
  return out;
}

/** Short French sentence for one effect at a level ("+3 usure moteur"). */
export function describeEffect(e: Effect, level: number, isMain = true): string {
  const v = effectValue(e, level, isMain);
  if (v < 0) {
    if (e.kind === 'wear') return `−${-v} point${-v > 1 ? 's' : ''} de ${CAT_LABELS[e.category].toLowerCase()} (contrepartie)`;
    if (e.kind === 'moveBonus') return `−${-v} case${-v > 1 ? 's' : ''} ${e.gears === 'all' ? 'à tous les rapports' : `au${e.gears.length > 1 ? 'x' : ''} rapport${e.gears.length > 1 ? 's' : ''} ${e.gears.join(', ')}`} (contrepartie)`;
  }
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
