<script lang="ts">
  // /kit/disclosure/ — the S21 staging smoke page for Disclosure: every state
  // (collapsed / expanded / disabled), the active state that stays readable
  // while collapsed, lazy onLoad, refresh() without re-toggling, the trailing
  // slot, and both palettes. Prerendered, no data fetching, noindex.
  import Disclosure from '$lib/components/Disclosure.svelte';

  let filters = $state(false);
  let day = $state('todos');
  let ministry = $state('todos');

  const DAYS = [
    ['todos', 'Todos los días'],
    ['dom', 'Domingo'],
    ['mie', 'Miércoles'],
  ] as const;
  const MINISTRIES = [
    ['todos', 'Todos'],
    ['alabanza', 'Alabanza'],
    ['jovenes', 'Jóvenes'],
  ] as const;

  const activeFilters = $derived([day, ministry].filter((v) => v !== 'todos').length);
  const filterSummary = $derived(
    [
      day === 'todos' ? null : DAYS.find(([v]) => v === day)?.[1],
      ministry === 'todos' ? null : MINISTRIES.find(([v]) => v === ministry)?.[1],
    ]
      .filter(Boolean)
      .join(' · ') || undefined,
  );

  // The "load once, refresh on demand" case — the discipleship Miembros panel.
  let members = $state<string[]>([]);
  let loads = $state(0);
  let membersPanel = $state<ReturnType<typeof Disclosure> | undefined>();

  const POOL = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elena', 'Fabián', 'Gabriela'];

  async function loadMembers(): Promise<void> {
    loads += 1;
    await new Promise((r) => setTimeout(r, 350));
    members = POOL.slice(0, 3 + (loads % 4));
  }
</script>

<svelte:head>
  <title>Kit · Disclosure</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="kit">
  <header class="kit__head">
    <h1 class="kit__title">Disclosure</h1>
    <p class="kit__lede">
      Página de prueba de S21. El único expandir/colapsar del panel. Los controles secundarios
      —Filtros, Compartir/QR, configuración— empiezan <strong>colapsados</strong> detrás de un botón
      con nombre (<code>docs/admin-ux.md</code> §1).
    </p>
  </header>

  <section class="kit__section">
    <h2>Filtros — el estado activo se ve aunque esté cerrado</h2>
    <p class="kit__note">
      El contador y el resumen viven en el disparador, así que no hace falta abrir el panel para
      saber por qué la lista está filtrada.
    </p>

    <Disclosure
      bind:open={filters}
      label="Filtros"
      icon="filter"
      count={activeFilters}
      summary={filterSummary}
    >
      <div class="panel">
        <label class="field">
          <span class="field__label">Día</span>
          <select class="field__control" bind:value={day}>
            {#each DAYS as [value, label] (value)}
              <option {value}>{label}</option>
            {/each}
          </select>
        </label>
        <label class="field">
          <span class="field__label">Ministerio</span>
          <select class="field__control" bind:value={ministry}>
            {#each MINISTRIES as [value, label] (value)}
              <option {value}>{label}</option>
            {/each}
          </select>
        </label>
      </div>
    </Disclosure>

    <dl class="facts">
      <div class="facts__row">
        <dt>abierto</dt>
        <dd>{filters ? 'sí' : 'no'}</dd>
      </div>
      <div class="facts__row">
        <dt>filtros activos</dt>
        <dd>{activeFilters}</dd>
      </div>
    </dl>
  </section>

  <section class="kit__section">
    <h2>Carga diferida y <code>refresh()</code></h2>
    <p class="kit__note">
      <code>onLoad</code> corre la primera vez que se abre. <code>refresh()</code> vuelve a cargar sin
      cerrar ni volver a abrir — es lo que reemplaza el truco de llamar dos veces al abridor.
    </p>

    <Disclosure bind:this={membersPanel} label="Miembros" icon="users" onLoad={loadMembers}>
      {#snippet trailing()}
        <button type="button" class="mini" onclick={() => membersPanel?.refresh()}>
          Actualizar
        </button>
      {/snippet}
      <ul class="members">
        {#each members as name (name)}
          <li>{name}</li>
        {:else}
          <li class="kit__note">Sin miembros todavía.</li>
        {/each}
      </ul>
    </Disclosure>

    <dl class="facts">
      <div class="facts__row">
        <dt>veces cargado</dt>
        <dd>{loads}</dd>
      </div>
      <div class="facts__row">
        <dt>miembros</dt>
        <dd>{members.length}</dd>
      </div>
    </dl>
  </section>

  <section class="kit__section">
    <h2>Estados</h2>
    <div class="stack">
      <Disclosure label="Colapsado (por defecto)">
        <p class="panel">Contenido.</p>
      </Disclosure>

      <Disclosure label="Expandido de entrada" icon="qrcode" open>
        <p class="panel">
          Un panel puede abrirse de entrada, pero nunca uno que sea el control
          <em>principal</em> de la pantalla.
        </p>
      </Disclosure>

      <Disclosure label="Deshabilitado" icon="lock" disabled>
        <p class="panel">Inalcanzable.</p>
      </Disclosure>
    </div>
  </section>

  <section class="kit__section">
    <h2>Paleta pública vs. admin</h2>
    <div class="compare">
      <div class="compare__col">
        <h3>público</h3>
        <Disclosure label="Compartir / QR" icon="share-nodes" count={2}>
          <p class="panel">El acento sale de <code>--color-secondary</code> (oro).</p>
        </Disclosure>
      </div>
      <div class="compare__col" data-surface="admin">
        <h3>admin</h3>
        <Disclosure label="Compartir / QR" icon="share-nodes" count={2}>
          <p class="panel">El mismo componente, pizarra (D-014).</p>
        </Disclosure>
      </div>
    </div>
  </section>
</main>

<style>
  .kit {
    max-width: 64rem;
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
  .kit__section h3 {
    margin: 0 0 var(--mg-xs);
    color: var(--color-muted);
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
  }
  code {
    font-size: 0.85em;
  }

  .panel {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mg-sm);
    margin: 0;
    padding: var(--pd-sm);
    border: 1px solid var(--gray-40);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    font-size: var(--fs-sm);
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

  .mini {
    min-height: 2.75rem;
    padding: 0.4rem 0.8rem;
    border: 1.5px solid var(--gray-50);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-size: var(--fs-xs);
    font-weight: var(--fw-semibold);
    cursor: pointer;
  }
  .mini:hover {
    border-color: var(--color-dark);
  }

  .members {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mg-xs);
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--fs-sm);
  }
  .members li {
    padding: 0.2rem 0.6rem;
    border-radius: var(--radius-full);
    background: var(--status-neutral-bg);
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

  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--mg-xs);
  }

  .compare {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: var(--mg-sm);
  }
  .compare__col {
    padding: var(--pd-sm);
    border-radius: var(--radius-md);
    background: var(--color-bg-light);
  }
</style>
