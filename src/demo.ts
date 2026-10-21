import { DEFAULT_TRACK, loadTrack, toTrack } from './data/tracks';
import { allowedGears, createGame, currentCar, enumerateMoves, reducer } from './engine';
import type { Action, GameEvent, RaceState } from './engine';
import { RaceRenderer } from './render';
import { markOf } from './render/cells';
import { loadDevOrigin } from './devOrigin';

await loadDevOrigin();

const params = new URLSearchParams(location.search);
const def = await loadTrack(params.get('track') ?? DEFAULT_TRACK);
let state: RaceState = createGame({ seed: Number(params.get('seed') ?? 1), cars: 4, track: toTrack(def) });
let lastEvents: GameEvent[] = [];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const renderer = await RaceRenderer.create($('host'), def);

function describe(e: GameEvent): string {
  switch (e.type) {
    case 'DICE_ROLLED': return `dé ${e.face} → ${e.roll} cases`;
    case 'BLOCKED': return e.by === 'car' ? `contact : carrosserie −${e.body}` : `bloqué : freins −${e.brakes}`;
    case 'WALL_CRASH': return 'mur percuté : abandon';
    case 'CORNER_OVERSHOOT': return 'virage raté : pneus perdus';
    case 'CORNER_STOP': return `arrêt au virage ${e.corner}, encore ${e.left}`;
    case 'CAR_RETIRED': return `${e.carId} abandonne (${e.reason})`;
    case 'INVALID_ACTION': return `action refusée (${e.reason})`;
    default: return '';
  }
}

let pendingGear = 1;
const marks = () => new Map(state.phase === 'adjust' ? enumerateMoves(state).filter((o) => o.playable).map((o) => [o.cellId, markOf(o)] as const) : []);

function refresh(): void {
  renderer.update(state, marks());
  const car = currentCar(state);
  const said = lastEvents.map(describe).filter(Boolean).join(' · ');
  $('status').innerHTML = car
    ? `Manche <b>${state.round}</b> · <b>${car.id}</b> · rapport <b>${car.gear}</b>${said ? `<br>${said}` : ''}`
    : `Course terminée${said ? `<br>${said}` : ''}`;
  $<HTMLButtonElement>('roll').disabled = state.phase !== 'gear';
  $<HTMLButtonElement>('end').hidden = true; // no end-of-turn button any more: tapping the destination ends the turn
  $<HTMLButtonElement>('up').disabled = state.phase !== 'gear';
  $<HTMLButtonElement>('down').disabled = state.phase !== 'gear';
}

function dispatch(action: Action): GameEvent[] {
  const r = reducer(state, action);
  state = r.state;
  lastEvents = r.events;
  if (state.phase === 'pit') return dispatch({ type: 'SKIP_PIT' }); // the demo has no pit menu
  refresh();
  return r.events;
}

const gearDelta = (d: number) => {
  const car = currentCar(state);
  if (!car) return;
  const gears = allowedGears(car, state.config);
  pendingGear = gears.includes(pendingGear + d) ? pendingGear + d : pendingGear;
  $('roll').textContent = `Rapport ${pendingGear} : lancer`;
};
$('roll').onclick = () => {
  const car = currentCar(state);
  if (car) dispatch({ type: 'SHIFT_GEAR', gear: car.started ? pendingGear : 1 });
};
$('up').onclick = () => gearDelta(1);
$('down').onclick = () => gearDelta(-1);
$('fit').onclick = () => renderer.fitAll();
$('follow').onclick = () => renderer.follow();
renderer.onCellTap = (cellId) => {
  if (state.phase === 'adjust') dispatch({ type: 'MOVE_TO', cellId });
};

refresh();
if (params.get('debug') === 'cases') renderer.setDebug(true);
renderer.settle();

if (import.meta.env.DEV) {
  Object.assign(window, {
    __game: {
      get state() {
        return state;
      },
      dispatch,
      destinations: () => enumerateMoves(state).filter((o) => o.playable).map((o) => o.cellId),
    },
    __render: {
      ready: true,
      camera: () => ({ cx: renderer.camera.cx, cy: renderer.camera.cy, zoom: renderer.camera.zoom, w: renderer.camera.w, h: renderer.camera.h }),
      following: () => renderer.following,
      settle: () => renderer.settle(),
      fitAll: () => renderer.fitAll(),
      setDebug: (on: boolean) => renderer.setDebug(on),
      frameCells: (ids: string[]) => renderer.frame(ids),
      cellScreen: (id: string) => {
        const c = def.cells.find((x) => x.id === id)!;
        const p = renderer.camera.worldToScreen(c.x, c.y);
        const r = renderer.canvas.getBoundingClientRect();
        return { x: p.x + r.left, y: p.y + r.top };
      },
    },
  });
}
