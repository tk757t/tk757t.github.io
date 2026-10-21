import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../engine';
import { explosionFor, soundsForEvents } from './raceSounds';

const wear = (category: 'tires' | 'brakes' | 'gearbox' | 'body' | 'engine' | 'handling', cause: string, amount = 1): GameEvent => ({ type: 'WEAR_LOST', carId: 'a', category, amount, cause });

describe('sounds of the race', () => {
  it('the die, the start and the stall', () => {
    expect(soundsForEvents([{ type: 'DICE_ROLLED', carId: 'a', gear: 2, face: 3, roll: 3, bonus: 0 }])).toEqual(['dice']);
    expect(soundsForEvents([{ type: 'START_ROLL', carId: 'a', d20: 20, result: 'super' }, { type: 'DICE_ROLLED', carId: 'a', gear: 1, face: 1, roll: 4, bonus: 0 }])).toEqual(['start', 'dice']);
    expect(soundsForEvents([{ type: 'START_ROLL', carId: 'a', d20: 1, result: 'stall' }])).toEqual(['stall']);
  });

  it('one crash sound per kind of part lost against one’s will, none for what the player chose', () => {
    expect(soundsForEvents([wear('handling', 'risk')])).toEqual(['crash-handling']);
    expect(soundsForEvents([wear('engine', 'engine roll')])).toEqual(['crash-engine']);
    expect(soundsForEvents([wear('tires', 'overshoot', 3)])).toEqual(['crash-tires']);
    expect(soundsForEvents([wear('brakes', 'blocked', 2)])).toEqual(['crash-brakes']);
    expect(soundsForEvents([wear('brakes', 'adjustment'), wear('gearbox', 'downshift'), wear('tires', 'overshoot', 0)])).toEqual([]);
  });

  it('a contact is a collision, once for both cars', () => {
    const hit: GameEvent = { type: 'CONTACT', carId: 'a', other: 'b', d20: 1, hit: true };
    expect(soundsForEvents([hit, wear('body', 'contact'), wear('body', 'contact')])).toEqual(['contact']);
    expect(soundsForEvents([{ ...hit, hit: false }])).toEqual([]);
  });

  it('weather, pit stop, lap and retirement, at most three sounds', () => {
    expect(soundsForEvents([{ type: 'WEATHER', weather: 'rain', wetness: 3, d20: 2 }])).toEqual(['rain']);
    expect(soundsForEvents([{ type: 'WEATHER', weather: 'sun', wetness: 0, d20: 19 }])).toEqual(['sun']);
    expect(soundsForEvents([{ type: 'WEATHER', weather: 'cloud', wetness: 2, d20: 8 }])).toEqual([]);
    expect(soundsForEvents([{ type: 'PIT_STOP', carId: 'a', fast: true, tires: 'soft', repairs: 0, d20: 4, restartCells: 2 }])).toEqual(['pit']);
    expect(soundsForEvents([{ type: 'CAR_RETIRED', carId: 'a', reason: 'body' }])).toEqual(['crash-body']);
    const many = soundsForEvents([
      { type: 'DICE_ROLLED', carId: 'a', gear: 2, face: 3, roll: 3, bonus: 0 },
      { type: 'LAP_COMPLETED', carId: 'a', laps: 1 },
      wear('handling', 'risk'),
      { type: 'PIT_STOP', carId: 'a', fast: true, tires: 'soft', repairs: 0, d20: 4, restartCells: 2 },
    ]);
    expect(many).toHaveLength(3);
  });

  it('the explosion matches the part that gave out', () => {
    expect(explosionFor('body')).toBe('explosion-body');
    expect(explosionFor('engine')).toBe('explosion-engine');
    expect(explosionFor('handling')).toBe('explosion-handling');
    expect(explosionFor('tires')).toBe('explosion');
  });
});
