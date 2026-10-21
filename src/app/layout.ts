/**
 * The width from which the chat is docked at the right of the screen, always in view (a computer); under it, the chat is a window opened
 * from the top bar or from the floating bubble (a phone or a tablet).
 */
export const DOCK_MIN_WIDTH = 1180;

const query = (): MediaQueryList => window.matchMedia(`(min-width: ${DOCK_MIN_WIDTH}px)`);

export const isDockLayout = (): boolean => query().matches;

/** Calls `fn` when the screen changes from one layout to the other. */
export function onLayoutChange(fn: () => void): () => void {
  const q = query();
  q.addEventListener('change', fn);
  return () => q.removeEventListener('change', fn);
}
