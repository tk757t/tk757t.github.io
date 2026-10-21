import { Button } from '../ui/kit';
import { el } from '../ui/dom';

export interface BuildInfo {
  version: string;
  hash?: string;
  date?: string;
}

/** True when the published build differs from the running one (version or commit hash). Pure. */
export function isUpdateAvailable(current: BuildInfo, remote: unknown): boolean {
  if (!remote || typeof remote !== 'object') return false;
  const r = remote as Partial<BuildInfo>;
  if (typeof r.version !== 'string' || r.version === '') return false;
  if (r.version !== current.version) return true;
  return typeof r.hash === 'string' && r.hash !== '' && current.hash !== undefined && r.hash !== current.hash;
}

/** Version of the running build ("<version>+<hash>" split). */
export function currentBuild(): BuildInfo {
  const [version = '', hash] = (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0+dev').split('+');
  return { version, hash };
}

const CHECK_EVERY = 5 * 60_000;

function showBanner(): void {
  if (document.querySelector('[data-testid="update-banner"]')) return;
  const bar = Button({
    text: 'Mise à jour disponible, cliquez',
    variant: 'green',
    block: true,
    attrs: { 'data-testid': 'update-banner' },
    onClick: () => location.reload(),
  });
  document.body.append(el('div', { class: 'update-banner', role: 'status' }, bar));
}

/**
 * Polls version.json every 5 minutes and when the tab regains focus; shows a banner when the build changed.
 * Off in dev, unless the URL has ?updateCheck=1 (used by the e2e tests).
 */
export function startUpdater(): void {
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('updateCheck') !== '1') return;
  const current = currentBuild();
  const url = new URL('version.json', document.baseURI).href;
  let found = false;
  const check = async (): Promise<void> => {
    if (found) return;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return;
      if (isUpdateAvailable(current, await res.json())) {
        found = true;
        showBanner();
      }
    } catch {
      // offline or blocked: try again later
    }
  };
  setInterval(() => void check(), CHECK_EVERY);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
  window.addEventListener('focus', () => void check());
  void check();
}
