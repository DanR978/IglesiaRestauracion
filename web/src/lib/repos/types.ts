/* ============================================================================
 * web/src/lib/repos/types.ts — the repo-layer contract (S22 · S22b, D-032)
 * ----------------------------------------------------------------------------
 * Every repo module honours ADR-0004, which replaced the S22 "safe empty" rule:
 *
 *   reads  — NEVER throw. Return `ReadResult<T>`: `{ ok: true, data }` where an
 *            empty list or `null` means "nothing there", or `{ ok: false,
 *            error }` when the read failed. A failure is never returned as an
 *            empty result. A read with no key to look up (`''`, `[]`) is an
 *            empty success; a key that is present but malformed is `invalid`.
 *   writes — NEVER throw. Return `WriteResult<T>` with the same failure
 *            branch. A delete/update that must change a row and changed none
 *            (it is gone, or RLS hid it) is a `not_found` failure (D-027).
 *
 * `RepoError.message` is Spanish copy, safe to render; `detail` is the raw
 * backend text for the console and is never rendered (DESIGN-SYSTEM §5.3).
 * The one mapping from Supabase / fetch failures lives in `./errors`.
 *
 * Views render loading, empty and error as three different states, and the
 * error state always offers Retry. A prerender (build-time) read that fails
 * renders the LOADING state and lets the client refetch — never a baked-in
 * empty state.
 *
 * Usage:
 *   import type { ReadResult, WriteResult } from '#lib/repos/types.js';
 *   const res = await fetchAlbums();
 *   if (!res.ok) showError(res.error.message); // + Retry; log res.error.detail
 *   else if (!res.data.length) showEmpty();
 *   else showAlbums(res.data);
 * ========================================================================== */

import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

/** What went wrong, coarse enough for a view to choose its state and copy. */
export type RepoErrorKind =
  'network' | 'auth' | 'forbidden' | 'not_found' | 'conflict' | 'invalid' | 'unknown';

export interface RepoError {
  kind: RepoErrorKind;
  /** Spanish, safe to show — the only error text a view may render. */
  message: string;
  /** Raw backend text — console only, never rendered. */
  detail?: string;
}

/** The failure branch reads and writes share. */
export type RepoFailure = { ok: false; error: RepoError };

/** Discriminated read result: narrow on `ok`. An empty `data` is a success. */
export type ReadResult<T> = { ok: true; data: T } | RepoFailure;

/** Discriminated write result: narrow on `ok`. `data` is `undefined` for deletes. */
export type WriteResult<T = undefined> = { ok: true; data: T } | RepoFailure;

/** Tear down a realtime subscription; safe to call more than once. */
export type Unsubscribe = () => void;

/** Callback for `subscribe*` helpers; the payload is optional to consume. */
export type ChangeHandler<Row extends Record<string, unknown>> = (
  payload: RealtimePostgresChangesPayload<Row>,
) => void;
