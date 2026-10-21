import { currentCar, distanceRange, downshiftCost, effectiveDrop, isRaining, weatherOf } from '../engine';
import type { CarState, DnfReason, EngineConfig, GameEvent, RaceState, TireType, Weather, WearCategory } from '../engine';

export const WEAR_LABELS: Record<WearCategory, string> = {
  tires: 'Pneus',
  brakes: 'Freins',
  gearbox: 'Boîte',
  body: 'Carrosserie',
  engine: 'Moteur',
  handling: 'Tenue de route',
};

/** Short names for the narrow wear gauges of the race HUD. */
export const WEAR_SHORT_LABELS: Record<WearCategory, string> = {
  tires: 'Pneus',
  brakes: 'Freins',
  gearbox: 'Boîte',
  body: 'Carrosserie',
  engine: 'Moteur',
  handling: 'Tenue',
};

const RETIRE_LABELS: Record<DnfReason, string> = {
  tires: 'pneus usés',
  brakes: 'freins usés',
  gearbox: 'boîte cassée',
  body: 'carrosserie détruite',
  engine: 'moteur cassé',
  handling: 'tenue de route perdue',
  'no-move': 'aucun déplacement possible',
};

export const TIRE_LABELS: Record<TireType, string> = { hard: 'Durs', rain: 'Pluie', soft: 'Tendres' };
export const WEATHER_LABELS: Record<Weather, string> = { sun: 'Soleil', cloud: 'Nuageux', rain: 'Pluie' };
export const WEATHER_ICONS: Record<Weather, string> = { sun: '☀️', cloud: '⛅', rain: '🌧️' };

