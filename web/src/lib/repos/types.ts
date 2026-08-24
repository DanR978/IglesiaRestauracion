/* ============================================================================
 * web/src/lib/repos/types.ts — the repo-layer contract (S22)
 * ----------------------------------------------------------------------------
 * Every repo module honours the same two rules, ported from legacy
 * `js/lib/discipleship.js` / `gallery.js` and locked here for S40/S52:
 *
 *   reads  — NEVER throw to the caller. On error: `console.warn` with a
 *            `[module]` tag and return a safe empty (`[]` / `null`).
 *   writes — NEVER throw. Return `WriteResult`: `{ ok: true, data }` or
 *            `{ ok: false, error }` where `error` is the Supabase message,
 *            ready for `toast(error, 'error')`.
 *
 * Usage:
 *   import type { WriteResult, Unsubscribe } from '$lib/repos/types';
 *   const res = await deleteAlbum(id);
 *   if (!res.ok) toast(res.error, 'error');
 * ========================================================================== */

import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

/** Discriminated write result: narrow on `ok`. `data` is `undefined` for deletes. */
export type WriteResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Tear down a realtime subscription; safe to call more than once. */
export type Unsubscribe = () => void;

/** Callback for `subscribe*` helpers; the payload is optional to consume. */
export type ChangeHandler<Row extends Record<string, unknown>> = (
  payload: RealtimePostgresChangesPayload<Row>,
) => void;
