import type { WearCategory } from '../../engine/types';
import type { CosmeticDef, CosmeticKind, Effect, Family, ItemDef, PartDef, Rarity, Slot } from './types';

const wear = (category: WearCategory, amount: number, perLevel?: number): Effect => ({ kind: 'wear', category, amount, perLevel });

/** A drawback of an epic or legendary part: fewer points of a gauge, at every level. */
const cost = (category: WearCategory, amount: number): Effect => ({ kind: 'wear', category, amount: -amount, perLevel: 0 });

const part = (id: string, name: string, slot: Slot, rarity: Rarity, family: Family, ...effects: Effect[]): PartDef => ({
  kind: 'part',
  id,
  name,
  slot,
  rarity,
  family,
  effects,
});

export const PARTS: PartDef[] = [
  // Moteur
  part('eng-stock', 'Bloc de série renforcé', 'engine', 'common', 'endurance', wear('engine', 2)),
  part('eng-cooler', 'Radiateur surdimensionné', 'engine', 'common', 'precision', { kind: 'rollWearDiscount', category: 'engine', amount: 1 }),
  part('eng-turbo', 'Turbo calibré', 'engine', 'rare', 'speed', wear('engine', 2), { kind: 'moveBonus', gears: [5], amount: 1 }),
  part('eng-v8', 'V8 Sport', 'engine', 'epic', 'speed', wear('engine', 3), { kind: 'moveBonus', gears: [4, 5, 6], amount: 1 }, cost('gearbox', 1)),
  part('eng-hybrid', 'Hybride prototype', 'engine', 'legendary', 'speed', { kind: 'moveBonus', gears: [4, 5, 6], amount: 1 }, { kind: 'rollWearDiscount', category: 'engine', amount: 1 }, wear('engine', 2), cost('gearbox', 1)),
  // Boîte
  part('gbx-stock', 'Carter renforcé', 'gearbox', 'common', 'endurance', wear('gearbox', 2)),
  part('gbx-oil', 'Huile racing', 'gearbox', 'common', 'speed', wear('gearbox', 1), wear('engine', 1)),
  part('gbx-clutch', 'Embrayage souple', 'gearbox', 'rare', 'precision', { kind: 'downshiftDiscount', amount: 1 }),
  part('gbx-seq', 'Séquentielle', 'gearbox', 'epic', 'precision', { kind: 'downshiftDiscount', amount: 1 }, wear('gearbox', 3), cost('engine', 1)),
  part('gbx-dct', 'Double embrayage', 'gearbox', 'legendary', 'precision', { kind: 'downshiftDiscount', amount: 2 }, wear('gearbox', 2), cost('engine', 1), cost('brakes', 1)),
  // Freins
  part('brk-stock', 'Plaquettes durcies', 'brakes', 'common', 'endurance', wear('brakes', 2)),
  part('brk-vent', 'Disques ventilés', 'brakes', 'common', 'endurance', wear('brakes', 1), wear('tires', 1)),
  part('brk-abs', 'ABS de course', 'brakes', 'rare', 'precision', { kind: 'blockBrakeDiscount', amount: 1 }),
  part('brk-carbon', 'Carbone-céramique', 'brakes', 'epic', 'precision', { kind: 'freeStop', amount: 1 }, wear('brakes', 4), cost('tires', 1)),
  part('brk-recup', 'Freinage régénératif', 'brakes', 'legendary', 'precision', { kind: 'freeStop', amount: 1 }, { kind: 'blockBrakeDiscount', amount: 1 }, wear('brakes', 3), cost('tires', 1)),
  // Pneus
  part('tir-stock', 'Gommes tendres', 'tires', 'common', 'speed', wear('tires', 2)),
  part('tir-wet', 'Mixtes polyvalents', 'tires', 'common', 'precision', wear('tires', 1), wear('handling', 1)),
  part('tir-grip', 'Slicks adhérents', 'tires', 'rare', 'precision', { kind: 'overshootTireDiscount', amount: 1 }),
  part('tir-pro', 'Slicks pro', 'tires', 'epic', 'endurance', { kind: 'overshootTireDiscount', amount: 1 }, wear('tires', 3), cost('handling', 1)),
  part('tir-proto', 'Gommes prototype', 'tires', 'legendary', 'endurance', { kind: 'overshootTireDiscount', amount: 1 }, wear('tires', 4), wear('handling', 2), cost('brakes', 1)),
  // Aileron
  part('wng-stock', 'Aileron fixe', 'wing', 'common', 'precision', wear('handling', 2)),
  part('wng-flap', 'Volet additionnel', 'wing', 'common', 'speed', wear('handling', 1), wear('body', 1)),
  part('wng-drs', 'Aileron mobile', 'wing', 'rare', 'precision', { kind: 'reroll', amount: 1 }),
  part('wng-active', 'Aérodynamique active', 'wing', 'epic', 'speed', { kind: 'reroll', amount: 1 }, wear('handling', 3), cost('handling', 1)),
  part('wng-wind', 'Soufflerie parfaite', 'wing', 'legendary', 'precision', { kind: 'reroll', amount: 2 }, wear('handling', 3), cost('body', 1), cost('engine', 1)),
  // Châssis
  part('chs-stock', 'Cage renforcée', 'chassis', 'common', 'endurance', wear('body', 2)),
  part('chs-light', 'Panneaux allégés', 'chassis', 'common', 'speed', wear('body', 1), wear('handling', 1)),
  part('chs-alu', 'Monocoque alu', 'chassis', 'rare', 'endurance', wear('body', 4)),
  part('chs-ti', 'Titane usiné', 'chassis', 'epic', 'endurance', wear('body', 3), wear('handling', 3), wear('brakes', 1), cost('tires', 1)),
  part('chs-carbon', 'Monocoque carbone', 'chassis', 'legendary', 'endurance', wear('body', 4), wear('handling', 1), wear('tires', 1), wear('brakes', 1), wear('gearbox', 1), wear('engine', 1), cost('engine', 1)),
];

