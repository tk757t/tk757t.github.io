import { currentCar } from './reducer';
import { WEAR_CATEGORIES, type RaceState } from './types';

/** Returns every violated invariant of a state (empty array = valid). */
export function checkInvariants(s: RaceState): string[] {
  const p: string[] = [];
  const seen = new Set<string>();
  if (!Number.isInteger(s.rng) || s.rng < 0 || s.rng > 0xffffffff) p.push('rng is not a uint32');
  if (s.round < 1 || s.round > s.config.maxRounds + 1) p.push(`round ${s.round} out of range`);
  if (s.wetness < 0 || s.wetness > 4 || !Number.isInteger(s.wetness)) p.push(`bad wetness ${s.wetness}`);
  const ranks: number[] = [];
  for (const c of s.cars) {
    const active = c.retired === null && c.finishRank === null;
    if (!Number.isInteger(c.gear) || c.gear < 0 || c.gear > s.config.dice.length) p.push(`${c.id}: bad gear ${c.gear}`);
    for (const cat of WEAR_CATEGORIES) {
      const w = c.wear[cat];
      if (!Number.isInteger(w)) p.push(`${c.id}: ${cat} is not an integer`);
      if (active && w < 0) p.push(`${c.id}: active with ${cat} at ${w}`);
      if (w > c.maxWear[cat]) p.push(`${c.id}: ${cat} ${w} above its maximum ${c.maxWear[cat]}`);
    }
    if (c.rerolls < 0 || c.freeStops < 0 || c.repairLeft < 0) p.push(`${c.id}: negative counters`);
    if (c.laps < -1 || !Number.isInteger(c.laps) || c.laps > s.config.laps) p.push(`${c.id}: bad laps ${c.laps}`);
    if (c.cornerLeft < 0 || !Number.isInteger(c.cornerLeft)) p.push(`${c.id}: bad cornerLeft`);
    if (active !== (c.position !== null)) p.push(`${c.id}: position ${c.position} does not match its status`);
    if (c.retired !== null && c.finishRank !== null) p.push(`${c.id}: retired and finished`);
    if (c.finishRank !== null) ranks.push(c.finishRank);
    if (c.position !== null) {
      if (!s.track.cells[c.position]) p.push(`${c.id}: unknown cell ${c.position}`);
      if (seen.has(c.position)) p.push(`${c.id}: shares cell ${c.position}`);
      seen.add(c.position);
    }
  }
  if ([...ranks].sort((a, b) => a - b).some((r, i) => r !== i + 1)) p.push(`finish ranks ${ranks.join(',')} are not 1..n`);
  if (s.status === 'racing') {
    const car = currentCar(s);
    if (!car) p.push('no current car');
    else if (car.retired !== null || car.finishRank !== null) p.push('current car is out of the race');
    if (!s.turn) p.push('racing without a turn');
    if (s.results) p.push('results set while racing');
    if (s.phase === 'finished') p.push('phase finished while racing');
    if (s.turn && s.phase === 'gear' && s.turn.roll !== null) p.push('rolled before choosing a gear');
    if (s.turn && s.phase === 'adjust' && s.turn.roll === null) p.push('adjusting without a roll');
    if (s.turn && s.turn.brakes < 0) p.push('negative brakes adjustment');
  } else {
    if (!s.results) p.push('finished without results');
    if (s.phase !== 'finished') p.push('finished status with wrong phase');
    if (s.turn) p.push('turn left after the end');
  }
  return p;
}
