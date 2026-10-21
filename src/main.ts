import './ui/kit'; // design system first: app styles override it
import './app/style.css';
import { App } from './app/App';
import { initProfile } from './app/profile';
import { exposeSoundForTests, installKitSounds } from './app/sound';
import { applyTokens } from './ui/kit';
import { startUpdater } from './app/updater';
import { loadDevOrigin } from './devOrigin';
import { devParam } from './app/devParams';
import { ensureAccount } from './app/accountScreen';
import { connectServerGame } from './app/serverGame';
import { startPresence } from './app/presence';

await loadDevOrigin();
applyTokens();
installKitSounds();
exposeSoundForTests();

const params = new URLSearchParams(location.search);
// a brand new profile draws its packs from this seed (?seed= in tests, random otherwise)
const seed = Number(devParam('packSeed') ?? devParam('seed'));
initProfile(Number.isFinite(seed) && seed > 0 ? seed : crypto.getRandomValues(new Uint32Array(1))[0]);
const root = document.getElementById('app') as HTMLElement;
await ensureAccount();
// a signed-in account plays against the game server (its economy is decided there); the menu shows meanwhile
void connectServerGame();
startPresence();
// the circuit editor, opened from the Course tab (?editor=1), or at /editor on the development server (loaded on demand)
if (params.has('editor') || (import.meta.env.DEV && /^\/editor\/?$/.test(location.pathname))) {
  const { mountEditor } = await import('./editor/EditorScreen');
  await mountEditor(root);
} else {
  const app = new App(root);
  app.showShell('race');
  startUpdater();
  // an invitation link (?join=CODE) opens the online room
  const join = params.get('join');
  if (join) app.openOnline(join.toUpperCase());
}
