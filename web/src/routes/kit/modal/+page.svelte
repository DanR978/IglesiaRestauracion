<script lang="ts">
  // /kit/modal/ — the S16 staging smoke page: every Modal variant, every close
  // path, the reference-counted scroll lock, focus return, a confirm stacked on
  // top of an open modal, and both palettes. Prerendered, no data fetching,
  // noindex.
  import { onMount } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import ConfirmHost from '$lib/components/ConfirmHost.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import { MODAL_VARIANTS, type ModalVariant } from '$lib/components/modal';
  import { prefersReducedMotion } from '$lib/reduced-motion';
  import { FLOATING_POPUP_CLASS, bodyScrollLockDepth } from '$lib/scroll-lock';
  import { confirm } from '$lib/stores/confirm.svelte';

  const VARIANT_ROLE: Record<ModalVariant, string> = {
    standard: 'formularios y paneles de detalle (~500px)',
    wide: 'tablas y herramientas del diseñador (~760px)',
    confirm: 'la pregunta de ConfirmDialog (~360px, se apila encima)',
    tool: 'paletas de propiedades y capas (~420px)',
  };

  let openVariant = $state<ModalVariant | null>(null);
  let openLocked = $state(false);
  let openError = $state(false);
  let openLong = $state(false);
  let openCustomHeader = $state(false);
  let openAdmin = $state(false);
  let openStack = $state(false);

  let formError = $state<string | null>(null);
  let lastAnswer = $state('—');
  let viewport = $state(0);

  // Live readouts of state that lives on <body>, not in this component.
  let lockDepth = $state(0);
  let bodyOverflow = $state('');
  let floatingFaded = $state(false);

  function sample() {
    lockDepth = bodyScrollLockDepth();
    bodyOverflow = document.body.style.overflow || '(sin valor)';
    floatingFaded = document.body.classList.contains(FLOATING_POPUP_CLASS);
    viewport = window.innerWidth;
  }

  // A plain function, not an event handler: this is how a repo module or a
  // realtime handler calls it (S38).
  async function askToDelete(): Promise<void> {
    const ok = await confirm(
      '¿Eliminar la inscripción?',
      'Se borrarán también los acompañantes registrados con ella. Esta acción no se puede deshacer.',
    );
    lastAnswer = ok ? 'true (Sí, continuar)' : 'false (No / × / Escape / fondo)';
    if (ok) openStack = false;
  }

  async function askToDiscard(): Promise<void> {
    const ok = await confirm('¿Descartar los cambios?', 'Volverás al listado sin guardar.', {
      danger: false,
      confirmLabel: 'Sí, descartar',
      cancelLabel: 'Seguir editando',
    });
    lastAnswer = ok ? 'true (Sí, descartar)' : 'false (Seguir editando)';
  }

  function submitWithError() {
    formError = 'No pudimos guardar los cambios. Revisa la conexión e intenta de nuevo.';
  }

  onMount(() => {
    sample();
    const poll = setInterval(sample, 250);
    window.addEventListener('resize', sample);
    return () => {
      clearInterval(poll);
      window.removeEventListener('resize', sample);
    };
  });
</script>

<svelte:head>
  <title>Kit · Modal</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<a class="skip-link" href="#kit-main">Saltar al contenido</a>

