import { describe, expect, it } from 'vitest';
import { deleteConfirmed, PRIVACY, PUBLISHER } from './privacy';

describe('privacy notice', () => {
  it('names the publisher and covers the four topics', () => {
    expect(PRIVACY.map((s) => s.title)).toEqual(['Qui édite le jeu', 'Ce que le jeu garde', 'Si vous liez Discord', 'Supprimer votre compte']);
    expect(PRIVACY[0].lines.join(' ')).toContain(PUBLISHER);
  });
  it('says honestly that Discord gives an e-mail address', () => {
    expect(PRIVACY[2].lines.join(' ')).toMatch(/e-mail/);
  });
});

describe('deleteConfirmed', () => {
  it('accepts the pseudo typed back, ignoring case and spaces around', () => {
    expect(deleteConfirmed(' max_07 ', 'Max_07')).toBe(true);
  });
  it('refuses anything else, and an empty entry', () => {
    expect(deleteConfirmed('Max_08', 'Max_07')).toBe(false);
    expect(deleteConfirmed('', '')).toBe(false);
  });
});
