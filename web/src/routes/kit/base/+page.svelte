<script lang="ts">
  // /kit/base/ — the S12 staging smoke page: element baseline, the ≥16px
  // mobile-input floor, container/zigzag scaffolds, animation utilities and
  // the reduced-motion signal. Prerendered, no data fetching, noindex.
  import { onMount } from 'svelte';
  import { prefersReducedMotion, motionMs } from '$lib/reduced-motion';

  let inputEl: HTMLInputElement | undefined = $state();
  let inputPx = $state('');
  let viewport = $state(0);
  let revealed = $state(false);
  let replay = $state(0);

  function measure() {
    viewport = window.innerWidth;
    if (inputEl) inputPx = getComputedStyle(inputEl).fontSize;
  }

  onMount(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });

  const FIELDS = [
    { type: 'text', label: 'Texto', placeholder: 'Nombre' },
    { type: 'email', label: 'Correo', placeholder: 'correo@ejemplo.org' },
    { type: 'tel', label: 'Teléfono', placeholder: '(555) 123-4567' },
    { type: 'number', label: 'Número', placeholder: '0' },
    { type: 'date', label: 'Fecha', placeholder: '' },
    { type: 'search', label: 'Buscar', placeholder: 'Buscar…' },
  ];
  const ZIGZAG = [
    { title: 'Salvación', order: ['One', 'Two'] },
    { title: 'Bautismo', order: ['Three', 'Four'] },
    { title: 'Servir', order: ['Six', 'Five'] },
  ];
  const REVEALS = [
    'scroll-fade-up',
    'scroll-fade',
    'scroll-fade-left',
    'scroll-fade-right',
    'scroll-fade-scale',
    'scroll-blur-in',
  ];
</script>

<svelte:head>
  <title>Kit · Base</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<a class="skip-link" href="#kit-main">Saltar al contenido</a>

