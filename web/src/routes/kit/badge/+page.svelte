<script lang="ts">
  // /kit/badge/ — the PR-C2 staging smoke page for Badge: the five status tones
  // (glyph + words, never colour alone), the three role chips, the per-record
  // colour through a validated --tint, truncation at 360px, words-as-text, and
  // both palettes. The colours below stand in for database values. Prerendered,
  // no data fetching, noindex.
  import { onMount } from 'svelte';
  import Badge from '#lib/components/Badge.svelte';
  import { BADGE_ROLES, BADGE_TONES, type BadgeTone } from '#lib/components/badge.js';

  const TONE_LABEL: Record<BadgeTone, string> = {
    neutral: 'Inactivo',
    info: 'Abierto',
    success: 'Activa',
    warn: 'Pendiente',
    danger: 'Cancelado',
  };

  const TONE_USE: Record<BadgeTone, string> = {
    neutral: 'inactivo, finalizado, borrador',
    info: 'abierto, inscripciones abiertas',
    success: 'activo, pagado, completado',
    warn: 'pendiente, vence pronto',
    danger: 'vencido, cancelado, cerrado',
  };

  // Stand-ins for ministries.color / role_presets.color as they come from the
  // database — including the values badgeTint() must refuse.
  const MINISTRIES = [
    { name: 'Jóvenes', color: '#2563EB' },
    { name: 'Alabanza', color: '#0f766e' },
    { name: 'Niños', color: '#ca8a04' },
    { name: 'Damas', color: '#be185d' },
    { name: 'Varones', color: '#000' },
    { name: 'Hospitalidad', color: '#ffffff' },
    { name: 'Sin color válido', color: 'azul; background:url(x)' },
  ];

  const PRESETS = [
    { name: 'Medios', color: '#0e7490', icon: 'camera' },
    { name: 'Tesorería', color: '#b45309', icon: 'coins' },
    { name: 'Desarrollador', color: '#475569', icon: 'code' },
  ];

  const EVENTS = [
    { title: 'Culto de jóvenes', ministry: MINISTRIES[0], tone: 'success', status: 'Publicado' },
    {
      title: 'Retiro de matrimonios en la montaña, con hospedaje y transporte incluidos',
      ministry: { name: 'Ministerio de Matrimonios y Familias Restauradas', color: '#9333ea' },
      tone: 'warn',
      status: 'Pendiente de revisión',
    },
    { title: 'Ensayo general', ministry: MINISTRIES[1], tone: 'danger', status: 'Cancelado' },
  ] as const;

  /** Markup in a label: rendered as words, never as an element. */
  const MARKUP = '<img src=x onerror="alert(1)">';

  let viewport = $state(0);

  function measure() {
    viewport = window.innerWidth;
  }

  onMount(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });
</script>

<svelte:head>
  <title>Kit · Badge</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<a class="skip-link" href="#kit-main">Saltar al contenido</a>

