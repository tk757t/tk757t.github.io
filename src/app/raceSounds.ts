import type { SoundName } from '../data/assets';
import type { DnfReason, GameEvent, WearCategory } from '../engine';
import { playSound } from './sound';

const CRASH: Record<WearCategory, SoundName> = {
  tires: 'crash-tires',
  brakes: 'crash-brakes',
  gearbox: 'crash-engine',
  body: 'crash-body',
  engine: 'crash-engine',
  handling: 'crash-handling',
};

/** Parts lost against one's will (risk cell, contact, engine roll, missed corner, blocked road), not by choice. */
const INVOLUNTARY = new Set(['risk', 'contact', 'engine roll', 'overshoot', 'blocked']);

const RETIRE_CRASH: Record<DnfReason, SoundName> = {
  tires: 'crash-tires',
  brakes: 'crash-brakes',
  gearbox: 'crash-engine',
  body: 'crash-body',
  engine: 'crash-engine',
  handling: 'crash-handling',
  'no-move': 'crash-body',
};

/**
 * The sounds of what the engine just reported, in the order they happen, without repeats and at most 3 (a turn can
 * report a dozen events; a wall of noise would not help). Choosing a gear and rolling the die is the dice sound;
 * choosing the destination is not worth one.
 */
export function soundsForEvents(events: GameEvent[]): SoundName[] {
  const out: SoundName[] = [];
  const add = (n: SoundName) => {
    if (!out.includes(n)) out.push(n);
  };
  for (const e of events) {
    switch (e.type) {
      case 'START_ROLL':
        add(e.result === 'stall' ? 'stall' : 'start');
        break;
      case 'DICE_ROLLED':
        add('dice');
        break;
      case 'WEATHER':
        if (e.weather === 'rain') add('rain');
        else if (e.weather === 'sun') add('sun');
        break;
      case 'CONTACT':
        if (e.hit) add('contact');
        break;
      case 'WEAR_LOST':
        if (INVOLUNTARY.has(e.cause) && e.amount > 0 && e.cause !== 'contact') add(CRASH[e.category]);
        break;
      case 'PIT_STOP':
        add('pit');
        break;
      case 'LAP_COMPLETED':
        add('lap');
        break;
      case 'CAR_RETIRED':
        add(RETIRE_CRASH[e.reason]);
        break;
    }
  }
  return out.slice(0, 3);
}

/** Plays the sounds of a batch of events (the sound switch decides whether anything is heard). */
export function playRaceEvents(events: GameEvent[]): void {
  for (const n of soundsForEvents(events)) playSound(n);
}

/** Which explosion picture a retirement deserves (the part that gave out). */
export function explosionFor(reason: DnfReason): 'explosion' | 'explosion-body' | 'explosion-engine' | 'explosion-handling' {
  if (reason === 'body') return 'explosion-body';
  if (reason === 'engine' || reason === 'gearbox') return 'explosion-engine';
  if (reason === 'handling') return 'explosion-handling';
  return 'explosion';
}
