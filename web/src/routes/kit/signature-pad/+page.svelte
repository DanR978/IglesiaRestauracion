<script lang="ts">
  // /kit/signature-pad/ — the S19 staging smoke page: every SignaturePad
  // variant and state (framed / bare · empty / inked / disabled · with and
  // without the built-in clear button), the exposed controller methods driven
  // from outside the component, the hi-DPI backing store, and the trimmed
  // export with its size cap. Prerendered, no data fetching, noindex.
  import { onMount } from 'svelte';
  import SignaturePad from '$lib/components/SignaturePad.svelte';
  import { dataUrlByteLength, SIGNATURE_MAX_BYTES, SIGNATURE_PAD_HEIGHT } from '$lib/signature-pad';

  let framed = $state('');
  let bare = $state('');
  let short = $state('');
  let framedPad: SignaturePad | undefined = $state();
  let barePad: SignaturePad | undefined = $state();
  let viewport = $state(0);
  let dpr = $state(0);
  let backingStore = $state('…');
  let loadReport = $state('');
  let apiReport = $state('');

  const framedBytes = $derived(dataUrlByteLength(framed));
  const capKb = Math.round(SIGNATURE_MAX_BYTES / 1024);

  function measure() {
    viewport = window.innerWidth;
    dpr = window.devicePixelRatio || 1;
    const canvas = document.querySelector<HTMLCanvasElement>('#kit-framed canvas');
    backingStore = canvas
      ? `${canvas.width}×${canvas.height} px para ${Math.round(canvas.clientWidth)}×${SIGNATURE_PAD_HEIGHT} css`
      : 'sin medir';
  }

  // Demonstrates the imperative side: loadDataURL() paints AND adopts the value.
  async function copyToBare() {
    if (!framed) {
      loadReport = 'Firma primero en el recuadro de arriba.';
      return;
    }
    const ok = await barePad?.loadDataURL(framed);
    loadReport = ok ? 'Copiada al recuadro sin marco.' : 'No se pudo cargar.';
  }

  onMount(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });
</script>

<svelte:head>
  <title>Kit · SignaturePad</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<a class="skip-link" href="#kit-main">Saltar al contenido</a>

