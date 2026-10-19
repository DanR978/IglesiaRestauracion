/* ============================================================================
 * web/src/lib/components/admin/auth/auth-url.ts — what an auth URL carries (S39)
 * ----------------------------------------------------------------------------
 * The OAuth callback and the email links arrive with one-time values in the
 * address: `code`, `token_hash`, and GoTrue's `error` / `error_code` /
 * `error_description`. GoTrue puts them in the query, sometimes duplicates
 * them in the fragment, and the legacy implicit links used the fragment
 * alone — so both are read, the query winning as in auth-js.
 *
 * Then they leave the address bar and this history entry at once, before any
 * request is made (so no Referer carries them) — legacy auth.js stripped
 * `token_hash` the same way (DF-006). Only the named parameters survive
 * (`next` on the pages that keep it).
 *
 * history.replaceState directly, with `history.state` handed back unchanged:
 * the router keeps its bookkeeping there, and its non-shallow entries never
 * hold the URL. Kit's own shallow `goto(…, { shallow: true })` would copy
 * the old URL — token included — into the entry's state, so it is not used.
 * (In `npm run dev` Kit prints one "history API" warning for this; the
 * state it guards is left intact.)
 *
 * Usage:
 *   import { authParams, scrubLocation } from '#lib/components/admin/auth/auth-url.js';
 *   const params = authParams(new URL(location.href));
 *   scrubLocation();                 // or scrubLocation(['next'])
 * ========================================================================== */

/** The query and the fragment as one set of parameters; the query wins a clash. */
export function authParams(url: URL): URLSearchParams {
  const merged = new URLSearchParams(url.hash.replace(/^#/, ''));
  for (const [key, value] of url.searchParams) merged.set(key, value);
  return merged;
}

/** `url`'s pathname with only the `keep` parameters of its query, no fragment. */
export function scrubbedHref(url: URL, keep: readonly string[] = []): string {
  const kept = new URLSearchParams();
  for (const key of keep) {
    const value = url.searchParams.get(key);
    if (value !== null) kept.set(key, value);
  }
  const query = kept.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

/** Replace the current address with its scrubbed form; a no-op when it is already clean. */
export function scrubLocation(keep: readonly string[] = []): void {
  const href = scrubbedHref(new URL(location.href), keep);
  if (href === location.pathname + location.search + location.hash) return;
  history.replaceState(history.state, '', href);
}
