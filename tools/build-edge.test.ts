import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ALLOWED_IMPORTS, buildEdge, importsOf } from './build-edge';

const dir = mkdtempSync(join(tmpdir(), '4mules-edge-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('Edge Function bundle', () => {
  it('builds into one file whose only import is the Supabase client', async () => {
    const { file } = await buildEdge(join(dir, 'index.js'));
    const code = readFileSync(file, 'utf8');
    expect(importsOf(code)).toEqual(ALLOWED_IMPORTS);
    // the rules are inside, the browser side is not
    expect(code).toContain('finish_race');
    expect(code).toContain('Course terminée trop vite');
    for (const banned of ['localStorage', 'document.', 'pixi', 'sb_secret_', 'sb_publishable_', '/src/app/', '/src/render/']) expect(code, banned).not.toContain(banned);
    expect(code.length).toBeLessThan(500_000);
  }, 30_000);

  it('finds every kind of import', () => {
    expect(importsOf('import a from "x";\nimport { b } from \'y\';\nexport * from "z";\nawait import("w");\nimport "v";')).toEqual(['x', 'y', 'v', 'z', 'w']);
  });
});
