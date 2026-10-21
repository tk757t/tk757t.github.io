import { assets, type SoundName } from '../data/assets';
import { setFeedbackHandler, type FeedbackKind } from '../ui/kit/feedback';

const SETTINGS_KEY = '4mules.settings';

export type Sfx = FeedbackKind | SoundName | 'coin' | 'win' | 'reveal-common' | 'reveal-rare' | 'reveal-epic' | 'reveal-legendary' | 'levelup';

interface Settings {
  sound: boolean;
}

function readSettings(): Settings {
  try {
    const raw = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '{}');
    return { sound: typeof raw.sound === 'boolean' ? raw.sound : true };
  } catch {
    return { sound: true };
  }
}

let settings: Settings = readSettings();
let played = 0;
const names: string[] = [];
let ctx: AudioContext | null = null;
const listeners = new Set<() => void>();

export const soundEnabled = (): boolean => settings.sound;
/** How many sounds were requested while sound was on (muted requests are not counted). */
export const soundsPlayed = (): number => played;
/** The names of the sounds requested while sound was on, in order (used by tests). */
export const soundNames = (): readonly string[] => names;

export function setSoundEnabled(on: boolean): void {
  settings = { ...settings, sound: on };
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* private mode: the choice lasts until the page closes */
  }
  listeners.forEach((l) => l());
}

export function onSoundChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Re-reads the settings (used by tests). */
export function reloadSettings(): void {
  settings = readSettings();
  played = 0;
}

type Note = [freq: number, start: number, length: number, wave?: OscillatorType, gain?: number];

// the sounds of the race when no sound file is registered (assets.sound returns null): short synthesised ones
const RACE_NOTES: Record<SoundName, Note[]> = {
  dice: [[300, 0, 0.04, 'square', 0.07], [420, 0.05, 0.04, 'square', 0.07], [350, 0.1, 0.04, 'square', 0.07], [520, 0.15, 0.06, 'square', 0.07]],
  start: [[220, 0, 0.12, 'sawtooth', 0.09], [330, 0.12, 0.12, 'sawtooth', 0.09], [440, 0.24, 0.3, 'sawtooth', 0.09]],
  stall: [[200, 0, 0.12, 'sawtooth', 0.1], [140, 0.12, 0.12, 'sawtooth', 0.1], [90, 0.24, 0.3, 'sawtooth', 0.1]],
  contact: [[110, 0, 0.12, 'square', 0.14], [70, 0.05, 0.15, 'sawtooth', 0.12]],
  'crash-tires': [[160, 0, 0.18, 'sawtooth', 0.1], [120, 0.1, 0.2, 'sawtooth', 0.1]],
  'crash-brakes': [[600, 0, 0.1, 'sawtooth', 0.08], [300, 0.08, 0.2, 'sawtooth', 0.1]],
  'crash-body': [[90, 0, 0.2, 'square', 0.14], [60, 0.1, 0.25, 'sawtooth', 0.12]],
  'crash-engine': [[130, 0, 0.1, 'sawtooth', 0.12], [75, 0.1, 0.3, 'sawtooth', 0.12]],
  'crash-handling': [[260, 0, 0.1, 'sawtooth', 0.1], [180, 0.1, 0.1, 'sawtooth', 0.1], [100, 0.2, 0.2, 'sawtooth', 0.1]],
  pit: [[660, 0, 0.1, 'triangle', 0.12], [880, 0.14, 0.14, 'triangle', 0.12]],
  rain: [[1568, 0, 0.05, 'triangle', 0.05], [1319, 0.07, 0.05, 'triangle', 0.05], [1760, 0.14, 0.05, 'triangle', 0.05], [1397, 0.21, 0.08, 'triangle', 0.05]],
  sun: [[784, 0, 0.1, 'triangle', 0.1], [988, 0.1, 0.1, 'triangle', 0.1], [1175, 0.2, 0.25, 'triangle', 0.1]],
  lap: [[523, 0, 0.08, 'square', 0.09], [659, 0.08, 0.14, 'square', 0.09]],
  turn: [[440, 0, 0.06, 'triangle', 0.08]],
};