<main id="kit-main" class="kit" tabindex="-1">
  <header class="kit__head">
    <h1 class="kit__title">Firma</h1>
    <p class="kit__lede">
      Página de prueba de S19: <code>SignaturePad</code> envuelve el controlador de lienzo portado. Dibuja
      con el dedo, el ratón o un lápiz; el lienzo se genera a la resolución real de la pantalla y la firma
      se exporta recortada a su contenido. El papel es siempre claro —en modo oscuro también—, porque
      la tinta se imprime tal cual en el PDF de la exoneración.
    </p>
    <dl class="facts">
      <div class="facts__row">
        <dt>Densidad de pantalla</dt>
        <dd>{dpr ? `${dpr}×` : '…'}</dd>
      </div>
      <div class="facts__row">
        <dt>Lienzo del primer recuadro</dt>
        <dd>{backingStore}</dd>
      </div>
      <div class="facts__row">
        <dt>Tamaño de la firma exportada</dt>
        <dd>
          {framed ? `${framedBytes.toLocaleString('es-MX')} bytes` : 'sin firma'} · tope {capKb} kB
        </dd>
      </div>
      <div class="facts__row">
        <dt>Ancho de ventana</dt>
        <dd>{viewport ? `${viewport}px` : '…'}</dd>
      </div>
    </dl>
  </header>

  <section class="kit__section" aria-labelledby="h-framed">
    <h2 id="h-framed">Con marco — <code>variant="framed"</code> (predeterminado)</h2>
    <p class="kit__note">
      El recuadro estándar: papel, línea de firma y botón «Borrar firma» propio. Es el que usa la
      página de cuenta.
    </p>
    <div id="kit-framed" class="pad">
      <SignaturePad bind:this={framedPad} bind:value={framed} />
    </div>
    <p id="kit-framed-state" class="kit__note">
      <strong>Estado:</strong>
      {framed ? 'firmada' : 'vacía'} · <code>toDataURL()</code> devuelve
      {framed ? `${framedBytes.toLocaleString('es-MX')} bytes` : 'una cadena vacía'}.
    </p>
    {#if framed}
      <figure class="preview">
        <img src={framed} alt="Vista previa de la firma capturada" />
        <figcaption>PNG transparente recortado a su contenido.</figcaption>
      </figure>
    {/if}
  </section>

  <section class="kit__section" aria-labelledby="h-bare">
    <h2 id="h-bare">Sin marco — <code>variant="bare"</code></h2>
    <p class="kit__note">
      Sin fondo ni borde: el documento pone la línea. Así se monta sobre la exoneración, con una
      altura de 64&nbsp;px, sin texto de ayuda y sin el botón de borrar propio —ese lo pone el
      formulario.
    </p>
    <div class="doc">
      <p class="doc__ack">
        Declaro haber leído y aceptado los términos de esta exoneración de responsabilidad.
      </p>
      <div class="doc__line">
        <SignaturePad
          bind:this={barePad}
          bind:value={bare}
          variant="bare"
          height={64}
          description=""
          clearable={false}
          hint="Firma del padre / tutor"
          label="Firma del padre o tutor"
        />
      </div>
      <p class="doc__label">Firma del padre / tutor</p>
    </div>
    <div class="row">
      <button type="button" class="ctl" onclick={copyToBare}>Copiar la firma de arriba</button>
      <button type="button" class="ctl" onclick={() => (bare = '')}>Borrar</button>
      <span id="kit-bare-report" class="kit__note">{loadReport}</span>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-api">
    <h2 id="h-api">Métodos expuestos</h2>
    <p class="kit__note">
      Con <code>bind:this</code> el anfitrión llama <code>clear()</code>,
      <code>isEmpty()</code>, <code>toDataURL()</code>, <code>loadDataURL()</code> y
      <code>resize()</code>. También hay <code>bind:value</code> para el flujo normal de formulario.
    </p>
    <div class="row">
      <button type="button" class="ctl" onclick={() => framedPad?.clear()}>clear()</button>
      <button type="button" class="ctl" onclick={() => (apiReport = String(framedPad?.isEmpty()))}>
        isEmpty()
      </button>
      <button
        type="button"
        class="ctl"
        onclick={() => (apiReport = `${dataUrlByteLength(framedPad?.toDataURL() ?? '')} bytes`)}
      >
        toDataURL()
      </button>
      <button type="button" class="ctl" onclick={() => framedPad?.resize()}>resize()</button>
      <output id="kit-api-out" class="kit__note">{apiReport}</output>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-states">
    <h2 id="h-states">Otros estados</h2>
    <div class="pair">
      <div class="card">
        <h3>Baja — 64&nbsp;px de alto</h3>
        <SignaturePad bind:value={short} height={64} description="" />
      </div>
      <div class="card">
        <h3>Deshabilitada — <code>disabled</code></h3>
        <SignaturePad
          disabled
          height={64}
          description="No se puede firmar hasta aceptar los términos."
        />
      </div>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-admin">
    <h2 id="h-admin">Superficie admin</h2>
    <p class="kit__note">
      El mismo componente dentro de <code>[data-surface="admin"]</code>: el papel no cambia (la
      tinta es fija), pero los controles alrededor toman la paleta pizarra.
    </p>
    <div class="card" data-surface="admin">
      <SignaturePad height={110} description="Firma del tesorero para el corte del mes." />
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

  .pad {
    max-width: 34rem;
  }

  .preview {
    margin: var(--mg-sm) 0 0;
  }
  .preview img {
    max-width: 100%;
    /* The exported PNG is transparent — show it on the paper it prints on. */
    background: var(--static-white);
    border: 1.5px solid var(--gray-50);
    border-radius: var(--radius-sm);
  }
  .preview figcaption {
    margin-top: var(--mg-xxs);
    color: var(--color-muted);
    font-size: var(--fs-xs);
  }

  /* A stand-in for the waiver document: permanently light paper, dark ink. */
  .doc {
    max-width: 34rem;
    padding: var(--pd-sm);
    border-radius: var(--radius-md);
    background: var(--static-white);
    box-shadow: var(--shadow-sm);
    color: var(--color-dark);
  }
  .doc__ack {
    margin: 0 0 var(--mg-md);
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
  }
  .doc__line {
    border-bottom: 1px solid var(--gray-90);
  }
  .doc__label {
    margin: var(--mg-xxs) 0 0;
    font-size: var(--fs-xxs);
    text-transform: uppercase;
    letter-spacing: 0.02em;
    opacity: 0.65;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--mg-sm);
    margin-top: var(--mg-sm);
  }

  .ctl {
    min-height: 44px;
    padding: var(--btn-pd-y) var(--btn-pd-x);
    border: 1.5px solid var(--gray-50);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-muted);
    font: inherit;
    font-size: var(--fs-sm);
    cursor: pointer;
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

  @media (max-width: 640px) {
    .pair {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 480px) {
    .facts__row {
      grid-template-columns: 1fr;
    }
  }
</style>
