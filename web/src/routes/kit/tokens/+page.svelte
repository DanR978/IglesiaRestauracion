<script lang="ts">
  // /kit/tokens/ — the S11 staging smoke page. Exercises every token family and
  // the light/dark/system toggle so a human can confirm the palette flips with
  // no reload flash. Prerendered, no data fetching, noindex.
  import { onMount } from 'svelte';
  import { theme, THEMES, type Theme } from '$lib/theme.svelte';

  const THEME_LABEL: Record<Theme, string> = {
    light: 'Claro',
    dark: 'Oscuro',
    system: 'Sistema',
  };

  const BRAND = [
    '--color-dark',
    '--color-text',
    '--color-muted',
    '--color-surface',
    '--color-bg-light',
    '--color-white',
    '--color-black',
    '--color-secondary',
    '--gold-bright',
    '--color-accent',
    '--color-info',
    '--color-focus',
    '--color-done',
    '--color-add',
  ];
  const SEMANTIC = ['--color-success', '--color-danger', '--color-warn'];
  const GRAYS = [0, 10, 20, 30, 40, 50, 60, 65, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160].map(
    (n) => `--gray-${n}`,
  );
  const TEAL = [
    0, 5, 10, 15, 20, 25, 26, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
  ].map((n) => `--color-${n}`);
  const ORANGE = [
    0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 64, 65, 70, 75, 80, 85, 90, 95, 100,
  ].map((n) => `--orange-${n}`);
  const MONEY = [
    { name: 'pos', label: '+ $1,234.50', hint: 'ingreso · pagado' },
    { name: 'neg', label: '− $845.00', hint: 'gasto · vencido' },
    { name: 'warn', label: '$120.00', hint: 'pendiente · vence pronto' },
  ];
  const STATUS = [
    ['paid', 'Pagado'],
    ['pending', 'Pendiente'],
    ['overdue', 'Vencido'],
    ['open', 'Abierto'],
    ['closed', 'Cerrado'],
    ['completed', 'Completado'],
    ['finished', 'Finalizado'],
    ['active', 'Activo'],
    ['inactive', 'Inactivo'],
    ['restricted', 'Restringido'],
  ] as const;
  const CATS = [
    ['servicio', 'Servicio'],
    ['estudio', 'Estudio'],
    ['oracion', 'Oración'],
    ['evangelizacion', 'Evangelización'],
    ['especial', 'Especial'],
    ['otro', 'Otro'],
  ] as const;
  const FS = ['xxs', 'xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', 'btn'];
  const PD = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];
  const MG = ['xxs', 'xs', 'sm', 'md', 'ml', 'lg', 'xl', '2xl'];
  const GAP = ['sm', 'md', 'lg', 'xl', '2xl'];
  const RADIUS = ['xs', 'sm', 'md', 'lg', 'xl', 'full'];
  const SHADOWS = [
    '--shadow-sm',
    '--shadow-md',
    '--shadow-lg',
    '--btn-shadow',
    '--container-shadow',
    '--image-shadow',
  ];
  const Z = [
    ['--z-negative', -1],
    ['--z-base', 1],
    ['--z-menu', 10],
    ['--z-overlay', 50],
    ['--z-modal', 100],
    ['--z-max', 999],
    ['--z-fullscreen', 9000],
    ['--z-action-backdrop', 9990],
    ['--z-action-sheet', 9991],
    ['--z-page-transition', 9998],
    ['--z-splash', 9999],
    ['--z-lightbox', 10000],
  ] as const;
  const ADMIN_OVERRIDES = ['--color-secondary', '--color-accent', '--gold-bright', '--color-info'];

  let fsLg = $state('');
  onMount(() => {
    // The ROADMAP "done when": var(--fs-lg) resolves. Read it back from the live cascade.
    fsLg = getComputedStyle(document.documentElement).getPropertyValue('--fs-lg').trim();
  });
</script>