<main id="kit-main" class="kit" tabindex="-1">
  <header class="kit__head">
    <h1 class="kit__title">Modales y confirmación</h1>
    <p class="kit__lede">
      Página de prueba de S16: un solo <code>Modal</code> reemplaza los tres sistemas heredados, y
      <code>await confirm(…)</code> es una promesa que se puede pedir desde código que no es un componente.
      Escape y el fondo cierran, el bloqueo de scroll se cuenta (no se pisa), y el foco entra al abrir
      y vuelve al botón que lo abrió.
    </p>
    <dl class="facts">
      <div class="facts__row">
        <dt>Capas que bloquean el scroll</dt>
        <dd>{lockDepth}</dd>
      </div>
      <div class="facts__row">
        <dt><code>body.style.overflow</code></dt>
        <dd>{bodyOverflow}</dd>
      </div>
      <div class="facts__row">
        <dt><code>body.has-floating-popup</code></dt>
        <dd>{floatingFaded ? 'sí (FAB y barra móvil atenuados)' : 'no'}</dd>
      </div>
      <div class="facts__row">
        <dt>Última respuesta de <code>confirm()</code></dt>
        <dd>{lastAnswer}</dd>
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
    <div class="row">
      {#each MODAL_VARIANTS as variant (variant)}
        <Button variant="ghost" onclick={() => (openVariant = variant)}>{variant}</Button>
      {/each}
    </div>
    <ul class="legend">
      {#each MODAL_VARIANTS as variant (variant)}
        <li><code>{variant}</code> — {VARIANT_ROLE[variant]}</li>
      {/each}
    </ul>
  </section>

  <section class="kit__section" aria-labelledby="h-close">
    <h2 id="h-close">Formas de cerrar</h2>
    <p class="kit__note">
      Por defecto cierran Escape, un clic en el fondo y el botón <strong>Cerrar</strong>. El segundo
      modal las desactiva las dos primeras: es el patrón para un formulario con cambios sin guardar,
      donde salir tiene que ser deliberado.
    </p>
    <div class="row">
      <Button onclick={() => (openVariant = 'standard')}>Modal normal</Button>
      <Button variant="ghost" onclick={() => (openLocked = true)}>Sin Escape ni fondo</Button>
      <Button variant="ghost" onclick={() => ((formError = null), (openError = true))}>
        Con región de error
      </Button>
      <Button variant="ghost" onclick={() => (openLong = true)}>Cuerpo largo (scroll)</Button>
      <Button variant="ghost" onclick={() => (openCustomHeader = true)}>Encabezado propio</Button>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-confirm">
    <h2 id="h-confirm">ConfirmDialog</h2>
    <p class="kit__note">
      <code>await confirm(título, mensaje, opciones)</code> devuelve <code>true</code> solo con el botón
      afirmativo. El foco aterriza en el botón seguro, y el texto se pinta como texto — nunca como HTML.
    </p>
    <div class="row">
      <Button variant="danger" icon="trash" onclick={askToDelete}>Eliminar (peligro)</Button>
      <Button variant="ghost" onclick={askToDiscard}>Descartar (sin peligro)</Button>
      <Button
        variant="ghost"
        onclick={async () => {
          const ok = await confirm('<img src=x onerror="alert(1)">', 'El título llega como texto.');
          lastAnswer = String(ok);
        }}
      >
        Texto, no HTML
      </Button>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-stack">
    <h2 id="h-stack">Una confirmación encima de un modal abierto</h2>
    <p class="kit__note">
      Abre el panel y pulsa <strong>Eliminar</strong>: la confirmación se dibuja por encima, atrapa
      el foco para sí, y al cerrarse devuelve el foco y el bloqueo de scroll al panel de abajo — que
      sigue abierto. El contador de arriba pasa a <code>2</code> y vuelve a <code>1</code>.
    </p>
    <div class="row">
      <Button onclick={() => (openStack = true)}>Abrir inscripción</Button>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-surface">
    <h2 id="h-surface">Superficie pública vs. admin</h2>
    <p class="kit__note">
      El mismo componente. El modal del admin se declara dentro de
      <code>[data-surface="admin"]</code>, así que sus tokens heredan la paleta pizarra — nunca hay
      dos paletas escritas en el componente.
    </p>
    <div class="compare">
      <div class="compare__col">
        <p class="compare__tag">público</p>
        <Button variant="secondary" onclick={() => (openVariant = 'standard')}>Abrir</Button>
      </div>
      <div class="compare__col" data-surface="admin">
        <p class="compare__tag">admin</p>
        <Button variant="secondary" onclick={() => (openAdmin = true)}>Abrir</Button>

        <Modal bind:open={openAdmin} title="Nuevo ministerio" variant="standard">
          <p class="kit__note">
            Todo lo que pinte el admin tiene que ser descendiente del elemento con
            <code>data-surface="admin"</code>. Aquí el acento es pizarra.
          </p>
          {#snippet footer()}
            <Button variant="ghost" onclick={() => (openAdmin = false)}>Cancelar</Button>
            <Button variant="secondary" onclick={() => (openAdmin = false)}>Guardar</Button>
          {/snippet}
        </Modal>
      </div>
    </div>
  </section>
</main>

<!-- One host per app shell. S23 mounts it in the public chrome and S37 inside
     the (admin) layout's [data-surface="admin"] wrapper. -->
<ConfirmHost />

{#each MODAL_VARIANTS as variant (variant)}
  <Modal
    open={openVariant === variant}
    {variant}
    title="Modal {variant}"
    onclose={() => (openVariant = null)}
  >
    <p class="modal-copy">{VARIANT_ROLE[variant]}</p>
    <p class="modal-copy">
      Escape, un clic en el fondo o el botón Cerrar lo cierran. Al cerrarse, el foco vuelve al botón
      que lo abrió.
    </p>
    {#snippet footer()}
      <span class="ird-modal__spacer"></span>
      <Button variant="ghost" onclick={() => (openVariant = null)}>Cancelar</Button>
      <Button onclick={() => (openVariant = null)}>Entendido</Button>
    {/snippet}
  </Modal>
{/each}

<Modal
  bind:open={openLocked}
  title="Cambios sin guardar"
  closeOnEscape={false}
  closeOnBackdrop={false}
>
  <p class="modal-copy">
    Escape y el fondo están desactivados. Queda la × y los botones: salir tiene que ser una
    decisión.
  </p>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (openLocked = false)}>Descartar</Button>
    <Button onclick={() => (openLocked = false)}>Guardar</Button>
  {/snippet}
</Modal>

<Modal bind:open={openError} title="Editar evento" error={formError}>
  <div class="field">
    <label class="field__label" for="kit-modal-name">Nombre del evento</label>
    <input class="field__input" id="kit-modal-name" value="Escuela Bíblica de Vacaciones" />
  </div>
  <p class="modal-copy">
    El mensaje de error vive en una región <code>role="alert"</code>: se anuncia sin mover el foco.
    Es copia en español, nunca la cadena que devolvió la base de datos.
  </p>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (openError = false)}>Cancelar</Button>
    <Button onclick={submitWithError}>Guardar</Button>
  {/snippet}
</Modal>

<Modal bind:open={openLong} title="Política de inscripción" variant="wide">
  <div class="long">
    {#each Array.from({ length: 14 }, (_, i) => i + 1) as n (n)}
      <p class="modal-copy">
        Párrafo {n}. Solo el cuerpo se desplaza: el encabezado y la fila de acciones se quedan
        quietos, así que Guardar sigue alcanzable en un formulario largo.
      </p>
    {/each}
  </div>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (openLong = false)}>Cerrar</Button>
  {/snippet}
</Modal>

<Modal bind:open={openCustomHeader} ariaLabel="Diseño del cartel" variant="tool">
  {#snippet header()}
    <div class="tool-head">
      <span class="tool-head__kicker">Diseñador</span>
      <span class="tool-head__title">Propiedades</span>
    </div>
  {/snippet}
  <p class="modal-copy">
    Con un encabezado propio, el nombre accesible viene de <code>ariaLabel</code>: el diálogo nunca
    se queda sin nombre.
  </p>
  {#snippet footer()}
    <Button variant="ghost" size="sm" onclick={() => (openCustomHeader = false)}>Cerrar</Button>
  {/snippet}
</Modal>

<Modal bind:open={openStack} title="Inscripción · Ana Pérez" variant="wide">
  <p class="modal-copy">
    Grupo de 3 personas · EBV 2026 · pagado. Pulsa Eliminar para levantar la confirmación por encima
    de este panel.
  </p>
  {#snippet footer()}
    <Button variant="danger" icon="trash" onclick={askToDelete}>Eliminar</Button>
    <span class="ird-modal__spacer"></span>
    <Button variant="ghost" onclick={() => (openStack = false)}>Cerrar</Button>
  {/snippet}
</Modal>

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
    grid-template-columns: 18rem 1fr;
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

  .modal-copy {
    margin: 0 0 var(--mg-sm);
    color: var(--color-muted);
    font-size: var(--fs-sm);
    line-height: 1.55;
  }
  .long {
    max-height: 40vh;
  }

  .field {
    margin-bottom: var(--mg-sm);
  }
  .field__label {
    display: block;
    margin-bottom: var(--mg-xxs);
    font-size: var(--fs-xs);
    font-weight: var(--fw-semibold);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-muted);
  }
  .field__input {
    width: 100%;
    padding: var(--pd-xs) var(--pd-sm);
    border: 1px solid rgba(127, 127, 127, 0.25);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
  }

  .tool-head {
    display: flex;
    flex-direction: column;
  }
  .tool-head__kicker {
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-muted);
  }
  .tool-head__title {
    font-size: var(--fs-md);
    font-weight: var(--fw-bold);
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
