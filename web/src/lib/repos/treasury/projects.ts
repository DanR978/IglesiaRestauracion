/* ============================================================================
 * web/src/lib/repos/treasury/projects.ts — `fin_projects` (leader containers)
 * ----------------------------------------------------------------------------
 * The per-leader "project" containers that scope `fin_income` / `fin_expenses`
 * rows outside the church books. Ported from `project-treasury.js`
 * `loadProjects` (:58-62), `ensureMinistryProjects` (:76-107), `newProject`
 * (:328-340), `renameProject` (:342-350) and `deleteProject` (:352-360).
 *
 * `fetchProjects` takes BOTH scopes because the migration changes which one is
 * used: legacy is owner-scoped (`owner_id = me`), and D-019 makes ministry
 * treasury ministry-shared, so S56b re-reads the same containers by
 * `ministry_id = any(my_ministry_ids())`. The extra RLS policy that makes the
 * ministry read return rows is additive and lands in S56b — until then it
 * simply returns what the owner policy already allows.
 *
 * D-027: RLS refuses `updateProject` / `deleteProject` on a ministry row for a
 * non-finance user. The refusal matches no row, and that comes back as a
 * `not_found` failure — never as a success.
 *
 * Entry-level reads/writes are NOT here — a project entry is an ordinary
 * `fin_income`/`fin_expenses` row, so it goes through `./entries`; the
 * per-project rollups are in `./summary`.
 *
 * Usage:
 *   import { fetchProjects, createProject } from '#lib/repos/treasury/index.js';
 *   const res = await fetchProjects({ ownerId: userId });
 *   if (res.ok) renderTabs(res.data);
 * ========================================================================== */

import { supabase } from '#lib/db/client.js';
import { fail, invalid, noRows, ok } from '../errors';
import { requireSession } from '../session';
import type { ReadResult, WriteResult } from '../types';
import { TAG, type ProjectInsert, type ProjectRow, type ProjectUpdate } from './shared';

export type ProjectFilter = {
  /** Legacy scope: the containers this user owns (`project-treasury.js:60`). */
  ownerId?: string | null;
  /** D-019 scope: the containers carrying one of these ministries. */
  ministryIds?: string[];
  /** Legacy hides archived containers; reports may want them. */
  includeArchived?: boolean;
};

/**
 * Project containers, oldest first (the legacy tab order). With neither
 * `ownerId` nor `ministryIds` the query is unscoped and RLS decides what comes
 * back — finance sees every container, a leader only their own.
 */
export async function fetchProjects({
  ownerId,
  ministryIds,
  includeArchived = false,
}: ProjectFilter = {}): Promise<ReadResult<ProjectRow[]>> {
  const denied = await requireSession(TAG, 'fetchProjects');
  if (denied) return denied;
  let q = supabase.from('fin_projects').select('*');
  if (ownerId) q = q.eq('owner_id', ownerId);
  if (ministryIds?.length) q = q.in('ministry_id', ministryIds);
  if (!includeArchived) q = q.eq('archived', false);
  const { data, error, status } = await q.order('created_at');
  if (error) return fail(TAG, 'fetchProjects', error, status);
  return ok(data ?? []);
}

/**
 * Which of these ministries the treasurer has actually funded — a ministry
 * gets its own budget tab the first time it has an active recurring payment or
 * a church-books expense allocated to it (`project-treasury.js:84-89`).
 *
 * Legacy swallowed both errors inside one `try`, which made "no budget" and
 * "the query failed" indistinguishable. Here either probe failing fails the
 * read: a partial list would hide a ministry's budget tab exactly as if it
 * had never been funded.
 */
export async function fetchBudgetedMinistryIds(
  ministryIds: string[],
): Promise<ReadResult<string[]>> {
  const denied = await requireSession(TAG, 'fetchBudgetedMinistryIds');
  if (denied) return denied;
  if (!ministryIds.length) return ok([]);
  const [recRes, expRes] = await Promise.all([
    supabase
      .from('fin_recurring')
      .select('ministry_id')
      .in('ministry_id', ministryIds)
      .eq('active', true),
    supabase
      .from('fin_expenses')
      .select('ministry_id')
      .is('project_id', null)
      .in('ministry_id', ministryIds),
  ]);
  if (recRes.error) {
    return fail(TAG, 'fetchBudgetedMinistryIds recurring', recRes.error, recRes.status);
  }
  if (expRes.error) {
    return fail(TAG, 'fetchBudgetedMinistryIds expenses', expRes.error, expRes.status);
  }
  const funded = new Set<string>();
  for (const row of [...(recRes.data ?? []), ...(expRes.data ?? [])]) {
    if (row.ministry_id) funded.add(row.ministry_id);
  }
  return ok([...funded]);
}

/* ── Writes ────────────────────────────────────────────────────────────── */

export async function createProject(input: ProjectInsert): Promise<WriteResult<ProjectRow>> {
  const denied = await requireSession(TAG, 'createProject');
  if (denied) return denied;
  if (!input?.owner_id) return invalid('Falta el propietario del proyecto.');
  if (!input.name?.trim()) return invalid('El proyecto necesita un nombre.');
  const { data, error, status } = await supabase
    .from('fin_projects')
    .insert(input)
    .select()
    .single();
  if (error) return fail(TAG, 'createProject', error, status);
  return ok(data);
}

/** Rename, re-colour, archive, or attach a ministry (`project-treasury.js:97, 347`). */
export async function updateProject(
  id: string,
  patch: ProjectUpdate,
): Promise<WriteResult<ProjectRow>> {
  const denied = await requireSession(TAG, 'updateProject');
  if (denied) return denied;
  if (!id) return invalid('Falta el identificador del proyecto.');
  const { data, error, status } = await supabase
    .from('fin_projects')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) return fail(TAG, 'updateProject', error, status);
  return ok(data);
}

/**
 * Delete a container. Its entries survive: both FKs are
 * `on delete set null`, so the rows fall back into the church books' scope
 * with `project_id = null` — which is exactly what the legacy confirm text
 * promises ("quedarán sin proyecto").
 */
export async function deleteProject(id: string): Promise<WriteResult> {
  const denied = await requireSession(TAG, 'deleteProject');
  if (denied) return denied;
  if (!id) return invalid('Falta el identificador del proyecto.');
  const { error, status, count } = await supabase
    .from('fin_projects')
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) return fail(TAG, 'deleteProject', error, status);
  if (!count) return noRows(TAG, 'deleteProject');
  return ok(undefined);
}
