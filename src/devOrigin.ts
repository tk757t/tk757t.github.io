/**
 * Local development resources (circuits, pictures, sounds) live in src/dev-only and
 * public/dev-only, both git-ignored. They are loaded only by the dev server with
 * VITE_DEV_ORIGIN_ASSETS=1 (`npm run dev:origin`). A production build never contains them: import.meta.env.DEV
 * is false there, vite.config.ts stubs src/dev-only and drops public/dev-only, and `npm run check:origin` checks dist/.
 */
interface DevOriginModule {
  install(): Promise<void>;
}

/** Installs the development resources when asked to; false when they are off or absent (fresh clone). */
export async function loadDevOrigin(): Promise<boolean> {
  if (!import.meta.env.DEV || import.meta.env.VITE_DEV_ORIGIN_ASSETS !== '1') return false;
  // the glob is empty when src/dev-only is missing, so a clone without it still runs
  const entry = Object.values(import.meta.glob<DevOriginModule>('./dev-only/index.ts'))[0];
  if (!entry) {
    console.warn('VITE_DEV_ORIGIN_ASSETS=1 but src/dev-only/index.ts is missing');
    return false;
  }
  await (await entry()).install();
  return true;
}
