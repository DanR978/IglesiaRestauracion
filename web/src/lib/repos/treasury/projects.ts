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
 * Entry-level reads/writes are NOT here — a project entry is an ordinary
 * `fin_income`/`fin_expenses` row, so it goes through `./entries`; the
 * per-project rollups are in `./summary`.
 *
 * Usage:
 *   import { fetchProjects, createProject } from '$lib/repos/treasury';
 * ========================================================================== */

import { supabase } from '$lib/db/client';
import type { WriteResult } from '../types';
import {
  warnRead,
  writeFail,
  writeOk,
  type ProjectInsert,
  type ProjectRow,
  type ProjectUpdate,
} from './shared';

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
}: ProjectFilter = {}): Promise<ProjectRow[]> {
  let q = supabase.from('fin_projects').select('*');
  if (ownerId) q = q.eq('owner_id', ownerId);
  if (ministryIds?.length) q = q.in('ministry_id', ministryIds);
  if (!includeArchived) q = q.eq('archived', false);
  const { data, error } = await q.order('created_at');
  if (error) {
    warnRead('fetchProjects', error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Which of these ministries the treasurer has actually funded — a ministry
 * gets its own budget tab the first time it has an active recurring payment or
 * a church-books expense allocated to it (`project-treasury.js:84-89`).
 *
 * Legacy swallowed both errors inside one `try`, which made "no budget" and
 * "the query failed" indistinguishable; here a failed probe warns and
 * contributes nothing, and the other probe still counts.
 */
export async function fetchBudgetedMinistryIds(ministryIds: string[]): Promise<string[]> {
  if (!ministryIds.length) return [];
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
  if (recRes.error) warnRead('fetchBudgetedMinistryIds', recRes.error.message);
  if (expRes.error) warnRead('fetchBudgetedMinistryIds', expRes.error.message);
  const funded = new Set<string>();
  for (const row of [...(recRes.data ?? []), ...(expRes.data ?? [])]) {
    if (row.ministry_id) funded.add(row.ministry_id);
  }
  return [...funded];
}

/* ── Writes ────────────────────────────────────────────────────────────── */

export async function createProject(input: ProjectInsert): Promise<WriteResult<ProjectRow>> {
  if (!input?.owner_id) return writeFail('createProject', 'Falta el propietario del proyecto.');
  if (!input.name?.trim()) return writeFail('createProject', 'El proyecto necesita un nombre.');
  const { data, error } = await supabase.from('fin_projects').insert(input).select().single();
  if (error) return writeFail('createProject', error.message);
  return writeOk(data);
}

/** Rename, re-colour, archive, or attach a ministry (`project-treasury.js:97, 347`). */
export async function updateProject(
  id: string,
  patch: ProjectUpdate,
): Promise<WriteResult<ProjectRow>> {
  if (!id) return writeFail('updateProject', 'Falta el identificador del proyecto.');
  const { data, error } = await supabase
    .from('fin_projects')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) return writeFail('updateProject', error.message);
  return writeOk(data);
}

/**
 * Delete a container. Its entries survive: both FKs are
 * `on delete set null`, so the rows fall back into the church books' scope
 * with `project_id = null` — which is exactly what the legacy confirm text
 * promises ("quedarán sin proyecto").
 */
export async function deleteProject(id: string): Promise<WriteResult> {
  if (!id) return writeFail('deleteProject', 'Falta el identificador del proyecto.');
  const { error } = await supabase.from('fin_projects').delete().eq('id', id);
  if (error) return writeFail('deleteProject', error.message);
  return writeOk(undefined);
}
