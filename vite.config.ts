import { execSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { SUPABASE_URL } from './src/net/config';

const STUB = '\0dev-only-stub';

/**
 * Local development resources (src/dev-only, public/dev-only) never go
 * into a build: any import of src/dev-only resolves to an empty module, and public/dev-only is removed from the output.
 */
function stripDevOnly(): Plugin {
  let outDir = 'dist';
  let devOnly = '';
  return {
    name: 'strip-dev-only',
    apply: 'build',
    enforce: 'pre',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
      devOnly = resolve(config.root, 'src', 'dev-only') + sep;
    },
    async resolveId(source, importer, options) {
      if (source === STUB) return STUB;
      const hit = await this.resolve(source, importer, { ...options, skipSelf: true });
      return hit && resolve(hit.id.split('?')[0]).startsWith(devOnly) ? STUB : null;
    },
    load(id) {
      return id === STUB ? 'export async function install() {}\nexport default {};\n' : null;
    },
    closeBundle() {
      rmSync(resolve(outDir, 'dev-only'), { recursive: true, force: true });
    },
  };
}

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')) as { version: string };

function shortHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'nogit';
  }
}

const BUILD = { version: pkg.version, hash: shortHash(), date: new Date().toISOString() };

/** Writes dist/version.json (version, short hash, date): the running game compares it with its own to offer an update. */
function emitVersion(): Plugin {
  let outDir = 'dist';
  return {
    name: 'emit-version',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      writeFileSync(resolve(outDir, 'version.json'), JSON.stringify(BUILD));
    },
  };
}

/**
 * Content-Security-Policy as a meta tag (GitHub Pages cannot send headers), added to production builds only: the dev server
 * needs inline scripts and its own websocket. The build has no inline script and no eval; Pixi starts workers from blob: URLs.
 */
function contentSecurityPolicy(): Plugin {
  const host = new URL(SUPABASE_URL).host;
  const policy = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    `connect-src 'self' https://${host} wss://${host}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }],
  };
}

export default defineConfig(({ mode, command }) => ({
  define: { __APP_VERSION__: JSON.stringify(`${BUILD.version}+${BUILD.hash}`) },
  // the dev server with the development resources gets its own dependency cache, so both servers can run side by side (e2e)
  cacheDir: loadEnv(mode, import.meta.dirname, 'VITE_').VITE_DEV_ORIGIN_ASSETS === '1' ? 'node_modules/.vite-origin' : undefined,
  plugins: [stripDevOnly(), emitVersion(), contentSecurityPolicy()],
  build: {
    rollupOptions: {
      // the demo page is for development only: it is not part of what players get
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        ...(command === 'build' ? {} : { demo: resolve(import.meta.dirname, 'demo.html') }),
      } as Record<string, string>,
    },
  },
  test: { include: ['src/**/*.test.ts', 'tools/**/*.test.ts'] },
}));
