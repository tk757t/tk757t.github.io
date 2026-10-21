import { WEAR_CATEGORIES, type CarMods, type WearCategory } from '../../engine/types';
import { modsForLoadout } from './effects';
import type { Loadout } from './types';

/**
 * The ceilings of a ranked race (docs/gdd/03-ajouts.md § 3.3, "Plafonds en classé"): the car of a player is brought back to
 * the limits of their league. Parts above the ceiling level play at that level, then the totals are cut. Drawbacks (negative
 * values) are never lifted. Not used by a race yet: the ranked mode needs the server to replay races first.
 */
export interface League {
  id: string;
  label: string;
  /** Highest level at which a part counts. */
  pieceLevel: number;
  /** Highest bonus on one gauge. */
  gauge: number;
  /** Highest total of gauge bonuses. */
  gaugeTotal: number;
  /** Highest total of bonus cells over the 6 gears. */
  cases: number;
  rerolls: number;
  freeStops: number;
  /** Highest total of discounts (downshift, corner, block, engine roll). */
  discounts: number;
}

export const LEAGUES: League[] = [
  { id: 'paddock', label: 'Paddock', pieceLevel: 2, gauge: 1, gaugeTotal: 4, cases: 0, rerolls: 1, freeStops: 0, discounts: 1 },
  { id: 'bitume', label: 'Bitume', pieceLevel: 3, gauge: 2, gaugeTotal: 6, cases: 1, rerolls: 1, freeStops: 1, discounts: 2 },
  { id: 'chicane', label: 'Chicane', pieceLevel: 3, gauge: 2, gaugeTotal: 8, cases: 2, rerolls: 1, freeStops: 1, discounts: 2 },
  { id: 'epingle', label: 'Épingle', pieceLevel: 4, gauge: 3, gaugeTotal: 10, cases: 3, rerolls: 2, freeStops: 1, discounts: 3 },
  { id: 'turbo', label: 'Turbo', pieceLevel: 5, gauge: 3, gaugeTotal: 12, cases: 4, rerolls: 2, freeStops: 2, discounts: 3 },
  { id: 'legende', label: 'Légende', pieceLevel: 5, gauge: 4, gaugeTotal: 14, cases: 4, rerolls: 2, freeStops: 2, discounts: 4 },
];

export const getLeague = (id: string): League | undefined => LEAGUES.find((l) => l.id === id);

export interface CappedMods {
  mods: CarMods;
  /** What was cut, for the garage to show in orange: `piece-level`, `gauge-<category>`, `gauge-total`, `cases`, `rerolls`, `freeStops`, `discounts`. */
  clamped: string[];
}

/** The mods of a loadout in a league: levels cut to the ceiling, then every total brought down to the league's limits. */
export function capLoadoutMods(loadout: Loadout, owned: Record<string, number>, league: League): CappedMods {
  const clamped = new Set<string>();
  const levels: Record<string, number> = {};
  for (const [id, level] of Object.entries(owned)) {
    levels[id] = Math.min(level, league.pieceLevel);
    if (level > league.pieceLevel) clamped.add('piece-level');
  }
  const base = modsForLoadout(loadout, levels);
  const mods: CarMods = { ...base, wearBonus: { ...base.wearBonus }, rollWearDiscount: { ...base.rollWearDiscount }, moveBonus: base.moveBonus.map((b) => ({ ...b })) };

  // one gauge, then the total of the gauges (always taking from the biggest)
  for (const c of WEAR_CATEGORIES) {
    if ((mods.wearBonus[c] ?? 0) > league.gauge) {
      mods.wearBonus[c] = league.gauge;
      clamped.add(`gauge-${c}`);
    }
  }
  const total = () => WEAR_CATEGORIES.reduce((sum, c) => sum + Math.max(0, mods.wearBonus[c] ?? 0), 0);
  while (total() > league.gaugeTotal) {
    const biggest = WEAR_CATEGORIES.reduce<WearCategory>((best, c) => ((mods.wearBonus[c] ?? 0) > (mods.wearBonus[best] ?? 0) ? c : best), WEAR_CATEGORIES[0]);
    mods.wearBonus[biggest] = (mods.wearBonus[biggest] ?? 0) - 1;
    clamped.add('gauge-total');
  }

  // bonus cells: only the positive ones count, taken from the last entry first
  const casesOf = (b: { gears: number[] | 'all'; amount: number }) => b.amount * (b.gears === 'all' ? 6 : b.gears.length);
  const positive = () => mods.moveBonus.reduce((sum, b) => sum + (b.amount > 0 ? casesOf(b) : 0), 0);
  for (let i = mods.moveBonus.length - 1; i >= 0 && positive() > league.cases; i--) {
    while (mods.moveBonus[i].amount > 0 && positive() > league.cases) {
      mods.moveBonus[i].amount -= 1;
      clamped.add('cases');
    }
  }

  if (mods.rerolls > league.rerolls) {
    mods.rerolls = league.rerolls;
    clamped.add('rerolls');
  }
  if (mods.freeStops > league.freeStops) {
    mods.freeStops = league.freeStops;
    clamped.add('freeStops');
  }
  const discounts = () => mods.downshiftDiscount + mods.overshootTireDiscount + mods.blockBrakeDiscount + (mods.rollWearDiscount.engine ?? 0);
  const takes: (() => boolean)[] = [
    () => {
      const v = mods.rollWearDiscount.engine ?? 0;
      if (v <= 0) return false;
      mods.rollWearDiscount.engine = v - 1;
      return true;
    },
    () => (mods.blockBrakeDiscount > 0 ? (mods.blockBrakeDiscount--, true) : false),
    () => (mods.overshootTireDiscount > 0 ? (mods.overshootTireDiscount--, true) : false),
    () => (mods.downshiftDiscount > 0 ? (mods.downshiftDiscount--, true) : false),
  ];
  for (const take of takes) {
    while (discounts() > league.discounts && take()) clamped.add('discounts');
  }
  return { mods, clamped: [...clamped] };
}