export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n > 1 ? many : one}`;

export const playerName = (state: RaceState, carId: string): string => `Joueur ${state.cars.findIndex((c) => c.id === carId) + 1}`;

export const retireLabel = (reason: DnfReason): string => RETIRE_LABELS[reason];

export type WearLevel = 'ok' | 'warn' | 'low';
/** Colour level of a gauge: the points are few (2 to 6), so 1 left is already low. */
export function wearLevel(value: number, max: number): WearLevel {
  if (value <= 0) return 'low';
  const ratio = max > 0 ? value / max : 0;
  return ratio > 0.5 ? 'ok' : ratio > 0.25 || value >= 2 ? 'warn' : 'low';
}

/** Title and range ("2 à 4 cases") of a gear for the car, tires and parts included (§1). */
export function gearLabel(config: EngineConfig, car: CarState, gear: number): { title: string; detail: string } {
  const r = distanceRange(config, car, gear);
  return { title: `Rapport ${gear}`, detail: `${r.min === r.max ? r.min : `${r.min} à ${r.max}`} cases` };
}

/** What a downshift to `target` costs, in words, or null when it is free (§3). */
export function downshiftWarning(state: RaceState, target: number): string | null {
  const car = currentCar(state);
  if (!car) return null;
  const cost = downshiftCost(effectiveDrop(car, target));
  const parts = [cost.gearbox ? 'boîte −1' : '', cost.brakes ? 'freins −1' : '', cost.engine ? 'moteur −1' : ''].filter(Boolean);
  return parts.length ? `Rétrograder de ${car.gear - target} rapports coûte : ${parts.join(', ')}.` : null;
}

/** Corner status of the active car: "Virage T2 : encore 1 arrêt à faire." (§6) */
export function cornerStatus(state: RaceState): string | null {
  const car = currentCar(state);
  if (!car || car.position === null || state.status !== 'racing') return null;
  const corner = state.track.cells[car.position].corner;
  if (!corner) return null;
  const free = car.freeStops > 0 ? ` (+${plural(car.freeStops, 'arrêt gratuit', 'arrêts gratuits')} en réserve)` : '';
  if (car.cornerLeft <= 0) return `Virage ${corner.id} : ${plural(corner.stops, 'arrêt')} requis, arrêts faits : vous pouvez en sortir.`;
  return `Virage ${corner.id} : encore ${plural(car.cornerLeft, 'arrêt')} à faire sur ${corner.stops}${free}. Sortir maintenant coûte des pneus.`;
}

/** One short sentence per event the player should know about (null = not worth showing). */
export function describeEvent(e: GameEvent, state: RaceState, name: (carId: string) => string = (id) => playerName(state, id)): string | null {
  switch (e.type) {
    case 'START_ROLL':
      return e.result === 'super' ? `Super départ (d20 : ${e.d20}) : 4 cases !` : e.result === 'stall' ? `Calage au départ (d20 : ${e.d20}) : le tour est perdu.` : `Départ (d20 : ${e.d20}).`;
    case 'DICE_ROLLED': {
      const base = e.roll - e.bonus;
      return `Dé : ${e.face}${base !== e.face ? ` → ${base}` : ''}${e.bonus ? `, +${e.bonus} d'équipement` : ''} : ${plural(e.roll, 'case')}.`;
    }
    case 'REROLLED':
      return `Relance utilisée (${e.left} restante${e.left > 1 ? 's' : ''}).`;
    case 'ADJUSTED':
      return null;
    case 'BLOCKED':
      return `Chemin barré : ${plural(e.missing, 'case manquante', 'cases manquantes')}, freins −${e.brakes}${e.tires ? `, pneus −${e.tires}` : ''}.`;
    case 'CORNER_STOP':
      return e.left > 0 ? `Arrêt au virage ${e.corner} : encore ${plural(e.left, 'arrêt')}.` : `Virage ${e.corner} : tous les arrêts sont faits.`;
    case 'CORNER_OVERSHOOT':
      return `Virage ${e.corner} raté (${plural(e.left, 'arrêt manquant', 'arrêts manquants')}) : pneus −${e.tires}.`;
    case 'FREE_STOP_USED':
      return `${plural(e.used, 'arrêt gratuit', 'arrêts gratuits')} utilisé${e.used > 1 ? 's' : ''} !`;
    case 'LAP_COMPLETED':
      return `Tour ${e.laps} terminé !`;
    case 'CONTACT':
      return e.hit ? `Contact avec ${name(e.other)} : carrosserie −1.` : null;
    case 'ENGINE_ROLL':
      return e.hit ? 'Jet moteur raté : moteur −1.' : null;
    case 'RISK_ROLL':
      return e.hit ? 'Case à risque : tenue de route −1.' : null;
    case 'CAR_STOPPED':
      return 'Plus de pneus : la voiture est arrêtée (point mort).';
    case 'PIT_STOP':
      return e.fast
        ? `Arrêt rapide (d20 : ${e.d20}) : on repart tout de suite, ${plural(e.restartCells ?? 0, 'case')} en rapport 4.`
        : `Arrêt long${e.d20 !== null ? ` (d20 : ${e.d20})` : ''} : pneus neufs${e.repairs ? `, ${plural(e.repairs, 'réparation')}` : ''}, le tour est perdu.`;
    case 'WEATHER':
      return e.weather === 'rain' ? 'La pluie arrive.' : e.weather === 'sun' ? 'Le soleil revient.' : null;
    case 'CAR_RETIRED':
      return `${name(e.carId)} abandonne : ${retireLabel(e.reason)}.`;
    case 'CAR_FINISHED':
      return `${name(e.carId)} franchit la ligne : ${e.rank === 1 ? 'vainqueur' : `${e.rank}e`}.`;
    case 'INVALID_ACTION':
      return 'Action impossible pour le moment.';
    default:
      return null;
  }
}

/** Weather, tires and repair points of the active car, for the HUD status line. */
export function statusLine(state: RaceState, car: CarState, emoji = true): string {
  const w = weatherOf(state.wetness);
  return `${emoji ? `${WEATHER_ICONS[w]} ` : ''}${WEATHER_LABELS[w]}${isRaining(state) && car.tires !== 'rain' ? ' (attention)' : ''} · Pneus ${TIRE_LABELS[car.tires].toLowerCase()} · ${car.repairLeft} réparation${car.repairLeft > 1 ? 's' : ''}`;
}

export interface RankRow {
  rank: number;
  carId: string;
  name: string;
  status: string;
}

export function rankingRows(state: RaceState, label: (carId: string) => string = (id) => playerName(state, id)): RankRow[] {
  const lapLength = state.track.lapLength;
  return (state.results ?? []).map((r) => ({
    rank: r.rank,
    carId: r.carId,
    name: label(r.carId),
    status: r.retired
      ? `Abandon : ${retireLabel(r.retired)}`
      : r.finished
        ? r.rank === 1
          ? 'Vainqueur'
          : 'Arrivée'
        : `${(r.progress / lapLength).toFixed(1).replace('.', ',')} tours parcourus`,
  }));
}
