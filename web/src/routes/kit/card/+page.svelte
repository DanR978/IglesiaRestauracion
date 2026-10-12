<script lang="ts">
  // /kit/card/ — the S14 staging smoke page: static vs interactive cards (the
  // false-affordance rule made structural), the KPI tile with its honest scope,
  // the pure-CSS card grid that replaces autoBalance() (G-010), and both
  // palettes. Prerendered, no data fetching, noindex.
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import type { KpiTile } from '$lib/components/card';
  import { prefersReducedMotion } from '$lib/reduced-motion';

  const KPIS: KpiTile[] = [
    { icon: 'users', value: 128, label: 'Inscritos', scope: 'Este mes' },
    { icon: 'calendar-check', value: 6, label: 'Eventos publicados', scope: 'Este mes' },
    { icon: 'hand-holding-heart', value: '$4,250.00', label: 'Ingresos', scope: 'Este mes' },
    { icon: 'file-invoice-dollar', value: '$430.00', label: 'Por pagar', scope: 'Todo el tiempo' },
    {
      icon: 'triangle-exclamation',
      value: 3,
      label: 'Discipulado pendiente',
      scope: 'Sin asignar',
      tone: 'alert',
    },
  ];

  let viewport = $state(0);
  let opened = $state('—');
  let tagRow: HTMLElement | undefined = $state();
  let tags = $state('…');

  function measure() {
    viewport = window.innerWidth;
  }

  onMount(() => {
    measure();
    window.addEventListener('resize', measure);
    tags = Array.from(tagRow?.querySelectorAll('.ird-card') ?? [])
      .map((el) => `<${el.tagName.toLowerCase()}>`)
      .join(' · ');
    return () => window.removeEventListener('resize', measure);
  });
</script>

<svelte:head>
  <title>Kit · Card</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<a class="skip-link" href="#kit-main">Saltar al contenido</a>

