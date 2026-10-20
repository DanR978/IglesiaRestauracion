<script lang="ts">
  // /kit/icon-button/ — the PR-C2 staging smoke page for IconButton: every
  // variant × size × state, the toggle (aria-pressed), the 44px touch hit area,
  // a ghost button inheriting the light ink of the dark top bar, link mode, the
  // ARIA passthrough and both palettes. Prerendered, no data fetching, noindex.
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import IconButton from '#lib/components/IconButton.svelte';
  import { ICON_BUTTON_SIZES, ICON_BUTTON_VARIANTS } from '#lib/components/icon-button.js';
  import type { IconButtonVariant } from '#lib/components/icon-button.js';
  import { prefersReducedMotion } from '#lib/reduced-motion.js';

  const ACTION: Record<IconButtonVariant, { icon: string; label: string; use: string }> = {
    ghost: {
      icon: 'xmark',
      label: 'Cerrar',
      use: 'cromo de la barra superior, cerrar un aviso, acciones en línea — hereda la tinta',
    },
    subtle: {
      icon: 'ellipsis-vertical',
      label: 'Más acciones',
      use: 'barras de herramientas y menús de fila (⋮) — tiene forma visible en reposo',
    },
    danger: {
      icon: 'trash',
      label: 'Eliminar',
      use: 'una acción destructiva de fila — siempre seguida de una confirmación',
    },
  };

  const uid = $props.id();
  const drawerId = `${uid}-drawer`;

  let viewport = $state(0);
  let clicks = $state(0);
  let saving = $state(false);
  let bold = $state(true);
  let italic = $state(false);
  let underline = $state(false);
  let drawerOpen = $state(false);

  function measure() {
    viewport = window.innerWidth;
  }

  // Slow enough to watch the spinner hold the square.
  function fakeSave() {
    saving = true;
    setTimeout(() => (saving = false), 1800);
  }

  const onOff = (on: boolean) => (on ? 'activado' : 'desactivado');

  onMount(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });
</script>

<svelte:head>
  <title>Kit · IconButton</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<a class="skip-link" href="#kit-main">Saltar al contenido</a>