<svelte:head>
  <title>Kit · Tokens</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="kit">
  <header class="kit__head">
    <h1 class="kit__title">Tokens de diseño</h1>
    <p class="kit__lede">
      Página de prueba de S11. Cada muestra lee un <code>var(--…)</code> del cascade global; nada aquí
      tiene un color fijo.
    </p>

    <div class="theme" role="group" aria-label="Tema">
      <span class="theme__label">Tema:</span>
      {#each THEMES as t (t)}
        <button
          type="button"
          class="theme__btn"
          class:is-active={theme.current === t}
          aria-pressed={theme.current === t}
          onclick={() => theme.set(t)}
        >
          {THEME_LABEL[t]}
        </button>
      {/each}
      <span class="theme__state">
        actual: <strong>{theme.current}</strong> · pintado: <strong>{theme.resolved}</strong>
      </span>
    </div>
    <p class="kit__note">
      <code>--fs-lg</code> resuelve a <code>{fsLg || '…'}</code>
    </p>
  </header>

  <section class="kit__section" aria-labelledby="h-brand">
    <h2 id="h-brand">Marca, superficie y tinta</h2>
    <ul class="swatches">
      {#each BRAND as name (name)}
        <li class="swatch" style:--swatch="var({name})">
          <span class="swatch__chip"></span>
          <code class="swatch__name">{name}</code>
        </li>
      {/each}
    </ul>
    <p class="kit__note">
      Texto de cuerpo en <code>--color-text</code>,
      <span class="muted">atenuado en --color-muted</span>, sobre <code>--color-bg-light</code>.
      Panel:
    </p>
    <div class="panel">
      <strong>--color-surface</strong> con --color-text encima ·
      <span class="muted">--color-muted</span> · <a href="#h-brand">un enlace (--color-40)</a>
    </div>
    <div class="dark-fill">
      <span>--color-dark</span> con <code>--color-white</code> como tinta
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-semantic">
    <h2 id="h-semantic">Semántico (relleno)</h2>
    <ul class="swatches">
      {#each SEMANTIC as name (name)}
        <li class="swatch" style:--swatch="var({name})">
          <span class="swatch__chip"></span>
          <code class="swatch__name">{name}</code>
        </li>
      {/each}
    </ul>
  </section>

  <section class="kit__section" aria-labelledby="h-money">
    <h2 id="h-money">Dinero (D-016) — <code>--money-*</code></h2>
    <ul class="money">
      {#each MONEY as m (m.name)}
        <li
          class="money__row"
          style:--ink="var(--money-{m.name})"
          style:--tint="var(--money-{m.name}-bg)"
        >
          <span class="money__amount">{m.label}</span>
          <span class="money__pill">{m.hint}</span>
          <code class="money__name">--money-{m.name} / --money-{m.name}-bg</code>
        </li>
      {/each}
    </ul>
  </section>

  <section class="kit__section" aria-labelledby="h-status">
    <h2 id="h-status">Estados (vocabulario honesto) — <code>--status-*</code></h2>
    <ul class="pills">
      {#each STATUS as [key, label] (key)}
        <li class="pill" style:--ink="var(--status-{key})" style:--tint="var(--status-{key}-bg)">
          {label}
        </li>
      {/each}
    </ul>
  </section>

  <section class="kit__section" aria-labelledby="h-cat">
    <h2 id="h-cat">Categorías de evento — <code>--cat-*</code></h2>
    <ul class="pills">
      {#each CATS as [key, label] (key)}
        <li class="pill" style:--ink="var(--cat-{key}-t)" style:--tint="var(--cat-{key})">
          {label}
        </li>
      {/each}
    </ul>
  </section>

  <section class="kit__section" aria-labelledby="h-admin">
    <h2 id="h-admin">Superficie admin (D-014) — <code>[data-surface="admin"]</code></h2>
    <div class="compare">
      <div class="compare__col">
        <h3>Público</h3>
        <ul class="swatches">
          {#each ADMIN_OVERRIDES as name (name)}
            <li class="swatch" style:--swatch="var({name})">
              <span class="swatch__chip"></span>
              <code class="swatch__name">{name}</code>
            </li>
          {/each}
        </ul>
        <p><strong>strong en --color-secondary</strong></p>
      </div>
      <div class="compare__col" data-surface="admin">
        <h3>Admin (pizarra)</h3>
        <ul class="swatches">
          {#each ADMIN_OVERRIDES as name (name)}
            <li class="swatch" style:--swatch="var({name})">
              <span class="swatch__chip"></span>
              <code class="swatch__name">{name}</code>
            </li>
          {/each}
        </ul>
        <p><strong>strong en --color-secondary</strong></p>
      </div>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-type">
    <h2 id="h-type">Escala tipográfica (D-015, monótona) — <code>--fs-*</code></h2>
    <ul class="type">
      {#each FS as step (step)}
        <li class="type__row" style:--fs="var(--fs-{step})">
          <code class="type__name">--fs-{step}</code>
          <span class="type__sample">Restauración Aa 0123</span>
        </li>
      {/each}
    </ul>
  </section>

  <section class="kit__section" aria-labelledby="h-space">
    <h2 id="h-space">Espaciado — <code>--pd-* · --mg-* · --gap-*</code></h2>
    <ul class="bars">
      {#each PD as s (s)}
        <li class="bar">
          <code>--pd-{s}</code><span class="bar__fill" style:--len="var(--pd-{s})"></span>
        </li>
      {/each}
      {#each MG as s (s)}
        <li class="bar">
          <code>--mg-{s}</code><span class="bar__fill" style:--len="var(--mg-{s})"></span>
        </li>
      {/each}
      {#each GAP as s (s)}
        <li class="bar">
          <code>--gap-{s}</code><span class="bar__fill" style:--len="var(--gap-{s})"></span>
        </li>
      {/each}
    </ul>
  </section>

  <section class="kit__section" aria-labelledby="h-radius">
    <h2 id="h-radius">Radio — <code>--radius-*</code></h2>
    <ul class="boxes">
      {#each RADIUS as r (r)}
        <li class="box" style:--r="var(--radius-{r})"><code>--radius-{r}</code></li>
      {/each}
    </ul>
  </section>

  <section class="kit__section" aria-labelledby="h-shadow">
    <h2 id="h-shadow">Sombras (una sola definición) — <code>--shadow-*</code></h2>
    <ul class="boxes">
      {#each SHADOWS as s (s)}
        <li class="box box--shadow" style:--sh="var({s})"><code>{s}</code></li>
      {/each}
    </ul>
  </section>

  <section class="kit__section" aria-labelledby="h-z">
    <h2 id="h-z">Capas — <code>--z-*</code></h2>
    <table class="ztable">
      <thead><tr><th scope="col">Token</th><th scope="col">Valor</th></tr></thead>
      <tbody>
        {#each Z as [name, value] (name)}
          <tr><td><code>{name}</code></td><td class="num">{value}</td></tr>
        {/each}
      </tbody>
    </table>
  </section>

  <section class="kit__section" aria-labelledby="h-ramps">
    <h2 id="h-ramps">Rampas</h2>
    <h3>Grises (superficie, se oscurecen en modo oscuro)</h3>
    <ul class="ramp">
      {#each GRAYS as name (name)}
        <li class="ramp__chip" style:--swatch="var({name})" title={name}></li>
      {/each}
    </ul>
    <h3>Teal</h3>
    <ul class="ramp">
      {#each TEAL as name (name)}
        <li class="ramp__chip" style:--swatch="var({name})" title={name}></li>
      {/each}
    </ul>
    <h3>Naranja</h3>
    <ul class="ramp">
      {#each ORANGE as name (name)}
        <li class="ramp__chip" style:--swatch="var({name})" title={name}></li>
      {/each}
    </ul>
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
    color: var(--color-text);
    background: var(--color-bg-light);
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
  .kit__section h2 {
    font-size: var(--fs-lg);
    font-weight: var(--fw-semibold);
    margin-bottom: var(--mg-sm);
  }
  .kit__section h3 {
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
    color: var(--color-muted);
    margin: var(--mg-sm) 0 var(--mg-xs);
  }
  code {
    font-size: 0.85em;
  }
  .muted {
    color: var(--color-muted);
  }

  /* theme toggle */
  .theme {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--mg-xs);
    margin-top: var(--mg-sm);
  }
  .theme__label,
  .theme__state {
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  .theme__btn {
    padding: var(--btn-pd-y) var(--btn-pd-x);
    border: 1.5px solid var(--gray-50);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-size: var(--fs-btn);
    font-weight: var(--fw-semibold);
    box-shadow: var(--shadow-sm);
    transition:
      background-color 0.18s cubic-bezier(0.22, 1, 0.36, 1),
      color 0.18s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .theme__btn:hover {
    border-color: var(--color-dark);
  }
  .theme__btn.is-active {
    background: var(--color-dark);
    border-color: var(--color-dark);
    color: var(--color-white);
  }
  .theme__btn:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .theme__btn {
      transition: none;
    }
  }

  /* swatches */
  .swatches,
  .pills,
  .money,
  .type,
  .bars,
  .boxes,
  .ramp {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .swatches {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
    gap: var(--mg-xs);
  }
  .swatch {
    display: flex;
    align-items: center;
    gap: var(--mg-xs);
    min-width: 0;
  }
  .swatch__chip {
    flex: none;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: var(--radius-sm);
    border: 1px solid rgba(127, 127, 127, 0.25);
    background: var(--swatch);
  }
  .swatch__name {
    overflow-wrap: anywhere;
  }

  .panel {
    margin-top: var(--mg-xs);
    padding: var(--pd-sm);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    box-shadow: var(--shadow-sm);
  }
  .dark-fill {
    margin-top: var(--mg-xs);
    padding: var(--pd-sm);
    border-radius: var(--radius-md);
    background: var(--color-dark);
    color: var(--color-white);
  }

  /* money */
  .money__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--mg-xs) var(--mg-sm);
    padding: var(--mg-xs) 0;
  }
  .money__amount {
    min-width: 8ch;
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-weight: var(--fw-bold);
    font-size: var(--fs-lg);
    color: var(--ink);
  }
  .money__pill,
  .pill {
    display: inline-block;
    padding: 2px 9px;
    border-radius: var(--radius-full);
    font-size: var(--fs-xs);
    font-weight: var(--fw-bold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink);
    background: var(--tint);
  }
  .money__name {
    color: var(--color-muted);
  }
  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mg-xs);
  }

  /* admin compare */
  .compare {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--mg-sm);
  }
  .compare__col {
    padding: var(--pd-sm);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-sm);
  }
  .compare__col h3 {
    margin-top: 0;
  }
  @media (max-width: 640px) {
    .compare {
      grid-template-columns: 1fr;
    }
  }

  /* type scale */
  .type__row {
    display: grid;
    grid-template-columns: 7rem 1fr;
    align-items: baseline;
    gap: var(--mg-sm);
    padding: var(--mg-xxs) 0;
    border-bottom: 1px solid rgba(127, 127, 127, 0.12);
  }
  .type__sample {
    font-size: var(--fs);
    line-height: 1.15;
    overflow-wrap: anywhere;
  }
  @media (max-width: 480px) {
    .type__row {
      grid-template-columns: 1fr;
    }
  }

  /* spacing bars */
  .bar {
    display: grid;
    grid-template-columns: 6rem 1fr;
    align-items: center;
    gap: var(--mg-xs);
    padding: 2px 0;
  }
  .bar__fill {
    display: block;
    height: 0.75rem;
    width: var(--len);
    max-width: 100%;
    border-radius: var(--radius-xs);
    background: var(--color-40);
  }

  /* radius + shadow boxes */
  .boxes {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mg-sm);
  }
  .box {
    display: grid;
    place-items: center;
    width: 8rem;
    height: 5rem;
    border-radius: var(--r, var(--radius-md));
    background: var(--color-surface);
    border: 1.5px solid var(--gray-50);
    font-size: var(--fs-xs);
    text-align: center;
  }
  .box--shadow {
    border: 0;
    box-shadow: var(--sh);
  }

  /* z table */
  .ztable {
    border-collapse: collapse;
    font-size: var(--fs-sm);
  }
  .ztable th,
  .ztable td {
    padding: var(--mg-xxs) var(--mg-sm);
    text-align: left;
    border-bottom: 1px solid rgba(127, 127, 127, 0.12);
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* ramps */
  .ramp {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
  }
  .ramp__chip {
    width: 2rem;
    height: 2rem;
    border-radius: var(--radius-xs);
    background: var(--swatch);
    border: 1px solid rgba(127, 127, 127, 0.2);
  }
</style>
