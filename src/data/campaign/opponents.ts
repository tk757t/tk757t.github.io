import { assets } from '../assets';
import type { CarMods } from '../../engine/types';
import { modsForLoadout } from '../parts/effects';
import type { Opponent } from './types';

/** How a seat is shown: its fictional names, and its pictures when the asset registry has them. */
export interface OpponentLook {
  driver: string;
  team: string;
  /** Index of the car picture in the asset registry, or null. */
  car: number | null;
  /** Index of the driver portrait, or null. */
  portrait: number | null;
}

export function opponentLook(o: Opponent): OpponentLook {
  return { driver: o.name, team: o.team, car: assets.carSprite(o.car) !== null ? o.car : null, portrait: assets.driverPortrait(o.portrait) !== null ? o.portrait : null };
}

/** The modifiers the equipment of an opponent gives, computed like the player's garage does. */
export function opponentMods(o: Opponent): CarMods {
  const parts: Record<string, string> = {};
  const owned: Record<string, number> = {};
  for (const [slot, p] of Object.entries(o.parts)) {
    if (!p) continue;
    parts[slot] = p.id;
    owned[p.id] = p.level;
  }
  const mods = modsForLoadout({ parts }, owned);
  for (const b of o.paceBonus ?? []) mods.moveBonus.push({ gears: [...b.gears], amount: b.amount });
  return mods;
}