<main id="kit-main" class="kit" tabindex="-1">
  <header class="kit__head">
    <h1 class="kit__title">Tarjetas</h1>
    <p class="kit__lede">
      Página de prueba de S14: el componente <code>Card</code> con un solo radio (<code
        >--radius-md</code
      >) y una sola sombra. Una tarjeta es
      <strong>estática</strong> (un <code>&lt;div&gt;</code> que no promete nada) o
      <strong>interactiva</strong> (un <code>&lt;a&gt;</code>/<code>&lt;button&gt;</code> real que hace
      la acción principal). No existe el término medio.
    </p>
    <dl class="facts">
      <div class="facts__row">
        <dt>Elementos generados (fila de abajo)</dt>
        <dd>{tags}</dd>
      </div>
      <div class="facts__row">
        <dt>Última tarjeta activada</dt>
        <dd>{opened}</dd>
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
    <h2 id="h-variants">Estática vs. interactiva</h2>
    <div class="pair" bind:this={tagRow}>
      <Card heading="Nota del tesorero" headingIcon="note-sticky">
        <p class="body">
          Tarjeta estática: sin cursor, sin hover, sin foco. Solo contiene información.
        </p>
      </Card>
      <Card
        variant="interactive"
        href="{base}/kit/button/"
        heading="Ir a los botones"
        headingIcon="arrow-right"
      >
        <p class="body">
          Tarjeta interactiva como <code>&lt;a&gt;</code>: toda la tarjeta navega. Enter funciona
          porque es un enlace de verdad.
        </p>
      </Card>
      <Card
        variant="interactive"
        heading="Abrir grupo"
        headingIcon="layer-group"
        onclick={() => (opened = 'Abrir grupo')}
      >
        <p class="body">
          Tarjeta interactiva como <code>&lt;button&gt;</code>: Enter y Espacio funcionan sin
          escribir un solo <code>keydown</code>.
        </p>
      </Card>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-false">
    <h2 id="h-false">La regla de la falsa afordancia</h2>
    <p class="kit__note">
      Una tarjeta que parece pulsable <em>tiene</em> que hacer la acción principal. Cuando además hace
      falta un menú de fila, la tarjeta es estática y los controles son explícitos — nunca una tarjeta
      que finge y en realidad dispara un kebab oculto.
    </p>
    <div class="pair">
      <Card heading="Vacaciones Bíblicas 2026" headingIcon="church">
        <p class="body">14–18 de julio · 128 inscritos</p>
        <div class="cardbar">
          <Button variant="ghost" size="sm" icon="pen">Editar</Button>
          <Button variant="ghost" size="sm" icon="ellipsis-vertical">Opciones</Button>
          <Button size="sm" icon="eye">Ver inscritos</Button>
        </div>
      </Card>
      <Card
        variant="interactive"
        ariaLabel="Abrir Vacaciones Bíblicas 2026"
        heading="Vacaciones Bíblicas 2026"
        headingIcon="church"
        onclick={() => (opened = 'Vacaciones Bíblicas 2026')}
      >
        <p class="body">14–18 de julio · 128 inscritos</p>
        <p class="body body--muted">Toda la tarjeta abre el evento. Nada más dentro.</p>
      </Card>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-kpi">
    <h2 id="h-kpi">Mosaicos KPI — con alcance honesto</h2>
    <p class="kit__note">
      Cada mosaico dice de qué periodo habla. «Por pagar» es de todo el tiempo y lo declara, así que
      ya no se confunde con las cifras del mes que tiene al lado. La rejilla es CSS puro (<code
        >repeat(auto-fit, minmax(180px, 1fr))</code
      >): ningún componente toca
      <code>style.gridColumn</code> en tiempo de ejecución.
    </p>
    <div class="cardgrid">
      {#each KPIS as kpi (kpi.label)}
        <Card {kpi} />
      {/each}
    </div>
    <h3 class="kit__sub">Los mismos mosaicos, interactivos</h3>
    <div class="cardgrid">
      {#each KPIS.slice(0, 3) as kpi (kpi.label)}
        <Card
          variant="interactive"
          {kpi}
          ariaLabel="Ver {kpi.label}"
          onclick={() => (opened = kpi.label)}
        />
      {/each}
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-surface">
    <h2 id="h-surface">Superficie pública vs. admin</h2>
    <div class="compare">
      <div class="compare__col">
        <p class="compare__tag">público</p>
        <Card kpi={{ icon: 'users', value: 128, label: 'Inscritos', scope: 'Este mes' }} />
      </div>
      <div class="compare__col" data-surface="admin">
        <p class="compare__tag">admin</p>
        <Card kpi={{ icon: 'users', value: 128, label: 'Inscritos', scope: 'Este mes' }} />
      </div>
    </div>
    <p class="kit__note">
      Sin ámbar, sin barrido decorativo y sin salto de 3px al pasar el ratón: el borde se refuerza
      al color de tinta y la tarjeta sube un escalón de sombra.
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
  .kit__sub {
    margin: var(--mg-md) 0 var(--mg-xs);
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
    color: var(--color-muted);
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

  /* The pure-CSS replacement for autoBalance()/grid-balance.js (G-010): the
     last row fills itself, at every width, with no JS and no style.gridColumn. */
  .cardgrid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--mg-sm);
    margin-top: var(--mg-sm);
  }

  .pair {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: var(--mg-sm);
    align-items: start;
  }

  .body {
    margin: 0;
    font-size: var(--fs-sm);
  }
  .body--muted {
    margin-top: var(--mg-xs);
    color: var(--color-muted);
  }

  .cardbar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mg-xs);
    margin-top: var(--mg-sm);
  }

  .compare {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--mg-sm);
  }
  .compare__col {
    padding: var(--pd-sm);
    border-radius: var(--radius-md);
    background: var(--color-bg-light);
    box-shadow: var(--shadow-sm);
  }
  .compare__tag {
    margin: 0 0 var(--mg-xs);
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-muted);
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
