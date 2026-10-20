<script lang="ts">
  // /kit/segmented-control/ — the PR-C2 staging smoke page for
  // SegmentedControl: the theme choice S45 ships (Claro / Oscuro / Sistema —
  // it really switches this page's theme), the report Período with its nested
  // quarter, the disabled state, and both palettes. A native radio group, so
  // the arrow keys move AND select. Prerendered, no data fetching, noindex.
  import { onMount } from 'svelte';
  import SegmentedControl from '#lib/components/SegmentedControl.svelte';
  import type { SegmentedOption } from '#lib/components/segmented-control.js';
  import { isTheme, theme } from '#lib/theme.svelte.js';

  /** Set once the page is interactive; the e2e specs wait for it before typing. */
  let hydrated = $state(false);
  onMount(() => (hydrated = true));

  const THEME: SegmentedOption[] = [
    { value: 'light', label: 'Claro', icon: 'sun' },
    { value: 'dark', label: 'Oscuro', icon: 'moon' },
    { value: 'system', label: 'Sistema', icon: 'circle-half-stroke' },
  ];

  const PERIODS: SegmentedOption[] = [
    { value: 'week', label: 'Semana' },
    { value: 'month', label: 'Mes' },
    { value: 'quarter', label: 'Trimestre' },
    { value: 'year', label: 'Año' },
  ];

  const QUARTERS: SegmentedOption[] = [
    { value: 'q1', label: 'T1' },
    { value: 'q2', label: 'T2' },
    { value: 'q3', label: 'T3' },
    { value: 'q4', label: 'T4' },
  ];

  let period = $state('month');
  let quarter = $state('q1');
  let changes = $state(0);
  let density = $state('normal');

  function chooseTheme(next: string): void {
    if (isTheme(next)) theme.set(next);
  }
</script>

<svelte:head>
  <title>Kit · SegmentedControl</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="kit" data-hydrated={hydrated || undefined}>
  <header class="kit__head">
    <h1 class="kit__title">SegmentedControl</h1>
    <p class="kit__lede">
      Página de prueba de PR-C2. Una opción entre pocas, todas a la vista: un grupo de radios
      nativos con nombre. Las flechas mueven y eligen; Tab entra en la opción elegida y sale del
      grupo.
    </p>
  </header>

  <section class="kit__section" aria-labelledby="h-theme">
    <h2 id="h-theme">Tema</h2>
    <p class="kit__note">El control que usa Preferencias. Cambia el tema de esta página.</p>
    <SegmentedControl label="Tema" options={THEME} value={theme.current} onChange={chooseTheme} />
    <dl class="facts">
      <div class="facts__row">
        <dt>preferencia</dt>
        <dd data-testid="theme-current">{theme.current}</dd>
      </div>
      <div class="facts__row">
        <dt>pintado</dt>
        <dd data-testid="theme-resolved">{theme.resolved}</dd>
      </div>
    </dl>
  </section>

  <section class="kit__section" aria-labelledby="h-period">
    <h2 id="h-period">Período del informe</h2>
    <p class="kit__note">
      Con «Trimestre» aparece el trimestre. En una pantalla estrecha los segmentos pasan a la línea
      siguiente en lugar de desbordar.
    </p>
    <div class="stack">
      <SegmentedControl
        label="Período"
        options={PERIODS}
        bind:value={period}
        onChange={() => (changes += 1)}
      />
      {#if period === 'quarter'}
        <SegmentedControl label="Trimestre" options={QUARTERS} bind:value={quarter} />
      {/if}
    </div>
    <dl class="facts">
      <div class="facts__row">
        <dt>período</dt>
        <dd data-testid="period-value">{period}</dd>
      </div>
      <div class="facts__row">
        <dt>cambios</dt>
        <dd data-testid="period-changes">{changes}</dd>
      </div>
    </dl>
  </section>

  <section class="kit__section" aria-labelledby="h-states">
    <h2 id="h-states">Estados</h2>
    <div class="stack">
      <SegmentedControl label="Deshabilitado" options={PERIODS} value="year" disabled />
      <SegmentedControl
        label="Densidad (sin etiqueta visible)"
        hideLabel
        options={[
          { value: 'normal', label: 'Normal' },
          { value: 'compact', label: 'Compacta' },
        ]}
        bind:value={density}
      />
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-admin" data-surface="admin">
    <h2 id="h-admin">Dentro del panel (<code>data-surface="admin"</code>)</h2>
    <div class="card">
      <SegmentedControl label="Ver" options={PERIODS} value="quarter" />
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
  code {
    font-size: 0.85em;
  }

  .stack {
    display: grid;
    gap: var(--mg-md);
    justify-items: start;
  }

  .card {
    padding: var(--pd-sm);
    border: 1px solid rgba(127, 127, 127, 0.18);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .facts {
    margin: var(--mg-sm) 0 0;
    padding: var(--pd-sm);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    font-size: var(--fs-sm);
  }
  .facts__row {
    display: grid;
    grid-template-columns: minmax(0, 10rem) minmax(0, 1fr);
    gap: var(--mg-xs);
    padding: var(--mg-xxs) 0;
  }
  .facts__row dt {
    color: var(--color-muted);
  }
  .facts__row dd {
    margin: 0;
  }
</style>
