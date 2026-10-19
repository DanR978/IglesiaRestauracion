<script lang="ts">
  // /kit/alert/ — the PR-C2 staging smoke page for Alert: the four tones and
  // their live-region roles, title + actions, dismiss (the parent removes the
  // alert and places focus), a live in-form error, words-as-text and both
  // palettes. Prerendered, no data fetching, noindex.
  import { onMount, tick } from 'svelte';
  import Alert from '#lib/components/Alert.svelte';
  import Button from '#lib/components/Button.svelte';
  import { ALERT_ROLES, ALERT_TONES, type AlertTone } from '#lib/components/alert.js';

  const TONE_MESSAGE: Record<AlertTone, string> = {
    error: 'Correo o contraseña incorrectos.',
    success: 'Tus cambios se guardaron.',
    info: 'Puedes agregar un segundo dispositivo para la verificación en dos pasos.',
    warn: 'Estás en el navegador de una app. Para entrar con Google o Microsoft, abre esta página en Safari o Chrome.',
  };

  /** Markup plus a Postgres phrase: what must never render as HTML (or reach a user). */
  const RAW_BACKEND = '<img src=x onerror="alert(1)"> violates row-level security policy';

  let viewport = $state(0);
  let notices = $state<AlertTone[]>(['success', 'info']);
  let restoreButton = $state<HTMLElement>();
  let saving = $state(false);
  let saveError = $state<string | null>(null);
  let copied = $state(false);

  function measure() {
    viewport = window.innerWidth;
  }

  // The parent owns the alert: it removes it, then puts focus somewhere useful
  // instead of letting it fall to <body> with the removed button.
  async function dismiss(tone: AlertTone) {
    notices = notices.filter((t) => t !== tone);
    await tick();
    restoreButton?.querySelector('button')?.focus();
  }

  function restore() {
    notices = ['success', 'info'];
  }

  function fakeSave() {
    saving = true;
    saveError = null;
    setTimeout(() => {
      saving = false;
      saveError = 'No pudimos guardar los cambios. Revisa tu conexión e inténtalo de nuevo.';
    }, 900);
  }

  onMount(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });
</script>

<svelte:head>
  <title>Kit · Alert</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<a class="skip-link" href="#kit-main">Saltar al contenido</a>

<main id="kit-main" class="kit" tabindex="-1">
  <header class="kit__head">
    <h1 class="kit__title">Avisos en línea (alert)</h1>
    <p class="kit__lede">
      Página de prueba de PR-C2: <code>Alert</code> es el mensaje que se queda en su sitio —el error
      de un formulario, el de inicio de sesión—; el pasajero es el toast. Icono y texto plano, nunca
      HTML. El error usa <code>role="alert"</code>; los demás, <code>role="status"</code>.
    </p>
    <dl class="facts">
      <div class="facts__row">
        <dt>Ancho de ventana</dt>
        <dd>{viewport ? `${viewport}px` : '…'}</dd>
      </div>
    </dl>
  </header>

  <section class="kit__section" aria-labelledby="h-tones">
    <h2 id="h-tones">Tonos</h2>
    <div class="stack" data-testid="tones">
      {#each ALERT_TONES as tone (tone)}
        <Alert {tone} message={TONE_MESSAGE[tone]} />
      {/each}
    </div>
    <ul class="legend">
      {#each ALERT_TONES as tone (tone)}
        <li><code>{tone}</code> → <code>role="{ALERT_ROLES[tone]}"</code></li>
      {/each}
    </ul>
  </section>

  <section class="kit__section" aria-labelledby="h-rich">
    <h2 id="h-rich">Con título y acciones</h2>
    <div class="stack">
      <Alert
        tone="warn"
        title="Navegador integrado"
        message="Google y Microsoft no permiten iniciar sesión dentro de otra app. Abre esta página en Safari o Chrome; con correo y contraseña puedes seguir aquí."
      >
        {#snippet actions()}
          <Button size="sm" variant="ghost" icon="copy" onclick={() => (copied = true)}>
            {copied ? 'Enlace copiado' : 'Copiar enlace'}
          </Button>
        {/snippet}
      </Alert>
      <Alert
        tone="error"
        title="No pudimos guardar"
        message="La conexión se interrumpió antes de terminar. Tus cambios siguen en el formulario."
      >
        {#snippet actions()}
          <Button size="sm" variant="ghost" icon="rotate-right">Reintentar</Button>
        {/snippet}
      </Alert>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-dismiss">
    <h2 id="h-dismiss">Descartable</h2>
    <p class="kit__note">
      Con <code>onDismiss</code> aparece «Cerrar aviso». El padre quita el aviso y decide a dónde va el
      foco — aquí, al botón de restaurar.
    </p>
    <div class="stack" data-testid="dismissible">
      {#each notices as tone (tone)}
        <Alert {tone} message={TONE_MESSAGE[tone]} onDismiss={() => dismiss(tone)} />
      {/each}
    </div>
    <div class="row" bind:this={restoreButton}>
      <Button size="sm" variant="ghost" icon="rotate-left" onclick={restore}>
        Mostrar los avisos otra vez
      </Button>
      <span class="kit__note" data-testid="notice-count">{notices.length} visibles</span>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-live">
    <h2 id="h-live">En un formulario</h2>
    <p class="kit__note">
      Guardar falla a propósito: el aviso aparece en su sitio y, por ser <code>role="alert"</code>,
      el lector de pantalla lo anuncia sin mover el foco.
    </p>
    <form class="form" onsubmit={(event) => event.preventDefault()}>
      {#if saveError}
        <Alert tone="error" message={saveError} onDismiss={() => (saveError = null)} />
      {/if}
      <div class="row">
        <Button type="submit" loading={saving} onclick={fakeSave}>Guardar cambios</Button>
      </div>
    </form>
  </section>

  <section class="kit__section" aria-labelledby="h-text">
    <h2 id="h-text">El mensaje es texto</h2>
    <div data-testid="text-only">
      <Alert tone="error" message={RAW_BACKEND} />
    </div>
    <p class="kit__note">
      Se ve tal cual, sin interpretar. (Y un texto así no debería llegar nunca: el tono de error
      recibe <code>RepoError.message</code>, en español, jamás el detalle del servidor).
    </p>
  </section>

  <section class="kit__section" aria-labelledby="h-surface">
    <h2 id="h-surface">Superficie pública vs. admin</h2>
    <div class="compare">
      <div class="compare__col">
        <p class="compare__tag">público</p>
        <Alert tone="info" message="Los avisos leen tokens de estado." />
      </div>
      <div class="compare__col" data-surface="admin">
        <p class="compare__tag">admin</p>
        <Alert tone="info" message="Los avisos leen tokens de estado." />
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
    gap: var(--mg-sm);
    margin-top: var(--mg-sm);
  }

  .legend {
    margin: var(--mg-sm) 0 0;
    padding-left: 1.1rem;
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }

  .form {
    display: grid;
    gap: var(--mg-sm);
    padding: var(--pd-sm);
    border: 1px solid rgba(127, 127, 127, 0.18);
    border-radius: var(--radius-md);
    background: var(--color-surface);
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
