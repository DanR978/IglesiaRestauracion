/* ============================================================================
 * web/src/lib/repos/receipts.ts — treasury receipts (S56b · D-018 / D-019)
 * ----------------------------------------------------------------------------
 * The data layer behind the Recibos month grid: list one scope + one year,
 * upload an already-optimised WebP pair, delete, and download. Reads never
 * throw (warn with `[receipts]`, return a safe empty); writes return
 * `WriteResult`.
 *
 * THE BUCKET IS PRIVATE (D-018). There is no `getPublicUrl` here and no signed
 * URL: every read goes through an authenticated `.download()` so no bearer URL
 * ever lands in history, the DOM, or a service-worker cache. Callers must
 * `URL.revokeObjectURL()` whatever they create from the returned Blob.
 *
 * VISIBILITY is RLS's job, not this module's (D-002). `scope='ministry'` rows
 * are shared with every leader of that ministry (D-019); `scope='project'` rows
 * are owner-only and invisible even to finance. The scope argument here only
 * shapes the query.
 *
 * TYPES — TEMPORARY: `fin_receipts` is not in the generated
 * `$lib/db/database.types` yet. S56b's UI session runs `supabase gen types
 * --local` and then this module drops `FinReceipt` / `ReceiptsDatabase` for
 * `Tables<'fin_receipts'>` and the plain `supabase` client. Until then the row
 * type below mirrors `supabase/migrations/20260824120000_fin_receipts.sql`
 * column for column.
 *
 * Usage:
 *   import { listReceipts, monthSummaries, uploadReceipt } from '$lib/repos/receipts';
 *   const rows = await listReceipts({ scope: 'church' }, 2026);
 *   const months = monthSummaries(rows);   // always 12 entries, Ene…Dic
 * ========================================================================== */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '$lib/db/client';
import type { WriteResult } from './types';

const TAG = '[receipts]';

/** Supabase Storage bucket holding every receipt object. Private — never public. */
export const RECEIPTS_BUCKET = 'receipts';

export const RECEIPT_SCOPES = ['church', 'ministry', 'project'] as const;
export type ReceiptScope = (typeof RECEIPT_SCOPES)[number];

/** Which set of receipts a view is looking at; mirrors the scope↔ids CHECK. */
export type ScopeRef =
  | { scope: 'church' }
  | { scope: 'ministry'; ministryId: string }
  | { scope: 'project'; projectId: string };