<main id="kit-main" class="kit" tabindex="-1">
  <header class="kit__head">
    <h1 class="kit__title">Botones de icono</h1>
    <p class="kit__lede">
      Página de prueba de PR-C2: <code>IconButton</code> reemplaza a <code>.icon-btn__admin</code> y
      <code>.adm-icon-btn</code>. Su nombre accesible (<code>label</code>) es obligatorio y se emite
      como <code>aria-label</code> — nunca como un <code>title</code> que el lector de pantalla y el táctil
      no ven. El icono es decorativo.
    </p>
    <dl class="facts">
      <div class="facts__row">
        <dt>Clics registrados</dt>
        <dd data-testid="clicks">{clicks}</dd>
      </div>
      <div class="facts__row">
        <dt>Formato</dt>
        <dd data-testid="format">
          negrita {onOff(bold)} · cursiva {onOff(italic)} · subrayado {onOff(underline)}
        </dd>
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

  <section class="kit__section" aria-labelledby="h-matrix">
    <h2 id="h-matrix">Variantes, tamaños y estados</h2>
    <p class="kit__note">
      <code>sm</code> mide 32px y <code>md</code> 40px; con <code>touch</code> el área que recibe el toque
      crece a 44px sin cambiar el cuadrado. Pasa el ratón, mantén pulsado y recorre con el tabulador:
      cada una tiene reposo, hover, anillo de foco, pulsado, deshabilitado y cargando.
    </p>
    <div class="matrix" role="table" aria-label="Estados por variante">
      <div class="matrix__row matrix__row--head" role="row">
        <span role="columnheader">Variante</span>
        <span role="columnheader">sm</span>
        <span role="columnheader">md</span>
        <span role="columnheader">md + touch</span>
        <span role="columnheader">Deshabilitado</span>
        <span role="columnheader">Cargando</span>
      </div>
      {#each ICON_BUTTON_VARIANTS as variant (variant)}
        {@const a = ACTION[variant]}
        <div class="matrix__row" role="row" data-variant={variant}>
          <span class="matrix__label" role="rowheader"><code>{variant}</code></span>
          {#each ICON_BUTTON_SIZES as size (size)}
            <span role="cell">
              <IconButton
                {variant}
                {size}
                icon={a.icon}
                label={`${a.label} (${variant}, ${size})`}
                onclick={() => (clicks += 1)}
              />
            </span>
          {/each}
          <span role="cell">
            <IconButton
              {variant}
              touch
              icon={a.icon}
              label={`${a.label} (${variant}, táctil)`}
              onclick={() => (clicks += 1)}
            />
          </span>
          <span role="cell">
            <IconButton {variant} disabled icon={a.icon} label={`${a.label} (deshabilitado)`} />
          </span>
          <span role="cell">
            <IconButton {variant} loading icon={a.icon} label={`${a.label} (cargando)`} />
          </span>
        </div>
      {/each}
    </div>
    <ul class="legend">
      {#each ICON_BUTTON_VARIANTS as variant (variant)}
        <li><code>{variant}</code> — {ACTION[variant].use}</li>
      {/each}
    </ul>
  </section>

  <section class="kit__section" aria-labelledby="h-toggle">
    <h2 id="h-toggle">Interruptor (<code>aria-pressed</code>)</h2>
    <p class="kit__note">
      Con <code>pressed</code> el botón es un interruptor: el lector anuncia «activado» o «desactivado»
      y el estado se ve con el par invertido de tinta y superficie en ambos temas. Espacio o Intro lo
      cambian.
    </p>
    <div class="toolbar" role="group" aria-label="Formato de texto">
      <IconButton
        variant="subtle"
        icon="bold"
        label="Negrita"
        pressed={bold}
        onclick={() => (bold = !bold)}
      />
      <IconButton
        variant="subtle"
        icon="italic"
        label="Cursiva"
        pressed={italic}
        onclick={() => (italic = !italic)}
      />
      <IconButton
        variant="subtle"
        icon="underline"
        label="Subrayado"
        pressed={underline}
        onclick={() => (underline = !underline)}
      />
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-topbar">
    <h2 id="h-topbar">Sobre la barra superior</h2>
    <p class="kit__note">
      <code>ghost</code> hereda la tinta clara de la barra oscura, y su anillo de foco también: el
      anillo global (<code>--color-focus</code>) sería pizarra sobre pizarra. El menú usa el paso de
      atributos ARIA: <code>aria-expanded</code> + <code>aria-controls</code>.
    </p>
    <div class="topbar" data-surface="admin">
      <IconButton
        icon="bars"
        label="Abrir menú"
        touch
        aria-expanded={drawerOpen}
        aria-controls={drawerId}
        data-testid="burger"
        onclick={() => (drawerOpen = !drawerOpen)}
      />
      <span class="topbar__title">Inicio</span>
      <IconButton icon="bell" label="Notificaciones" onclick={() => (clicks += 1)} />
    </div>
    <nav id={drawerId} class="drawer" aria-label="Menú de prueba" hidden={!drawerOpen}>
      <p class="kit__note">Panel del menú: abierto por el botón de arriba.</p>
    </nav>
  </section>

  <section class="kit__section" aria-labelledby="h-loading">
    <h2 id="h-loading">Cargando conserva el cuadrado</h2>
    <div class="row">
      <IconButton
        variant="subtle"
        icon="floppy-disk"
        label="Guardar borrador"
        loading={saving}
        onclick={fakeSave}
      />
      <span class="kit__note">{saving ? 'guardando…' : 'en reposo'}</span>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-link">
    <h2 id="h-link">Como enlace</h2>
    <div class="row">
      <IconButton
        variant="subtle"
        icon="arrow-right"
        label="Ir a la página de botones"
        href={resolve('kit/button/')}
      />
      <IconButton
        variant="subtle"
        icon="arrow-up-right-from-square"
        label="Abrir el sitio público en otra pestaña"
        href="https://www.irdlex.org/"
        target="_blank"
      />
      <IconButton
        variant="subtle"
        icon="download"
        label="Descargar (no disponible)"
        href={resolve('kit/button/')}
        disabled
      />
    </div>
    <p class="kit__note">
      Con <code>href</code> se emite un <code>&lt;a&gt;</code>; deshabilitado pierde el destino,
      sale del orden de tabulación y lo declara con <code>aria-disabled</code>.
    </p>
  </section>

  <section class="kit__section" aria-labelledby="h-touch">
    <h2 id="h-touch">Área táctil de 44px</h2>
    <p class="kit__note">
      El borde punteado marca 44 × 44px. A la izquierda un <code>sm</code> normal (32px de área); a
      la derecha el mismo cuadrado con <code>touch</code>: tocar en cualquier punto del recuadro lo
      activa.
    </p>
    <div class="row">
      <span class="hit">
        <IconButton
          variant="subtle"
          size="sm"
          icon="pen"
          label="Editar (sin área táctil)"
          data-testid="hit-plain"
          onclick={() => (clicks += 1)}
        />
      </span>
      <span class="hit">
        <IconButton
          variant="subtle"
          size="sm"
          touch
          icon="pen"
          label="Editar (área táctil)"
          data-testid="hit-touch"
          onclick={() => (clicks += 1)}
        />
      </span>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-surface">
    <h2 id="h-surface">Superficie pública vs. admin</h2>
    <div class="compare">
      <div class="compare__col">
        <p class="compare__tag">público</p>
        <div class="row">
          {#each ICON_BUTTON_VARIANTS as variant (variant)}
            <IconButton {variant} icon={ACTION[variant].icon} label={ACTION[variant].label} />
          {/each}
        </div>
      </div>
      <div class="compare__col" data-surface="admin">
        <p class="compare__tag">admin</p>
        <div class="row">
          {#each ICON_BUTTON_VARIANTS as variant (variant)}
            <IconButton {variant} icon={ACTION[variant].icon} label={ACTION[variant].label} />
          {/each}
        </div>
      </div>
    </div>
    <p class="kit__note">
      Los tres leen tokens que no cambian con la superficie (tinta, superficie y el rojo de dinero),
      así que se ven iguales en ambas: el control no escribe ninguna paleta.
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
    grid-template-columns: 7rem repeat(5, 1fr);
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

  .toolbar {
    display: inline-flex;
    gap: var(--mg-xxs);
    padding: var(--mg-xxs);
    border: 1px solid rgba(127, 127, 127, 0.18);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  /* The admin top bar (visual brief): solid --color-dark with the light ink. */
  .topbar {
    display: flex;
    align-items: center;
    gap: var(--mg-sm);
    min-block-size: 3.75rem;
    padding-inline: var(--pd-xs);
    border-radius: var(--radius-md);
    background: var(--color-dark);
    color: var(--color-white);
  }
  .topbar__title {
    flex: 1 1 auto;
    font-weight: var(--fw-semibold);
  }

  .drawer {
    margin-top: var(--mg-xs);
    padding: var(--pd-sm);
    border: 1px solid rgba(127, 127, 127, 0.18);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  /* The dashed 44px square the touch demo is measured against. */
  .hit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 2.75rem;
    block-size: 2.75rem;
    border: 1px dashed rgba(127, 127, 127, 0.6);
    border-radius: var(--radius-sm);
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

  @media (max-width: 768px) {
    .matrix__row {
      grid-template-columns: repeat(3, auto);
      justify-content: start;
      padding-bottom: var(--mg-sm);
      border-bottom: 1px solid rgba(127, 127, 127, 0.18);
    }
    .matrix__label {
      grid-column: 1 / -1;
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
