import type { SupabaseClient } from '@supabase/supabase-js';
import type { GameStore } from './handler';
import { userFromVerifiedJwt } from './jwt';
import { RULES_VERSION } from './state';

/**
 * The GameStore of the Edge Function: a Supabase client created with the service key (Deno.env, never in the code).
 * Writes go through the security definer functions of supabase/migrations/20261021200000_game_server.sql, which write
 * the game and its log line in one transaction and apply the optimistic lock.
 */
export function supabaseStore(db: SupabaseClient): GameStore {
  return {
    // no call to the auth service: the gateway already checked the token (see jwt.ts), one network hop less per action
    async userOf(token) {
      return userFromVerifiedJwt(token, Date.now());
    },
    async suspension(uid) {
      const { data, error } = await db.from('suspensions').select('reason').eq('user_id', uid).maybeSingle();
      if (error) throw error;
      return data ? String((data as { reason: unknown }).reason) : null;
    },
    async recentActions(uid, sinceMs) {
      const { count, error } = await db.from('action_log').select('id', { count: 'exact', head: true }).eq('user_id', uid).gte('created_at', new Date(sinceMs).toISOString());
      if (error) throw error;
      return count ?? 0;
    },
    async load(uid) {
      const { data, error } = await db.from('game_state').select('state, version').eq('user_id', uid).maybeSingle();
      if (error) throw error;
      return data ? { state: (data as { state: unknown }).state, version: Number((data as { version: unknown }).version) } : null;
    },
    async create(uid, state, log) {
      const { data, error } = await db.rpc('game_create', { p_user: uid, p_state: state, p_rules: RULES_VERSION, p_action: log.action, p_params: log.params, p_summary: log.summary });
      if (error) throw error;
      return data === true;
    },
    async commit(uid, version, state, log) {
      const { data, error } = await db.rpc('game_commit', { p_user: uid, p_version: version, p_state: state, p_rules: RULES_VERSION, p_action: log.action, p_params: log.params, p_summary: log.summary });
      if (error) throw error;
      return typeof data === 'number' ? data : null;
    },
  };
}
