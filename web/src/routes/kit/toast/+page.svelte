<script lang="ts">
  // /kit/toast/ — the S15 staging smoke page: every toast variant and state
  // (success / error / info / undo × auto-dismiss / sticky / action / long
  // message), the stack cap, hover-to-hold, and the "message is text, never
  // HTML" guarantee. Prerendered, no data fetching, noindex.
  import { onMount } from 'svelte';
  import ToastHost from '$lib/components/ToastHost.svelte';
  import { prefersReducedMotion } from '$lib/reduced-motion';
  import {
    TOAST_DURATION_MS,
    TOAST_MAX,
    TOAST_UNDO_DURATION_MS,
    toast,
  } from '$lib/stores/toast.svelte';

  const PAYLOAD = '<img src=x onerror="alert(1)"> · <b>negrita</b>';
  const LONG =
    'new row for relation "event_registrations" violates check constraint ' +
    '"event_registrations_email_check" — correo.muy.largo.de.prueba@iglesiarestauracion.org';

  const ALBUMS = ['Retiro de jóvenes', 'Navidad 2025', 'Bautismos de verano'];

  let albums = $state([...ALBUMS]);
  let viewport = $state(0);

  function removeAlbum(name: string) {
    const index = albums.indexOf(name);
    if (index === -1) return;
    albums.splice(index, 1);
    toast.undo(`Álbum "${name}" eliminado`, {
      onAction: () => albums.splice(Math.min(index, albums.length), 0, name),
    });
  }

  function flood() {
    for (let i = 1; i <= TOAST_MAX + 2; i++) toast.info(`Mensaje ${i} de ${TOAST_MAX + 2}`);
  }

  onMount(() => {
    const measure = () => (viewport = window.innerWidth);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });
</script>

<svelte:head>
  <title>Kit · Toast</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<a class="skip-link" href="#kit-main">Saltar al contenido</a>

