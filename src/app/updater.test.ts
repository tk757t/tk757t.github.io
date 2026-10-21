import { describe, expect, it } from 'vitest';
import { isUpdateAvailable } from './updater';

describe('isUpdateAvailable', () => {
  const cur = { version: '0.1.0', hash: 'abc1234' };
  it('is false for the same build', () => expect(isUpdateAvailable(cur, { version: '0.1.0', hash: 'abc1234', date: 'x' })).toBe(false));
  it('is true for another version', () => expect(isUpdateAvailable(cur, { version: '0.2.0', hash: 'abc1234' })).toBe(true));
  it('is true for another hash', () => expect(isUpdateAvailable(cur, { version: '0.1.0', hash: 'def5678' })).toBe(true));
  it('ignores garbage', () => {
    for (const bad of [null, undefined, 'x', 3, {}, { version: 2 }, { version: '' }]) expect(isUpdateAvailable(cur, bad)).toBe(false);
  });
});
