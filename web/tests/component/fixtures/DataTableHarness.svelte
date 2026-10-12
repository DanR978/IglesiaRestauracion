<!--
  Test fixture (S21). Supplies DataTable's snippet props (a rich cell, the
  toolbar, the empty action) and the bind:sortKey / bind:sortDir read-back the
  tests assert on.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import DataTable from '$lib/components/DataTable.svelte';
  import type { DataTableColumn, DataTableState, SortDir } from '$lib/components/data-table';
  import type { HarnessRow } from './rows';

  interface Props {
    rows?: HarnessRow[];
    state?: DataTableState;
    sortKey?: string;
    sortDir?: SortDir;
    withToolbar?: boolean;
    withEmptyAction?: boolean;
    onRetry?: () => void;
    loadingRows?: number;
  }

  let {
    rows = [],
    state = 'ready',
    sortKey = $bindable(undefined),
    sortDir = $bindable('asc'),
    withToolbar = false,
    withEmptyAction = false,
    onRetry,
    loadingRows = 3,
  }: Props = $props();

  function buildColumns(actions: Snippet<[HarnessRow]>): DataTableColumn<HarnessRow>[] {
    return [
      { key: 'payee', label: 'Beneficiario', sortable: true, value: (r) => r.payee },
      { key: 'cents', label: 'Monto', money: true, sortable: true, value: (r) => r.cents },
      { key: 'due', label: 'Vence', sortable: true, value: (r) => r.due },
      { key: 'actions', label: 'Acciones', hideLabel: true, cell: actions },
    ];
  }
</script>

{#snippet actionsCell(row: HarnessRow)}
  <button type="button" data-testid="kebab-{row.id}" aria-label="Acciones">⋮</button>
{/snippet}

{#snippet toolbarSlot()}
  <input data-testid="search" type="search" placeholder="Buscar" />
{/snippet}

{#snippet emptyActionSlot()}
  <button type="button" data-testid="empty-cta">Nueva cuenta</button>
{/snippet}

<DataTable
  columns={buildColumns(actionsCell)}
  {rows}
  {state}
  {loadingRows}
  {onRetry}
  bind:sortKey
  bind:sortDir
  rowKey={(r) => r.id}
  caption="Cuentas por pagar"
  emptyMessage="No hay cuentas por pagar."
  errorMessage="No pudimos cargar las cuentas. Revisa tu conexión."
  rowTone={(r) => r.tone ?? 'default'}
  isSystemRow={(r) => r.auto === true}
  toolbar={withToolbar ? toolbarSlot : undefined}
  emptyAction={withEmptyAction ? emptyActionSlot : undefined}
/>

<p data-testid="sort-state">{sortKey ?? 'none'}:{sortDir}</p>