<main id="kit-main" class="kit" tabindex="-1">
  <header class="kit__head">
    <h1 class="kit__title">Avisos (toast)</h1>
    <p class="kit__lede">
      Página de prueba de S15: un solo sistema de avisos — <code>toast.success/error/info</code> más
      <code>toast.undo</code> — que reemplaza los dos sistemas anteriores (el público
      <code>showToast</code>
      y el del panel <code>toast(msg, tipo)</code>). El mensaje siempre se pinta como
      <strong>texto</strong>, nunca como HTML.
    </p>
    <dl class="facts">
      <div class="facts__row">
        <dt>Avisos en pantalla</dt>
        <dd>{toast.items.length} de {TOAST_MAX} como máximo</dd>
      </div>
      <div class="facts__row">
        <dt>Cierre automático</dt>
        <dd>{TOAST_DURATION_MS / 1000}s · {TOAST_UNDO_DURATION_MS / 1000}s con acción</dd>
      </div>
      <div class="facts__row">
        <dt>Movimiento reducido</dt>
        <dd>
          {prefersReducedMotion.current
            ? 'activado (aparecen y desaparecen sin animación)'
            : 'no solicitado'}
        </dd>
      </div>
      <div class="facts__row">
        <dt>Ancho de ventana</dt>
        <dd>{viewport ? `${viewport}px` : '…'}</dd>
      </div>
    </dl>
  </header>

  <section class="kit__section" aria-labelledby="h-variants">
    <h2 id="h-variants">Variantes</h2>
    <p class="kit__note">
      <code>error</code> se anuncia con <code>role="alert"</code> (interrumpe al lector de
      pantalla); el resto usa <code>role="status"</code>. El color nunca va solo: cada variante
      lleva su icono.
    </p>
    <div class="row">
      <button type="button" class="demo-btn" onclick={() => toast.success('Guardado')}>
        success
      </button>
      <button
        type="button"
        class="demo-btn"
        onclick={() => toast.error('No pudimos guardar los cambios. Intenta de nuevo.')}
      >
        error
      </button>
      <button type="button" class="demo-btn" onclick={() => toast.info('Sincronizando…')}>
        info
      </button>
      <button
        type="button"
        class="demo-btn"
        onclick={() =>
          toast.undo('Álbum eliminado', { onAction: () => toast.success('Restaurado') })}
      >
        undo
      </button>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-timing">
    <h2 id="h-timing">Duración y cierre</h2>
    <p class="kit__note">
      Se cierran solos a los {TOAST_DURATION_MS / 1000}s, o cuando pulsas <em>Cerrar</em>. Con
      <code>duration: 0</code> se quedan hasta que el usuario los cierre. Mientras el puntero está encima
      —o el foco dentro— la cuenta atrás se detiene.
    </p>
    <div class="row">
      <button
        type="button"
        class="demo-btn"
        onclick={() => toast.info('Este aviso no se cierra solo', { duration: 0 })}
      >
        Aviso fijo (duration: 0)
      </button>
      <button
        type="button"
        class="demo-btn"
        onclick={() => toast.success('Rápido', { duration: 1200 })}
      >
        Aviso breve (1.2s)
      </button>
      <button type="button" class="demo-btn" onclick={() => toast.clear()}>
        Cerrar todos ({toast.items.length})
      </button>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-stack">
    <h2 id="h-stack">Apilado</h2>
    <p class="kit__note">
      Se apilan abajo a la derecha (abajo a lo ancho en móvil, ≤640px). A partir de {TOAST_MAX} se descarta
      el más antiguo, para que un error en bucle no tape la pantalla.
    </p>
    <div class="row">
      <button type="button" class="demo-btn" onclick={flood}>
        Lanzar {TOAST_MAX + 2} avisos
      </button>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-action">
    <h2 id="h-action">Acción: deshacer y reintentar</h2>
    <p class="kit__note">
      Una acción destructiva ofrece <em>Deshacer</em> en vez de sólo un diálogo de confirmación. También
      sirve para reintentar una escritura fallida.
    </p>
    <ul class="albums">
      {#each albums as name (name)}
        <li class="albums__row">
          <span>{name}</span>
          <button type="button" class="demo-btn demo-btn--sm" onclick={() => removeAlbum(name)}>
            Eliminar
          </button>
        </li>
      {:else}
        <li class="albums__row albums__row--empty">No queda ningún álbum de prueba.</li>
      {/each}
    </ul>
    <div class="row">
      <button
        type="button"
        class="demo-btn"
        onclick={() =>
          toast.error('No pudimos publicar el álbum.', {
            action: { label: 'Reintentar', onAction: () => toast.success('Publicado') },
          })}
      >
        Error con “Reintentar”
      </button>
      <button
        type="button"
        class="demo-btn"
        onclick={() => (albums = [...ALBUMS])}
        disabled={albums.length === ALBUMS.length}
      >
        Reiniciar la lista
      </button>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-text">
    <h2 id="h-text">El mensaje es texto, nunca HTML</h2>
    <p class="kit__note">
      El cuerpo se interpola con Svelte, sin <code>{'{@html}'}</code> (D-005): una cadena de Postgres,
      un correo o una etiqueta se leen tal cual. Un mensaje largo parte de línea; el aviso no se ensancha
      ni provoca desplazamiento horizontal.
    </p>
    <div class="row">
      <button type="button" class="demo-btn" onclick={() => toast.error(PAYLOAD)}>
        Mensaje con etiquetas
      </button>
      <button type="button" class="demo-btn" onclick={() => toast.error(LONG)}>
        Mensaje largo de la base de datos
      </button>
    </div>
    <p class="kit__note">
      Aun así, un error de la base de datos <strong>no</strong> es copia para el usuario: en las pantallas
      reales va texto humano en español (DESIGN-SYSTEM §5.3). Aquí se muestra sólo para probar el saneado
      y el ajuste de línea.
    </p>
  </section>

  <section class="kit__section" aria-labelledby="h-api">
    <h2 id="h-api">Desde código que no es un componente</h2>
    <p class="kit__note">
      El estado vive en un módulo con runes, así que un repositorio o una suscripción en tiempo real
      puede avisar sin pasar por un componente (S38). <code>&lt;ToastHost /&gt;</code> se monta una sola
      vez, dentro del envoltorio de la superficie.
    </p>
    <pre class="snippet"><code
        >{`import { toast } from '$lib/stores/toast.svelte';

toast.success('Guardado');
toast.error('No pudimos guardar los cambios.');
toast.info('Sincronizando…', { duration: 0 });
toast.undo('Álbum eliminado', { onAction: () => restore(id) });

const id = toast.info('Subiendo…', { duration: 0 });
toast.dismiss(id);`}</code
      ></pre>
  </section>
</main>

<ToastHost />

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

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--mg-sm);
    margin-top: var(--mg-sm);
  }

  /* A stand-in control: S14 owns the real Button. */
  .demo-btn {
    padding: var(--btn-pd-y) var(--btn-pd-x);
    border: 1.5px solid var(--color-dark);
    border-radius: var(--radius-full);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-size: var(--fs-btn);
    font-weight: var(--fw-semibold);
    cursor: pointer;
    transition: background-color 0.18s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .demo-btn--sm {
    padding: var(--pd-xs) var(--pd-sm);
    font-size: var(--fs-xs);
  }
  .demo-btn:hover:not(:disabled) {
    background: var(--status-neutral-bg);
  }
  .demo-btn:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .albums {
    list-style: none;
    margin: var(--mg-sm) 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--mg-xs);
  }
  .albums__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--mg-sm);
    padding: var(--pd-xs) var(--pd-sm);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-sm);
    font-size: var(--fs-sm);
  }
  .albums__row--empty {
    color: var(--color-muted);
    justify-content: flex-start;
  }

  .snippet {
    margin: var(--mg-sm) 0 0;
    padding: var(--pd-sm);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-sm);
    font-size: var(--fs-xs);
    overflow-x: auto;
  }

  @media (max-width: 640px) {
    .facts__row {
      grid-template-columns: 1fr;
      gap: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .demo-btn {
      transition: none;
    }
  }
</style>
