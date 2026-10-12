<script lang="ts">
  // /kit/lightbox/ — the S20 staging smoke page. Opens the viewer over a few
  // static placeholder images from static/kit/lightbox/ so every behaviour can
  // be exercised by hand: keys, swipe, full screen, share, download, the
  // one-photo edge case, a missing caption, a very long caption, and the
  // scroll lock (the page below is deliberately tall). Prerendered, noindex,
  // no data fetching.
  import { base } from '$app/paths';
  import Lightbox from '$lib/components/Lightbox.svelte';
  import ToastHost from '$lib/components/ToastHost.svelte';
  import { prefersReducedMotion } from '$lib/reduced-motion';
  import { lightbox, openLightbox, type LightboxPhoto } from '$lib/stores/lightbox.svelte';

  const photo = (file: string, width: number, height: number, caption: string | null) => ({
    public_url: `${base}/kit/lightbox/${file}`,
    thumbnail_url: `${base}/kit/lightbox/${file}`,
    caption,
    width,
    height,
  });

  const ALBUM: LightboxPhoto[] = [
    photo('foto-1.svg', 1200, 800, 'Retiro de jóvenes · apertura del sábado'),
    photo('foto-2.svg', 800, 1200, 'Bautismos de verano'),
    photo('foto-3.svg', 1000, 1000, null),
    photo(
      'foto-4.svg',
      1400,
      700,
      'Salida misionera a la comunidad: entrega de despensas, oración por las familias y ' +
        'una comida compartida al final de la tarde — un pie de foto largo para comprobar ' +
        'que la barra no desborda ni provoca desplazamiento horizontal.',
    ),
  ];

  const SINGLE: LightboxPhoto[] = [ALBUM[2]];
</script>

<svelte:head>
  <title>Kit · Lightbox</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<a class="skip-link" href="#kit-main">Saltar al contenido</a>

