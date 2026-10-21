import type { Profile } from '../data/profile/profile';

/** Index of the portrait of the player's driver: the same race number gives the same driver. */
export function profilePortraitIndex(p: Pick<Profile, 'loadout'>): number {
  return [...String(p.loadout.number ?? '')].reduce((a, ch) => a + ch.charCodeAt(0), 0);
}
