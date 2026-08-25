<script lang="ts">
  // /kit/button/ — the S14 staging smoke page: every Button variant × size ×
  // state (default / hover / focus-visible / active / disabled / loading), the
  // element choice, the icon slot, both palettes and the reduced-motion fact.
  // Prerendered, no data fetching, noindex.
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import Button from '$lib/components/Button.svelte';
  import { BUTTON_VARIANTS, BUTTON_SIZES } from '$lib/components/button';
  import { prefersReducedMotion } from '$lib/reduced-motion';

  const VARIANT_ROLE: Record<string, string> = {
    primary: 'la acción principal de la pantalla',
    secondary: 'una acción de apoyo',
    danger: 'borrar / algo irreversible',
    ghost: 'una acción terciaria o de fila',
  };

  let viewport = $state(0);
  let clicks = $state(0);
  let saving = $state(false);
  let tagRow: HTMLElement | undefined = $state();
  let tags = $state('…');

  function measure() {
    viewport = window.innerWidth;
  }

  // Deliberately slow enough to watch the label hold its width under the spinner.
  function fakeSave() {
    saving = true;
    setTimeout(() => (saving = false), 1800);
  }

  onMount(() => {
    measure();
    window.addEventListener('resize', measure);
    tags = Array.from(tagRow?.querySelectorAll('.ird-btn') ?? [])
      .map((el) => `<${el.tagName.toLowerCase()}>`)
      .join(' · ');
    return () => window.removeEventListener('resize', measure);
  });
</script>

<svelte:head>
  <title>Kit · Button</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<a class="skip-link" href="#kit-main">Saltar al contenido</a>

