/* ============================================================================
 * web/src/lib/db/client.ts — the typed Supabase client (MIGRATION.md S06)
 * ----------------------------------------------------------------------------
 * NON-NULLABLE by construction: config.ts already fails the build when a
 * PUBLIC_* value is missing (D-007), so unlike legacy `sb` there is no
 * `if (!sb)` guard anywhere in web/ — the client always exists.
 *
 * Browser-guarded: session persistence, token auto-refresh, and URL session
 * detection are enabled only in the browser, so importing this module during
 * prerender (Node) starts no timers and opens no socket (S06 "Done when").
 *
 * The anon key is the only credential here — RLS is the security boundary
 * (D-002). Never import a service-role key into web/.
 *
 * Usage:
 *   import { supabase } from '$lib/db/client';
 *   const { data, error } = await supabase.from('events').select('*');
 * ========================================================================== */
import { createClient } from '@supabase/supabase-js';
import { browser } from '$app/environment';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '$lib/config';
import type { Database } from './database.types';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: browser,
    autoRefreshToken: browser,
    detectSessionInUrl: browser,
  },
});
