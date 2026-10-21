import type { WearCategory } from '../../engine/types';
import type { CosmeticDef, CosmeticKind, Effect, ItemDef, PartDef, Rarity, Slot } from './types';

const wear = (category: WearCategory, amount: number, perLevel?: number): Effect => ({ kind: 'wear', category, amount, perLevel });

const part = (id: string, name: string, slot: Slot, rarity: Rarity, ...effects: Effect[]): PartDef => ({
  kind: 'part',
  id,
  name,
  slot,
  rarity,
  effects,
});

export const PARTS: PartDef[] = [
  // Moteur
  part('eng-stock', 'Bloc de série renforcé', 'engine', 'common', wear('engine', 2)),
  part('eng-cooler', 'Radiateur surdimensionné', 'engine', 'common', { kind: 'rollWearDiscount', category: 'engine', amount: 1 }),
  part('eng-turbo', 'Turbo calibré', 'engine', 'rare', wear('engine', 2), { kind: 'moveBonus', gears: [4], amount: 1 }),
  part('eng-v8', 'V8 Sport', 'engine', 'epic', wear('engine', 3), { kind: 'moveBonus', gears: [4, 5, 6], amount: 1 }),
  part('eng-hybrid', 'Hybride prototype', 'engine', 'legendary', { kind: 'moveBonus', gears: 'all', amount: 1 }, { kind: 'rollWearDiscount', category: 'engine', amount: 1 }, wear('engine', 2)),
  // Boîte
  part('gbx-stock', 'Carter renforcé', 'gearbox', 'common', wear('gearbox', 2)),
  part('gbx-oil', 'Huile racing', 'gearbox', 'common', wear('gearbox', 1), wear('engine', 1)),
  part('gbx-clutch', 'Embrayage souple', 'gearbox', 'rare', { kind: 'downshiftDiscount', amount: 1 }),
  part('gbx-seq', 'Séquentielle', 'gearbox', 'epic', { kind: 'downshiftDiscount', amount: 1 }, wear('gearbox', 3)),
  part('gbx-dct', 'Double embrayage', 'gearbox', 'legendary', { kind: 'downshiftDiscount', amount: 2 }, wear('gearbox', 2)),
  // Freins
  part('brk-stock', 'Plaquettes durcies', 'brakes', 'common', wear('brakes', 2)),
  part('brk-vent', 'Disques ventilés', 'brakes', 'common', wear('brakes', 1), wear('tires', 1)),
  part('brk-abs', 'ABS de course', 'brakes', 'rare', { kind: 'blockBrakeDiscount', amount: 1 }),
  part('brk-carbon', 'Carbone-céramique', 'brakes', 'epic', { kind: 'freeStop', amount: 1 }),
  part('brk-recup', 'Freinage régénératif', 'brakes', 'legendary', { kind: 'freeStop', amount: 1 }, { kind: 'blockBrakeDiscount', amount: 1 }, wear('brakes', 3)),
  // Pneus
  part('tir-stock', 'Gommes tendres', 'tires', 'common', wear('tires', 2)),
  part('tir-wet', 'Mixtes polyvalents', 'tires', 'common', wear('tires', 1), wear('handling', 1)),
  part('tir-grip', 'Slicks adhérents', 'tires', 'rare', { kind: 'overshootTireDiscount', amount: 1 }),
  part('tir-pro', 'Slicks pro', 'tires', 'epic', { kind: 'overshootTireDiscount', amount: 1 }, wear('tires', 3)),
  part('tir-proto', 'Gommes prototype', 'tires', 'legendary', { kind: 'overshootTireDiscount', amount: 1 }, wear('tires', 4), wear('handling', 2)),
  // Aileron
  part('wng-stock', 'Aileron fixe', 'wing', 'common', wear('handling', 2)),
  part('wng-flap', 'Volet additionnel', 'wing', 'common', wear('handling', 1), wear('body', 1)),
  part('wng-drs', 'Aileron mobile', 'wing', 'rare', { kind: 'reroll', amount: 1 }),
  part('wng-active', 'Aérodynamique active', 'wing', 'epic', { kind: 'reroll', amount: 1 }, { kind: 'moveBonus', gears: [1, 2, 3], amount: 1 }),
  part('wng-wind', 'Soufflerie parfaite', 'wing', 'legendary', { kind: 'reroll', amount: 2 }, wear('handling', 3)),
  // Châssis
  part('chs-stock', 'Cage renforcée', 'chassis', 'common', wear('body', 2)),
  part('chs-light', 'Panneaux allégés', 'chassis', 'common', wear('body', 1), wear('handling', 1)),
  part('chs-alu', 'Monocoque alu', 'chassis', 'rare', wear('body', 4)),
  part('chs-ti', 'Titane usiné', 'chassis', 'epic', wear('body', 3), wear('handling', 3), wear('brakes', 1)),
  part('chs-carbon', 'Monocoque carbone', 'chassis', 'legendary', wear('body', 4), wear('handling', 1), wear('tires', 1), wear('brakes', 1), wear('gearbox', 1), wear('engine', 1)),
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
