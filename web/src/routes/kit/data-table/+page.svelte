<script lang="ts">
  // /kit/data-table/ — the S21 staging smoke page for DataTable: the desktop
  // table, the card collapse below 1100px (resize the window — the page must
  // never scroll sideways, including at 360px), sorting that really reorders,
  // money tones, system + overdue rows, and the loading / empty / error
  // states. Prerendered, no data fetching, noindex.
  import { onMount, type Snippet } from 'svelte';
  import DataTable from '$lib/components/DataTable.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import type { DataTableColumn, DataTableState } from '$lib/components/data-table';

  interface Payable {
    id: string;
    creditor: string;
    cents: number;
    due: string | null;
    status: 'paid' | 'pending' | 'overdue';
    auto: boolean;
  }

  const ALL: Payable[] = [
    {
      id: '1',
      creditor: 'Energía Eléctrica',
      cents: 24350,
      due: '2026-08-05',
      status: 'overdue',
      auto: false,
    },
    {
      id: '2',
      creditor: 'Pastor Juan — sostenimiento',
      cents: 120000,
      due: '2026-09-01',
      status: 'pending',
      auto: true,
    },
    {
      id: '3',
      creditor: 'Ministerio de Alabanza',
      cents: 45000,
      due: '2026-09-10',
      status: 'pending',
      auto: true,
    },
    {
      id: '4',
      creditor: 'Seguro del templo',
      cents: 78900,
      due: '2026-08-28',
      status: 'paid',
      auto: false,
    },
    { id: '5', creditor: 'Agua', cents: -5200, due: null, status: 'paid', auto: false },
    {
      id: '6',
      creditor: 'Ábaco Papelería',
      cents: 3125,
      due: '2026-09-15',
      status: 'pending',
      auto: false,
    },
  ];

  const STATUS_LABEL: Record<Payable['status'], string> = {
    paid: 'Pagado',
    pending: 'Pendiente',
    overdue: 'Vencido',
  };
  const STATUS_ICON: Record<Payable['status'], string> = {
    paid: 'circle-check',
    pending: 'clock',
    overdue: 'triangle-exclamation',
  };

  let tableState = $state<DataTableState>('ready');
  let query = $state('');
  let sortKey = $state<string | undefined>('due');
  let sortDir = $state<'asc' | 'desc'>('asc');
  let viewport = $state(0);

  const rows = $derived(
    tableState === 'ready'
      ? ALL.filter((r) => r.creditor.toLowerCase().includes(query.trim().toLowerCase()))
      : [],
  );

  type Cell = Snippet<[Payable]>;

  function buildColumns(due: Cell, status: Cell, actions: Cell): DataTableColumn<Payable>[] {
    return [
      { key: 'creditor', label: 'Se le debe a', sortable: true, value: (r) => r.creditor },
      { key: 'cents', label: 'Monto', money: true, sortable: true, value: (r) => r.cents },
      { key: 'due', label: 'Vence', sortable: true, value: (r) => r.due ?? '', cell: due },
      { key: 'status', label: 'Estado', sortable: true, value: (r) => r.status, cell: status },
      { key: 'actions', label: 'Acciones', hideLabel: true, cell: actions },
    ];
  }

  const STATES = ['ready', 'loading', 'error'] as const;

  onMount(() => {
    const measure = () => (viewport = window.innerWidth);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });
</script>

