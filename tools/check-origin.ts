// Fails when the production build (dist/) contains a forbidden name in a built file
// or its path, or a copy of a development file (npm run check:origin, after npm run build). The list is local: tools/dev-only/forbidden-terms.json.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ForbiddenList {
  terms: string[];
  caseSensitiveTerms: string[];
  paths: string[];
  forbiddenDirs: string[];
}

export interface Finding {
  file: string;
  what: string;
}

const TEXT = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.svg', '.txt', '.xml', '.map', '.webmanifest', '.md']);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** One regex per term, matching it as a whole word (letters, digits and _ around it break the match). */
export function termMatchers(list: Pick<ForbiddenList, 'terms' | 'caseSensitiveTerms'>): { term: string; re: RegExp }[] {
  const word = (t: string, flags: string) => new RegExp(`(?<![\\p{L}\\p{N}_])${escape(t)}(?![\\p{L}\\p{N}_])`, flags);
  return [...list.terms.map((t) => ({ term: t, re: word(t, 'iu') })), ...list.caseSensitiveTerms.map((t) => ({ term: t, re: word(t, 'u') }))];
}

/** The local list of forbidden names (git-ignored); null on a fresh clone, where the check has nothing to compare with. */
export function loadForbiddenList(): ForbiddenList | null {
  const file = new URL('./dev-only/forbidden-terms.json', import.meta.url);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as ForbiddenList) : null;
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

const sha = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

/** Everything of `list` found in the build folder `dist` (paths relative to it). `root` resolves the forbidden folders. */
export function checkBuild(dist: string, list: ForbiddenList, root = '.'): Finding[] {
  const out: Finding[] = [];
  const files = walk(dist);
  if (files.length === 0) return [{ file: dist, what: 'no build to check (run npm run build first)' }];
  const matchers = termMatchers(list);
  const bySize = new Map<number, string[]>();
  for (const file of files) {
    const rel = relative(dist, file).replace(/\\/g, '/');
    for (const p of list.paths) if (rel.toLowerCase().includes(p.toLowerCase())) out.push({ file: rel, what: `path contains "${p}"` });
    for (const { term, re } of matchers) if (re.test(rel)) out.push({ file: rel, what: `file name contains "${term}"` });
    if (TEXT.has(extname(file).toLowerCase())) {
      const text = readFileSync(file, 'utf8');
      for (const { term, re } of matchers) {
        const m = re.exec(text);
        if (m) out.push({ file: rel, what: `contains "${term}": …${text.slice(Math.max(0, m.index - 30), m.index + term.length + 30).replace(/\s+/g, ' ')}…` });
      }
    }
    const size = statSync(file).size;
    bySize.set(size, [...(bySize.get(size) ?? []), rel]);
  }
  // copies of development files, whatever their name: compare contents (only files of a size found in the build)
  const built = new Map<string, string>();
  for (const dir of list.forbiddenDirs) {
    for (const file of walk(join(root, dir))) {
      const candidates = bySize.get(statSync(file).size);
      if (!candidates) continue;
      const hash = sha(readFileSync(file));
      for (const rel of candidates) {
        if (!built.has(rel)) built.set(rel, sha(readFileSync(join(dist, rel))));
        if (built.get(rel) === hash) out.push({ file: rel, what: `is a copy of ${relative(root, file).replace(/\\/g, '/')}` });
      }
    }
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const list = loadForbiddenList();
  if (!list) {
    console.log('check:origin: skipped, tools/dev-only/forbidden-terms.json is absent (local list)');
    process.exit(0);
  }
  const findings = checkBuild('dist', list);
  if (findings.length) {
    console.error(`check:origin: ${findings.length} problem(s) in dist/`);
    for (const f of findings) console.error(`  ${f.file}: ${f.what}`);
    process.exit(1);
  }
  console.log(`check:origin: dist/ is clean (${walk('dist').length} files, ${list.terms.length + list.caseSensitiveTerms.length} forbidden names)`);
}
