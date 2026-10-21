import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// e2e/dev-only (git-ignored) plays with the local development resources, on a second dev server
// started with VITE_DEV_ORIGIN_ASSETS=1. Everything else plays the game as it ships, without them.
const devOrigin = existsSync('e2e/dev-only') && existsSync('src/dev-only/index.ts');

// parallel work in several worktrees: each sets E2E_PORT (E2E_PORT+1 serves the dev-origin resources) so servers never mix
const PORT = Number(process.env.E2E_PORT ?? 5173);
const PORT_ORIGIN = PORT + 1;

export default defineConfig({
  testDir: 'e2e',
  // every test renders the race in WebGL without a GPU: more workers than this oversubscribe the CPU and make timings flaky
  workers: 6,
  webServer: [
    {
      command: `npm run dev -- --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: true,
      env: { VITE_DEV_ORIGIN_ASSETS: '0' },
    },
    ...(devOrigin
      ? [{ command: `npm run dev -- --port ${PORT_ORIGIN} --strictPort`, url: `http://localhost:${PORT_ORIGIN}`, reuseExistingServer: true, env: { VITE_DEV_ORIGIN_ASSETS: '1' } }]
      : []),
  ],
  projects: [
    { name: 'chromium', testIgnore: 'dev-only/**', use: { browserName: 'chromium', baseURL: `http://localhost:${PORT}` } },
    ...(devOrigin ? [{ name: 'dev-origin', testDir: 'e2e/dev-only', use: { browserName: 'chromium' as const, baseURL: `http://localhost:${PORT_ORIGIN}` } }] : []),
  ],
});
