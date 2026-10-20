<script lang="ts">
  // /kit/states/ — the PR-C2 staging smoke page for the async-view state trio
  // (DESIGN-SYSTEM §5): a skeleton per shape, the calm empty state with its
  // action, the error state with human copy + Reintentar, a live view that
  // walks error → retry (fails again, re-announced) → retry → content, the
  // compact forms inside cards, words-as-text and both palettes. Prerendered,
  // no data fetching (the "requests" are timers), noindex.
  import { onMount } from 'svelte';
  import Button from '#lib/components/Button.svelte';
  import Card from '#lib/components/Card.svelte';
  import StateEmpty from '#lib/components/StateEmpty.svelte';
  import StateError from '#lib/components/StateError.svelte';
  import StateLoading from '#lib/components/StateLoading.svelte';
  import { LOADING_SHAPES } from '#lib/components/states.js';
  import { prefersReducedMotion } from '#lib/reduced-motion.js';

  /** What a repo hands back for a dropped connection (repos/errors.ts, kind "network"). */
  const NETWORK_COPY =
    'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
  /** Markup plus a Postgres phrase: what must never render as HTML (or reach a user). */
  const RAW_BACKEND = '<img src=x onerror="alert(1)"> new row violates row-level security policy';
  const EVENTS = ['Culto dominical', 'Estudio bíblico', 'Reunión de jóvenes'];
  /** Long enough to watch the spinner; the e2e spec waits for it. */
  const FAKE_REQUEST_MS = 700;

  type View = 'loading' | 'error' | 'empty' | 'ok';

  let viewport = $state(0);
  let view = $state<View>('error');
  let attempts = $state(0);
  let created = $state(0);

  function measure() {
    viewport = window.innerWidth;
  }

  const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

  // The view keeps showing the error while the retry runs (the button carries
  // the progress), and swaps only once the "request" has answered: the first
  // retry fails again, the second one succeeds.
  async function retry(): Promise<void> {
    attempts += 1;
    await wait(FAKE_REQUEST_MS);
    view = attempts >= 2 ? 'ok' : 'error';
  }

  function reset(next: View) {
    attempts = 0;
    view = next;
  }

  onMount(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });
</script>

<svelte:head>
  <title>Kit · Estados</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<a class="skip-link" href="#kit-main">Saltar al contenido</a>