<main id="kit-main" class="kit" tabindex="-1">
  <header class="kit__head">
    <h1 class="kit__title">Etiquetas (badge)</h1>
    <p class="kit__lede">
      Página de prueba de PR-C2: una sola etiqueta guiada por datos reemplaza
      <code>.role--*</code>, los estados de discipulado, <code>statusBadge</code>,
      <code>cat-badge</code> y el «Activa» siempre verde. Un estado siempre lleva icono y palabras — el
      color nunca es la única señal.
    </p>
    <dl class="facts">
      <div class="facts__row">
        <dt>Ancho de ventana</dt>
        <dd>{viewport ? `${viewport}px` : '…'}</dd>
      </div>
    </dl>
  </header>

  <section class="kit__section" aria-labelledby="h-tones">
    <h2 id="h-tones">Estados (tono)</h2>
    <div class="row" data-testid="tones">
      {#each BADGE_TONES as tone (tone)}
        <Badge {tone} label={TONE_LABEL[tone]} />
      {/each}
    </div>
    <ul class="legend">
      {#each BADGE_TONES as tone (tone)}
        <li><code>{tone}</code> — {TONE_USE[tone]}</li>
      {/each}
    </ul>
    <h3 class="kit__sub">Con un icono propio</h3>
    <div class="row">
      <Badge tone="warn" icon="clock" label="Vence pronto" />
      <Badge tone="success" icon="hand-holding-dollar" label="Pagado" />
      <Badge tone="info" icon="door-open" label="Inscripciones abiertas" />
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-roles">
    <h2 id="h-roles">Roles</h2>
    <p class="kit__note">
      Tres tratamientos que no se confunden a simple vista —sólido, contorno y tinte— además de su
      icono y su nombre. En el panel heredado los tres eran idénticos.
    </p>
    <div class="row" data-testid="roles">
      {#each BADGE_ROLES as role (role)}
        <Badge {role} />
      {/each}
      <Badge role="admin" label="Desarrollador" />
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-tint">
    <h2 id="h-tint">Color del registro (ministerio, perfil de acceso)</h2>
    <p class="kit__note">
      El color llega solo a través de <code>badgeTint()</code> (un hexadecimal estricto) y de la
      propiedad <code>--tint</code>; pinta el tinte y el punto. Las palabras conservan la tinta del
      tema, así que cualquier color se lee en claro y en oscuro. Un valor inválido queda neutro.
    </p>
    <div class="row" data-testid="tinted">
      {#each MINISTRIES as ministry (ministry.name)}
        <Badge tint={ministry.color} label={ministry.name} />
      {/each}
    </div>
    <h3 class="kit__sub">Con el icono del perfil</h3>
    <div class="row">
      {#each PRESETS as preset (preset.name)}
        <Badge tint={preset.color} icon={preset.icon} label={preset.name} />
      {/each}
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-context">
    <h2 id="h-context">En contexto</h2>
    <p class="kit__note">
      Un nombre largo se recorta dentro de su fila en vez de ensanchar la pantalla a 360px; el texto
      completo sigue en el DOM para el lector de pantalla.
    </p>
    <ul class="events">
      {#each EVENTS as event (event.title)}
        <li class="events__row">
          <span class="events__title">{event.title}</span>
          <span class="events__badges">
            <Badge tint={event.ministry.color} label={event.ministry.name} />
            <Badge tone={event.tone} label={event.status} />
          </span>
        </li>
      {/each}
    </ul>
  </section>

  <section class="kit__section" aria-labelledby="h-text">
    <h2 id="h-text">Las palabras son texto</h2>
    <div class="row" data-testid="text-only">
      <Badge tone="danger" label={MARKUP} />
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-surface">
    <h2 id="h-surface">Superficie pública vs. admin</h2>
    <div class="compare">
      <div class="compare__col">
        <p class="compare__tag">público</p>
        <div class="row">
          <Badge tone="success" label="Activa" />
          <Badge role="treasurer" />
          <Badge tint="#0f766e" label="Alabanza" />
        </div>
      </div>
      <div class="compare__col" data-surface="admin">
        <p class="compare__tag">admin</p>
        <div class="row">
          <Badge tone="success" label="Activa" />
          <Badge role="treasurer" />
          <Badge tint="#0f766e" label="Alabanza" />
        </div>
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
    font-size: var(--fs-lg);
    font-weight: var(--fw-semibold);
    margin-bottom: var(--mg-sm);
  }
  .kit__sub {
    margin: var(--mg-md) 0 var(--mg-xs);
    font-size: var(--fs-md);
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

  .events {
    margin: 0;
    padding: 0;
    list-style: none;
    border: 1px solid rgba(127, 127, 127, 0.18);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }
  .events__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--mg-xs) var(--mg-sm);
    padding: var(--pd-sm);
  }
  .events__row + .events__row {
    border-top: 1px solid rgba(127, 127, 127, 0.18);
  }
  .events__title {
    min-inline-size: 0;
    font-weight: var(--fw-semibold);
  }
  /* The badges may shrink: each truncates inside this row, never past it. */
  .events__badges {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mg-xs);
    min-inline-size: 0;
    max-inline-size: 100%;
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
