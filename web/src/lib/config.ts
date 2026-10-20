/* ============================================================================
 * web/src/lib/config.ts — build-time public config (MIGRATION.md D-007)
 * ----------------------------------------------------------------------------
 * Values come from GitHub Secrets → the deploy workflow's env → the variables
 * src/env.ts declares → SvelteKit `$app/env/public`. Only PUBLIC_* values exist
 * here — the anon key is the only Supabase credential the client ever holds
 * (D-002); the service-role key must never appear in web/.
 *
 * Import this module (it is reached via the root +layout.ts) so that a build
 * with a missing/undeclared PUBLIC_* variable FAILS instead of shipping a
 * silently-nullable client (the legacy `sb`-is-null trap this replaces).
 *
 * Usage:
 *   import { SUPABASE_URL, SUPABASE_ANON_KEY } from '#lib/config.js';
 * ========================================================================== */
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$app/env/public';

// The second line behind src/env.ts, whose schemas already stop a build when a
// value is empty (an unset GitHub secret interpolates to ''). This one still
// holds wherever env.ts does not run — e.g. a test that stubs $app/env/public.
function required(name: string, value: string): string {
  if (!value) throw new Error(`config: missing required build-time variable ${name}`);
  return value;
}

export const SUPABASE_URL = required('PUBLIC_SUPABASE_URL', PUBLIC_SUPABASE_URL);
export const SUPABASE_ANON_KEY = required('PUBLIC_SUPABASE_ANON_KEY', PUBLIC_SUPABASE_ANON_KEY);
