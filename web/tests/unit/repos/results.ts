/* ============================================================================
 * web/tests/unit/repos/results.ts — expected repo results for mocked outcomes
 * ----------------------------------------------------------------------------
 * Builds the `ReadResult` / `WriteResult` a repo must return, from the same
 * copy table the repos use (`REPO_ERROR_MESSAGES`), so a test states WHICH
 * failure it expects — kind plus raw detail — without restating the Spanish
 * copy. Also the canned backend answers several suites share.
 *
 * Usage:
 *   import { failure, OFFLINE } from './results';
 *   mock.results.events = [{ data: null, error: { message: 'boom' } }];
 *   expect(await fetchUpcomingEvents()).toEqual(failure('unknown', 'boom'));
 * ========================================================================== */
import { REPO_ERROR_MESSAGES } from '#lib/repos/errors.js';
import type { RepoErrorKind, RepoFailure } from '#lib/repos/types.js';
import type { Canned } from './mock-client';

/** The failure branch for a mapped backend error: kind copy + raw detail. */
export function failure(kind: RepoErrorKind, detail: string): RepoFailure {
  return { ok: false, error: { kind, message: REPO_ERROR_MESSAGES[kind], detail } };
}

/** A request refused before any network call (no detail, nothing logged). */
export function invalidInput(message: string): RepoFailure {
  return { ok: false, error: { kind: 'invalid', message } };
}

/** A delete/update that had to change a row and changed none (D-027). */
export const NOT_FOUND = failure('not_found', 'no row was affected');

/** What postgrest-js resolves to when the fetch itself failed (offline, DNS, CORS). */
export const OFFLINE: Canned = {
  data: null,
  error: { message: 'TypeError: Failed to fetch', code: '' },
  status: 0,
};

/** An RLS refusal on a write: Postgres 42501, which PostgREST answers with 403. */
export const RLS_DENIED: Canned = {
  data: null,
  error: { message: 'new row violates row-level security policy', code: '42501' },
  status: 403,
};
