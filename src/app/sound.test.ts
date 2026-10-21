// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { feedback } from '../ui/kit/feedback';
import { installKitSounds, onSoundChange, playSound, reloadSettings, setSoundEnabled, soundEnabled, soundsPlayed } from './sound';

beforeEach(() => {
  window.localStorage.clear();
  reloadSettings();
});

describe('sound settings', () => {
  it('is on by default', () => {
    expect(soundEnabled()).toBe(true);
  });

  it('can be switched off and the choice survives a reload', () => {
    setSoundEnabled(false);
    expect(soundEnabled()).toBe(false);
    reloadSettings();
    expect(soundEnabled()).toBe(false);
    setSoundEnabled(true);
    reloadSettings();
    expect(soundEnabled()).toBe(true);
  });

  it('ignores a corrupted settings entry', () => {
    window.localStorage.setItem('4mules.settings', '{broken');
    reloadSettings();
    expect(soundEnabled()).toBe(true);
    window.localStorage.setItem('4mules.settings', '{"sound":"yes"}');
    reloadSettings();
    expect(soundEnabled()).toBe(true);
  });

  it('notifies listeners (the top bar icon)', () => {
    const fn = vi.fn();
    const off = onSoundChange(fn);
    setSoundEnabled(false);
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    setSoundEnabled(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('keeps working when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => setSoundEnabled(false)).not.toThrow();
    expect(soundEnabled()).toBe(false);
    spy.mockRestore();
  });
});

describe('playing sounds', () => {
  it('counts requests while on, and nothing while muted', () => {
    playSound('tap');
    playSound('coin');
    expect(soundsPlayed()).toBe(2);
    setSoundEnabled(false);
    playSound('tap');
    expect(soundsPlayed()).toBe(2);
  });

  it('never throws without audio support', () => {
    expect(() => (['tap', 'confirm', 'open', 'close', 'error', 'coin', 'win', 'levelup', 'reveal-common', 'reveal-rare', 'reveal-epic', 'reveal-legendary'] as const).forEach(playSound)).not.toThrow();
  });

  it('the kit announces taps through the sound player once installed', () => {
    installKitSounds();
    feedback('tap');
    expect(soundsPlayed()).toBe(1);
    setSoundEnabled(false);
    feedback('tap');
    expect(soundsPlayed()).toBe(1);
  });
});