<main id="kit-main" class="kit" tabindex="-1">
  <header class="kit__head">
    <h1 class="kit__title">Estados: cargando, vacío y error</h1>
    <p class="kit__lede">
      Página de prueba de PR-C2: los tres estados que toda vista asíncrona debe mostrar. Cargando es
      un esqueleto con la forma de lo que viene (no la cadena «Cargando…» de siempre); vacío es una
      invitación con su acción; error dice qué pasó en español y ofrece «Reintentar» — nunca el
      texto crudo del servidor, y nunca con el aspecto de «no hay nada».
    </p>
    <dl class="facts">
      <div class="facts__row">
        <dt>Intentos en la vista en vivo</dt>
        <dd data-testid="attempts">{attempts}</dd>
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

  <section class="kit__section" aria-labelledby="h-loading">
    <h2 id="h-loading">Cargando — un esqueleto por forma</h2>
    <p class="kit__note">
      Cada esqueleto ocupa el sitio de su contenido, así que nada salta al llegar los datos. El
      pulso se detiene con «reducir movimiento». Para el lector de pantalla: <code>aria-busy</code> y
      un «Cargando…» oculto.
    </p>
    {#each LOADING_SHAPES as shape (shape)}
      <h3 class="kit__sub"><code>shape="{shape}"</code></h3>
      <div class="demo" data-shape={shape}>
        <StateLoading {shape} rows={shape === 'card-grid' ? 4 : 3} />
      </div>
    {/each}
  </section>

  <section class="kit__section" aria-labelledby="h-empty">
    <h2 id="h-empty">Vacío — una invitación, no una disculpa</h2>
    <div class="stack" data-testid="empty">
      <StateEmpty
        icon="images"
        message="Aún no hay álbumes."
        hint="Los álbumes que publiques aparecerán en la galería del sitio."
      >
        {#snippet action()}
          <Button icon="plus" onclick={() => (created += 1)}>Nuevo álbum</Button>
        {/snippet}
      </StateEmpty>
      <StateEmpty icon="calendar-check" message="No hay eventos próximos." />
    </div>
    <p class="kit__note">Álbumes creados en esta página: {created}</p>
  </section>

  <section class="kit__section" aria-labelledby="h-error">
    <h2 id="h-error">Error — qué pasó, qué hacer, y Reintentar</h2>
    <p class="kit__note">
      Triángulo de advertencia, tono de error y borde sólido: un fallo nunca se confunde con «no hay
      nada». El texto es <code>RepoError.message</code> y se muestra como texto.
    </p>
    <div class="stack">
      <StateError message={NETWORK_COPY} onRetry={() => wait(FAKE_REQUEST_MS)} />
      <div data-testid="text-only">
        <StateError message={RAW_BACKEND} onRetry={() => undefined} />
      </div>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-live">
    <h2 id="h-live">Una vista en vivo</h2>
    <p class="kit__note">
      Empieza con la red caída. El primer «Reintentar» vuelve a fallar (el aviso se anuncia otra
      vez); el segundo trae los datos. Mientras tanto el botón muestra su progreso y el error sigue
      en pantalla.
    </p>
    <div class="row">
      <Button size="sm" variant="ghost" onclick={() => reset('loading')}>Ver cargando</Button>
      <Button size="sm" variant="ghost" onclick={() => reset('error')}>Ver error</Button>
      <Button size="sm" variant="ghost" onclick={() => reset('empty')}>Ver vacío</Button>
    </div>
    <div class="live" data-testid="live" data-view={view}>
      {#if view === 'loading'}
        <StateLoading shape="list" rows={3} label="Cargando eventos…" />
      {:else if view === 'error'}
        <StateError message={NETWORK_COPY} onRetry={retry} />
      {:else if view === 'empty'}
        <StateEmpty icon="calendar-check" message="No hay eventos próximos." />
      {:else}
        <ul class="events">
          {#each EVENTS as title (title)}
            <li class="events__row">{title}</li>
          {/each}
        </ul>
      {/if}
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-compact">
    <h2 id="h-compact">Dentro de una tarjeta (<code>compact</code>)</h2>
    <div class="cards">
      <Card heading="Eventos este mes">
        <StateLoading shape="detail" rows={1} />
      </Card>
      <Card heading="Interesados pendientes">
        <StateEmpty compact icon="user-check" message="Nadie en espera." />
      </Card>
      <Card heading="Álbumes de galería">
        <StateError compact message={NETWORK_COPY} onRetry={() => wait(FAKE_REQUEST_MS)} />
      </Card>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-surface">
    <h2 id="h-surface">Superficie pública vs. admin</h2>
    <div class="compare">
      <div class="compare__col">
        <p class="compare__tag">público</p>
        <StateEmpty compact icon="inbox" message="Nada por aquí." />
      </div>
      <div class="compare__col" data-surface="admin">
        <p class="compare__tag">admin</p>
        <StateEmpty compact icon="inbox" message="Nada por aquí." />
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

  .stack {
    display: grid;
    gap: var(--mg-sm);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--mg-xs);
    margin-bottom: var(--mg-sm);
  }

  .demo,
  .live {
    padding: var(--pd-sm);
    border: 1px solid rgba(127, 127, 127, 0.18);
    border-radius: var(--radius-md);
    background: var(--color-bg-light);
  }

  .events {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .events__row {
    display: flex;
    align-items: center;
    min-block-size: 3.5rem;
    border-block-end: 1px solid rgba(127, 127, 127, 0.18);
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
    gap: var(--mg-sm);
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
