/* ============================================================================
 * web/src/lib/repos/session.ts — staff-only repo calls need a live session
 * ----------------------------------------------------------------------------
 * With no session, supabase-js sends the anon key, and RLS answers a staff
 * table with an empty 200: a dead session would read as "no data" or "$0.00",
 * the failure-as-empty ADR-0004 rules out. Every repo function only staff may
 * call checks first and returns an `auth` failure instead.
 *
 * getSession() reads the stored session and refreshes it when the access
 * token has expired; once that refresh is refused (signed out elsewhere,
 * revoked, timed out) it returns no session. A refresh that could not reach
 * the server is a `network` failure, not a sign-out. Reads that work signed
 * out (public events, published albums, groups) never call this.
 *
 * Usage:
 *   const denied = await requireSession(TAG, 'fetchBooksSummary');
 *   if (denied) return denied;
 * ========================================================================== */

import { supabase } from '#lib/db/client.js';
import { REPO_ERROR_MESSAGES, fail } from './errors';
import type { RepoFailure } from './types';

/** `null` when a signed-in session exists; otherwise the failure to return. */
export async function requireSession(tag: string, fn: string): Promise<RepoFailure | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (data.session) return null;
    if (error) {
      const failure = fail(tag, fn, error);
      if (failure.error.kind === 'network') return failure;
    }
  } catch (e) {
    return fail(tag, fn, e);
  }
  console.warn(`${tag} ${fn}:`, 'no signed-in session');
  return {
    ok: false,
    error: { kind: 'auth', message: REPO_ERROR_MESSAGES.auth, detail: 'no signed-in session' },
  };
}