<main id="kit-main" class="kit" tabindex="-1">
  <header class="kit__head">
    <h1 class="kit__title">Botones</h1>
    <p class="kit__lede">
      Página de prueba de S14: el componente <code>Button</code> con sus cuatro variantes, tres
      tamaños y todos sus estados. <code>href</code> decide el elemento: con él un
      <code>&lt;a&gt;</code>, sin él un <code>&lt;button&gt;</code>. El estado
      <em>cargando</em> es una propiedad — ninguna pantalla vuelve a escribir su propio spinner.
    </p>
    <dl class="facts">
      <div class="facts__row">
        <dt>Elementos generados (fila de abajo)</dt>
        <dd>{tags}</dd>
      </div>
      <div class="facts__row">
        <dt>Clics registrados</dt>
        <dd>{clicks}</dd>
      </div>
      <div class="facts__row">
        <dt>Movimiento reducido</dt>
        <dd>{prefersReducedMotion.current ? 'activado' : 'no solicitado'}</dd>
      </div>
      <div class="facts__row">
        <dt>Ancho de ventana</dt>
        <dd>{viewport ? `${viewport}px` : '…'}</dd>
      </div>
    </dl>
  </header>

  <section class="kit__section" aria-labelledby="h-variants">
    <h2 id="h-variants">Variantes</h2>
    <div class="row" bind:this={tagRow}>
      {#each BUTTON_VARIANTS as variant (variant)}
        <Button {variant} onclick={() => (clicks += 1)}>
          {variant}
        </Button>
      {/each}
      <Button href="#h-variants">enlace</Button>
    </div>
    <ul class="legend">
      {#each BUTTON_VARIANTS as variant (variant)}
        <li><code>{variant}</code> — {VARIANT_ROLE[variant]}</li>
      {/each}
    </ul>
  </section>

  <section class="kit__section" aria-labelledby="h-states">
    <h2 id="h-states">Matriz de estados</h2>
    <p class="kit__note">
      Pasa el ratón, mantén pulsado y recorre con el tabulador: cada variante tiene reposo, hover,
      anillo de foco visible, pulsado (<code>scale(.97)</code>), deshabilitado y cargando.
    </p>
    <div class="matrix" role="table" aria-label="Estados por variante">
      <div class="matrix__row matrix__row--head" role="row">
        <span role="columnheader">Variante</span>
        <span role="columnheader">Reposo</span>
        <span role="columnheader">Con icono</span>
        <span role="columnheader">Deshabilitado</span>
        <span role="columnheader">Cargando</span>
      </div>
      {#each BUTTON_VARIANTS as variant (variant)}
        <div class="matrix__row" role="row">
          <span class="matrix__label" role="rowheader"><code>{variant}</code></span>
          <span role="cell"><Button {variant}>Guardar</Button></span>
          <span role="cell"><Button {variant} icon="floppy-disk">Guardar</Button></span>
          <span role="cell"><Button {variant} disabled>Guardar</Button></span>
          <span role="cell"><Button {variant} loading>Guardar</Button></span>
        </div>
      {/each}
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-loading">
    <h2 id="h-loading">Cargando conserva el ancho</h2>
    <p class="kit__note">
      Pulsa: la etiqueta se queda en su sitio con opacidad 0 y el spinner se dibuja encima, así que
      el botón no cambia de tamaño y conserva su nombre accesible (<code>aria-busy="true"</code>).
    </p>
    <div class="row">
      <Button loading={saving} onclick={fakeSave}>Guardar cambios</Button>
      <Button variant="ghost" loading={saving} onclick={fakeSave}>Guardar cambios</Button>
      <span class="kit__note">{saving ? 'guardando…' : 'en reposo'}</span>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-sizes">
    <h2 id="h-sizes">Tamaños</h2>
    <div class="row">
      {#each BUTTON_SIZES.filter((s) => s !== 'full') as size (size)}
        <Button {size}>tamaño {size}</Button>
        <Button variant="ghost" {size} icon="filter">Filtros</Button>
      {/each}
    </div>
    <div class="stack stack--full">
      <Button size="full">Continuar</Button>
      <Button size="full" variant="ghost">Cancelar</Button>
    </div>
    <p class="kit__note">
      <code>full</code> es la barra de acciones apilada del móvil. A 360px nada se desborda.
    </p>
  </section>

  <section class="kit__section" aria-labelledby="h-element">
    <h2 id="h-element">Elemento y destino</h2>
    <div class="row">
      <Button href="{base}/kit/card/">Ir a /kit/card/ (&lt;a&gt;)</Button>
      <Button href="https://www.irdlex.org/" target="_blank">Sitio público (pestaña nueva)</Button>
      <Button href="{base}/kit/card/" disabled>Enlace deshabilitado</Button>
      <Button type="submit">type="submit"</Button>
    </div>
    <p class="kit__note">
      Un enlace deshabilitado pierde su <code>href</code>, sale del orden de tabulación y lo declara
      con <code>aria-disabled</code>: un <code>&lt;a&gt;</code> no admite
      <code>disabled</code>. La pestaña nueva recibe <code>rel="noopener noreferrer"</code>.
    </p>
  </section>

  <section class="kit__section" aria-labelledby="h-surface">
    <h2 id="h-surface">Superficie pública vs. admin</h2>
    <p class="kit__note">
      El mismo componente. <code>secondary</code> lee el token de acento, que es dorado en el sitio
      público y pizarra dentro de <code>[data-surface="admin"]</code> — nunca hay dos paletas escritas
      en el componente.
    </p>
    <div class="compare">
      <div class="compare__col">
        <p class="compare__tag">público</p>
        <div class="row">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
        </div>
      </div>
      <div class="compare__col" data-surface="admin">
        <p class="compare__tag">admin</p>
        <div class="row">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
        </div>
      </div>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-bar">
    <h2 id="h-bar">Barra de acciones (uso real)</h2>
    <div class="actionbar">
      <Button variant="ghost" icon="xmark">Cancelar</Button>
      <Button variant="danger" icon="trash">Eliminar</Button>
      <Button icon="check">Guardar</Button>
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
    font-size: var(--fs-lg);
    font-weight: var(--fw-semibold);
    margin-bottom: var(--mg-sm);
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
    grid-template-columns: 16rem 1fr;
    gap: var(--mg-xs);
    padding: var(--mg-xxs) 0;
  }
  .facts__row dt {
    color: var(--color-muted);
  }
  .facts__row dd {
    margin: 0;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--mg-sm);
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--mg-xs);
  }
  .stack--full {
    max-width: 22rem;
    margin-top: var(--mg-sm);
  }

  .legend {
    margin: var(--mg-sm) 0 0;
    padding-left: 1.1rem;
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }

  .matrix {
    display: grid;
    gap: var(--mg-xs);
    margin-top: var(--mg-sm);
  }
  .matrix__row {
    display: grid;
    grid-template-columns: 7rem repeat(4, 1fr);
    gap: var(--mg-sm);
    align-items: center;
  }
  .matrix__row--head {
    font-size: var(--fs-xs);
    font-weight: var(--fw-semibold);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-muted);
  }
  .matrix__label {
    font-size: var(--fs-sm);
  }

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
  .compare__tag {
    margin: 0 0 var(--mg-xs);
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-muted);
  }

  .actionbar {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--mg-xs);
    padding-top: var(--pd-sm);
    border-top: 1px solid rgba(127, 127, 127, 0.18);
  }

  @media (max-width: 768px) {
    .matrix__row {
      grid-template-columns: 1fr;
      padding-bottom: var(--mg-sm);
      border-bottom: 1px solid rgba(127, 127, 127, 0.18);
    }
    .matrix__row--head {
      display: none;
    }
  }
  @media (max-width: 640px) {
    .compare {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 480px) {
    .facts__row {
      grid-template-columns: 1fr;
    }
  }
</style>
