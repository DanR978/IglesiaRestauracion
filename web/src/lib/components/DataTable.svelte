<!--
  DataTable — the admin's one data table (S21, DESIGN-SYSTEM §4.4).
  Consumers: the financial tables (Ingresos, Gastos, Recurrentes, Por pagar,
  movements) and the registrant list. Retires the per-feature `.trez-table`
  wrap + `.se-reg-table`, and the dead sortable surface behind them.

  HARD REQUIREMENT (docs/admin-ux.md §2): below 1100px each row becomes a
  labeled card — `display:block` the parts, hide the `thead`, and prefix each
  cell with its column label via `td[data-label]` + `::before`. There is NO
  `overflow-x: auto` anywhere in this file: the legacy `.trez-tablewrap`
  sideways strip is explicitly rejected, and nothing scrolls horizontally at
  360px.

  What else the port fixes:
   • sort state DRIVES RENDER ORDER (legacy tracked sortKey/sortDir that
     nothing read) and stays reachable in card mode, where the `th` buttons
     are hidden, through a compact "Ordenar por" select;
   • money cells take their +/- colour from --money-* only, with no hex and no
     !important (D-016), right-aligned with tabular-nums;
   • auto-inserted rows (recurring, mirrored payables) carry a visible
     system-row marker the treasurer view has never had;
   • loading / empty / error are BUILT IN — a table skeleton, a calm empty box
     with an action slot, and an error box with human Spanish copy plus a
     RETRY button. It never prints a backend string (DESIGN-SYSTEM §5).

  Usage:
    <DataTable
      columns={cols} rows={rows} rowKey={(r) => r.id}
      caption="Ingresos de agosto"
      bind:sortKey bind:sortDir
      state={loading ? 'loading' : failed ? 'error' : 'ready'}
      onRetry={load} />
-->
<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { formatUSD } from '$lib/money';
  import Icon from './Icon.svelte';
  import {
    ariaSort,
    nextSort,
    sortRows,
    type DataTableColumn,
    type DataTableState,
    type MoneyTone,
    type RowTone,
    type SortDir,
  } from './data-table';

  interface Props {
    columns: DataTableColumn<T>[];
    rows: readonly T[];
    /** Stable per-row key — never the array index. */
    rowKey: (row: T) => string;
    /** Accessible table name. Rendered as a visually-hidden <caption>. */
    caption: string;
    state?: DataTableState;
    /** Skeleton rows while loading. Match the page size you expect. */
    loadingRows?: number;
    emptyMessage?: string;
    /** Font Awesome name (no `fa-`) for the empty box. */
    emptyIcon?: string;
    /** Primary action inside the empty state ("Crear", "Nuevo álbum"…). */
    emptyAction?: Snippet;
    /** HUMAN Spanish copy. Never `error.message` (DESIGN-SYSTEM §5.3). */
    errorMessage?: string;
    /** Re-runs the failed fetch. Required for the error state's Retry button. */
    onRetry?: () => void;
    /** Row emphasis: 'overdue' for a past-due payable, 'muted' for a settled row. */
    rowTone?: (row: T) => RowTone;
    /** True for auto-inserted rows (materialised recurring, mirrored payable). */
    isSystemRow?: (row: T) => boolean;
    systemLabel?: string;
    sortKey?: string;
    sortDir?: SortDir;
    /** Search / filter controls above the table. */
    toolbar?: Snippet;
    /** Paging / totals below the table. */
    footer?: Snippet;
  }

  let {
    columns,
    rows,
    rowKey,
    caption,
    state = 'ready',
    loadingRows = 5,
    emptyMessage = 'No hay registros todavía.',
    emptyIcon = 'inbox',
    emptyAction,
    errorMessage = 'No pudimos cargar los datos. Revisa tu conexión.',
    onRetry,
    rowTone,
    isSystemRow,
    systemLabel = 'Generado automáticamente',
    sortKey = $bindable(undefined),
    sortDir = $bindable('asc'),
    toolbar,
    footer,
  }: Props = $props();

  const uid = $props.id();
  const sortSelectId = `dt-sort-${uid}`;

  /** docs/admin-ux.md §2 — the card-collapse breakpoint. Mirrored in CSS. */
  const CARD_QUERY = '(max-width: 1100px)';
  let media: MediaQuery | undefined;
  /**
   * True while the table renders as cards. CSS does the layout; this is only
   * so the sort control survives the hidden `thead`. Server / prerender and
   * any environment without matchMedia report false (the desktop table).
   */
  const cardMode = $derived.by(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    media ??= new MediaQuery(CARD_QUERY);
    return media.current;
  });

  const sortableColumns = $derived(columns.filter((c) => c.sortable));
  const visibleRows = $derived(sortRows(rows, columns, sortKey, sortDir));
  const showSkeleton = $derived(state === 'loading');
  const showError = $derived(state === 'error');
  const showEmpty = $derived(state === 'ready' && visibleRows.length === 0);
  const colCount = $derived(columns.length);
  const skeletonRows = $derived([...Array(Math.max(0, loadingRows)).keys()]);

  function alignOf(column: DataTableColumn<T>): 'start' | 'end' {
    return column.align ?? (column.money || column.numeric ? 'end' : 'start');
  }

  function toneOf(column: DataTableColumn<T>, row: T): MoneyTone {
    if (!column.money) return 'none';
    if (column.moneyTone) return column.moneyTone(row);
    const cents = Number(column.value?.(row) ?? 0);
    if (cents > 0) return 'pos';
    if (cents < 0) return 'neg';
    return 'none';
  }

  function textOf(column: DataTableColumn<T>, row: T): string {
    const raw = column.value?.(row);
    if (column.money) return formatUSD(Number(raw ?? 0));
    return raw == null ? '' : String(raw);
  }

  function applySort(key: string): void {
    const next = nextSort(key, sortKey, sortDir);
    sortKey = next.sortKey;
    sortDir = next.sortDir;
  }

  function toggleDir(): void {
    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  }
