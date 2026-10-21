import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import { CHANGELOG } from './changelog';

describe('changelog', () => {
  it('starts with the current package version', () => expect(CHANGELOG[0]?.version).toBe(pkg.version));
  it('has notes for every entry', () => {
    for (const e of CHANGELOG) expect(e.notes.length).toBeGreaterThan(0);
  });
});
