import { applyAction, isAction, type ActionName, type ActionResult } from './actions';
import { GameError, fail, type ErrorCode } from './errors';
import { importSave, MAX_SAVE_CHARS, type Adjustment } from './importSave';
import { asParams, only } from './params';
import type { RaceRules } from './race';
import { freshState, publicState, readState, type PublicState, type ServerState } from './state';

/**
 * The HTTP side of the game server, independent of Deno and of Supabase (both are injected): CORS by list of origins,
 * session check, rate limits, suspension, then load → rule → write with an optimistic lock on `version`, and the action
 * log. supabase/functions/game/index.ts plugs it into Deno.serve with a Supabase store; tests use memoryStore.
 */

export interface StoredRow {
  state: unknown;
  version: number;
}

export interface LogEntry {
  action: string;
  params: Record<string, unknown>;
  summary: Record<string, unknown>;
}

export interface GameStore {
  /** The user behind a session token (auth.getUser on the server), or null when it is not valid. */
  userOf(token: string): Promise<{ id: string } | null>;
  /** The reason of a suspension, or null. */
  suspension(uid: string): Promise<string | null>;
  /** How many actions of this player the log holds since `sinceMs`. */
  recentActions(uid: string, sinceMs: number): Promise<number>;
  load(uid: string): Promise<StoredRow | null>;
  /** Creates the row at version 0 and logs, in one transaction. False when the row already exists. */
  create(uid: string, state: ServerState, log: LogEntry): Promise<boolean>;
  /** Writes if the stored version is still `version` (then version + 1) and logs, in one transaction. Null when another write came first. */
  commit(uid: string, version: number, state: ServerState, log: LogEntry): Promise<number | null>;
}

export type ServerAction = ActionName | 'import_save';

export interface GameResponse {
  state: PublicState;
  result: ActionResult | { action: 'import_save'; report: Adjustment[] };
  version: number;
  serverTime: number;
}

export interface ErrorResponse {
  error: string;
  code: ErrorCode;
}

export interface HandlerOptions {
  now?: () => number;
  /** uint32 per call; crypto.getRandomValues by default. */
  random?: () => number;
  isAllowedOrigin?: (origin: string) => boolean;
  /** Requests per player and per 10 s counted in memory (each isolate): every request, refused ones too. */
  maxRequestsPer10s?: number;
  /** Actions per player and per 10 s counted in the action log (all isolates). */
  maxActionsPer10s?: number;
  rules?: RaceRules;
  /** Where unexpected errors go (console.error by default). */
  report?: (e: unknown) => void;
}

export const PROD_ORIGIN = 'https://tk757t.github.io';

/** The published game, and the dev servers of this repository (Vite and the e2e ports 5173 to 5800). */
export function defaultAllowedOrigin(origin: string): boolean {
  if (origin === PROD_ORIGIN) return true;
  const m = /^http:\/\/(localhost|127\.0\.0\.1):(\d{4})$/.exec(origin);
  return m !== null && Number(m[2]) >= 5173 && Number(m[2]) <= 5800;
}

export const cryptoRandom = (): number => crypto.getRandomValues(new Uint32Array(1))[0];

