import { parseProfile } from '../data/profile/profile';
import { SUPABASE_KEY, SUPABASE_URL } from '../net/config';
import { authClient } from '../net/supabase';
import type { ActionResult, Adjustment, ErrorResponse, GameResponse, RaceToken, ServerAction } from '../server';
import { getAccount } from './account';
import { devParam } from './devParams';
import { cachedServerProfile, localSaveText, setServerProfile, useLocalProfile } from './profile';
import { toast } from './toast';

/**
 * Client of the Edge Function « game » (supabase/functions/game, logic in src/server). For signed-in accounts (guest or
 * Discord) the server decides the whole economy: this module sends the player's actions, and the profile on screen is
 * the one the server returns. Without an account, offline, or in development without ?account=1, nothing changes:
 * the game plays locally (src/app/economy.ts picks the path).
 */

export const GAME_URL = `${SUPABASE_URL}/functions/v1/game`;
const TIMEOUT_MS = 12_000;

export class ServerError extends Error {
  constructor(
    message: string,
    /** The server's code (see src/server/errors.ts), or "network". */
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ServerError';
  }
}

/** Accounts play against the server in production, and in development only with ?account=1 (the e2e tests play offline). */
export const serverModeAllowed = (): boolean => !import.meta.env.DEV || devParam('account') === '1';

let offset = 0;
let race: RaceToken | null = null;
let connecting: Promise<void> = Promise.resolve();

/** The server's clock as seen from here (countdowns of the chests): device time corrected by the last answer. */
export const serverNow = (): number => Date.now() + offset;

/** Resolves once the connection attempt of the start-up is over (economy actions wait for it). */
export const serverReady = (): Promise<void> => connecting;

const cacheKey = (uid: string): string => `4mules.server.${uid}`;

async function session(): Promise<{ token: string; uid: string } | null> {
  const { data } = await authClient().auth.getSession();
  const s = data.session;
  return s ? { token: s.access_token, uid: s.user.id } : null;
}

export interface Answer<R> {
  result: R;
  race: RaceToken | null;
}

/** Sends one action. The profile of the answer replaces the one on screen. Throws a ServerError (French message). */
export async function callGame<A extends ServerAction>(action: A, params: Record<string, unknown> = {}): Promise<Answer<Extract<GameResponse['result'], { action: A }>>> {
  const s = await session();
  if (!s) throw new ServerError('Session expirée : reconnectez-vous.', 'auth', 401);
  let res: Response;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    res = await fetch(GAME_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: SUPABASE_KEY, authorization: `Bearer ${s.token}` },
      body: JSON.stringify({ action, params }),
      signal: abort.signal,
    });
  } catch {
    throw new ServerError('Connexion au serveur impossible. Vérifiez votre réseau et réessayez.', 'network', 0);
  } finally {
    clearTimeout(timer);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* not JSON: handled below */
  }
  if (!res.ok) {
    const e = (body ?? {}) as Partial<ErrorResponse>;
    throw new ServerError(typeof e.error === 'string' ? e.error : 'Le serveur de jeu est indisponible. Réessayez plus tard.', typeof e.code === 'string' ? e.code : 'server', res.status);
  }
  const answer = body as Partial<GameResponse> | null;
  const parsed = answer?.state?.profile ? parseProfile(JSON.stringify(answer.state.profile)) : null;
  if (!answer || !parsed || typeof answer.serverTime !== 'number' || !answer.result) throw new ServerError('Réponse du serveur illisible.', 'server', res.status);
  offset = answer.serverTime - Date.now();
  race = answer.state?.race ?? null;
  setServerProfile(parsed.profile, cacheKey(s.uid));
  return { result: answer.result as Extract<GameResponse['result'], { action: A }>, race };
}

/** The race token the server holds for this player (one at a time). */
export const currentRace = (): RaceToken | null => race;

const FIELD_LABELS: Record<string, string> = { gold: 'or', gems: 'gemmes', fragments: 'fragments', xp: 'expérience', packs: 'coffres', campaign: 'campagne' };

/** One line for the player about what the import brought down. */
export function importMessage(report: Adjustment[]): string {
  if (report.length === 0) return 'Votre progression est maintenant enregistrée sur le serveur.';
  const names = [...new Set(report.map((r) => FIELD_LABELS[r.field] ?? (r.field.startsWith('owned.') ? 'pièces' : r.field.startsWith('slots') ? 'coffres' : 'compteurs')))];
  return `Progression importée. Certaines valeurs ont été ramenées à un niveau raisonnable : ${names.join(', ')}.`;
}

/**
 * At start-up, for a signed-in account: shows the last copy the server sent (if any), then asks the server. The first
 * time, the save of this device is offered for import (the server bounds it, and refuses once the game exists there).
 * When the server cannot be reached, the device goes back to its local save.
 */
export function connectServerGame(): Promise<void> {
  if (!serverModeAllowed() || !getAccount()) return connecting;
  connecting = (async () => {
    const s = await session().catch(() => null);
    if (!s) return;
    const cached = cachedServerProfile(cacheKey(s.uid));
    if (cached) setServerProfile(cached, cacheKey(s.uid));
    try {
      let synced = false;
      if (!cached) {
        try {
          const r = await callGame('import_save', { save: localSaveText() });
          synced = true;
          toast(importMessage(r.result.report), r.result.report.length ? 'bad' : 'good');
        } catch (e) {
          if (!(e instanceof ServerError) || e.code !== 'import_refused') throw e;
        }
      }
      if (!synced) await callGame('sync');
    } catch (e) {
      useLocalProfile();
      toast(e instanceof ServerError && e.code === 'suspended' ? e.message : 'Serveur de jeu injoignable : la partie continue sur cet appareil.', 'bad');
    }
  })();
  return connecting;
}

/**
 * Runs an action for the economy screens and tells the player what went wrong. A refusal or a lost write means this
 * screen was out of date: the profile is read again from the server. Returns null when the action did not happen.
 */
export async function serverAction<A extends ServerAction>(action: A, params: Record<string, unknown> = {}): Promise<Extract<ActionResult, { action: A }> | null> {
  try {
    return (await callGame(action, params)).result as Extract<ActionResult, { action: A }>;
  } catch (e) {
    const err = e instanceof ServerError ? e : new ServerError('Une erreur est survenue. Réessayez.', 'server', 0);
    toast(err.code === 'conflict' ? 'Partie mise à jour depuis le serveur : réessayez.' : err.message, 'bad');
    if (err.code !== 'network' && err.code !== 'auth' && err.code !== 'too_many') void callGame('sync').catch(() => undefined);
    return null;
  }
}
