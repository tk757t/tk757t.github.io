import { describe, expect, it } from 'vitest';
import { onlineLabel, waitingLabel } from './lobby';

describe('lobby labels', () => {
  it('counts the players online, in the singular for one', () => {
    expect(onlineLabel(0)).toBe('0 joueur en ligne');
    expect(onlineLabel(1)).toBe('1 joueur en ligne');
    expect(onlineLabel(12)).toBe('12 joueurs en ligne');
  });
  it('tells how many wait in each queue', () => {
    expect(waitingLabel({ online: 9, rankedWaiting: 3, openWaiting: 1 })).toBe('En attente : 3 en classé, 1 en non classé');
  });
});
