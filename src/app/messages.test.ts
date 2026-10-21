import { describe, expect, it } from 'vitest';
import { adjust, asCurrent, fixedDice, game, inRace, linearTrack, moveTo, patchCar, run, shift } from '../engine/testing';
import { cornerStatus, describeEvent, downshiftWarning, gearLabel, plural, rankingRows, retireLabel, statusLine, wearLevel } from './messages';
import { DEFAULT_CONFIG } from '../engine/config';

const track = linearTrack(40, { corners: [{ from: 3, to: 6, stops: 2, id: 'T2' }], grid: [0, 1] });
const sample = () => asCurrent(inRace(track, { weather: 'sun', laps: 2 }, 2), 'car1');

describe('messages', () => {
  it('pluralises', () => {
    expect(plural(1, 'arrêt')).toBe('1 arrêt');
    expect(plural(2, 'arrêt')).toBe('2 arrêts');
    expect(plural(0, 'arrêt')).toBe('0 arrêt');
    expect(plural(3, 'case manquante', 'cases manquantes')).toBe('3 cases manquantes');
  });

  it('describes the corner state of the active car', () => {
    const s = patchCar(sample(), 'car1', { position: 'c4', cornerId: 'T2', cornerLeft: 2 });
    expect(cornerStatus(sample())).toBeNull();
    expect(cornerStatus(s)).toBe('Virage T2 : encore 2 arrêts à faire sur 2. Sortir maintenant coûte des pneus.');
    expect(cornerStatus(patchCar(s, 'car1', { cornerLeft: 1 }))).toContain('encore 1 arrêt à faire');
    expect(cornerStatus(patchCar(s, 'car1', { cornerLeft: 0 }))).toBe('Virage T2 : 2 arrêts requis, arrêts faits : vous pouvez en sortir.');
    expect(cornerStatus(patchCar(s, 'car1', { cornerLeft: 1, freeStops: 1 }))).toContain('+1 arrêt gratuit en réserve');
  });

  it('warns about what a downshift costs (§3)', () => {
    const s = patchCar(sample(), 'car1', { gear: 6 });
    expect(downshiftWarning(s, 5)).toBeNull();
    expect(downshiftWarning(s, 4)).toBe('Rétrograder de 2 rapports coûte : boîte −1.');
    expect(downshiftWarning(s, 3)).toBe('Rétrograder de 3 rapports coûte : boîte −1, freins −1.');
    expect(downshiftWarning(s, 1)).toBe('Rétrograder de 5 rapports coûte : boîte −1, freins −1, moteur −1.');
    const discounted = patchCar(inRace(track, { weather: 'sun' }, 1, { mods: { car1: { downshiftDiscount: 1 } } }), 'car1', { gear: 6 });
    expect(downshiftWarning(discounted, 4)).toBeNull();
  });

  it('labels gears with the distance range the car really has', () => {
    const car = sample().cars[0];
    expect(gearLabel(DEFAULT_CONFIG, car, 1)).toEqual({ title: 'Rapport 1', detail: '1 à 2 cases' });
    expect(gearLabel(DEFAULT_CONFIG, car, 3)).toEqual({ title: 'Rapport 3', detail: '4 à 8 cases' });
    expect(gearLabel(DEFAULT_CONFIG, car, 6).detail).toBe('21 à 30 cases');
    const soft = { ...car, tires: 'soft' as const };
    expect(gearLabel(DEFAULT_CONFIG, soft, 3).detail).toBe('4 à 9 cases');
    const fixed = game(track, fixedDice([2, 3, 6, 9, 15, 25]), 1).cars[0];
    expect(gearLabel({ ...DEFAULT_CONFIG, ...fixedDice([2, 3, 6, 9, 15, 25]) }, fixed, 3).detail).toBe('6 cases');
  });

  it('colours the gauges: the points are few, so one left is already a warning', () => {
    expect(wearLevel(6, 6)).toBe('ok');
    expect(wearLevel(2, 4)).toBe('warn');
    expect(wearLevel(1, 4)).toBe('low');
    expect(wearLevel(0, 4)).toBe('low');
    expect(wearLevel(2, 2)).toBe('ok');
  });

  it('describes the events a player should know about', () => {
    const s = sample();
    expect(describeEvent({ type: 'DICE_ROLLED', carId: 'car1', gear: 3, face: 6, roll: 6, bonus: 0 }, s)).toBe('Dé : 6 : 6 cases.');
    expect(describeEvent({ type: 'DICE_ROLLED', carId: 'car1', gear: 2, face: 4, roll: 5, bonus: 1 }, s)).toBe("Dé : 4, +1 d'équipement : 5 cases.");
    expect(describeEvent({ type: 'DICE_ROLLED', carId: 'car1', gear: 2, face: 4, roll: 5, bonus: 0 }, s)).toBe('Dé : 4 → 5 : 5 cases.'); // soft tires
    expect(describeEvent({ type: 'START_ROLL', carId: 'car1', d20: 20, result: 'super' }, s)).toContain('Super départ');
    expect(describeEvent({ type: 'START_ROLL', carId: 'car1', d20: 1, result: 'stall' }, s)).toContain('Calage');
    expect(describeEvent({ type: 'BLOCKED', carId: 'car1', missing: 4, brakes: 3, tires: 1, body: 0, by: 'end' }, s)).toBe('Chemin barré : 4 cases manquantes, freins −3, pneus −1.');
    expect(describeEvent({ type: 'BLOCKED', carId: 'car1', missing: 4, brakes: 0, tires: 0, body: 1, by: 'car' }, s)).toBe('Contact : une voiture barre la route (4 cases manquantes), carrosserie −1.');
    expect(describeEvent({ type: 'WALL_CRASH', carId: 'car1', corner: 'T2', left: 2 }, s)).toBe('Virage T2 : 2 arrêts manquants, la voiture percute le mur et abandonne.');
    expect(describeEvent({ type: 'CORNER_OVERSHOOT', carId: 'car1', corner: 'T2', left: 1, steps: 3, tires: 3 }, s)).toBe('Virage T2 raté (1 arrêt manquant) : pneus −3.');
    expect(describeEvent({ type: 'CORNER_STOP', carId: 'car1', corner: 'T2', left: 1 }, s)).toBe('Arrêt au virage T2 : encore 1 arrêt.');
    expect(describeEvent({ type: 'CORNER_STOP', carId: 'car1', corner: 'T2', left: 0 }, s)).toBe('Virage T2 : tous les arrêts sont faits.');
    expect(describeEvent({ type: 'CONTACT', carId: 'car1', other: 'car2', d20: 1, hit: true }, s)).toBe('Contact avec Joueur 2 : carrosserie −1.');
    expect(describeEvent({ type: 'CONTACT', carId: 'car1', other: 'car2', d20: 9, hit: false }, s)).toBeNull();
    expect(describeEvent({ type: 'ENGINE_ROLL', carId: 'car1', d20: 3, hit: true }, s)).toBe('Jet moteur raté : moteur −1.');
    expect(describeEvent({ type: 'ENGINE_ROLL', carId: 'car1', d20: 15, hit: false }, s)).toBeNull();
    expect(describeEvent({ type: 'PIT_STOP', carId: 'car1', fast: true, tires: 'soft', repairs: 0, d20: 7, restartCells: 4 }, s)).toContain('Arrêt rapide');
    expect(describeEvent({ type: 'PIT_STOP', carId: 'car1', fast: false, tires: 'soft', repairs: 2, d20: null, restartCells: null }, s)).toBe('Arrêt long : pneus neufs, 2 réparations, le tour est perdu.');
    expect(describeEvent({ type: 'REROLLED', carId: 'car1', left: 0 }, s)).toBe('Relance utilisée (0 restante).');
    expect(describeEvent({ type: 'FREE_STOP_USED', carId: 'car1', corner: 'T2', used: 2 }, s)).toBe('2 arrêts gratuits utilisés !');
    expect(describeEvent({ type: 'CAR_RETIRED', carId: 'car1', reason: 'tires' }, s)).toBe('Joueur 1 abandonne : pneus usés.');
    expect(describeEvent({ type: 'CAR_RETIRED', carId: 'car1', reason: 'no-move' }, s)).toContain('aucun déplacement');
    expect(describeEvent({ type: 'CAR_FINISHED', carId: 'car2', rank: 1 }, s)).toBe('Joueur 2 franchit la ligne : vainqueur.');
    expect(describeEvent({ type: 'WEATHER', weather: 'rain', wetness: 3, d20: 2 }, s)).toBe('La pluie arrive.');
    expect(describeEvent({ type: 'WEATHER', weather: 'cloud', wetness: 2, d20: 9 }, s)).toBeNull();
    expect(describeEvent({ type: 'TURN_STARTED', carId: 'car1', round: 1 }, s)).toBeNull();
  });

  it('the status line gives weather, tires and the repair points left', () => {
    const s = sample();
    expect(statusLine(s, s.cars[0])).toBe('☀️ Soleil · Pneus durs · 2 réparations');
    const wet = patchCar(inRace(track, { weather: 'rain' }, 1), 'car1', { repairLeft: 1 });
    expect(statusLine(wet, wet.cars[0])).toBe('🌧️ Pluie (attention) · Pneus durs · 1 réparation');
    expect(statusLine(patchCar(wet, 'car1', { tires: 'rain' }), { ...wet.cars[0], tires: 'rain' })).toContain('Pneus pluie');
  });

  it('builds the ranking: finishers, runners and retired cars', () => {
    let s = inRace(linearTrack(30, { grid: [1, 0] }), { ...fixedDice([2, 3, 6, 9, 15, 25]), laps: 1, maxRounds: 1, weather: 'sun' }, 2);
    s = patchCar(s, 'car2', { position: null, retired: 'engine', retiredRound: 1, retiredProgress: 0 });
    s = run(s, shift(1), adjust(0), moveTo('c3')).state;
    expect(s.status).toBe('finished');
    const rows = rankingRows(s);
    expect(rows.map((r) => [r.rank, r.name])).toEqual([[1, 'Joueur 1'], [2, 'Joueur 2']]);
    expect(rows[1].status).toBe('Abandon : moteur cassé');
    expect(rows[0].status).toContain('tours parcourus');
    expect(retireLabel('no-move')).toBe('aucun déplacement possible');
  });
});
