/* ============================================================================
 * web/src/env.ts — the build environment the app may read (MIGRATION.md D-007)
 * ----------------------------------------------------------------------------
 * Kit 3 re-exports ONLY the variables declared here: `$app/env/public` has
 * exactly these two names, so nothing else in the build env can reach a
 * bundle. Both are PUBLIC by design — the anon key is the only Supabase
 * credential the client ever holds (D-002) — and `static`: the build-time
 * value is validated once and inlined. Never declare a service-role key.
 *
 * D-007's fail-the-build guarantee lives here now. Kit's default rejects only
 * an UNSET variable, while an unset GitHub secret interpolates to '' — so each
 * schema also rejects an empty value, and `vite build` stops with "Invalid
 * environment variables". The URL must be https, or plain http on a loopback
 * host (the local Supabase stack, mocked e2e). #lib/config.ts keeps its
 * required() check as the runtime second line.
 *
 * Values: web/.env locally (see .env.example), GitHub Secrets in CI/deploy.
 *
 * Usage (only #lib/config.ts reads them):
 *   import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$app/env/public';
 * ========================================================================== */
import { defineEnvVars } from '@sveltejs/kit/env';

/** Hosts a plain-http Supabase URL may name. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

// Messages never echo the value: they end up in CI logs.
function nonEmpty(name: string, value: string | undefined): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is empty — set it in web/.env, or as a GitHub secret in CI`);
  }
  return value;
}

function supabaseUrl(value: string | undefined): string {
  const raw = nonEmpty('PUBLIC_SUPABASE_URL', value);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('PUBLIC_SUPABASE_URL is not an absolute URL');
  }
  const loopbackHttp = url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
  if (url.protocol !== 'https:' && !loopbackHttp) {
    throw new Error('PUBLIC_SUPABASE_URL must be https (plain http only on localhost/127.0.0.1)');
  }
  return raw;
}

export const variables = defineEnvVars({
  PUBLIC_SUPABASE_URL: {
    public: true,
    static: true,
    description: 'The Supabase project URL: https, or http on a loopback host.',
    schema: supabaseUrl,
  },
  PUBLIC_SUPABASE_ANON_KEY: {
    public: true,
    static: true,
    description: 'The Supabase anon key (public by design, D-002) — never the service-role key.',
    schema: (value) => nonEmpty('PUBLIC_SUPABASE_ANON_KEY', value),
  },
});
