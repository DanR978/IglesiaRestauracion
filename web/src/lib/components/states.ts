/* ============================================================================
 * web/src/lib/components/states.ts — the async-view state contract (PR-C2, S12)
 * ----------------------------------------------------------------------------
 * The non-visual half of StateLoading / StateEmpty / StateError, the three
 * states every async view renders (DESIGN-SYSTEM §5, CLAUDE.md §5). They
 * retire the legacy strings (js/components/states.js):
 *   loading  <div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>
 *   empty    <div class="empty-state"><i class="fas fa-…"></i><p>No hay …</p></div>
 *   error    the same empty-state box printing error.message — a raw backend
 *            string, no retry, and indistinguishable from "nothing here".
 *
 * The contract a view keeps (ADR-0004 / D-032):
 *   pending                → <StateLoading shape=… />   a skeleton of the real layout
 *   ok, data empty         → <StateEmpty icon message action? />
 *   ok: false              → <StateError message={result.error.message} onRetry={load} />
 * A failure is never shown as empty, and the error copy is RepoError.message —
 * Spanish and safe — never `detail`.
 *
 * Emitted names (one BEM block for all three):
 *   ird-state · ird-state--{loading|empty|error} · ird-state--compact
 *   ird-state--{card-grid|table|list|detail}            (loading shapes)
 *   ird-state__skeleton · __card · __row · __row--head · __item · __lines ·
 *   __field · __bone · __bone--{icon|value|title|line|meta|label|cell|avatar}
 *   ird-state__icon · __message · __hint · __action
 * Skeleton sizes are component tokens a parent may set on any ancestor:
 *   --state-grid-min (11.25rem) · --state-card-height (8rem) · --state-row-height (2.75rem)
 *
 * Usage:
 *   import StateLoading from '#lib/components/StateLoading.svelte';
 *   <StateLoading shape="table" rows={6} />
 *   <StateEmpty icon="calendar-check" message="No hay eventos próximos." />
 *   <StateError message={res.error.message} onRetry={load} />
 * ========================================================================== */

/** DESIGN-SYSTEM §5.1 — the four layouts a skeleton can stand in for. */
export type LoadingShape = 'card-grid' | 'table' | 'list' | 'detail';

export const LOADING_SHAPES: readonly LoadingShape[] = ['card-grid', 'table', 'list', 'detail'];

/** Placeholders per shape when `rows` is not given: cards, table rows, list rows, fields. */
export const DEFAULT_ROWS: Readonly<Record<LoadingShape, number>> = {
  'card-grid': 4,
  table: 5,
  list: 4,
  detail: 4,
};

/** Upper bound on placeholders: a skeleton is a hint of the layout, not a second page. */
export const MAX_ROWS = 24;

export const DEFAULT_COLUMNS = 4;
export const MAX_COLUMNS = 8;

export const STATE_BLOCK = 'ird-state';

/** Visually hidden, read by assistive tech while a view loads. */
export const STATE_LOADING_LABEL = 'Cargando…';

export const STATE_RETRY_LABEL = 'Reintentar';

/** Error copy when the caller has none — what happened, and what to do. */
export const STATE_ERROR_FALLBACK = 'No pudimos cargar esta información. Inténtalo de nuevo.';

function bounded(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.round(value)));
}

/** How many placeholders to draw: `rows` rounded into 1…MAX_ROWS, or the shape's default. */
export function skeletonRows(shape: LoadingShape, rows?: number): number {
  return bounded(rows, DEFAULT_ROWS[shape], MAX_ROWS);
}

/** Table cells per row: `columns` rounded into 1…MAX_COLUMNS, or DEFAULT_COLUMNS. */
export function skeletonColumns(columns?: number): number {
  return bounded(columns, DEFAULT_COLUMNS, MAX_COLUMNS);
}

/** The error copy to render: the caller's trimmed message, or the fallback when blank. */
export function errorCopy(message: string | null | undefined): string {
  const text = typeof message === 'string' ? message.trim() : '';
  return text === '' ? STATE_ERROR_FALLBACK : text;
}

/** Whether a retry handler handed back something to wait for. */
export function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}