<main id="kit-main" class="kit" tabindex="-1">
  <header class="kit__head">
    <h1 class="kit__title">Visor de fotos (lightbox)</h1>
    <p class="kit__lede">
      Página de prueba de S20: un visor a pantalla completa con estado propio (<code
        >openLightbox(fotos, i)</code
      >) y un solo componente que lo pinta. Sustituye al bloque de marcado con once <code>id</code>
      globales de <code>galeria/album/</code>.
    </p>
    <dl class="facts">
      <div class="facts__row">
        <dt>Visor</dt>
        <dd>{lightbox.isOpen ? 'abierto' : 'cerrado'}</dd>
      </div>
      <div class="facts__row">
        <dt>Foto actual</dt>
        <dd>{lightbox.isOpen ? `${lightbox.index + 1} de ${lightbox.count}` : '—'}</dd>
      </div>
      <div class="facts__row">
        <dt>Descarga en curso</dt>
        <dd>{lightbox.downloading ? 'sí' : 'no'}</dd>
      </div>
      <div class="facts__row">
        <dt>Movimiento reducido</dt>
        <dd>{prefersReducedMotion.current ? 'activado (sin animación)' : 'no solicitado'}</dd>
      </div>
    </dl>
  </header>

  <section class="kit__section" aria-labelledby="h-album">
    <h2 id="h-album">Álbum de prueba</h2>
    <p class="kit__note">
      Pulsa una miniatura para abrir el visor en esa foto. Las miniaturas son botones reales, así
      que el foco vuelve a la que abriste al cerrar.
    </p>
    <ul class="grid">
      {#each ALBUM as item, i (item.public_url)}
        <li>
          <button type="button" class="tile" onclick={() => openLightbox(ALBUM, i)}>
            <img
              class="tile__img"
              src={item.thumbnail_url}
              alt={item.caption ?? `Foto ${i + 1} de ${ALBUM.length}`}
              width={item.width}
              height={item.height}
              loading="lazy"
              decoding="async"
            />
            <span class="tile__label">{item.caption ? 'Con pie de foto' : 'Sin pie de foto'}</span>
          </button>
        </li>
      {/each}
    </ul>
  </section>

  <section class="kit__section" aria-labelledby="h-states">
    <h2 id="h-states">Casos límite</h2>
    <p class="kit__note">
      Con una sola foto las flechas quedan deshabilitadas y las teclas ← → no hacen nada (igual que
      en el sitio actual). Un índice fuera de rango se ajusta al extremo más cercano, y una lista
      vacía no abre nada.
    </p>
    <div class="row">
      <button type="button" class="demo-btn" onclick={() => openLightbox(SINGLE)}>
        Álbum de una sola foto
      </button>
      <button type="button" class="demo-btn" onclick={() => openLightbox(ALBUM, 99)}>
        Índice fuera de rango (99)
      </button>
      <button type="button" class="demo-btn" onclick={() => openLightbox([])}>
        Lista vacía (no abre)
      </button>
      <button type="button" class="demo-btn" onclick={() => openLightbox(ALBUM, 2)}>
        Abrir en la foto sin pie
      </button>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-keys">
    <h2 id="h-keys">Teclado, gestos y acciones</h2>
    <ul class="keys">
      <li><kbd>←</kbd> / <kbd>→</kbd> foto anterior / siguiente (dan la vuelta al final)</li>
      <li><kbd>Esc</kbd> cierra y devuelve el foco a la miniatura</li>
      <li><kbd>F</kbd> o el botón de expandir: pantalla completa del navegador</li>
      <li><kbd>Tab</kbd> se queda dentro del visor mientras está abierto</li>
      <li>Deslizar a los lados cambia de foto; deslizar hacia abajo cierra</li>
      <li>Tocar fuera de la foto cierra</li>
      <li>
        <strong>Compartir</strong> usa la API del sistema; si no existe, copia el enlace y avisa
      </li>
      <li>
        <strong>Descargar</strong> baja el archivo de verdad (<code>fetch</code> →
        <code>blob</code>), no abre la imagen en otra pestaña
      </li>
    </ul>
    <p class="kit__note">
      Mientras el visor está abierto la página de debajo no se desplaza, y al cerrar recupera el
      valor de <code>overflow</code> que tuviera antes (el bloqueo lleva cuenta de referencias, así que
      un diálogo encima no lo suelta antes de tiempo).
    </p>
  </section>

  <section class="kit__section" aria-labelledby="h-api">
    <h2 id="h-api">Desde código que no es un componente</h2>
    <pre class="snippet"><code
        >{`import { openLightbox } from '$lib/stores/lightbox.svelte';
import Lightbox from '$lib/components/Lightbox.svelte';

// una sola vez en la ruta:
<Lightbox />

// desde la cuadrícula del álbum:
openLightbox(photos, i);`}</code
      ></pre>
  </section>

  <section class="kit__section kit__section--tall" aria-labelledby="h-scroll">
    <h2 id="h-scroll">Espacio para comprobar el bloqueo de desplazamiento</h2>
    <p class="kit__note">
      Desplázate hasta aquí, abre el visor y comprueba que la página de detrás no se mueve; al
      cerrar, el foco y la posición siguen donde estaban.
    </p>
  </section>
</main>

<Lightbox />
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
  .kit__section--tall {
    min-height: 90vh;
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
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--mg-sm);
    margin: var(--mg-sm) 0 0;
    padding: 0;
  }

  /* A stand-in for the real gallery tile (S29 owns that); it only has to be a
     focusable control that calls openLightbox. */
  .tile {
    display: block;
    width: 100%;
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-sm);
    overflow: hidden;
    text-align: start;
    transition: box-shadow 0.18s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .tile:hover {
    box-shadow: var(--shadow-md);
  }
  .tile__img {
    width: 100%;
    height: 9rem;
    object-fit: cover;
  }
  .tile__label {
    display: block;
    padding: var(--pd-xs) var(--pd-sm);
    color: var(--color-muted);
    font-size: var(--fs-xs);
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
  .demo-btn:hover {
    background: var(--status-neutral-bg);
  }

  .keys {
    margin: var(--mg-sm) 0 0;
    padding-inline-start: 1.25rem;
    font-size: var(--fs-sm);
  }
  .keys li {
    margin-block: var(--mg-xxs);
  }
  kbd {
    padding: 0 0.35em;
    border: 1.5px solid var(--gray-40);
    border-radius: var(--radius-xs);
    background: var(--color-surface);
    font-family: var(--font-Geist);
    font-size: 0.85em;
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
    .demo-btn,
    .tile {
      transition: none;
    }
  }
</style>
