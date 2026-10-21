/**
 * URL parameters that only exist for tests and development (?seed, ?packSeed, ?unlockMs, ?aiDelay, ?net=local, ?debug).
 * In a production build they are ignored: they would let a player pick the dice, the packs, the timers or farm rewards.
 */
export const devParam = (name: string): string | null => (import.meta.env.DEV ? new URLSearchParams(location.search).get(name) : null);

/** A random string from the browser's secure generator (room codes, client ids). */
export function secureToken(length: number, alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
