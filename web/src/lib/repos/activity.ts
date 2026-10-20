/* ============================================================================
 * web/src/lib/repos/activity.ts — the audit log, newest first (S40)
 * ----------------------------------------------------------------------------
 * The read js/pages/admin/activity-tab.js `loadActivity()` ran inline
 * (`audit_log … order(created_at desc).limit(100)`, a hard ceiling with no
 * way past it — PORT-DEBT S42). Here: a short recent list for Inicio (S41)
 * and keyset pages for the Actividad tab (S42). Reads return a `ReadResult`
 * (ADR-0004) and log under `[activity]`.
 *
 * Staff-only, developer tier: `audit_log` is readable only with
 * has_system_tab('activity') in a two-step-verified session (20261019000001),
 * so the session is checked first (./session) — a dead one would read as
 * "no activity yet".
 *
 * Pages are keyset, not offset: rows are ordered by (created_at, id)
 * descending and the next page starts strictly after the last row seen, so a
 * row written while someone pages is never shown twice or skipped.
 *
 * Usage:
 *   import { fetchRecentActivity, fetchActivityPage } from '#lib/repos/activity.js';
 *   const recent = await fetchRecentActivity({ limit: 8 });
 *   const page = await fetchActivityPage({ limit: 50 });
 *   if (page.ok && page.data.next) more = await fetchActivityPage({ before: page.data.next });
 * ========================================================================== */

import { supabase } from '#lib/db/client.js';
import type { Tables } from '#lib/db/database.types.js';
import { fail, invalid, ok } from './errors';
import { requireSession } from './session';
import type { ReadResult } from './types';

const TAG = '[activity]';

/** One audit row: who (`actor_*`) did what (`action`: INSERT/UPDATE/DELETE) to which `entity`. */
export type AuditEntry = Tables<'audit_log'>;

/** Where the next page starts: the last row of the previous one. */
export type ActivityCursor = Pick<AuditEntry, 'created_at' | 'id'>;

export type ActivityPage = {
  entries: AuditEntry[];
  /** null on the last page. */
  next: ActivityCursor | null;
};

export const ACTIVITY_PAGE_SIZE = 50;
const RECENT_DEFAULT = 10;
const MAX_LIMIT = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The timestamptz text PostgREST returns (`2026-10-19T14:03:05.123456+00:00`).
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;

/** A whole number of rows in 1…100; anything else is the default. */
function clampLimit(limit: number | undefined, fallback: number): number {
  if (limit === undefined || !Number.isFinite(limit)) return fallback;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function isCursor(c: ActivityCursor): boolean {
  return TIMESTAMP.test(c.created_at) && !Number.isNaN(Date.parse(c.created_at)) && UUID.test(c.id);
}

/** The latest `limit` (default 10) audit rows, newest first. */
export async function fetchRecentActivity({ limit }: { limit?: number } = {}): Promise<
  ReadResult<AuditEntry[]>
> {
  const denied = await requireSession(TAG, 'fetchRecentActivity');
  if (denied) return denied;
  const { data, error, status } = await supabase
    .from('audit_log')
    .select('id,actor_id,actor_name,action,entity,entity_id,label,created_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(clampLimit(limit, RECENT_DEFAULT));
  if (error) return fail(TAG, 'fetchRecentActivity', error, status);
  return ok(data ?? []);
}

/**
 * One page of the audit log, newest first: the first page without `before`,
 * then pass the previous page's `next` until it comes back null.
 */
export async function fetchActivityPage({
  before = null,
  limit,
}: { before?: ActivityCursor | null; limit?: number } = {}): Promise<ReadResult<ActivityPage>> {
  const denied = await requireSession(TAG, 'fetchActivityPage');
  if (denied) return denied;
  if (before && !isCursor(before)) {
    return invalid('No pudimos cargar más actividad. Recarga la página e inténtalo de nuevo.');
  }
  const size = clampLimit(limit, ACTIVITY_PAGE_SIZE);
  let q = supabase
    .from('audit_log')
    .select('id,actor_id,actor_name,action,entity,entity_id,label,created_at');
  if (before) {
    // Quoted: a timestamp holds PostgREST's reserved `.` and `:` characters.
    const at = `"${before.created_at}"`;
    q = q.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${before.id})`);
  }
  const { data, error, status } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    // One row past the page says whether another page exists.
    .limit(size + 1);
  if (error) return fail(TAG, 'fetchActivityPage', error, status);
  const rows = data ?? [];
  const entries = rows.slice(0, size);
  const last = entries[entries.length - 1];
  return ok({
    entries,
    next: rows.length > size && last ? { created_at: last.created_at, id: last.id } : null,
  });
}
