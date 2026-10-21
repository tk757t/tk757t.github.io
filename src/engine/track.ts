import { CELL_BOX_FIRST, CELL_BOX_LAST, type Track } from './types';

/** Returns a list of structural problems of an engine track (empty when valid). */
export function validateTrack(track: Track): string[] {
  const problems: string[] = [];
  for (const [key, cell] of Object.entries(track.cells)) {
    if (cell.id !== key) problems.push(`cell ${key} has mismatching id ${cell.id}`);
    for (const n of cell.next) if (!track.cells[n]) problems.push(`cell ${key} points to unknown ${n}`);
    for (const n of cell.side) if (!track.cells[n]) problems.push(`cell ${key} has unknown neighbour ${n}`);
    if (cell.link && !track.cells[cell.link]) problems.push(`cell ${key} has unknown link ${cell.link}`);
    if (cell.corner && ![1, 2, 3].includes(cell.corner.stops)) problems.push(`cell ${key} corner needs ${cell.corner.stops} stops (1-3 allowed)`);
    if ((cell.type === 1) !== (cell.corner !== undefined)) problems.push(`cell ${key}: type ${cell.type} does not match its corner data`);
    if (cell.type < 0 || cell.type > CELL_BOX_LAST) problems.push(`cell ${key} has invalid type ${cell.type}`);
    if (cell.type >= CELL_BOX_FIRST && cell.type > CELL_BOX_LAST) problems.push(`cell ${key} is not a valid box`);
  }
  for (const g of track.grid) if (!track.cells[g]) problems.push(`grid cell ${g} unknown`);
  if (new Set(track.grid).size !== track.grid.length) problems.push('duplicate grid cells');
  if (!(track.weather.rain < track.weather.sun)) problems.push('weather thresholds must satisfy rain < sun');
  return problems;
}