const cosmetic = (id: string, name: string, kind: CosmeticKind, rarity: Rarity, value: number): CosmeticDef => ({
  kind: 'cosmetic',
  id,
  name,
  cosmetic: kind,
  rarity,
  value,
});

export const COSMETICS: CosmeticDef[] = [
  cosmetic('paint-white', 'Blanc glacier', 'paint', 'common', 0xf2f4f7),
  cosmetic('paint-orange', 'Orange mécanique', 'paint', 'common', 0xff8f1f),
  cosmetic('paint-teal', 'Turquoise lagon', 'paint', 'common', 0x14b8a6),
  cosmetic('paint-lime', 'Vert acide', 'paint', 'rare', 0x9be21b),
  cosmetic('paint-pink', 'Rose bonbon', 'paint', 'rare', 0xff5fa8),
  cosmetic('paint-gold', 'Or sprint', 'paint', 'epic', 0xf5c542),
  cosmetic('paint-violet', 'Violet nébuleuse', 'paint', 'epic', 0x7c3aed),
  cosmetic('paint-chrome', 'Chrome liquide', 'paint', 'legendary', 0xcfd8e3),
  cosmetic('num-7', 'Numéro 7', 'number', 'common', 7),
  cosmetic('num-13', 'Numéro 13', 'number', 'common', 13),
  cosmetic('num-27', 'Numéro 27', 'number', 'rare', 27),
  cosmetic('num-42', 'Numéro 42', 'number', 'rare', 42),
  cosmetic('num-69', 'Numéro 69', 'number', 'epic', 69),
  cosmetic('num-99', 'Numéro 99', 'number', 'legendary', 99),
  cosmetic('hlm-red', 'Casque rouge', 'helmet', 'common', 0xe53935),
  cosmetic('hlm-blue', 'Casque bleu', 'helmet', 'common', 0x1e88e5),
  cosmetic('hlm-green', 'Casque vert', 'helmet', 'rare', 0x43a047),
  cosmetic('hlm-black', 'Casque noir mat', 'helmet', 'rare', 0x20242b),
  cosmetic('hlm-gold', 'Casque doré', 'helmet', 'epic', 0xf5c542),
  cosmetic('hlm-rainbow', 'Casque arc-en-ciel', 'helmet', 'legendary', 0xff4fd8),
];

export const ITEMS: ItemDef[] = [...PARTS, ...COSMETICS];

const byId = new Map<string, ItemDef>(ITEMS.map((i) => [i.id, i]));

export const getItem = (id: string): ItemDef | undefined => byId.get(id);
export const getPart = (id: string): PartDef | undefined => {
  const i = byId.get(id);
  return i?.kind === 'part' ? i : undefined;
};
export const getCosmetic = (id: string): CosmeticDef | undefined => {
  const i = byId.get(id);
  return i?.kind === 'cosmetic' ? i : undefined;
};

export const itemsOfRarity = (rarity: Rarity): ItemDef[] => ITEMS.filter((i) => i.rarity === rarity);
