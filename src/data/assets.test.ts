import { afterEach, describe, expect, it } from 'vitest';
import { NO_ASSETS, assets, setAssetProvider, type AssetProvider } from './assets';

afterEach(() => setAssetProvider(NO_ASSETS));

describe('asset registry', () => {
  it('has no provider by default: the game draws and plays its fallbacks', () => {
    expect(assets.carSprite(0)).toBeNull();
    expect(assets.carNose).toBe(0);
    expect(assets.driverPortrait(0)).toBeNull();
    expect(assets.sound('dice')).toBeNull();
    expect(assets.icon('rain')).toBeNull();
  });

  it('can be replaced without touching the callers, and can be empty', () => {
    const ours: AssetProvider = { ...NO_ASSETS, carSprite: (i) => `/our/car-${i}.png`, carNose: Math.PI };
    setAssetProvider(ours);
    expect(assets.carSprite(2)).toBe('/our/car-2.png');
    expect(assets.carNose).toBeCloseTo(Math.PI);
    expect(assets.sound('dice')).toBeNull();
    setAssetProvider(NO_ASSETS);
    expect(assets.carSprite(2)).toBeNull();
    expect(assets.driverPortrait(0)).toBeNull();
    expect(assets.icon('sun')).toBeNull();
  });
});
