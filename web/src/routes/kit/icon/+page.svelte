<script lang="ts">
  // /kit/icon/ — the S13 staging smoke page: every Icon variant and state
  // (fas / far / fab / sprite × decorative / meaningful × spin), inheritance of
  // size and colour, the icon-only-control pattern, the admin surface, and the
  // refusal of an unknown name. Prerendered, no data fetching, noindex.
  import { onMount } from 'svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { FA_VERSION, SPRITE_HOLDER_ID, SPRITE_ICONS } from '$lib/components/icon';
  import { prefersReducedMotion } from '$lib/reduced-motion';

  // The most-used legacy `fas` names (grep of the live site), with their role.
  const SOLID = [
    ['spinner', 'cargando'],
    ['hand-holding-heart', 'donar'],
    ['map-marker-alt', 'dirección'],
    ['location-dot', 'ubicación'],
    ['user', 'usuario'],
    ['users', 'grupo'],
    ['envelope', 'correo'],
    ['phone', 'teléfono'],
    ['play', 'reproducir'],
    ['plus', 'agregar'],
    ['ellipsis-vertical', 'menú'],
    ['trash', 'eliminar'],
    ['times', 'cerrar'],
    ['check', 'listo'],
    ['save', 'guardar'],
    ['star', 'destacado'],
    ['chevron-right', 'siguiente'],
    ['chevron-left', 'anterior'],
    ['calendar-day', 'día'],
    ['calendar-week', 'semana'],
    ['calendar-check', 'confirmado'],
    ['paper-plane', 'enviar'],
    ['house', 'inicio'],
    ['arrow-right', 'ir'],
    ['tag', 'categoría'],
    ['layer-group', 'nivel'],
    ['flag', 'reportar'],
    ['exclamation-triangle', 'error'],
    ['circle-check', 'éxito'],
    ['pen', 'editar'],
    ['images', 'galería'],
    ['camera-retro', 'álbum'],
    ['lock', 'bloqueado'],
    ['link', 'enlace'],
    ['file-pdf', 'PDF'],
    ['print', 'imprimir'],
    ['bell', 'notificaciones'],
    ['bars', 'menú principal'],
    ['right-from-bracket', 'salir'],
    ['church', 'iglesia'],
  ] as const;
  const REGULAR = ['clock', 'calendar-alt', 'heart', 'star'] as const;
  const BRANDS = ['facebook-f', 'instagram', 'youtube', 'tiktok', 'whatsapp'] as const;
  const SIZES = ['sm', 'base', 'md', 'lg', 'xl', '2xl'] as const;

  let viewport = $state(0);
  let faLoaded = $state<'…' | 'sí' | 'no'>('…');
  let symbolCount = $state<number | null>(null);
  let holderCount = $state<number | null>(null);
  let decorativeEl: HTMLElement | undefined = $state();
  let meaningfulEl: HTMLElement | undefined = $state();
  let invalidEl: HTMLElement | undefined = $state();
  let decorativeAttrs = $state('');
  let meaningfulAttrs = $state('');
  let invalidCount = $state<number | null>(null);

  function attrsOf(wrapper: HTMLElement | undefined): string {
    const el = wrapper?.querySelector('.icon');
    if (!el) return '(nada)';
    return Array.from(el.attributes)
      .filter((a) => a.name !== 'class')
      .map((a) => `${a.name}="${a.value}"`)
      .join(' ');
  }

  function measure() {
    viewport = window.innerWidth;
  }

  onMount(() => {
    measure();
    window.addEventListener('resize', measure);
    const holders = document.querySelectorAll(`#${SPRITE_HOLDER_ID}`);
    holderCount = holders.length;
    symbolCount = holders[0]?.querySelectorAll('symbol').length ?? 0;
    decorativeAttrs = attrsOf(decorativeEl);
    meaningfulAttrs = attrsOf(meaningfulEl);
    invalidCount = invalidEl?.querySelectorAll('.icon').length ?? 0;
    document.fonts?.ready.then(() => {
      faLoaded = document.fonts.check('900 1em "Font Awesome 6 Free"') ? 'sí' : 'no';
    });
    return () => window.removeEventListener('resize', measure);
  });
