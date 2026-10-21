/**
 * The player of a session token, read from the token itself (no network call).
 *
 * The Edge Function is deployed with `verify_jwt = true`: the Supabase gateway checks the signature and the expiry
 * before the function runs, so the payload can be trusted here. If that setting were ever turned off, this would accept
 * forged tokens: keep it on (docs/deploiement.md, tools/smoke-game.mjs checks that a forged token gets a 401).
 * What this does not see, compared with asking the auth service: a session closed or an account deleted less than an
 * hour ago (the token stays valid until it expires). The game checks suspensions in the database on every request.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function userFromVerifiedJwt(token: string, nowMs: number): { id: string } | null {
  try {
    const part = token.split('.')[1] ?? '';
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: unknown; role?: unknown; exp?: unknown };
    if (typeof payload.sub !== 'string' || !UUID.test(payload.sub)) return null;
    if (payload.role !== 'authenticated') return null; // the anon key itself is a token too: it is not a player
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= nowMs) return null;
    return { id: payload.sub };
  } catch {
    return null;
  }
}
