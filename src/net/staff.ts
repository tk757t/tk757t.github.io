import { serverError } from './chat';
import { authClient } from './supabase';

/**
 * The tools of the staff (supabase/migrations/20261022200000_admin_tools.sql). Every function checks the role of the caller on the
 * server; what the browser decides (showing the buttons, or not) is only for comfort, never for security.
 */
export type Role = 'player' | 'tester' | 'vip' | 'admin';
export const ROLES: readonly Role[] = ['player', 'tester', 'vip', 'admin'];
export const ROLE_LABELS: Record<Role, string> = { player: 'Joueur', tester: 'Testeur', vip: 'VIP', admin: 'Admin' };

const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v);

let role: Role | null = null;
const roleFns = new Set<() => void>();

/** The role read from the server, or null while it is not known (no account, not asked yet, or the server did not answer). */
export const knownRole = (): Role | null => role;
export const canTest = (r: Role | null = role): boolean => r === 'tester' || r === 'admin';
export const canAdmin = (r: Role | null = role): boolean => r === 'admin';
export const onRoleChange = (fn: () => void): (() => void) => {
  roleFns.add(fn);
  return () => roleFns.delete(fn);
};

/** Asks the server which role this account has (a player when it says nothing useful). */
export async function refreshRole(): Promise<Role | null> {
  try {
    const { data, error } = await authClient().rpc('my_role');
    if (error) return role;
    const next: Role = isRole(data) ? data : 'player';
    if (next !== role) {
      role = next;
      roleFns.forEach((f) => f());
    }
  } catch {
    /* offline: the role stays what it was */
  }
  return role;
}

/** Tests: set the known role. */
export function setKnownRole(next: Role | null): void {
  role = next;
  roleFns.forEach((f) => f());
}

export const staffError = (e: unknown): string => serverError(e, 'Le serveur ne répond pas. Réessayez.');

async function call<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await authClient().rpc(name, args);
  if (error) throw error;
  return data as T;
}

// ------------------------------------------------------------------------------------------------ types
export interface AdminStats {
  accounts: number;
  withPseudo: number;
  new24h: number;
  online: number;
  suspended: number;
  muted: number;
  reportsPending: number;
  messagesHour: number;
  actionsHour: number;
}

export interface AdminPlayer {
  id: string;
  pseudo: string;
  role: Role;
  createdAt: number;
  lastAction: number | null;
  /** The reason of the suspension, or null. */
  suspension: string | null;
  mutedUntil: number | null;
  reports: number;
}

export interface AdminReport {
  messageId: number;
  body: string;
  author: string;
  authorPseudo: string;
  reports: number;
  reasons: string;
  hidden: boolean;
  lastAt: number;
}

export interface AdminAction {
  at: number;
  action: string;
  summary: string;
}

export interface AdminAuditLine {
  at: number;
  actor: string | null;
  action: string;
  target: string | null;
  payload: string;
}

const time = (v: unknown): number | null => (typeof v === 'string' ? Date.parse(v) : null);

// ------------------------------------------------------------------------------------------------ reading
export async function adminStats(): Promise<AdminStats> {
  const row = (await call<Record<string, number>[]>('admin_stats'))[0];
  return {
    accounts: Number(row.accounts),
    withPseudo: Number(row.with_pseudo),
    new24h: Number(row.new_24h),
    online: Number(row.online),
    suspended: Number(row.suspended),
    muted: Number(row.muted),
    reportsPending: Number(row.reports_pending),
    messagesHour: Number(row.messages_hour),
    actionsHour: Number(row.actions_hour),
  };
}

export async function adminPlayers(query: string, limit = 30): Promise<AdminPlayer[]> {
  const rows = await call<Record<string, unknown>[]>('admin_players', { p_query: query, p_limit: limit });
  return rows.map((r) => ({
    id: String(r.id),
    pseudo: String(r.pseudo),
    role: isRole(r.role) ? r.role : 'player',
    createdAt: time(r.created_at) ?? 0,
    lastAction: time(r.last_action),
    suspension: typeof r.suspension === 'string' ? r.suspension : null,
    mutedUntil: time(r.muted_until),
    reports: Number(r.reports ?? 0),
  }));
}

export async function adminReports(limit = 30): Promise<AdminReport[]> {
  const rows = await call<Record<string, unknown>[]>('admin_reports', { p_limit: limit });
  return rows.map((r) => ({
    messageId: Number(r.message_id),
    body: String(r.body),
    author: String(r.author),
    authorPseudo: String(r.author_pseudo),
    reports: Number(r.reports),
    reasons: String(r.reasons ?? ''),
    hidden: r.hidden === true,
    lastAt: time(r.last_at) ?? 0,
  }));
}

export async function adminActions(user: string, limit = 30): Promise<AdminAction[]> {
  const rows = await call<Record<string, unknown>[]>('admin_actions', { p_user: user, p_limit: limit });
  return rows.map((r) => ({ at: time(r.at) ?? 0, action: String(r.action), summary: String(r.summary ?? '') }));
}

export async function adminAudit(limit = 40): Promise<AdminAuditLine[]> {
  const rows = await call<Record<string, unknown>[]>('admin_audit', { p_limit: limit });
  return rows.map((r) => ({ at: time(r.at) ?? 0, actor: typeof r.actor_pseudo === 'string' ? r.actor_pseudo : null, action: String(r.action), target: typeof r.target_pseudo === 'string' ? r.target_pseudo : null, payload: String(r.payload ?? '') }));
}

export async function adminWords(): Promise<string[]> {
  return (await call<{ word: string }[]>('admin_words')).map((r) => r.word);
}

// ------------------------------------------------------------------------------------------------ actions
export const setRole = (user: string, to: Role): Promise<void> => call('admin_set_role', { p_user: user, p_role: to });
export const suspend = (user: string, reason: string): Promise<void> => call('admin_suspend', { p_user: user, p_reason: reason });
export const unsuspend = (user: string): Promise<void> => call('admin_unsuspend', { p_user: user });
export const mute = (user: string, minutes: number, reason: string): Promise<void> => call('admin_mute', { p_user: user, p_minutes: minutes, p_reason: reason });
export const unmute = (user: string): Promise<void> => call('admin_unmute', { p_user: user });
export const hideMessage = (message: number, hidden: boolean): Promise<void> => call('admin_hide', { p_message: message, p_hidden: hidden });
export const dismissReports = (message: number): Promise<void> => call('admin_dismiss', { p_message: message });
export const addWord = (word: string): Promise<void> => call('admin_word_add', { p_word: word });
export const removeWord = (word: string): Promise<void> => call('admin_word_remove', { p_word: word });

/** How the audit shows what an administrator did. */
export const AUDIT_LABELS: Record<string, string> = {
  role: 'a changé un rôle',
  suspend: 'a suspendu',
  unsuspend: 'a levé la suspension de',
  mute: 'a réduit au silence',
  unmute: 'a rendu la parole à',
  hide: 'a masqué un message',
  unhide: 'a réaffiché un message',
  dismiss: 'a écarté les signalements d’un message',
  word_add: 'a ajouté un mot refusé',
  word_remove: 'a retiré un mot refusé',
};