{#snippet dueCell(row: Payable)}
  {row.due ?? 'Sin fecha'}
{/snippet}

{#snippet statusCell(row: Payable)}
  <span class="pill pill--{row.status}">
    <Icon name={STATUS_ICON[row.status]} />
    {STATUS_LABEL[row.status]}
  </span>
{/snippet}

{#snippet actionsCell(row: Payable)}
  <button type="button" class="kebab" aria-label="Acciones de {row.creditor}">
    <Icon name="ellipsis-vertical" />
  </button>
{/snippet}

{#snippet toolbar()}
  <label class="field">
    <span class="field__label">Buscar</span>
    <input class="field__control" type="search" bind:value={query} placeholder="Proveedor…" />
  </label>
{/snippet}

{#snippet emptyAction()}
  <button type="button" class="cta"><Icon name="plus" /> Nueva cuenta por pagar</button>
{/snippet}

{#snippet footer()}
  <p class="kit__note">{rows.length} de {ALL.length} cuentas</p>
{/snippet}

<svelte:head>
  <title>Kit · DataTable</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="kit">
  <header class="kit__head">
    <h1 class="kit__title">DataTable</h1>
    <p class="kit__lede">
      Página de prueba de S21. Por debajo de <strong>1100px</strong> cada fila se convierte en una
      tarjeta con etiquetas; nunca hay desplazamiento horizontal, ni siquiera a 360px (<code
        >docs/admin-ux.md</code
      > §2).
    </p>
    <dl class="facts">
      <div class="facts__row">
        <dt>ancho de ventana</dt>
        <dd>{viewport}px — {viewport > 1100 ? 'tabla' : 'tarjetas'}</dd>
      </div>
      <div class="facts__row">
        <dt>orden</dt>
        <dd>{sortKey ?? 'sin ordenar'} · {sortDir}</dd>
      </div>
    </dl>
  </header>

  <section class="kit__section">
    <h2>Estado</h2>
    <div class="switcher" role="group" aria-label="Estado de la tabla">
      {#each STATES as s (s)}
        <button
          type="button"
          class="switcher__btn"
          class:is-active={tableState === s}
          aria-pressed={tableState === s}
          onclick={() => (tableState = s)}
        >
          {s === 'ready' ? 'Con datos' : s === 'loading' ? 'Cargando' : 'Error'}
        </button>
      {/each}
      <button
        type="button"
        class="switcher__btn"
        class:is-active={tableState === 'ready' && query === 'zzz'}
        onclick={() => {
          tableState = 'ready';
          query = 'zzz';
        }}
      >
        Vacío
      </button>
    </div>
  </section>

  <section class="kit__section">
    <h2>Cuentas por pagar</h2>
    <DataTable
      columns={buildColumns(dueCell, statusCell, actionsCell)}
      {rows}
      state={tableState}
      bind:sortKey
      bind:sortDir
      rowKey={(r) => r.id}
      caption="Cuentas por pagar de la iglesia"
      loadingRows={5}
      emptyMessage="No hay cuentas por pagar."
      emptyIcon="file-invoice-dollar"
      errorMessage="No pudimos cargar las cuentas. Revisa tu conexión."
      onRetry={() => {
        tableState = 'ready';
        query = '';
      }}
      rowTone={(r) =>
        r.status === 'overdue' ? 'overdue' : r.status === 'paid' ? 'muted' : 'default'}
      isSystemRow={(r) => r.auto}
      {toolbar}
      {emptyAction}
      {footer}
    />
  </section>

  <section class="kit__section" data-surface="admin">
    <h2>La misma tabla en la superficie admin</h2>
    <p class="kit__note">
      Pizarra en vez de oro (D-014); el verde/rojo del dinero se queda porque significa algo
      (D-016).
    </p>
    <DataTable
      columns={buildColumns(dueCell, statusCell, actionsCell)}
      rows={ALL.slice(0, 3)}
      rowKey={(r) => r.id}
      caption="Cuentas por pagar (admin)"
      isSystemRow={(r) => r.auto}
      rowTone={(r) => (r.status === 'overdue' ? 'overdue' : 'default')}
    />
  </section>
</main>

<style>
  .kit {
    max-width: 72rem;
    margin: 0 auto;
    padding: var(--pd-md);
    font-family: var(--font-base);
    font-size: var(--fs-base);
    line-height: 1.5;
  }
  .kit__title {
    font-size: var(--fs-2xl);
    font-weight: var(--fw-bold);
  }
  .kit__lede,
  .kit__note {
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
  .kit__section {
    margin-top: var(--mg-lg);
  }
  .kit__section > h2 {
    margin-bottom: var(--mg-sm);
    font-size: var(--fs-lg);
    font-weight: var(--fw-semibold);
  }
  code {
    font-size: 0.85em;
  }

  .facts {
    margin: var(--mg-sm) 0 0;
    padding: var(--pd-sm);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-sm);
    font-size: var(--fs-sm);
  }
  .facts__row {
    display: grid;
    grid-template-columns: 14rem 1fr;
    gap: var(--mg-xs);
    padding: var(--mg-xxs) 0;
  }
  .facts__row dt {
    color: var(--color-muted);
  }
  .facts__row dd {
    margin: 0;
  }

  .switcher {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mg-xxs);
  }
  .switcher__btn {
    min-height: 2.75rem;
    padding: 0.4rem 0.9rem;
    border: 1.5px solid var(--gray-50);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-size: var(--fs-sm);
    cursor: pointer;
  }
  .switcher__btn.is-active {
    border-color: var(--color-dark);
    background: var(--color-dark);
    color: var(--color-white);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }
  .field__label {
    color: var(--color-muted);
    font-size: var(--fs-xs);
    font-weight: var(--fw-semibold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .field__control {
    max-width: 100%;
    padding: 0.5rem 0.6rem;
    border: 1.5px solid var(--gray-50);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-size: var(--fs-sm);
  }

  /* Status pills use the S11 honest-status tokens and pair icon + text — colour
     is never the only cue (DESIGN-SYSTEM §2.5). Badge itself is S14. */
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.18rem 0.6rem;
    border-radius: var(--radius-full);
    font-size: var(--fs-xxs);
    font-weight: var(--fw-bold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .pill--paid {
    background: var(--status-paid-bg);
    color: var(--status-paid);
  }
  .pill--pending {
    background: var(--status-pending-bg);
    color: var(--status-pending);
  }
  .pill--overdue {
    background: var(--status-overdue-bg);
    color: var(--status-overdue);
  }

  .kebab,
  .cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 2.75rem;
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-muted);
    font: inherit;
    cursor: pointer;
  }
  .kebab {
    width: 2.75rem;
    border: 1.5px solid var(--gray-50);
  }
  .kebab:hover {
    border-color: var(--color-dark);
    color: var(--color-text);
  }
  .cta {
    padding: 0.5rem 1.1rem;
    border: 0;
    border-radius: var(--radius-md);
    background: var(--color-dark);
    color: var(--color-white);
    font-size: var(--fs-btn);
    font-weight: var(--fw-semibold);
  }
</style>
