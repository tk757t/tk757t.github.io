import { isRaining, rainExtra, tireFactor } from './rules';
import { CELL_PIT_LANE, type CarState, type Cell, type MoveOption, type RaceState } from './types';

/** What a partial path has cost on its way to a destination. */
interface Partial {
  tires: number;
  missing: number;
  /** What stopped the car on this path, when it did not take every step. */
  blocked: 'car' | 'end' | null;
  /** The path leaves a corner with two stops or more missing: the wall. */
  crash: boolean;
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

/** Weight of one bodywork point in the cost the AI minimises: bodywork is scarcer than brakes (3), so a contact is avoided harder. */
const BODY_WEIGHT = 6;

/** Added to the cost of a path that ends in the wall, so that the AI never picks it when another path exists. */
const CRASH_COST = 100;

/**
 * Enumerates the paths of the car through the cell graph (DFS with memoisation on the cell, the cells
 * left, the corner state and the free stops left).
 *
 * Rules implemented (§5, §6):
 * - an occupied cell cannot be entered: the car stops before it and loses bodywork (`blockBody`, parts may reduce it);
 *   a dead end (none on our circuits) costs brakes (at most `brakeLossCap`), the rest tires;
 * - a lane change is only possible between two plain track cells, and not across a neighbour;
 * - the pit lane can only be entered to stop there, and left only when the car started in it;
 * - leaving a corner zone with one stop left costs tires; with two or more left the car hits the wall and is out (§6).
 */
export function createWalker(state: RaceState, car: CarState): Walker {
  const { track, config } = state;
  const here = car.position;
  if (here === null) return { moves: () => [] };

  const occupied = new Set<string>();
  for (const c of state.cars) if (c !== car && c.position !== null) occupied.add(c.position);
  const raining = isRaining(state);
  const factor = tireFactor(car, raining);
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

  // behind a car the cost is bodywork; only the end of the way (never on our circuits) costs brakes then tires
  const brakesLossOf = (p: Partial): number => (p.blocked === 'end' ? Math.max(0, Math.min(p.missing, config.brakeLossCap) - car.mods.blockBrakeDiscount) : 0);
  const blockTiresOf = (p: Partial): number => (p.blocked === 'end' ? Math.max(0, p.missing - config.brakeLossCap) : 0);
  const bodyLossOf = (p: Partial): number => (p.blocked === 'car' ? Math.max(0, Math.round(config.blockBody - car.mods.blockBrakeDiscount)) : 0);
  const lossOf = (p: Partial): number => p.tires + blockTiresOf(p) + 3 * brakesLossOf(p) + BODY_WEIGHT * bodyLossOf(p) + (p.crash ? CRASH_COST : 0);

  const offer = (out: Frontier, dest: string, p: Partial) => {
    const old = out.get(dest);
    if (!old || lossOf(p) < lossOf(old) || (lossOf(p) === lossOf(old) && p.missing < old.missing)) out.set(dest, p);
  };

  const explore = (id: string, left: number, cornerId: string | null, cornerLeft: number, enteredPit: boolean, free: number): Frontier => {
    const key = `${id}|${left}|${cornerId}|${cornerLeft}|${enteredPit ? 1 : 0}|${free}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const out: Frontier = new Map();
    const stop = (missing: number, blocked: Partial['blocked'] = null) => offer(out, id, { tires: 0, missing, blocked, crash: false, laps: 0, risk: 0, freeUsed: 0, cornerId, cornerLeft });
    const cell = track.cells[id];
    if (left === 0) stop(0);
    else {
      let stepped = false;
      for (const nid of cell.next) {
        const n = track.cells[nid];
        if (!edgeAllowed(cell, n, enteredPit)) continue;
        stepped = true;
        if (occupied.has(nid)) {
          stop(left, 'car'); // blocked: the remaining steps are missing
          continue;
        }
        // --- the step itself: corner exit loss (§6), corner entry, lap line, risk
        let tires = 0;
        let used = 0;
        let cId = cornerId;
        let cLeft = cornerLeft;
        let fr = free;
        let exit: Partial['overshoot'];
        let severe = false;
        if (cId !== null && n.corner?.id !== cId) {
          if (cLeft > 0) {
            const cover = Math.min(cLeft, fr);
            cLeft -= cover;
            fr -= cover;
            used += cover;
          }
          if (cLeft > 0) {
            // leaving the zone with one stop missing: steps left x factor in tires; with two or more, the wall (no tires: the car is out)
            severe = cLeft > 1;
            if (!severe) tires += Math.max(0, left * factor + extra - discount);
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
            crash: p.crash || severe,
            // crossing the line = the row falls back to the start of the lap (not every lane has a flagged line cell)
            laps: p.laps + (n.row < cell.row - track.lapLength / 2 ? 1 : 0),
            risk: p.risk + n.risk,
            freeUsed: p.freeUsed + used,
            overshoot: exit ?? p.overshoot,
          });
        }
      }
      if (!stepped) stop(left, 'end'); // dead end
    }
    memo.set(key, out);
    return out;
  };

  return {
    moves(movement, brakesSpent = 0) {
      const frontier = explore(here, movement, car.cornerId, car.cornerLeft, false, car.freeStops);
      const options: MoveOption[] = [];
      for (const [dest, p] of frontier) {
        const brakesLoss = brakesLossOf(p);
        const bodyLoss = bodyLossOf(p);
        const tiresLoss = p.tires + blockTiresOf(p);
        let reason: MoveOption['reason'];
        if (brakesSpent + brakesLoss > car.wear.brakes) reason = 'brakes';
        else if (!config.practice && car.wear.tires - tiresLoss < 0) reason = 'tires';
        options.push({
          cellId: dest,
          movement,
          missing: p.missing,
          blocked: p.blocked,
          bodyLoss,
          crash: p.crash,
          brakesLoss,
          tiresLoss,
          cost: tiresLoss + 3 * brakesLoss + BODY_WEIGHT * bodyLoss + (p.crash ? CRASH_COST : 0),
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
