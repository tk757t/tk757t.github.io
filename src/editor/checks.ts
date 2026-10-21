import { raceReadyProblems, validateTrackDef } from '../data/tracks/validate';
import type { Generated } from './generate';

export interface Check {
  /** An error blocks the race and the simulation; a warning does not. */
  level: 'error' | 'warning';
  message: string;
  /** Cells to highlight on the drawing. */
  cells: string[];
}

/** Cars a circuit must be able to host. */
export const MIN_CARS = 4;

/** Validator messages (src/data/tracks/validate.ts) in the editor's words. */
const RULES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^cells (\S+) and (\S+) overlap$/, (m) => `Les cases ${m[1]} et ${m[2]} se superposent.`],
  [/^corner (\S+) can be crossed in (\d+) cells but needs (\d+) stops$/, (m) => `Le virage ${m[1]} se traverse en ${m[2]} case(s) mais demande ${m[3]} arrêts : allongez-le.`],
  [/^corner (\S+) is not one contiguous zone$/, (m) => `Le virage ${m[1]} est coupé en plusieurs morceaux.`],
  [/^weather thresholds/, () => 'Météo : il faut 1 ≤ seuil de pluie < seuil de soleil ≤ 20.'],
  [/^grid is empty$/, () => 'La grille de départ est vide.'],
  [/^no start\/finish line$/, () => 'Il n’y a pas de ligne d’arrivée.'],
  [/^cell (\S+) cannot be reached from the grid$/, (m) => `La case ${m[1]} n’est pas atteignable depuis la grille.`],
  [/^finish line is not reachable from cell (\S+)$/, (m) => `La ligne d’arrivée n’est pas atteignable depuis la case ${m[1]}.`],
  [/^finish line is not reachable from the grid$/, () => 'La ligne d’arrivée n’est pas atteignable depuis la grille.'],
  [/^the pit lane has no box$/, () => 'La voie des stands n’a aucun stand.'],
  [/^no way (into|out of) the pit lane$/, (m) => `La voie des stands n’a pas d’${m[1] === 'into' ? 'entrée' : 'sortie'}.`],
  [/^grid has (\d+) slots, (\d+) needed$/, (m) => `La grille n’a que ${m[1]} place(s) : il en faut ${m[2]}.`],
];

const translate = (msg: string): string => {
  for (const [re, fr] of RULES) {
    const m = msg.match(re);
    if (m) return fr(m);
  }
  return `Circuit invalide : ${msg}`;
};

const idsIn = (msg: string): string[] => msg.match(/\b(?:L\dS\d+|P\d+)\b/g) ?? [];

/**
 * Everything to fix before racing on a drawing: the circuit validator, what a race of four cars needs (grid, a box for
 * every team) and what the generator noticed (turns too tight, the line crossing itself, a pit lane too short).
 * Messages repeated for many cells are grouped.
 */
export function checkCircuit(g: Generated): Check[] {
  const out: Check[] = [];
  const raw = validateTrackDef(g.def);
  // "cell X ..." problems are grouped by their wording without the ids
  const grouped = new Map<string, { first: string; cells: string[]; count: number }>();
  for (const msg of raw) {
    const key = msg.replace(/\b(?:L\dS\d+|P\d+)\b/g, '#');
    const e = grouped.get(key) ?? { first: msg, cells: [], count: 0 };
    e.cells.push(...idsIn(msg));
    e.count++;
    grouped.set(key, e);
  }
  for (const e of grouped.values()) {
    const more = e.count > 1 ? ` (et ${e.count - 1} autre${e.count > 2 ? 's' : ''})` : '';
    out.push({ level: 'error', message: translate(e.first) + more, cells: [...new Set(e.cells)] });
  }
  const ready = raceReadyProblems(g.def, MIN_CARS);
  const missingTeams = ready.filter((p) => /^team \d+ has no box$/.test(p)).map((p) => p.match(/\d+/)![0]);
  for (const p of ready) if (!/^team/.test(p)) out.push({ level: 'error', message: translate(p), cells: [] });
  if (missingTeams.length) {
    out.push({
      level: 'error',
      message: g.pitSlots.length ? `Il manque les stands des équipes ${missingTeams.join(', ')}.` : 'Il manque la voie des stands et les stands des 5 équipes.',
      cells: [],
    });
  }
  for (const w of g.warnings) out.push({ level: w.code === 'no-corner' ? 'warning' : 'error', message: w.message, cells: w.cells });
  return out;
}

export const hasErrors = (checks: Check[]): boolean => checks.some((c) => c.level === 'error');