const SOUNDS: Record<Exclude<Sfx, SoundName>, Note[]> = {
  tap: [[520, 0, 0.06, 'square', 0.08]],
  confirm: [[523, 0, 0.08, 'square', 0.1], [784, 0.07, 0.12, 'square', 0.1]],
  open: [[330, 0, 0.07, 'triangle', 0.12], [494, 0.06, 0.1, 'triangle', 0.12]],
  close: [[440, 0, 0.06, 'triangle', 0.1], [294, 0.05, 0.1, 'triangle', 0.1]],
  error: [[180, 0, 0.14, 'sawtooth', 0.09]],
  coin: [[988, 0, 0.07, 'square', 0.08], [1319, 0.07, 0.2, 'square', 0.08]],
  win: [[523, 0, 0.12, 'square', 0.1], [659, 0.12, 0.12, 'square', 0.1], [784, 0.24, 0.12, 'square', 0.1], [1047, 0.36, 0.4, 'square', 0.1]],
  levelup: [[392, 0, 0.1, 'triangle', 0.14], [523, 0.1, 0.1, 'triangle', 0.14], [659, 0.2, 0.1, 'triangle', 0.14], [784, 0.3, 0.3, 'triangle', 0.14]],
  'reveal-common': [[392, 0, 0.12, 'triangle', 0.12]],
  'reveal-rare': [[392, 0, 0.1, 'triangle', 0.12], [587, 0.1, 0.18, 'triangle', 0.12]],
  'reveal-epic': [[392, 0, 0.1, 'triangle', 0.13], [494, 0.1, 0.1, 'triangle', 0.13], [740, 0.2, 0.25, 'triangle', 0.13]],
  'reveal-legendary': [[392, 0, 0.1, 'square', 0.1], [494, 0.1, 0.1, 'square', 0.1], [659, 0.2, 0.1, 'square', 0.1], [988, 0.3, 0.1, 'square', 0.1], [1319, 0.4, 0.5, 'square', 0.1]],
};

const RACE_SOUNDS = new Set<string>(Object.keys(RACE_NOTES));
const isRaceSound = (kind: Sfx): kind is SoundName => RACE_SOUNDS.has(kind);

/** Plays a sound file registered in the asset registry; false when it could not be started. */
function playFile(url: string): boolean {
  try {
    const audio = new Audio(url);
    audio.volume = 0.6;
    void audio.play().catch(() => undefined); // autoplay policy, missing file: stay silent
    return true;
  } catch {
    return false;
  }
}

/**
 * Plays a sound: the file the asset registry has for it (race sounds), else a short synthesised one.
 * Silent when muted or when audio is unavailable.
 */
export function playSound(kind: Sfx): void {
  if (!settings.sound) return;
  played++;
  names.push(kind);
  if (isRaceSound(kind)) {
    const url = assets.sound(kind);
    if (url && playFile(url)) return;
  }
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    for (const [freq, start, length, wave = 'square', gain = 0.1] of isRaceSound(kind) ? RACE_NOTES[kind] : SOUNDS[kind]) {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = wave;
      osc.frequency.value = freq;
      amp.gain.setValueAtTime(0.0001, t0 + start);
      amp.gain.exponentialRampToValueAtTime(gain, t0 + start + 0.01);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + start + length);
      osc.connect(amp).connect(ctx.destination);
      osc.start(t0 + start);
      osc.stop(t0 + start + length + 0.02);
    }
  } catch {
    /* no audio device, autoplay policy, ...: the game stays silent */
  }
}

/** Makes every kit button / modal announce itself with a sound. */
export function installKitSounds(): void {
  setFeedbackHandler((kind) => playSound(kind));
}

export function exposeSoundForTests(): void {
  if (!import.meta.env.DEV) return;
  Object.assign(window, { __sound: { enabled: soundEnabled, played: soundsPlayed, names: () => [...names] } });
}
