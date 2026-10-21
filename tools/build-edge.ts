// Builds the deployable file of the Edge Function « game »: supabase/functions/game/index.ts and everything it imports
// from src/server and src/data, in one ESM file (supabase/functions/game/index.js, git-ignored). The only import left is
// the Supabase client, which Deno resolves itself (npm: specifier).
//   npx tsx tools/build-edge.ts            -> supabase/functions/game/index.js
//   npx tsx tools/build-edge.ts --out f.js -> another file
// esbuild is used when installed (it comes with tsx and vite), otherwise the bundler of vite (rolldown).
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const EDGE_ENTRY = resolve(ROOT, 'supabase/functions/game/index.ts');
export const EDGE_OUT = resolve(ROOT, 'supabase/functions/game/index.js');
/** The only module the bundle may import: Deno fetches it from npm. */
export const ALLOWED_IMPORTS = ['npm:@supabase/supabase-js@2.118.0'];

const BANNER = '// Généré par tools/build-edge.ts à partir de supabase/functions/game/index.ts et src/server : ne pas modifier.';

export async function buildEdge(outFile: string = EDGE_OUT): Promise<{ file: string; bundler: 'esbuild' | 'rolldown' }> {
  mkdirSync(dirname(outFile), { recursive: true });
  try {
    const esbuild = await import('esbuild');
    await esbuild.build({
      entryPoints: [EDGE_ENTRY],
      outfile: outFile,
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      target: 'es2022',
      external: ['npm:*'],
      banner: { js: BANNER },
      charset: 'utf8',
      legalComments: 'none',
      logLevel: 'silent',
    });
    return { file: outFile, bundler: 'esbuild' };
  } catch (e) {
    if (!(e instanceof Error) || !/Cannot find (module|package)/.test(e.message)) throw e;
  }
  const { rolldown } = await import('rolldown');
  const bundle = await rolldown({ input: EDGE_ENTRY, platform: 'neutral', external: [/^npm:/] });
  await bundle.write({ file: outFile, format: 'esm', banner: BANNER });
  await bundle.close();
  return { file: outFile, bundler: 'rolldown' };
}

/** Every module specifier the bundle imports (static, dynamic, re-exports). */
export function importsOf(code: string): string[] {
  const out = new Set<string>();
  const patterns = [/\bimport\s*(?:[\w*{}\s,$]+\s*from\s*)?["']([^"']+)["']/g, /\bexport\s*[\w*{}\s,$]*\s*from\s*["']([^"']+)["']/g, /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g];
  for (const re of patterns) for (const m of code.matchAll(re)) out.add(m[1]);
  return [...out];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const at = process.argv.indexOf('--out');
  const out = at > 0 && process.argv[at + 1] ? resolve(process.argv[at + 1]) : EDGE_OUT;
  const r = await buildEdge(out);
  console.log(`Edge Function « game » construite avec ${r.bundler} : ${r.file}`);
}
