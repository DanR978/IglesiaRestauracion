// Vitest stand-in for $app/env/public (Kit 3's rename of $env/static/public).
// The real module is generated from the variables src/env.ts declares and
// validated against the build env; unit tests must not depend on either.
export const PUBLIC_SUPABASE_URL = 'http://stub.supabase.local';
export const PUBLIC_SUPABASE_ANON_KEY = 'stub-anon-key';
