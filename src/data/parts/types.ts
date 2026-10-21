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

/**
 * Declarative effect of a part. The engine applies them through CarMods hooks, nothing here runs
 * game logic. Value at level L = floor(amount + perLevel * (L - 1)); perLevel defaults depend on
 * the kind (wear grows by 1 per level, the rest by 1 at level 5).
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
