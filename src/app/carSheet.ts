import { capLoadoutMods, LEAGUES, type League } from '../data/parts/caps';
import { equippedParts, modsForLoadout } from '../data/parts/effects';
import { carStats, STAT_HINTS, type CarStats } from '../data/parts/stats';
import { FAMILIES, FAMILY_LABELS, type Family } from '../data/parts/types';
import type { Profile } from '../data/profile/profile';
import { Badge, ProgressBar } from '../ui/kit';
import { el } from '../ui/dom';

/** The family of each part equipped in the garage, counted (docs/gdd/10-stats-voitures.md § 10.5). */
export function familyCounts(p: Pick<Profile, 'loadout' | 'owned'>): Record<Family, number> {
  const counts: Record<Family, number> = { speed: 0, endurance: 0, precision: 0 };
  for (const part of equippedParts(p.loadout, p.owned)) counts[part.family]++;
  return counts;
}

/** One line per family: parts equipped out of the 5 that count, and what the next step of the series gives. */
export function seriesLine(counts: Record<Family, number>): HTMLElement {
  const items = FAMILIES.map((f) => {
    const n = counts[f];
    const active = n >= 5 ? 'série de 5' : n >= 3 ? 'série de 3' : null;
    return Badge({
      text: `${FAMILY_LABELS[f]} ${n}/5${active ? ` · ${active}` : ''}`,
      tone: n >= 5 ? 'gold' : n >= 3 ? 'green' : 'blue',
      attrs: { 'data-family': f, 'data-count': String(n) },
    });
  });
  return el('div', { class: 'series', 'data-testid': 'series', 'aria-label': 'Séries de pièces' }, ...items);
}

/** The six stats as bars of 10 and the power, one row per stat. `compare` marks the stats that differ from another car. */
export function statSheet(stats: CarStats, opts: { compare?: CarStats; clampedFrom?: CarStats; testid?: string } = {}): HTMLElement {
  const rows = stats.stats.map((s, i) => {
    const other = opts.compare?.stats[i];
    const cut = opts.clampedFrom?.stats[i];
    const bar = ProgressBar({ value: s.bars, max: 10, tone: 'blue', label: `${s.label} : ${s.bars} sur 10`, text: `${s.bars}/10`, small: true, attrs: { 'data-stat-bar': s.key } });
    const note = other && other.bars !== s.bars ? `${other.bars} → ${s.bars}` : cut && cut.bars !== s.bars ? `${cut.bars} → ${s.bars}` : null;
    return el(
      'li',
      { class: `stat-row${note ? (cut && !other ? ' clamped' : s.bars > (other?.bars ?? 0) ? ' up' : ' down') : ''}`, title: STAT_HINTS[s.key] },
      el('span', { class: 'stat-row__label', text: s.label }),
      bar,
      el('span', { class: 'stat-row__note', 'data-note': s.key, text: note ?? '' }),
    );
  });
  const powerNote = opts.compare && opts.compare.power !== stats.power ? ` (${opts.compare.power} → ${stats.power})` : opts.clampedFrom && opts.clampedFrom.power !== stats.power ? ` (${opts.clampedFrom.power} → ${stats.power})` : '';
  return el(
    'div',
    { class: 'stat-sheet', 'data-testid': opts.testid ?? 'stat-sheet' },
    el('p', { class: 'stat-power' }, el('span', { text: 'Puissance ' }), el('b', { 'data-testid': 'power', text: String(stats.power) }), el('small', { text: `/60${powerNote}` })),
    el('ul', { class: 'stat-rows' }, ...rows),
  );
}

/** The stats of the garage loadout. */
export const statsOfProfile = (p: Pick<Profile, 'loadout' | 'owned'>): CarStats => carStats(modsForLoadout(p.loadout, p.owned));

/** "En classé": the car brought back to the ceilings of a league, with what is cut shown in orange (§ 10.7). */
export function leagueSheet(p: Pick<Profile, 'loadout' | 'owned'>, league: League): HTMLElement {
  const own = statsOfProfile(p);
  const capped = capLoadoutMods(p.loadout, p.owned, league);
  const stats = carStats(capped.mods);
  const sheet = statSheet(stats, { clampedFrom: own, testid: 'league-sheet' });
  sheet.append(
    el('p', { class: 'muted', 'data-testid': 'league-note', text: capped.clamped.length ? 'Les valeurs en orange sont ramenées aux plafonds de la ligue.' : 'Aucune valeur n’est écrêtée dans cette ligue.' }),
  );
  return sheet;
}

export { LEAGUES };