<main id="kit-main" class="kit" tabindex="-1">
  <header class="kit__head">
    <h1 class="kit__title">Base global</h1>
    <p class="kit__lede">
      Página de prueba de S12: resets de elementos, formularios, andamios de layout y utilidades de
      animación. Pulsa <kbd>Tab</kbd> desde el inicio de la página para ver el enlace "Saltar al contenido"
      y el anillo de foco global.
    </p>
    <dl class="facts">
      <div class="facts__row">
        <dt>Movimiento reducido</dt>
        <dd>
          {prefersReducedMotion.current ? 'activado (las transiciones se anulan)' : 'no solicitado'} ·
          <code>motionMs(240) = {motionMs(240)}</code>
        </dd>
      </div>
      <div class="facts__row">
        <dt>Ancho de ventana</dt>
        <dd>{viewport ? `${viewport}px` : '…'}</dd>
      </div>
      <div class="facts__row">
        <dt>Tamaño calculado del input</dt>
        <dd>
          <code>{inputPx || '…'}</code>
          {#if viewport && viewport <= 768}
            <span class="tag">≤ 768px → debe ser ≥ 16px</span>
          {/if}
        </dd>
      </div>
    </dl>
  </header>

  <section class="kit__section" aria-labelledby="h-elements">
    <h2 id="h-elements">Elementos</h2>
    <div class="stack">
      <h1>Encabezado h1</h1>
      <h2>Encabezado h2</h2>
      <h3>Encabezado h3</h3>
      <h4>Encabezado h4</h4>
      <h5>Encabezado h5</h5>
      <h6>Encabezado h6</h6>
      <p>
        Párrafo con <strong>texto fuerte en --color-secondary</strong>, <em>énfasis</em>, un
        <a href="#h-elements">enlace en --color-40</a> y <code>código</code>. Los márgenes de los
        encabezados están a cero; cada componente decide su ritmo.
      </p>
      <p>
        <button type="button" class="demo-btn">Botón (reset: sin borde, sin fondo)</button>
        <button type="button" class="demo-btn" disabled>Botón deshabilitado</button>
      </p>
      <ul>
        <li>Elemento de lista</li>
        <li>Otro elemento</li>
      </ul>
      <table class="demo-table">
        <caption>Tabla de ejemplo</caption>
        <thead><tr><th scope="col">Concepto</th><th scope="col" class="num">Monto</th></tr></thead>
        <tbody>
          <tr><td>Ofrenda</td><td class="num">$1,234.50</td></tr>
          <tr><td>Diezmo</td><td class="num">$845.00</td></tr>
        </tbody>
      </table>
      <svg class="demo-media" viewBox="0 0 320 120" role="img" aria-label="Marcador de imagen">
        <rect width="320" height="120" rx="10" class="demo-media__bg" />
        <text x="160" y="66" text-anchor="middle" class="demo-media__t"
          >img / svg: display block</text
        >
      </svg>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-forms">
    <h2 id="h-forms">Formularios (≥16px en móvil)</h2>
    <form class="form" onsubmit={(e) => e.preventDefault()}>
      {#each FIELDS as f, i (f.type)}
        <label class="field">
          <span class="field__label">{f.label}</span>
          {#if i === 0}
            <input
              bind:this={inputEl}
              type={f.type}
              placeholder={f.placeholder}
              class="field__control"
            />
          {:else}
            <input type={f.type} placeholder={f.placeholder} class="field__control" />
          {/if}
        </label>
      {/each}
      <label class="field">
        <span class="field__label">Selección</span>
        <select class="field__control">
          <option>Servicio</option>
          <option>Estudio</option>
          <option>Oración</option>
        </select>
      </label>
      <label class="field field--wide">
        <span class="field__label">Área de texto</span>
        <textarea rows="3" class="field__control" placeholder="Mensaje"></textarea>
      </label>
      <label class="field field--inline">
        <input type="checkbox" checked /> <span>Casilla (no se ajusta)</span>
      </label>
      <label class="field field--inline">
        <input type="radio" name="r" checked /> <span>Radio (no se ajusta)</span>
      </label>
      <label class="field field--inline">
        <input type="range" min="0" max="100" /> <span>Rango</span>
      </label>
      <label class="field field--inline">
        <input type="color" /> <span>Color</span>
      </label>
      <div class="field field--wide">
        <span class="field__label">Editable</span>
        <div contenteditable="true" class="field__control field__control--editable">
          Bloque contenteditable — también ≥16px en móvil
        </div>
      </div>
    </form>
  </section>

  <section class="kit__section" aria-labelledby="h-layout">
    <h2 id="h-layout">Layout — <code>.wrapper</code> · <code>.info-container</code></h2>
    <div class="wrapper">
      <div class="info-container">
        <div class="column-default">
          <p class="on-dark">Banda oscura (.info-container) con .column-default</p>
        </div>
        <div class="row-default">
          <span class="on-dark">.row-default</span>
          <span class="on-dark">tres</span>
          <span class="on-dark">elementos</span>
        </div>
      </div>
      <div class="rg-pd">
        <p>.rg-pd — relleno simple dentro del wrapper (radio + sombra por tokens).</p>
      </div>
    </div>
    <div class="hero-demo">
      <div class="overlay"></div>
      <p class="hero-demo__text">.overlay — veladura inferior sobre una foto</p>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-zigzag">
    <h2 id="h-zigzag">Zigzag — <code>.wrapper--zigzag-grid</code></h2>
    <div class="wrapper--zigzag-grid">
      {#each ZIGZAG as row (row.title)}
        <div class="zigzag-card {row.order[0]}">
          <h2>{row.title}</h2>
          <h5>Subtítulo h5</h5>
          <p>Texto de la tarjeta. En móvil la imagen va primero gracias a las clases de orden.</p>
        </div>
        <div class="zigzag-image {row.order[1]}">
          <svg class="img-cover-container" viewBox="0 0 400 260" role="img" aria-label="Imagen">
            <rect width="400" height="260" class="demo-media__bg" />
            <text x="200" y="136" text-anchor="middle" class="demo-media__t">{row.title}</text>
          </svg>
        </div>
      {/each}
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-anim">
    <h2 id="h-anim">Utilidades de animación</h2>
    <p class="kit__note">
      <button type="button" class="demo-btn demo-btn--solid" onclick={() => replay++}
        >Reproducir</button
      >
      <button
        type="button"
        class="demo-btn demo-btn--solid"
        aria-pressed={revealed}
        onclick={() => (revealed = !revealed)}
      >
        {revealed ? 'Ocultar' : 'Revelar'} (.is-visible)
      </button>
    </p>
    {#key replay}
      <ul class="anim-grid">
        <li class="anim-box fade-in">.fade-in</li>
        <li class="anim-box animate-fade-in visible">.animate-fade-in.visible</li>
        <li class="anim-box animate-slide-in-left">.animate-slide-in-left</li>
        <li class="anim-box animate-spin-in">.animate-spin-in</li>
        <li class="anim-box animate-reveal-text visible">.animate-reveal-text.visible</li>
        <li class="anim-box">
          <span class="spinner autoRotate" aria-hidden="true"></span> .autoRotate
        </li>
      </ul>
    {/key}
    <h3>Scroll reveal (<code>.reveal-stagger</code>)</h3>
    <ul class="anim-grid reveal-stagger">
      {#each REVEALS as cls (cls)}
        <li class="anim-box {cls}" class:is-visible={revealed}>.{cls}</li>
      {/each}
    </ul>
  </section>

  <section class="kit__section" aria-labelledby="h-a11y">
    <h2 id="h-a11y">Accesibilidad</h2>
    <p>
      <button type="button" class="demo-btn demo-btn--solid" aria-label="Cerrar">
        <span aria-hidden="true">×</span>
        <span class="sr-only">Cerrar</span>
      </button>
      Botón solo-icono con <code>.sr-only</code> como nombre accesible. Tab para ver el anillo de
      foco (<code>--color-focus</code>).
    </p>
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
  kbd,
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
  .tag {
    display: inline-block;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    background: var(--money-warn-bg);
    color: var(--money-warn);
    font-size: var(--fs-xs);
    font-weight: var(--fw-bold);
  }
  @media (max-width: 480px) {
    .facts__row {
      grid-template-columns: 1fr;
    }
  }

  .stack > * + * {
    margin-top: var(--mg-xs);
  }
  .demo-btn {
    font: inherit;
    font-size: var(--fs-btn);
    padding: var(--btn-pd-y) var(--btn-pd-x);
    border-radius: var(--radius-md);
    border: 1.5px solid var(--gray-50);
    color: var(--color-text);
  }
  .demo-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .demo-btn--solid {
    background: var(--color-dark);
    border-color: var(--color-dark);
    color: var(--color-white);
  }
  .demo-table {
    border-collapse: collapse;
    font-size: var(--fs-sm);
  }
  .demo-table th,
  .demo-table td {
    padding: var(--mg-xxs) var(--mg-sm);
    border-bottom: 1px solid rgba(127, 127, 127, 0.12);
    text-align: left;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .demo-media {
    width: 100%;
    max-width: 20rem;
  }
  .demo-media__bg {
    fill: var(--color-85);
  }
  .demo-media__t {
    fill: var(--color-dark);
    font-size: var(--fs-sm);
  }

  /* forms */
  .form {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--mg-sm);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--mg-xxs);
    min-width: 0;
  }
  .field--wide {
    grid-column: 1 / -1;
  }
  .field--inline {
    flex-direction: row;
    align-items: center;
    gap: var(--mg-xs);
    min-height: 44px;
  }
  .field__label {
    font-size: var(--fs-xs);
    font-weight: var(--fw-semibold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-muted);
  }
  .field__control {
    width: 100%;
    max-width: 100%;
    padding: 0.6rem 0.75rem;
    border: 1.5px solid var(--gray-50);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    /* deliberately under 16px: base/forms.css must lift it on ≤768px */
    font-size: var(--fs-sm);
  }
  .field__control:focus-visible {
    border-color: var(--color-dark);
  }
  .field__control--editable {
    min-height: 3rem;
  }
  @media (max-width: 640px) {
    .form {
      grid-template-columns: 1fr;
    }
  }

  /* layout demos */
  .on-dark {
    color: var(--color-white);
    padding: var(--mg-xs);
  }
  .hero-demo {
    position: relative;
    height: 10rem;
    margin-top: var(--mg-sm);
    border-radius: var(--radius-md);
    overflow: hidden;
    background: var(--color-60);
  }
  .hero-demo__text {
    position: absolute;
    inset: auto 0 var(--mg-sm);
    z-index: var(--z-base);
    margin: 0;
    text-align: center;
    color: var(--static-white);
    font-weight: var(--fw-semibold);
  }

  /* animation demos */
  .anim-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
    gap: var(--mg-sm);
  }
  .anim-box {
    display: flex;
    align-items: center;
    gap: var(--mg-xs);
    padding: var(--pd-sm);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-sm);
    font-size: var(--fs-sm);
  }
  .spinner {
    display: inline-block;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: var(--radius-full);
    border: 3px solid var(--gray-50);
    border-top-color: var(--color-dark);
  }
</style>
