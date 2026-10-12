<script lang="ts">
  // /kit/rich-text/ — the S18 staging smoke page: the editor in every state, the
  // save→render round trip that proves D-005's two sanitizer passes, and the
  // "escríbelo y mira dónde queda el cursor" check a human has to do by hand.
  // Prerendered, no data fetching, noindex.
  import { onMount } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import RichText from '$lib/components/RichText.svelte';
  import RichTextEditor from '$lib/components/RichTextEditor.svelte';
  import { RICH_TEXT_TOOLS, type RichTextEditorApi } from '$lib/components/rich-text';
  import { prefersReducedMotion } from '$lib/reduced-motion';

  const SEED =
    '<p>Vacaciones Bíblicas <b>2026</b>: cinco días de historias, música y juegos.</p>' +
    '<ul><li>Del 14 al 18 de julio</li><li>De 9:00 a 12:00</li></ul>';

  // Split on purpose: a literal closing script tag would end THIS block.
  const CLOSE_SCRIPT = '</scr' + 'ipt>';

  const HOSTILE =
    '<p>Traer <b>agua</b></p><script>alert(1)' +
    CLOSE_SCRIPT +
    '<img src="x" onerror="alert(1)"><a href="javascript:alert(1)">clic</a>';

  const LEGACY_PLAIN = 'Escrito antes del editor.\nSegunda línea.\n\nY otro párrafo.';

  const LINK_SAMPLE = '<p>Enlace <a href="https://irdlex.org">de ejemplo</a></p>';

  let description = $state(SEED);
  let information = $state('');
  let editor: RichTextEditorApi | undefined = $state();
  let refState = $state('—');
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
  <title>Kit · Texto enriquecido</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<a class="skip-link" href="#kit-main">Saltar al contenido</a>

<main id="kit-main" class="kit" tabindex="-1">
  <header class="kit__head">
    <h1 class="kit__title">Texto enriquecido</h1>
    <p class="kit__lede">
      Página de prueba de S18. El editor limpia lo que entra <em>y</em> lo que sale: lo guardado
      pasa por la lista blanca al escribirlo y otra vez al pintarlo en la página pública. Escribe en
      medio de una palabra y comprueba que el cursor <strong>no salta</strong>.
    </p>
    <dl class="facts">
      <div class="facts__row">
        <dt>Comandos en la barra</dt>
        <dd>{RICH_TEXT_TOOLS.length} + color</dd>
      </div>
      <div class="facts__row">
        <dt>Valor guardado (saneado)</dt>
        <dd><code>{description || '(vacío)'}</code></dd>
      </div>
      <div class="facts__row">
        <dt>Última llamada a la API imperativa</dt>
        <dd>{refState}</dd>
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

  <section class="kit__section" aria-labelledby="h-round">
    <h2 id="h-round">Guardar y pintar — las dos pasadas</h2>
    <p class="kit__note">
      A la izquierda, lo que el administrador escribe. A la derecha, lo mismo tal y como sale en la
      página del evento. El valor viaja saneado y se vuelve a sanear al pintarlo.
    </p>
    <div class="pair">
      <RichTextEditor
        bind:value={description}
        bind:this={editor}
        label="Descripción"
        placeholder="De qué se trata el evento..."
        hint="Se muestra en la página pública del evento."
      />
      <div class="preview">
        <p class="preview__tag">página pública</p>
        <RichText value={description} />
      </div>
    </div>
    <div class="bar">
      <Button
        variant="ghost"
        size="sm"
        icon="rotate-left"
        onclick={() => {
          editor?.setHtml(SEED);
          refState = 'setHtml(SEED)';
        }}>Restaurar ejemplo</Button
      >
      <Button
        variant="ghost"
        size="sm"
        icon="skull-crossbones"
        onclick={() => {
          editor?.setHtml(HOSTILE);
          refState = 'setHtml(HOSTILE)';
        }}>Cargar HTML hostil</Button
      >
      <Button
        variant="ghost"
        size="sm"
        icon="eraser"
        onclick={() => {
          editor?.setHtml('');
          refState = 'setHtml("")';
        }}>Vaciar</Button
      >
      <Button
        variant="ghost"
        size="sm"
        icon="circle-question"
        onclick={() => (refState = `isEmpty() → ${editor?.isEmpty()}`)}>¿Está vacío?</Button
      >
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-empty">
    <h2 id="h-empty">Vacío y sólo lectura</h2>
    <div class="pair">
      <RichTextEditor
        bind:value={information}
        label="Información"
        placeholder="Detalles logísticos: qué traer, horarios, edades, etc."
      />
      <RichTextEditor
        value={SEED}
        label="Información (bloqueada)"
        hint="Un preset fija el texto: se ve, no se toca."
        disabled
      />
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-render">
    <h2 id="h-render">Sólo pintado</h2>
    <p class="kit__note">
      Lo que sea que haya en la base de datos, se pinta inerte. Las filas antiguas guardaban texto
      plano con saltos de línea y siguen leyéndose como párrafos.
    </p>
    <div class="pair">
      <div class="preview">
        <p class="preview__tag">fila hostil</p>
        <RichText value={HOSTILE} />
      </div>
      <div class="preview">
        <p class="preview__tag">fila anterior al editor</p>
        <RichText value={LEGACY_PLAIN} />
      </div>
    </div>
    <div class="preview preview--empty">
      <p class="preview__tag">fila vacía</p>
      <RichText value="" />
      <p class="kit__note">Sin contenido no se pinta ningún contenedor — ni un hueco.</p>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-surface">
    <h2 id="h-surface">Superficie pública vs. admin</h2>
    <div class="compare">
      <div class="compare__col">
        <p class="compare__tag">público</p>
        <RichTextEditor value={LINK_SAMPLE} label="Descripción" />
      </div>
      <div class="compare__col" data-surface="admin">
        <p class="compare__tag">admin</p>
        <RichTextEditor value={LINK_SAMPLE} label="Descripción" />
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
    overflow-wrap: anywhere;
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
    min-width: 0;
  }

  .pair {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
    gap: var(--mg-sm);
    align-items: start;
  }

  .preview {
    padding: var(--pd-sm);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-sm);
    font-size: var(--fs-sm);
  }
  .preview--empty {
    margin-top: var(--mg-sm);
  }
  .preview__tag,
  .compare__tag {
    margin: 0 0 var(--mg-xs);
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-muted);
  }

  .bar {
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
