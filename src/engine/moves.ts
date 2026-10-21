import { isRaining, rainExtra, tireFactor } from './rules';
import { CELL_PIT_LANE, type CarState, type Cell, type MoveOption, type RaceState } from './types';

/** What a partial path has cost on its way to a destination. */
interface Partial {
  tires: number;
  missing: number;
  laps: number;
  risk: number;
  freeUsed: number;
  cornerId: string | null;
  cornerLeft: number;
  overshoot?: { corner: string; left: number; steps: number };
}

type Frontier = Map<string, Partial>;

export interface Walker {
  /** Every destination reachable with `movement` cells (§5), merged by destination, cheapest path kept. */
  moves(movement: number, brakesSpent?: number): MoveOption[];
}

const isPit = (c: Cell) => c.type >= CELL_PIT_LANE;

/**
 * Enumerates the paths of the car through the cell graph (DFS with memoisation on the cell, the cells
 * left, the corner state and the free stops left).
 *
 * Rules implemented (§5, §6):
 * - an occupied cell cannot be entered: the car stops before it and the missing steps cost brakes
 *   (at most `brakeLossCap`, the rest costs tires); a dead end costs the same;
 * - a lane change is only possible between two plain track cells, and not across a neighbour;
 * - the pit lane can only be entered to stop there, and left only when the car started in it;
 * - leaving a corner zone with stops left costs tires (§6).
 */
export function createWalker(state: RaceState, car: CarState): Walker {
  const { track, config } = state;
  const here = car.position;
  if (here === null) return { moves: () => [] };

  const occupied = new Set<string>();
  for (const c of state.cars) if (c !== car && c.position !== null) occupied.add(c.position);
  const raining = isRaining(state);
  const factor = tireFactor(car, raining);
  const startTires = car.maxWear.tires;
  const extra = rainExtra(config, car.tires, raining);
  const discount = car.mods.overshootTireDiscount;
  const memo = new Map<string, Frontier>();

  const edgeAllowed = (a: Cell, b: Cell, enteredPit: boolean): boolean => {
    if (isPit(a) && !isPit(b) && enteredPit) return false; // the pit lane cannot be used as a shortcut
    if (!isPit(a) && !isPit(b) && a.lane !== b.lane) {
      if (a.type !== 0 || b.type !== 0) return false; // lane changes only on the straights
      for (const sid of a.side) {
        const s = track.cells[sid];
        if (s.lane === b.lane && s.row === a.row && occupied.has(sid)) return false; // not across a neighbour
      }
    }
    return true;
  };

  const lossOf = (p: Partial): number => p.tires + Math.max(0, p.missing - config.brakeLossCap) + 3 * brakesLossOf(p.missing);
  const brakesLossOf = (missing: number): number => Math.max(0, Math.min(missing, config.brakeLossCap) - car.mods.blockBrakeDiscount);

  const offer = (out: Frontier, dest: string, p: Partial) => {
    const old = out.get(dest);
    if (!old || lossOf(p) < lossOf(old) || (lossOf(p) === lossOf(old) && p.missing < old.missing)) out.set(dest, p);
  };

  const explore = (id: string, left: number, cornerId: string | null, cornerLeft: number, enteredPit: boolean, free: number): Frontier => {
    const key = `${id}|${left}|${cornerId}|${cornerLeft}|${enteredPit ? 1 : 0}|${free}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const out: Frontier = new Map();
    const stop = (missing: number) => offer(out, id, { tires: 0, missing, laps: 0, risk: 0, freeUsed: 0, cornerId, cornerLeft });
    const cell = track.cells[id];
    if (left === 0) stop(0);
    else {
      let stepped = false;
      for (const nid of cell.next) {
        const n = track.cells[nid];
        if (!edgeAllowed(cell, n, enteredPit)) continue;
        stepped = true;
        if (occupied.has(nid)) {
          stop(left); // blocked: the remaining steps are missing
          continue;
        }
        // --- the step itself: corner exit loss (§6), corner entry, lap line, risk
        let tires = 0;
        let used = 0;
        let cId = cornerId;
        let cLeft = cornerLeft;
        let fr = free;
        let exit: Partial['overshoot'];
        if (cId !== null && n.corner?.id !== cId) {
          if (cLeft > 0) {
            const cover = Math.min(cLeft, fr);
            cLeft -= cover;
            fr -= cover;
            used += cover;
          }
          if (cLeft > 0) {
            // leaving the zone with stops missing: 3 x starting tires when more than one stop is missing, else steps left x factor
            const raw = cLeft > 1 ? 3 * startTires : left * factor;
            tires += Math.max(0, raw + extra - discount);
            exit = { corner: cId, left: cLeft, steps: left };
          }
          cId = null;
          cLeft = 0;
        }
        if (n.corner && n.corner.id !== cId) {
          cId = n.corner.id;
          cLeft = n.corner.stops;
        }
        const sub = explore(nid, left - 1, cId, cLeft, enteredPit || (!isPit(cell) && isPit(n)), fr);
        for (const [dest, p] of sub) {
          offer(out, dest, {
            ...p,
            tires: p.tires + tires,
            // crossing the line = the row falls back to the start of the lap (not every lane has a flagged line cell)
            laps: p.laps + (n.row < cell.row - track.lapLength / 2 ? 1 : 0),
            risk: p.risk + n.risk,
            freeUsed: p.freeUsed + used,
            overshoot: exit ?? p.overshoot,
          });
        }
      }
      if (!stepped) stop(left); // dead end
    }
    memo.set(key, out);
    return out;
  };

  return {
    moves(movement, brakesSpent = 0) {
      const frontier = explore(here, movement, car.cornerId, car.cornerLeft, false, car.freeStops);
      const options: MoveOption[] = [];
      for (const [dest, p] of frontier) {
        const brakesLoss = brakesLossOf(p.missing);
        const tiresLoss = p.tires + Math.max(0, p.missing - config.brakeLossCap);
        let reason: MoveOption['reason'];
        if (brakesSpent + brakesLoss > car.wear.brakes) reason = 'brakes';
        else if (!config.practice && car.wear.tires - tiresLoss < 0) reason = 'tires';
        options.push({
          cellId: dest,
          movement,
          missing: p.missing,
          brakesLoss,
          tiresLoss,
          cost: tiresLoss + 3 * brakesLoss,
          laps: p.laps,
          risk: p.risk,
          freeUsed: p.freeUsed,
          cornerId: p.cornerId,
          cornerLeft: p.cornerLeft,
          overshoot: p.overshoot,
          playable: reason === undefined,
          reason,
        });
      }
      // deterministic order: furthest first (laps crossed count), then by id
      const far = (o: MoveOption) => o.laps * track.lapLength + track.cells[o.cellId].row;
      return options.sort((a, b) => far(b) - far(a) || (a.cellId < b.cellId ? -1 : 1));
    },
  };
}
