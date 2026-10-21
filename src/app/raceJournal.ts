import { progressOf, weatherOf } from '../engine';
import type { GameEvent, RaceState } from '../engine';
import type { EffectSources } from '../data/parts/effects';
import { describeEvent, plural } from './messages';

/** The race journal: what happened, round after round, told from the events of the engine. No screen code here. */
export type JournalKind = 'dice' | 'move' | 'overtake' | 'incident' | 'wear' | 'corner' | 'pit' | 'lap' | 'weather';

export interface JournalEntry {
  n: number;
  /** Round of the race (every car plays once per round). */
  round: number;
  /** The car the line is about, or null for the race itself (weather). */
  carId: string | null;
  kind: JournalKind;
  icon: string;
  text: string;
}

export const JOURNAL_FILTERS = [
  { id: 'all', label: 'Tout' },
  { id: 'mine', label: 'Moi' },
  { id: 'overtake', label: 'Dépassements' },
  { id: 'incident', label: 'Incidents' },
  { id: 'pit', label: 'Arrêts' },
] as const;
export type JournalFilter = (typeof JOURNAL_FILTERS)[number]['id'];

const ICONS: Record<JournalKind, string> = { dice: '🎲', move: '🏎️', overtake: '🔁', incident: '💥', wear: '🛞', corner: '🌀', pit: '🔧', lap: '🏁', weather: '🌦️' };

/** The kind of a line of the journal, by the events it comes from. */
function kindOf(e: GameEvent): JournalKind | null {
  switch (e.type) {
    case 'START_ROLL':
    case 'DICE_ROLLED':
    case 'REROLLED':
    case 'GEAR_SHIFTED':
      return 'dice';
    case 'CAR_MOVED':
      return 'move';
    case 'BLOCKED':
    case 'WALL_CRASH':
    case 'CONTACT':
    case 'ENGINE_ROLL':
    case 'RISK_ROLL':
    case 'CAR_STOPPED':
    case 'CAR_RETIRED':
      return 'incident';
    case 'TIRE_WEAR':
    case 'WEAR_LOST':
      return 'wear';
    case 'CORNER_STOP':
    case 'CORNER_OVERSHOOT':
    case 'FREE_STOP_USED':
      return 'corner';
    case 'PIT_STOP':
      return 'pit';
    case 'LAP_COMPLETED':
    case 'CAR_FINISHED':
      return 'lap';
    case 'WEATHER':
      return 'weather';
    default:
      return null;
  }
}

/** The journal text of an event, or null when it says nothing worth keeping. */
function textOf(e: GameEvent, state: RaceState, name: (id: string) => string, sources: EffectSources): string | null {
  switch (e.type) {
    case 'GEAR_SHIFTED':
      return e.from === e.to ? null : `Rapport ${e.from} → ${e.to}.`;
    case 'DICE_ROLLED':
      return `Dé ${e.face} : ${plural(e.roll, 'case')}${e.bonus ? ` (${e.bonus > 0 ? '+' : '−'}${Math.abs(e.bonus)} d’équipement)` : ''}.`;
    case 'CAR_MOVED':
      return `Avance de ${plural(e.cells, 'case')}${e.missing > 0 ? ` (${plural(e.missing, 'case manquante', 'cases manquantes')})` : ''}.`;
    case 'WEAR_LOST':
      return `${e.category === 'body' ? 'Carrosserie' : e.category === 'tires' ? 'Pneus' : e.category === 'brakes' ? 'Freins' : e.category === 'engine' ? 'Moteur' : e.category === 'gearbox' ? 'Boîte' : 'Tenue de route'} −${e.amount}.`;
    case 'CAR_RETIRED':
    case 'CAR_FINISHED':
      return describeEvent(e, state, name, sources)?.replace(`${name(e.carId)} `, '') ?? null;
    default:
      return describeEvent(e, state, name, sources);
  }
}

/**
 * The lines of the journal for one action: `prev` and `next` are the states around it, `events` what the engine reported.
 * An overtake is a car that was behind another one and is now in front of it after its move.
 */
export function journalLines(prev: RaceState, next: RaceState, events: GameEvent[], name: (id: string) => string, sources: (carId: string) => EffectSources = () => ({})): Omit<JournalEntry, 'n'>[] {
  const lines: Omit<JournalEntry, 'n'>[] = [];
  for (const e of events) {
    const kind = kindOf(e);
    if (!kind) continue;
    // the weather is told when it changes, not every round
    if (e.type === 'WEATHER' && weatherOf(prev.wetness) === e.weather) continue;
    // an AI's or an opponent's incident and a wear loss that only repeats the line before are kept short: one line per event
    const text = textOf(e, next, name, 'carId' in e ? sources(e.carId) : {});
    if (!text) continue;
    const carId = 'carId' in e ? e.carId : null;
    lines.push({ round: next.round, carId, kind, icon: ICONS[kind], text });
    if (e.type !== 'CAR_MOVED') continue;
    const before = prev.cars.find((c) => c.id === e.carId);
    const after = next.cars.find((c) => c.id === e.carId);
    if (!before || !after) continue;
    const from = progressOf(prev, before);
    const to = progressOf(next, after);
    for (const other of prev.cars) {
      if (other.id === e.carId || other.position === null) continue; // finished or out cars are not overtaken
      const at = progressOf(prev, other);
      if (from < at && to > at) lines.push({ round: next.round, carId: e.carId, kind: 'overtake', icon: ICONS.overtake, text: `Dépasse ${name(other.id)}.` });
    }
  }
  return lines;
}

/** The entries a filter keeps. `mine` tells which cars belong to this person. */
export function filterJournal(entries: readonly JournalEntry[], filter: JournalFilter, mine: (carId: string) => boolean): JournalEntry[] {
  switch (filter) {
    case 'mine':
      return entries.filter((e) => e.carId !== null && mine(e.carId));
    case 'overtake':
      return entries.filter((e) => e.kind === 'overtake');
    case 'incident':
      return entries.filter((e) => e.kind === 'incident' || e.kind === 'wear');
    case 'pit':
      return entries.filter((e) => e.kind === 'pit' || e.kind === 'corner');
    default:
      return [...entries];
  }
}

/** The entries by round, in order, for the headings of the screen. */
export function groupByRound(entries: readonly JournalEntry[]): { round: number; entries: JournalEntry[] }[] {
  const groups: { round: number; entries: JournalEntry[] }[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.round === e.round) last.entries.push(e);
    else groups.push({ round: e.round, entries: [e] });
  }
  return groups;
}
