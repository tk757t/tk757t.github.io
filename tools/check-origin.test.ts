import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkBuild, termMatchers, type ForbiddenList } from './check-origin';

const list: ForbiddenList = { terms: ['Zorglub Dé', 'Quuxville', 'Blorp'], caseSensitiveTerms: ['QZ', 'BAR'], paths: ['dev-only'], forbiddenDirs: ['secret'] };

function fixture(files: Record<string, string | Buffer>): string {
  const root = mkdtempSync(join(tmpdir(), 'check-origin-'));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}

describe('check:origin', () => {
  it('matches whole words: case-free for names, exact for short ones', () => {
    const hit = (s: string) => termMatchers(list).filter((m) => m.re.test(s)).map((m) => m.term);
    expect(hit('une course à quuxville')).toEqual(['Quuxville']);
    expect(hit('ZORGLUB DÉ online')).toEqual(['Zorglub Dé']);
    expect(hit('le QZ de 2001')).toEqual(['QZ']);
    expect(hit('color:#f1f1f1;x.QZa=0;barre;BARx')).toEqual([]);
    expect(hit('écurie BAR')).toEqual(['BAR']);
  });

  it('passes a clean build', () => {
    const root = fixture({ 'dist/index.html': '<title>4 Mules</title>', 'dist/assets/a.js': 'const s="#f1f1f1";', 'dist/font.woff2': Buffer.from([1, 2, 3]) });
    expect(checkBuild(join(root, 'dist'), list, root)).toEqual([]);
  });

  it('finds a forbidden name in a built file, in a path, and a renamed copy of a development file', () => {
    const picture = Buffer.from([0x47, 0x49, 0x46, 0x38, 9, 9, 9]);
    const root = fixture({
      'dist/assets/index.js': 'const team="Blorp";',
      'dist/dev-only/x.txt': 'ok',
      'dist/assets/car.gif': picture,
      'secret/cars/red.gif': picture,
    });
    const found = checkBuild(join(root, 'dist'), list, root);
    expect(found.map((f) => f.file).sort()).toEqual(['assets/car.gif', 'assets/index.js', 'dev-only/x.txt']);
    expect(found.find((f) => f.file === 'assets/car.gif')!.what).toBe('is a copy of secret/cars/red.gif');
  });

  it('refuses to pass when there is no build', () => {
    expect(checkBuild(join(tmpdir(), 'no-such-dist-folder'), list)).toHaveLength(1);
  });
});
