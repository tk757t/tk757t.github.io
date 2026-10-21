import { authClient } from '../net/supabase';

/**
 * The player's account: a guest (anonymous sign-in) or Discord, plus the pseudo they chose. The server keeps nothing else
 * about them (no e-mail, no Discord name, no picture): see supabase/migrations/20261021120000_socle.sql.
 */
export interface Account {
  pseudo: string | null;
  guest: boolean;
}

export const PSEUDO_RE = /^[A-Za-z0-9_.-]{3,16}$/;
const RESERVED_RE = /(admin|modo|moderat|staff|support|system|4mules|anonym)/i;
const PENDING_KEY = '4mules.pendingPseudo';

/** A reason the pseudo cannot be used (same rules as the server's claim_pseudo), or null. */
export function pseudoProblem(raw: string): string | null {
  const p = raw.trim();
  if (!PSEUDO_RE.test(p)) return '3 à 16 caractères : lettres, chiffres, « _ », « - » ou « . ».';
  if (RESERVED_RE.test(p)) return 'Ce pseudo n’est pas disponible.';
  return null;
}

/** A message for the player from an error of the server or the network. */
export function accountError(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : '';
  if (/déjà pris|duplicate|unique/i.test(msg)) return 'Ce pseudo est déjà pris.';
  if (/déjà choisi/i.test(msg)) return 'Votre pseudo est déjà choisi.';
  if (/suspendu/i.test(msg)) return 'Compte suspendu.';
  if (/pseudo de 3|disponible/i.test(msg)) return msg;
  if (/fetch|network|failed|timeout/i.test(msg)) return 'Connexion impossible. Vérifiez votre réseau et réessayez.';
  return 'Une erreur est survenue. Réessayez.';
}

let current: Account | null = null;
export const getAccount = (): Account | null => current;

const setPending = (p: string | null): void => {
  try {
    if (p) localStorage.setItem(PENDING_KEY, p);
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* private mode: the pseudo is asked again after the redirect */
  }
};
const getPending = (): string | null => {
  try {
    return localStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
};

/** Reads the session of this browser (and, after a Discord redirect, the one in the URL). Null when signed out. */
export async function loadAccount(): Promise<Account | null> {
  const sb = authClient();
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  const { data: row, error } = await sb.from('profiles').select('pseudo').eq('id', user.id).maybeSingle();
  if (error) throw error;
  let pseudo = (row?.pseudo as string | null | undefined) ?? null;
  current = { pseudo, guest: user.is_anonymous === true };
  const pending = getPending();
  if (!pseudo && pending) {
    // the pseudo typed before the Discord redirect
    try {
      pseudo = await claimPseudo(pending);
    } catch {
      /* taken meanwhile: the player is asked again */
    }
  }
  setPending(null);
  current = { pseudo, guest: user.is_anonymous === true };
  return current;
}

/** Chooses the pseudo of the signed-in player (once, checked by the server). */
export async function claimPseudo(pseudo: string): Promise<string> {
  const { data, error } = await authClient().rpc('claim_pseudo', { p: pseudo.trim() });
  if (error) throw error;
  const name = String(data);
  current = { pseudo: name, guest: current?.guest ?? true };
  return name;
}

/** "Jouer en invité": anonymous sign-in, then the pseudo. */
export async function signInGuest(pseudo: string): Promise<Account> {
  const { data, error } = await authClient().auth.signInAnonymously();
  if (error) throw error;
  current = { pseudo: null, guest: data.user?.is_anonymous !== false };
  await claimPseudo(pseudo);
  return current;
}

/** Goes to Discord and comes back to this page; a pseudo typed before is claimed on return. */
export async function startDiscord(pseudo: string | null): Promise<void> {
  setPending(pseudo && pseudoProblem(pseudo) === null ? pseudo.trim() : null);
  const { error } = await authClient().auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: location.origin + location.pathname } });
  if (error) throw error;
}

/** A guest keeps their account by linking it to Discord. */
export async function linkDiscord(): Promise<void> {
  const { error } = await authClient().auth.linkIdentity({ provider: 'discord', options: { redirectTo: location.origin + location.pathname } });
  if (error) throw error;
}