const MAX_BODY_CHARS = MAX_SAVE_CHARS + 2_000;
const MAX_PARAMS_CHARS = 2_000;
const AUTH_CACHE_MS = 60_000;
const ATTEMPTS = 3;

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Expiry of a JWT (ms), or null when it cannot be read. */
function jwtExpiry(token: string): number | null {
  try {
    const part = token.split('.')[1] ?? '';
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown };
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

const summary = (s: ServerState, extra?: Record<string, unknown>): Record<string, unknown> => ({
  gold: s.profile.gold,
  gems: s.profile.gems,
  fragments: s.profile.fragments,
  xp: s.profile.xp,
  races: s.profile.races,
  wins: s.profile.wins,
  ...extra,
});

export function createGameHandler(store: GameStore, opts: HandlerOptions = {}): (req: Request) => Promise<Response> {
  const now = opts.now ?? Date.now;
  const random = opts.random ?? cryptoRandom;
  const allowed = opts.isAllowedOrigin ?? defaultAllowedOrigin;
  const maxRequests = opts.maxRequestsPer10s ?? 60;
  const maxActions = opts.maxActionsPer10s ?? 40;
  const report = opts.report ?? ((e: unknown) => console.error('game', e));
  const hits = new Map<string, number[]>();
  const authCache = new Map<string, { uid: string; until: number }>();

  const cors = (req: Request): Record<string, string> => {
    const origin = req.headers.get('origin') ?? '';
    return {
      'Access-Control-Allow-Origin': allowed(origin) ? origin : PROD_ORIGIN,
      'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Max-Age': '7200',
      Vary: 'Origin',
    };
  };
  const json = (req: Request, status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });
  const error = (req: Request, e: GameError): Response => json(req, e.status, { error: e.message, code: e.code } satisfies ErrorResponse);

  function tooMany(uid: string): boolean {
    const t = now();
    const list = (hits.get(uid) ?? []).filter((x) => t - x < 10_000);
    list.push(t);
    if (hits.size > 5000) hits.clear();
    hits.set(uid, list);
    return list.length > maxRequests;
  }

  async function userOf(token: string): Promise<string | null> {
    const t = now();
    const cached = authCache.get(token);
    if (cached && cached.until > t) return cached.uid;
    authCache.delete(token);
    const user = await store.userOf(token);
    if (!user) return null;
    const exp = jwtExpiry(token);
    if (authCache.size > 1000) authCache.clear();
    authCache.set(token, { uid: user.id, until: Math.min(t + AUTH_CACHE_MS, exp ?? t + 10_000) });
    return user.id;
  }

  async function run(req: Request): Promise<Response> {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token || token.length > 4096) fail('Session expirée : reconnectez-vous.', 'auth', 401);
    const uid = await userOf(token);
    if (!uid) return fail('Session expirée : reconnectez-vous.', 'auth', 401);
    if (tooMany(uid)) fail('Trop d’actions d’un coup : patientez quelques secondes.', 'too_many', 429);

    const text = await req.text();
    if (text.length > MAX_BODY_CHARS) fail('Requête trop longue.', 'invalid', 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return fail('Requête illisible.', 'invalid');
    }
    if (!isRecord(body)) fail('Requête illisible.', 'invalid');
    only(body as Record<string, unknown>, ['action', 'params']);
    const action = (body as Record<string, unknown>).action;
    if (action !== 'import_save' && !isAction(action)) fail('Action inconnue.', 'invalid');
    const params = asParams((body as Record<string, unknown>).params);
    if (action !== 'import_save' && JSON.stringify(params).length > MAX_PARAMS_CHARS) fail('Paramètres trop longs.', 'invalid');

    const [suspended, recent, firstRead] = await Promise.all([store.suspension(uid), store.recentActions(uid, now() - 10_000), store.load(uid)]);
    if (suspended !== null) {
      // a suspended account keeps its game and can still read it, nothing else
      if (action === 'sync' && firstRead) {
        const s = readState(firstRead.state);
        return json(req, 200, { state: publicState(s), result: { action: 'sync' }, version: firstRead.version, serverTime: now() } satisfies GameResponse);
      }
      fail(`Compte suspendu : ${suspended}`, 'suspended', 403);
    }
    if (recent > maxActions) fail('Trop d’actions d’un coup : patientez quelques secondes.', 'too_many', 429);

    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      let row = attempt === 0 ? firstRead : await store.load(uid);
      const t = now();
      if (!row) {
        if (action === 'import_save') {
          only(params, ['save']);
          const imported = importSave(params.save, t, random);
          const ok = await store.create(uid, imported.state, { action, params: { chars: (params.save as string).length }, summary: summary(imported.state, { adjusted: imported.report }) });
          if (!ok) continue;
          return json(req, 200, { state: publicState(imported.state), result: { action: 'import_save', report: imported.report }, version: 0, serverTime: t } satisfies GameResponse);
        }
        const fresh = freshState(t, random);
        if (!(await store.create(uid, fresh, { action: 'create', params: {}, summary: summary(fresh) }))) continue;
        row = { state: fresh, version: 0 };
      }
      if (action === 'import_save') fail('Votre partie est déjà sur le serveur : la sauvegarde de cet appareil n’est pas importée.', 'import_refused', 409);
      const state = readState(row.state);
      const applied = applyAction(state, action, params, { now: t, random, rules: opts.rules });
      if (!applied.changed) return json(req, 200, { state: publicState(applied.state), result: applied.result, version: row.version, serverTime: t } satisfies GameResponse);
      const version = await store.commit(uid, row.version, applied.state, { action, params, summary: summary(applied.state, applied.log) });
      if (version === null) continue; // another request wrote in between: read again and replay the rule
      return json(req, 200, { state: publicState(applied.state), result: applied.result, version, serverTime: t } satisfies GameResponse);
    }
    return fail('Conflit de sauvegarde : réessayez.', 'conflict', 409);
  }

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    if (req.method !== 'POST') return json(req, 405, { error: 'Méthode non autorisée.', code: 'invalid' } satisfies ErrorResponse);
    try {
      return await run(req);
    } catch (e) {
      if (e instanceof GameError) return error(req, e);
      report(e);
      return error(req, new GameError('Erreur du serveur de jeu. Réessayez plus tard.', 'server', 500));
    }
  };
}
