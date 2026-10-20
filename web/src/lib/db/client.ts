/* ============================================================================
 * web/src/lib/db/client.ts — the typed Supabase client (MIGRATION.md S06)
 * ----------------------------------------------------------------------------
 * NON-NULLABLE by construction: config.ts already fails the build when a
 * PUBLIC_* value is missing (D-007), so unlike legacy `sb` there is no
 * `if (!sb)` guard anywhere in web/ — the client always exists.
 *
 * Browser-guarded: session persistence and token auto-refresh are enabled
 * only in the browser, so importing this module during prerender (Node)
 * starts no timers and opens no socket (S06 "Done when").
 *
 * Auth (S38, D-035): the PKCE flow, so a Google / Microsoft sign-in returns a
 * `?code=` only this browser can exchange — and the OAuth callback route does
 * that exchange itself, so the client never reads a session from the URL.
 * Email links keep working: they carry a `token_hash` for verifyOtp, which a
 * PKCE client accepts in any browser. The storage key stays the default, so
 * this is the session the legacy /admin uses too (D-040).
 *
 * The anon key is the only credential here — RLS is the security boundary
 * (D-002). Never import a service-role key into web/. Outside the repos only
 * #lib/auth/* imports this module (lint-enforced).
 *
 * Usage:
 *   import { supabase } from '#lib/db/client.js';
 *   const { data, error } = await supabase.from('events').select('*');
 * ========================================================================== */
import { createClient } from '@supabase/supabase-js';
import { browser } from '$app/env';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '#lib/config.js';
import type { Database } from './database.types';

/** The client's auth options (exported for tests). No storageKey: the default is shared with /admin. */
export const AUTH_OPTIONS = {
  flowType: 'pkce',
  detectSessionInUrl: false,
  persistSession: browser,
  autoRefreshToken: browser,
} as const;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: AUTH_OPTIONS,
});
