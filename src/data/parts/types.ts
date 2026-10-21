import type { WearCategory } from '../../engine/types';

export const SLOTS = ['engine', 'gearbox', 'brakes', 'tires', 'wing', 'chassis'] as const;
export type Slot = (typeof SLOTS)[number];

export const SLOT_LABELS: Record<Slot, string> = {
  engine: 'Moteur',
  gearbox: 'Boîte',
  brakes: 'Freins',
  tires: 'Pneus',
  wing: 'Aileron',
  chassis: 'Châssis',
};

export const RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_LABELS: Record<Rarity, string> = {
  common: 'Commune',
  rare: 'Rare',
  epic: 'Épique',
  legendary: 'Légendaire',
};

export const MAX_LEVEL = 5;

/** The three styles of parts (docs/gdd/10-stats-voitures.md § 10.5): three of one family give a bonus, five give a bigger one. */
export const FAMILIES = ['speed', 'endurance', 'precision'] as const;
export type Family = (typeof FAMILIES)[number];

export const FAMILY_LABELS: Record<Family, string> = { speed: 'Vitesse', endurance: 'Endurance', precision: 'Précision' };

/** The gauge of each slot: levels 2 and 4 of a part add a point to it. */
export const SLOT_GAUGE: Record<Slot, WearCategory> = { engine: 'engine', gearbox: 'gearbox', brakes: 'brakes', tires: 'tires', wing: 'handling', chassis: 'body' };

/** The secondary gauge of each family: level 3 (and 5) of a part, and three parts of the family, add a point to it. */
export const FAMILY_SECONDARY: Record<Family, WearCategory> = { speed: 'engine', endurance: 'tires', precision: 'handling' };

/**
 * Declarative effect of a part. The engine applies them through CarMods hooks, nothing here runs
 * game logic. The main effect of a part gains 1 at level 5; the gauge points of levels 2 to 5 come from the part's slot and
 * family (effects.ts). A negative amount is a drawback (epic and legendary parts): it does not grow with the level.
 */
export type Effect =
  | { kind: 'wear'; category: WearCategory; amount: number; perLevel?: number }
  | { kind: 'reroll'; amount: number; perLevel?: number }
  | { kind: 'freeStop'; amount: number; perLevel?: number }
  | { kind: 'downshiftDiscount'; amount: number; perLevel?: number }
  | { kind: 'overshootTireDiscount'; amount: number; perLevel?: number }
  | { kind: 'blockBrakeDiscount'; amount: number; perLevel?: number }
  | { kind: 'rollWearDiscount'; category: WearCategory; amount: number; perLevel?: number }
  | { kind: 'moveBonus'; gears: number[] | 'all'; amount: number; perLevel?: number };

export interface PartDef {
  kind: 'part';
  id: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  family: Family;
  effects: Effect[];
}

export type CosmeticKind = 'paint' | 'number' | 'helmet';

export const COSMETIC_LABELS: Record<CosmeticKind, string> = { paint: 'Peinture', number: 'Numéro', helmet: 'Casque' };

export interface CosmeticDef {
  kind: 'cosmetic';
  id: string;
  name: string;
  cosmetic: CosmeticKind;
  rarity: Rarity;
  /** paint / helmet: 0xRRGGBB colour; number: the race number. */
  value: number;
}

export type ItemDef = PartDef | CosmeticDef;

export interface Loadout {
  parts: Partial<Record<Slot, string>>;
  paint?: string;
  number?: string;
  helmet?: string;
}

export const emptyLoadout = (): Loadout => ({ parts: {} });
