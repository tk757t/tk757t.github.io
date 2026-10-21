import { leagueOf, type RankLeague } from '../data/ranked';
import { authClient } from './supabase';

/**
 * The chat of the general channel. The server (supabase/migrations/20261022100000_chat.sql) is the one that decides: the pseudo, the silence,
 * the rate, the links and the word filter are imposed there. What is checked here only saves a trip and words the refusals for the player.
 */
export const MAX_CHAT_CHARS = 200;
export const CHAT_POLL_MS = 3_000;

export interface ChatMessage {
  id: number;
  /** Technical id of the author, to block them. */
  sender: string;
  pseudo: string;
  body: string;
  createdAt: number;
  mine: boolean;
  /** The league of the author this season, or null when they have not raced ranked yet. */
  league: RankLeague | null;
}

export const REPORT_REASONS = [
  { id: 'insulte', label: 'Insulte' },
  { id: 'spam', label: 'Spam' },
  { id: 'harcelement', label: 'Harcèlement' },
  { id: 'autre', label: 'Autre' },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]['id'];

/** The text as it will be sent: spaces collapsed and trimmed (the server does the same). */
export const cleanChatText = (text: string): string => text.replace(/\s+/g, ' ').trim();

const LINK_RE = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|fr|net|org|io|gg|ly|me|tv|xyz|ru|cc)([^a-z0-9]|$))/i;

/** Why a text cannot be sent (same rules as the server, for the cases a player can fix), or null. */
export function chatProblem(text: string): string | null {
  const clean = cleanChatText(text);
  if (clean.length === 0) return 'Écrivez un message.';
  if (clean.length > MAX_CHAT_CHARS) return `Un message fait ${MAX_CHAT_CHARS} caractères au plus.`;
  if (LINK_RE.test(clean)) return 'Les liens ne sont pas autorisés dans le chat.';
  return null;
}

/** A message for the player from an error of the server or the network: the server's own sentence when it wrote one for the player. */
export function serverError(e: unknown, fallback = 'Le serveur ne répond pas. Réessayez.'): string {
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : '';
  if (/fetch|network|failed|timeout/i.test(msg)) return 'Connexion impossible. Vérifiez votre réseau.';
  // the sentences of the server are written for the player and start with a capital letter and end with a full stop
  if (/^[A-ZÉÈÀ][\s\S]{5,160}\.$/.test(msg) && !/violates|permission|function|relation|column|syntax/i.test(msg)) return msg;
  return fallback;
}

export const chatError = (e: unknown): string => serverError(e, 'Le chat ne répond pas. Réessayez.');

interface Row {
  id: number;
  sender: string;
  pseudo: string;
  body: string;
  created_at: string;
  mine: boolean;
  trophies: number | null;
}

const toMessage = (r: Row): ChatMessage => ({ id: Number(r.id), sender: r.sender, pseudo: r.pseudo, body: r.body, createdAt: Date.parse(r.created_at), mine: r.mine === true, league: r.trophies === null || r.trophies === undefined ? null : leagueOf(Number(r.trophies)) });

/** The last messages (or those after `after`), oldest first, without the hidden ones and the players the person blocked. */
export async function fetchMessages(after: number | null = null, limit = 50): Promise<ChatMessage[]> {
  const { data, error } = await authClient().rpc('chat_fetch', { p_after: after, p_limit: limit });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toMessage);
}

/** Writes in the general channel; resolves the id of the new message. */
export async function sendMessage(text: string): Promise<number> {
  const problem = chatProblem(text);
  if (problem) throw new Error(problem);
  const { data, error } = await authClient().rpc('chat_send', { p_body: cleanChatText(text) });
  if (error) throw error;
  return Number(data);
}

export async function reportMessage(id: number, reason: ReportReason): Promise<void> {
  const { error } = await authClient().rpc('chat_report', { p_message: id, p_reason: reason });
  if (error) throw error;
}

export async function blockPlayer(sender: string): Promise<void> {
  const { error } = await authClient().rpc('chat_block', { p_user: sender });
  if (error) throw error;
}

export async function unblockPlayer(sender: string): Promise<void> {
  const { error } = await authClient().rpc('chat_unblock', { p_user: sender });
  if (error) throw error;
}

export interface BlockedPlayer {
  id: string;
  pseudo: string;
}

export async function blockedPlayers(): Promise<BlockedPlayer[]> {
  const { data, error } = await authClient().rpc('chat_blocked');
  if (error) throw error;
  return ((data ?? []) as { user_id: string; pseudo: string }[]).map((r) => ({ id: r.user_id, pseudo: r.pseudo }));
}
