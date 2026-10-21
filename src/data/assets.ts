/**
 * Registry of the art and sound files the game can show. Everything the UI needs goes through here, so our own
 * assets plug in by registering a provider: `setAssetProvider(ours)`. Nothing else has to change.
 *
 * A provider answers `null` for what it does not have; callers then fall back (circle tokens, synthesised
 * sounds, no portrait). The game ships with no provider yet (`NO_ASSETS`); development resources may register
 * one (src/devOrigin.ts), never in a production build.
 */

/** Sounds the game asks for, by what happened. */
export type SoundName =
  | 'dice'
  | 'start'
  | 'stall'
  | 'contact'
  | 'crash-tires'
  | 'crash-brakes'
  | 'crash-body'
  | 'crash-engine'
  | 'crash-handling'
  | 'pit'
  | 'rain'
  | 'sun'
  | 'lap'
  | 'turn';

export type IconName =
  | 'rain'
  | 'sun'
  | 'tires-hard'
  | 'tires-rain'
  | 'tires-soft'
  | 'tires'
  | 'brakes'
  | 'explosion'
  | 'explosion-body'
  | 'explosion-engine'
  | 'explosion-handling'
  | 'fast-stop'
  | 'long-stop';

export interface AssetProvider {
  /** Top view of a car (about 100 x 38). `index` is the seat / team. */
  carSprite(index: number): string | null;
  /** Where the nose of the car pictures points, in radians (0 = right, π = left). */
  carNose: number;
  /** Portrait of a driver (about 20 x 19). */
  driverPortrait(index: number): string | null;
  sound(name: SoundName): string | null;
  icon(name: IconName): string | null;
}

export const NO_ASSETS: AssetProvider = {
  carSprite: () => null,
  carNose: 0,
  driverPortrait: () => null,
  sound: () => null,
  icon: () => null,
};

let provider: AssetProvider = NO_ASSETS;

/** Replaces where the game gets its art and sounds from (our own assets, or `NO_ASSETS` in tests). */
export function setAssetProvider(next: AssetProvider): void {
  provider = next;
}

export const assets: AssetProvider = {
  carSprite: (i) => provider.carSprite(i),
  get carNose() {
    return provider.carNose;
  },
  driverPortrait: (i) => provider.driverPortrait(i),
  sound: (n) => provider.sound(n),
  icon: (n) => provider.icon(n),
};