</script>

<svelte:head>
  <title>Kit · Icon</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<a class="skip-link" href="#kit-main">Saltar al contenido</a>

<main id="kit-main" class="kit" tabindex="-1">
  <header class="kit__head">
    <h1 class="kit__title">Iconos</h1>
    <p class="kit__lede">
      Página de prueba de S13: el componente <code>Icon</code> con Font Awesome (<code>fas</code> /
      <code>far</code>
      / <code>fab</code>) y el sprite SVG propio. Un icono es decorativo salvo que reciba
      <code>label</code>; hereda tamaño y color del texto que lo rodea.
    </p>
    <dl class="facts">
      <div class="facts__row">
        <dt>Font Awesome {FA_VERSION} cargado</dt>
        <dd>{faLoaded}</dd>
      </div>
      <div class="facts__row">
        <dt>Sprite inyectado</dt>
        <dd>
          {#if holderCount === null}
            …
          {:else}
            {holderCount} contenedor{holderCount === 1 ? '' : 'es'} · {symbolCount} de {SPRITE_ICONS.length}
            símbolos
          {/if}
        </dd>
      </div>
      <div class="facts__row">
        <dt>Movimiento reducido</dt>
        <dd>
          {prefersReducedMotion.current ? 'activado (los giros se detienen)' : 'no solicitado'}
        </dd>
      </div>
      <div class="facts__row">
        <dt>Ancho de ventana</dt>
        <dd>{viewport ? `${viewport}px` : '…'}</dd>
      </div>
    </dl>
  </header>

  <section class="kit__section" aria-labelledby="h-solid">
    <h2 id="h-solid">Font Awesome sólido — <code>set="fas"</code></h2>
    <ul class="grid">
      {#each SOLID as [name, role] (name)}
        <li class="tile">
          <span class="tile__glyph"><Icon set="fas" {name} /></span>
          <code class="tile__name">{name}</code>
          <span class="tile__role">{role}</span>
        </li>
      {/each}
    </ul>
  </section>

  <section class="kit__section" aria-labelledby="h-regular">
    <h2 id="h-regular">Regular y marcas — <code>set="far"</code> · <code>set="fab"</code></h2>
    <ul class="grid">
      {#each REGULAR as name (name)}
        <li class="tile">
          <span class="tile__glyph"><Icon set="far" {name} /></span>
          <code class="tile__name">far {name}</code>
        </li>
      {/each}
      {#each BRANDS as name (name)}
        <li class="tile">
          <span class="tile__glyph"><Icon set="fab" {name} /></span>
          <code class="tile__name">fab {name}</code>
        </li>
      {/each}
    </ul>
  </section>

  <section class="kit__section" aria-labelledby="h-sprite">
    <h2 id="h-sprite">Sprite SVG — <code>set="sprite"</code></h2>
    <p class="kit__note">
      Los únicos nombres válidos son los símbolos del sprite ({SPRITE_ICONS.join(', ')}). Se inyecta
      una sola vez en <code>&lt;body&gt;</code>; el logo y el sobre se dimensionan con una clase.
    </p>
    <ul class="grid">
      {#each SPRITE_ICONS as name (name)}
        <li class="tile">
          <span class="tile__glyph"><Icon set="sprite" {name} /></span>
          <code class="tile__name">{name}</code>
        </li>
      {/each}
    </ul>
    <div class="row">
      <span class="brand">
        <Icon set="sprite" name="logo-church" class="brand__logo" label="Iglesia Restauración" />
        <span>logo a 56×70 (como el pie de página)</span>
      </span>
      <Icon set="sprite" name="floating-envelope" class="envelope" label="Ilustración de sobre" />
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-a11y">
    <h2 id="h-a11y">Semántica — <code>label</code> decide</h2>
    <div class="pair">
      <div class="card">
        <h3>Decorativo (sin <code>label</code>)</h3>
        <p class="card__demo" bind:this={decorativeEl}>
          <Icon set="fas" name="bell" /> Notificaciones
        </p>
        <p class="card__hint">El texto ya lo nombra; el icono se oculta al lector de pantalla.</p>
        <code class="attrs">{decorativeAttrs || '…'}</code>
      </div>
      <div class="card">
        <h3>Con significado (<code>label="Notificaciones"</code>)</h3>
        <p class="card__demo" bind:this={meaningfulEl}>
          <Icon set="fas" name="bell" label="Notificaciones" />
        </p>
        <p class="card__hint">No hay texto: el icono expone su nombre accesible.</p>
        <code class="attrs">{meaningfulAttrs || '…'}</code>
      </div>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-spin">
    <h2 id="h-spin">Giro — <code>spin</code></h2>
    <ul class="grid">
      <li class="tile">
        <span class="tile__glyph"><Icon set="fas" name="spinner" spin label="Cargando" /></span>
        <code class="tile__name">fas spinner · spin</code>
      </li>
      <li class="tile">
        <span class="tile__glyph"><Icon set="fas" name="circle-notch" spin /></span>
        <code class="tile__name">fas circle-notch · spin</code>
      </li>
      <li class="tile">
        <span class="tile__glyph"><Icon set="sprite" name="icon-clock" spin /></span>
        <code class="tile__name">sprite icon-clock · spin</code>
      </li>
    </ul>
    <p class="kit__note">
      Con <em>reducir movimiento</em> activado, ambos giros se detienen (guardas en Font Awesome y
      en el componente, además de <code>base/motion.css</code>).
    </p>
  </section>

  <section class="kit__section" aria-labelledby="h-inherit">
    <h2 id="h-inherit">Herencia de tamaño y color</h2>
    <ul class="stack">
      {#each SIZES as size (size)}
        <li class="line line--{size}">
          <Icon set="fas" name="calendar-check" />
          <Icon set="sprite" name="icon-calendar" />
          <span>--fs-{size} · el icono mide 1em y alinea con el texto</span>
        </li>
      {/each}
    </ul>
    <div class="row">
      <span class="chip chip--dark"><Icon set="fas" name="check" /> sobre --color-dark</span>
      <span class="chip chip--pos"><Icon set="fas" name="arrow-up" /> +$1,234.50</span>
      <span class="chip chip--neg"><Icon set="fas" name="arrow-down" /> −$845.00</span>
      <span class="chip chip--muted"><Icon set="far" name="clock" /> hace 2 h</span>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-control">
    <h2 id="h-control">Control solo-icono (patrón de S14)</h2>
    <p class="kit__note">
      El nombre accesible va en el <strong>control</strong>; su icono queda decorativo. Nunca
      <code>title=</code> a solas.
    </p>
    <div class="row">
      <button type="button" class="ctl" aria-label="Menú">
        <Icon set="fas" name="bars" />
      </button>
      <button type="button" class="ctl" aria-label="Notificaciones">
        <Icon set="fas" name="bell" />
      </button>
      <button type="button" class="ctl" aria-label="Cerrar">
        <Icon set="fas" name="times" />
      </button>
      <button type="button" class="ctl" aria-label="Más opciones">
        <Icon set="fas" name="ellipsis-vertical" />
      </button>
      <button type="button" class="ctl" aria-label="Cerrar sesión">
        <Icon set="fas" name="right-from-bracket" />
      </button>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-admin">
    <h2 id="h-admin">Superficie pública vs. admin</h2>
    <div class="compare">
      <div class="compare__col">
        <strong><Icon set="fas" name="star" /> --color-secondary público (dorado)</strong>
      </div>
      <div class="compare__col" data-surface="admin">
        <strong><Icon set="fas" name="star" /> --color-secondary admin (pizarra)</strong>
      </div>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-invalid">
    <h2 id="h-invalid">Nombre desconocido</h2>
    <p class="kit__note">
      <code>&lt;Icon set="sprite" name="Image" /&gt;</code> y
      <code>&lt;Icon name="spinner fa-spin" /&gt;</code> no renderizan nada (y avisan en consola): un
      valor ajeno nunca llega al sprite ni añade clases.
    </p>
    <p class="card__demo" bind:this={invalidEl}>
      [<Icon set="sprite" name="Image" /><Icon set="fas" name="spinner fa-spin" />]
      <span class="tile__role">
        {invalidCount === null ? '…' : `${invalidCount} iconos renderizados`}
      </span>
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
    margin: 0 0 var(--mg-xs);
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

  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
    gap: var(--mg-sm);
  }
  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--mg-xxs);
    padding: var(--pd-sm) var(--pd-xs);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-sm);
    text-align: center;
    min-width: 0;
  }
  .tile__glyph {
    font-size: var(--fs-xl);
    line-height: 1;
    color: var(--color-text);
  }
  .tile__name {
    font-size: var(--fs-xxs);
    overflow-wrap: anywhere;
  }
  .tile__role {
    font-size: var(--fs-xxs);
    color: var(--color-muted);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--mg-sm);
    margin-top: var(--mg-sm);
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: var(--mg-xs);
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  .brand :global(.brand__logo) {
    width: 56px;
    height: 70px;
    color: var(--color-text);
  }
  .row :global(.envelope) {
    width: 100%;
    max-width: 20rem;
    height: auto;
    aspect-ratio: 790 / 563;
  }

  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--mg-sm);
  }
  .card {
    padding: var(--pd-sm);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-sm);
    min-width: 0;
  }
  .card__demo {
    font-size: var(--fs-lg);
    margin: 0 0 var(--mg-xs);
  }
  .card__hint {
    margin: 0 0 var(--mg-xs);
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  .attrs {
    display: block;
    padding: var(--mg-xs);
    border-radius: var(--radius-sm);
    background: rgba(127, 127, 127, 0.12);
    overflow-wrap: anywhere;
  }

  .stack {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--mg-xs);
  }
  .line {
    display: flex;
    align-items: center;
    gap: var(--mg-xs);
    min-width: 0;
  }
  .line--sm {
    font-size: var(--fs-sm);
  }
  .line--base {
    font-size: var(--fs-base);
  }
  .line--md {
    font-size: var(--fs-md);
  }
  .line--lg {
    font-size: var(--fs-lg);
  }
  .line--xl {
    font-size: var(--fs-xl);
  }
  .line--2xl {
    font-size: var(--fs-2xl);
  }
  .line span {
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--mg-xxs);
    padding: var(--mg-xxs) var(--mg-sm);
    border-radius: var(--radius-full);
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
    font-variant-numeric: tabular-nums;
  }
  .chip--dark {
    background: var(--color-dark);
    color: var(--color-white);
  }
  .chip--pos {
    background: var(--money-pos-bg);
    color: var(--money-pos);
  }
  .chip--neg {
    background: var(--money-neg-bg);
    color: var(--money-neg);
  }
  .chip--muted {
    background: rgba(127, 127, 127, 0.12);
    color: var(--color-muted);
  }

  .ctl {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: 1.5px solid var(--gray-50);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-muted);
    font-size: var(--fs-base);
    transition:
      color 0.18s cubic-bezier(0.22, 1, 0.36, 1),
      border-color 0.18s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .ctl:hover {
    color: var(--color-text);
    border-color: var(--color-text);
  }
  @media (prefers-reduced-motion: reduce) {
    .ctl {
      transition: none;
    }
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
    font-size: var(--fs-sm);
  }

  @media (max-width: 640px) {
    .pair,
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