/** One `public.fin_receipts` row. Replace with `Tables<'fin_receipts'>` after S56b-UI. */
export type FinReceipt = {
  id: string;
  scope: ReceiptScope;
  ministry_id: string | null;
  project_id: string | null;
  year: number;
  month: number;
  storage_path: string;
  thumb_path: string;
  file_size: number | null;
  original_name: string | null;
  note: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export type FinReceiptInsert = Omit<FinReceipt, 'id' | 'created_at'> & {
  id?: string;
  created_at?: string;
};

/**
 * A one-table stand-in for the generated `Database` so the queries below stay
 * fully typed while `fin_receipts` is missing from `database.types.ts`. The
 * cast is the single, documented escape hatch in this module — never an `any`.
 */
type ReceiptsDatabase = {
  public: {
    Tables: {
      fin_receipts: {
        Row: FinReceipt;
        Insert: FinReceiptInsert;
        Update: Partial<FinReceiptInsert>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
  };
};

const db = supabase as unknown as SupabaseClient<ReceiptsDatabase>;

/* ── Retention (D-018) ─────────────────────────────────────────────────────
 * Year Y is deleted on February 1st of Y+2, so the books always hold the full
 * previous year plus the current one. Duplicated (one line) in
 * `supabase/functions/receipts-cleanup/index.ts` — Deno and the browser bundle
 * cannot share a module. Keep the two in step.
 * ------------------------------------------------------------------------ */

/** Everything filed in this year or earlier is gone at the next annual sweep. */
export function retentionCutoffYear(now: Date = new Date()): number {
  // D-018 is a DATE rule, not a year rule: year Y survives until the Feb 1
  // sweep of Y+2. In January the sweep has not happened yet, so the window is
  // still one year wider — without this, a manual off-cycle re-run in January
  // (the documented recovery for a missed Feb 1) would destroy a year of
  // receipts three weeks early, irreversibly.
  return now.getUTCFullYear() - (now.getUTCMonth() === 0 ? 3 : 2);
}

/**
 * The years the picker may offer, newest first — derived from the cutoff so it
 * can never disagree with what retention actually keeps. Two entries most of
 * the year; THREE during January, when year N-2 has not been swept yet and is
 * still readable (the retention notice on the screen promises exactly that).
 */
export function retainedYears(now: Date = new Date()): number[] {
  const oldest = retentionCutoffYear(now) + 1;
  const years: number[] = [];
  for (let y = now.getUTCFullYear(); y >= oldest; y--) years.push(y);
  return years;
}

/* ── Storage paths ─────────────────────────────────────────────────────────
 * The YEAR folder is what the retention job sweeps; the MONTH is a column, so
 * re-filing a receipt never moves an object. `receipts_insert` enforces this
 * exact shape (folder depth + 4-digit year) — build paths only through here.
 * ------------------------------------------------------------------------ */

/** `church/2026` · `ministry/<uuid>/2026` · `project/<uuid>/2026`. */
export function receiptFolder(ref: ScopeRef, year: number): string {
  if (ref.scope === 'ministry') return `ministry/${ref.ministryId}/${year}`;
  if (ref.scope === 'project') return `project/${ref.projectId}/${year}`;
  return `church/${year}`;
}

const newId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** The main + thumb object paths for one receipt. */
export function receiptPaths(
  ref: ScopeRef,
  year: number,
  id: string = newId(),
): { mainPath: string; thumbPath: string } {
  const folder = receiptFolder(ref, year);
  return { mainPath: `${folder}/${id}.webp`, thumbPath: `${folder}/${id}-thumb.webp` };
}

/* ── Read ──────────────────────────────────────────────────────────────────── */

/** Every receipt of one scope + year, in month then upload order. */
export async function listReceipts(ref: ScopeRef, year: number): Promise<FinReceipt[]> {
  if (!Number.isInteger(year)) return [];
  let q = db
    .from('fin_receipts')
    .select('*')
    .eq('scope', ref.scope)
    .eq('year', year)
    .order('month', { ascending: true })
    .order('created_at', { ascending: true });
  if (ref.scope === 'ministry') q = q.eq('ministry_id', ref.ministryId);
  if (ref.scope === 'project') q = q.eq('project_id', ref.projectId);
  const { data, error } = await q;
  if (error) {
    console.warn(`${TAG} listReceipts:`, error.message);
    return [];
  }
  return data ?? [];
}

/** Authenticated fetch of one object; `null` on failure (the bucket is private). */
export async function downloadReceipt(path: string): Promise<Blob | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(RECEIPTS_BUCKET).download(path);
  if (error) {
    console.warn(`${TAG} downloadReceipt:`, error.message);
    return null;
  }
  return data ?? null;
}

/* ── Grouping (the 4×3 month grid) ─────────────────────────────────────────── */

/** Grid labels, January-first. */
export const MONTH_LABELS: readonly string[] = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

/** Full names, for accessible control names ("Subir recibos de enero"). */
export const MONTH_NAMES: readonly string[] = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export type ReceiptMonth = {
  /** 1–12. */
  month: number;
  label: string;
  name: string;
  receipts: FinReceipt[];
  count: number;
  /** Sum of `file_size` in bytes; 0 when the month is empty. */
  totalSize: number;
};

/** Bytes held by a set of receipts (missing `file_size` counts as 0). */
export function totalBytes(rows: readonly FinReceipt[]): number {
  return rows.reduce((sum, r) => sum + (r.file_size ?? 0), 0);
}

/** Always 12 buckets, Ene…Dic, so the grid never has to fill gaps itself. */
export function monthSummaries(rows: readonly FinReceipt[]): ReceiptMonth[] {
  const months: ReceiptMonth[] = MONTH_LABELS.map((label, i) => ({
    month: i + 1,
    label,
    name: MONTH_NAMES[i],
    receipts: [],
    count: 0,
    totalSize: 0,
  }));
  for (const row of rows) {
    const bucket = months[row.month - 1];
    if (!bucket) continue;
    bucket.receipts.push(row);
  }
  for (const bucket of months) {
    bucket.count = bucket.receipts.length;
    bucket.totalSize = totalBytes(bucket.receipts);
  }
  return months;
}

/* ── Write ─────────────────────────────────────────────────────────────────── */

/**
 * One receipt's already-optimised renditions. Optimisation is NOT a repo
 * concern: the caller runs the S46 image optimiser with the receipt preset
 * (main WebP ≤1600px ~q0.8, thumb WebP 320px ~q0.7, never upscaled — D-018).
 */
export type ReceiptUpload = {
  year: number;
  /** 1–12. */
  month: number;
  main: Blob;
  thumb: Blob;
  originalName?: string | null;
  note?: string | null;
  /** `auth.uid()` of the uploader; the column has no default. */
  uploadedBy?: string | null;
};

/**
 * Upload one receipt: two storage objects, then the row. A failure at any step
 * removes whatever was already uploaded, so a failed upload can never leave an
 * orphaned object behind (the same rollback as legacy `gallery.js uploadPhoto`).
 */
export async function uploadReceipt(
  ref: ScopeRef,
  input: ReceiptUpload,
): Promise<WriteResult<FinReceipt>> {
  if (!input?.main || !input?.thumb) return { ok: false, error: 'Argumentos inválidos' };
  const { year, month } = input;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { ok: false, error: 'Año inválido' };
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { ok: false, error: 'Mes inválido' };
  }

  const { mainPath, thumbPath } = receiptPaths(ref, year);
  const bucket = supabase.storage.from(RECEIPTS_BUCKET);
  const opts = { cacheControl: '3600', upsert: false, contentType: 'image/webp' };

  const uploads = await Promise.all([
    bucket.upload(mainPath, input.main, opts),
    bucket.upload(thumbPath, input.thumb, opts),
  ]);
  const failed = uploads.find((u) => u.error);
  if (failed?.error) {
    // One of the pair may still have landed — never leave half a receipt.
    void bucket.remove([mainPath, thumbPath]);
    console.warn(`${TAG} uploadReceipt storage:`, failed.error.message);
    return { ok: false, error: failed.error.message };
  }

  const row: FinReceiptInsert = {
    scope: ref.scope,
    ministry_id: ref.scope === 'ministry' ? ref.ministryId : null,
    project_id: ref.scope === 'project' ? ref.projectId : null,
    year,
    month,
    storage_path: mainPath,
    thumb_path: thumbPath,
    file_size: input.main.size,
    original_name: input.originalName ?? null,
    note: input.note ?? null,
    uploaded_by: input.uploadedBy ?? null,
  };

  const { data, error } = await db.from('fin_receipts').insert(row).select().single();
  if (error) {
    void bucket.remove([mainPath, thumbPath]);
    console.warn(`${TAG} uploadReceipt row:`, error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, data };
}

/** Delete a receipt: its objects first (best effort), then the row. */
export async function deleteReceipt(
  receipt: Pick<FinReceipt, 'id'> & { storage_path?: string | null; thumb_path?: string | null },
): Promise<WriteResult> {
  if (!receipt?.id) return { ok: false, error: 'Argumentos inválidos' };
  const paths = [receipt.storage_path, receipt.thumb_path].filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  );
  if (paths.length) {
    const { error: rmErr } = await supabase.storage.from(RECEIPTS_BUCKET).remove(paths);
    if (rmErr) console.warn(`${TAG} deleteReceipt storage:`, rmErr.message);
  }
  const { error } = await db.from('fin_receipts').delete().eq('id', receipt.id);
  if (error) {
    console.warn(`${TAG} deleteReceipt:`, error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, data: undefined };
}