</script>

<div class="dt" data-state={state}>
  {#if toolbar || (cardMode && sortableColumns.length > 0)}
    <div class="dt__toolbar">
      {#if toolbar}
        <div class="dt__toolbar-slot">{@render toolbar()}</div>
      {/if}
      {#if cardMode && sortableColumns.length > 0}
        <!-- Card mode hides the thead, so the header sort buttons go with it.
             This keeps sorting reachable on a phone. -->
        <div class="dt__sortpicker">
          <label class="dt__sortpicker-label" for={sortSelectId}>Ordenar por</label>
          <select id={sortSelectId} class="dt__sortpicker-select" bind:value={sortKey}>
            <option value={undefined}>Sin ordenar</option>
            {#each sortableColumns as column (column.key)}
              <option value={column.key}>{column.label}</option>
            {/each}
          </select>
          <button
            type="button"
            class="dt__sortdir"
            onclick={toggleDir}
            disabled={!sortKey}
            aria-label={sortDir === 'asc' ? 'Orden ascendente' : 'Orden descendente'}
          >
            <Icon name={sortDir === 'asc' ? 'arrow-up-short-wide' : 'arrow-down-wide-short'} />
          </button>
        </div>
      {/if}
    </div>
  {/if}

  <table class="dt__table">
    <caption class="dt__caption">{caption}</caption>
    <thead class="dt__head">
      <tr>
        {#each columns as column (column.key)}
          <th
            scope="col"
            class="dt__th"
            class:dt__th--end={alignOf(column) === 'end'}
            aria-sort={column.sortable ? ariaSort(column.key, sortKey, sortDir) : undefined}
          >
            {#if column.sortable}
              <button
                type="button"
                class="dt__sort"
                class:is-active={sortKey === column.key}
                onclick={() => applySort(column.key)}
              >
                <span>{column.label}</span>
                <Icon
                  name={sortKey !== column.key
                    ? 'sort'
                    : sortDir === 'asc'
                      ? 'sort-up'
                      : 'sort-down'}
                  class="dt__sort-icon"
                />
              </button>
            {:else}
              {column.label}
            {/if}
          </th>
        {/each}
      </tr>
    </thead>

    <tbody class="dt__body">
      {#if showSkeleton}
        {#each skeletonRows as i (i)}
          <tr class="dt__row dt__row--skeleton" aria-hidden="true">
            {#each columns as column (column.key)}
              <td class="dt__td" data-label={column.label}>
                <span class="dt__skel"></span>
              </td>
            {/each}
          </tr>
        {/each}
      {:else if showError}
        <tr class="dt__row dt__row--state">
          <td class="dt__td dt__td--state" colspan={colCount}>
            <div class="dt__state dt__state--error" role="alert">
              <Icon name="exclamation-triangle" class="dt__state-icon" />
              <p class="dt__state-msg">{errorMessage}</p>
              {#if onRetry}
                <button type="button" class="ird-btn ird-btn--primary dt__btn" onclick={onRetry}>
                  <Icon name="rotate-right" />
                  Reintentar
                </button>
              {/if}
            </div>
          </td>
        </tr>
      {:else if showEmpty}
        <tr class="dt__row dt__row--state">
          <td class="dt__td dt__td--state" colspan={colCount}>
            <div class="dt__state dt__state--empty">
              <Icon name={emptyIcon} class="dt__state-icon" />
              <p class="dt__state-msg">{emptyMessage}</p>
              {#if emptyAction}
                <div class="dt__state-action">{@render emptyAction()}</div>
              {/if}
            </div>
          </td>
        </tr>
      {:else}
        {#each visibleRows as row (rowKey(row))}
          {@const tone = rowTone?.(row) ?? 'default'}
          {@const system = isSystemRow?.(row) ?? false}
          <tr
            class="dt__row"
            class:dt__row--overdue={tone === 'overdue'}
            class:dt__row--muted={tone === 'muted'}
            class:dt__row--system={system}
          >
            {#each columns as column, ci (column.key)}
              {@const money = toneOf(column, row)}
              <td
                class="dt__td"
                class:dt__td--end={alignOf(column) === 'end'}
                class:dt__td--num={column.money || column.numeric}
                class:dt__td--pos={money === 'pos'}
                class:dt__td--neg={money === 'neg'}
                class:dt__td--warn={money === 'warn'}
                class:dt__td--nolabel={column.hideLabel}
                data-label={column.hideLabel ? undefined : column.label}
              >
                {#if ci === 0 && system}
                  <span class="dt__system" title={systemLabel}>
                    <Icon name="rotate" label={systemLabel} />
                  </span>
                {/if}
                {#if column.cell}{@render column.cell(row)}{:else}{textOf(column, row)}{/if}
              </td>
            {/each}
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>

  {#if footer}
    <div class="dt__footer">{@render footer()}</div>
  {/if}
</div>

<style>
  .dt {
    /* No overflow-x anywhere in this component — admin-ux §2. */
    width: 100%;
    max-width: 100%;
  }

  .dt__toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    justify-content: space-between;
    gap: var(--mg-xs);
    margin-block-end: var(--mg-sm);
  }

  .dt__toolbar-slot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--mg-xs);
    min-width: 0;
  }

  .dt__sortpicker {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .dt__sortpicker-label {
    font-size: var(--fs-xs);
    font-weight: var(--fw-semibold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-muted);
  }

  .dt__sortpicker-select {
    min-height: 2.75rem;
    max-width: 100%;
    padding: 0.4rem 0.6rem;
    border: 1.5px solid var(--gray-50);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-size: var(--fs-sm);
  }

  .dt__sortdir {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    border: 1.5px solid var(--gray-50);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-muted);
    cursor: pointer;
  }

  .dt__sortdir:hover:not(:disabled) {
    border-color: var(--color-dark);
    color: var(--color-text);
  }

  .dt__sortdir:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .dt__table {
    width: 100%;
    max-width: 100%;
    border-collapse: collapse;
    table-layout: auto;
  }

  /* An accessible name for the table without a visible heading. Mirrors the
     global .sr-only utility so the component works standalone too. */
  .dt__caption {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  .dt__th {
    padding: 0.55rem 0.6rem;
    border-bottom: 1px solid var(--gray-50);
    background: var(--status-neutral-bg);
    color: var(--color-muted);
    font-size: var(--fs-xs);
    font-weight: var(--fw-bold);
    letter-spacing: 0.05em;
    text-align: start;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .dt__th--end {
    text-align: end;
  }

  .dt__sort {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0.1rem;
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    color: inherit;
    font: inherit;
    font-size: var(--fs-xs);
    font-weight: var(--fw-bold);
    letter-spacing: inherit;
    text-transform: inherit;
    cursor: pointer;
  }

  .dt__sort:hover {
    color: var(--color-text);
  }

  .dt__sort.is-active {
    color: var(--color-text);
  }

  .dt__sort :global(.dt__sort-icon) {
    opacity: 0.55;
  }

  .dt__sort.is-active :global(.dt__sort-icon) {
    opacity: 1;
  }

  .dt__td {
    padding: 0.6rem;
    border-bottom: 1px solid var(--gray-40);
    color: var(--color-text);
    font-size: var(--fs-sm);
    vertical-align: middle;
    /* A long email or note can never widen the table past the viewport. */
    word-break: break-word;
    overflow-wrap: anywhere;
  }

  .dt__td--end {
    text-align: end;
  }

  .dt__td--num {
    font-variant-numeric: tabular-nums;
    font-weight: var(--fw-semibold);
    white-space: nowrap;
  }

  /* Money semantics — the ONLY non-slate colour here, and it means something.
     Tokens only, no !important (D-016). */
  .dt__td--pos {
    color: var(--money-pos);
  }
  .dt__td--neg {
    color: var(--money-neg);
  }
  .dt__td--warn {
    color: var(--money-warn);
  }

  .dt__row:hover .dt__td {
    background: var(--status-neutral-bg);
  }

  .dt__row--muted .dt__td {
    color: var(--color-muted);
  }

  /* Overdue emphasis (Por pagar): a left rule + tinted ground, never colour alone. */
  .dt__row--overdue .dt__td {
    background: var(--money-neg-bg);
  }

  .dt__row--overdue .dt__td:first-child {
    box-shadow: inset 3px 0 0 0 var(--money-neg);
  }

  .dt__system {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    margin-inline-end: 0.35rem;
    border-radius: var(--radius-full);
    background: var(--status-neutral-bg);
    color: var(--color-muted);
    font-size: var(--fs-xxs);
    vertical-align: middle;
  }

  /* ── loading / empty / error ─────────────────────────────────────────── */
  .dt__skel {
    display: block;
    height: 0.85rem;
    border-radius: var(--radius-xs);
    background: linear-gradient(
      90deg,
      var(--status-neutral-bg) 25%,
      var(--status-restricted-bg) 37%,
      var(--status-neutral-bg) 63%
    );
    background-size: 400% 100%;
    animation: dt-shimmer 1.4s ease-in-out infinite;
  }

  @keyframes dt-shimmer {
    from {
      background-position: 100% 50%;
    }
    to {
      background-position: 0 50%;
    }
  }

  .dt__td--state {
    padding: var(--pd-sm);
    border-bottom: 0;
  }

  .dt__state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: var(--pd-md) var(--pd-sm);
    text-align: center;
  }

  .dt__state :global(.dt__state-icon) {
    font-size: var(--fs-xl);
    color: var(--color-muted);
  }

  .dt__state--error :global(.dt__state-icon) {
    color: var(--color-danger);
  }

  .dt__state-msg {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }

  .dt__state--error .dt__state-msg {
    color: var(--color-text);
  }

  /* INTERIM (S14 owns `.ird-btn`): a minimal token-only look so the Retry
     control is usable before the Button component lands. Delete this block
     when S14 ships and the global .ird-btn styles arrive. */
  .dt__btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.75rem;
    padding: 0.5rem 1.1rem;
    border: 0;
    border-radius: var(--radius-md);
    background: var(--color-dark);
    color: var(--color-white);
    box-shadow: var(--shadow-sm);
    font: inherit;
    font-size: var(--fs-btn);
    font-weight: var(--fw-semibold);
    cursor: pointer;
  }

  .dt__btn:hover {
    filter: brightness(1.08);
    box-shadow: var(--shadow-md);
  }

  .dt__footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--mg-xs);
    margin-block-start: var(--mg-sm);
  }

  /* ── card collapse (docs/admin-ux.md §2) ─────────────────────────────────
     Below 1100px every row becomes a labeled card. The table never scrolls
     sideways; it reflows. */
  @media (max-width: 1100px) {
    .dt__table,
    .dt__head,
    .dt__body,
    .dt__row,
    .dt__th,
    .dt__td {
      display: block;
    }

    .dt__head {
      display: none;
    }

    .dt__row {
      margin-block-end: 0.6rem;
      padding: 0.55rem 0.85rem;
      border: 1px solid var(--gray-50);
      border-radius: var(--radius-md);
      background: var(--color-surface);
    }

    .dt__row:hover .dt__td {
      background: none;
    }

    .dt__row--overdue {
      background: var(--money-neg-bg);
      border-inline-start: 3px solid var(--money-neg);
    }

    .dt__row--overdue .dt__td,
    .dt__row--overdue .dt__td:first-child {
      background: none;
      box-shadow: none;
    }

    .dt__td {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.3rem 0;
      border: 0;
      text-align: end;
    }

    .dt__td::before {
      content: attr(data-label);
      flex: 0 0 auto;
      color: var(--color-muted);
      font-size: var(--fs-xxs);
      font-weight: var(--fw-bold);
      letter-spacing: 0.03em;
      text-align: start;
      text-transform: uppercase;
    }

    .dt__td--nolabel {
      justify-content: flex-end;
      padding-block-start: 0.5rem;
    }

    .dt__td--nolabel::before {
      content: none;
    }

    .dt__td--state {
      display: block;
      text-align: center;
    }

    .dt__td--state::before {
      content: none;
    }

    .dt__row--skeleton {
      border-style: dashed;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dt__skel {
      animation: none;
      background: var(--status-neutral-bg);
    }
  }
</style>
