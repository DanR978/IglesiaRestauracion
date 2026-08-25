<!--
  Lightbox — the full-screen photo viewer (S20, DESIGN-SYSTEM §4.2).
  Mount it ONCE on a route that opens photos; it renders nothing until
  openLightbox(photos, i) is called, and it holds no photo state of its own —
  everything lives in $lib/stores/lightbox.svelte.

  Retires the id-coupled overlay in galeria/album/index.html (#lightbox,
  #lbImg, #lbPrev, #lbCounter, …) and its document-wide click bindings.

  Behaviours ported from js/components/lightbox.js: ← / → / Escape (plus F for
  full screen), horizontal swipe to change photo and swipe-down to close,
  backdrop click, share, download, the Fullscreen API, and neighbour
  preloading. Added here: a focus trap with focus returned to whatever opened
  the viewer, a reference-counted scroll lock, and a full-screen button that
  reflects the actual state.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { lockBodyScroll } from '$lib/scroll-lock';
  import {
    lightbox,
    photoAlt,
    photoSrc,
    SWIPE_CLOSE_PX,
    SWIPE_NEXT_PX,
  } from '$lib/stores/lightbox.svelte';

  // Every clause carries both exclusions: the backdrop is a <button> that is
  // deliberately out of the tab order, so a plain `button:not([disabled])`
  // would let the trap wrap focus onto an invisible control.
  const FOCUSABLE = ['a[href]', 'button', 'input', 'select', 'textarea', '[tabindex]']
    .map((selector) => `${selector}:not([disabled]):not([tabindex="-1"])`)
    .join(', ');

  let dialogEl = $state<HTMLDivElement | null>(null);
  let fullscreen = $state(false);

  let touchX = 0;
  let touchY = 0;
  let swiping = false;

  const photo = $derived(lightbox.current);
  const src = $derived(photo ? photoSrc(photo) : '');
  const alt = $derived(photo ? photoAlt(photo, lightbox.index, lightbox.count) : '');
  const caption = $derived(photo?.caption?.trim() ?? '');
  const single = $derived(lightbox.count < 2);

  // Escape / arrows / F, the focus trap, the scroll lock, and the focus return.
  // One effect so every one of them is torn down on the same close.
  $effect(() => {
    if (!lightbox.isOpen) return;
    const release = lockBodyScroll();
    const restoreTo = document.activeElement as HTMLElement | null;

    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        trapFocus(event);
        return;
      }
      // Leave Ctrl/⌘/Alt combinations to the browser (⌘F is Find, not full screen).
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          lightbox.close();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          lightbox.prev();
          break;
        case 'ArrowRight':
          event.preventDefault();
          lightbox.next();
          break;
        case 'f':
        case 'F':
          event.preventDefault();
          void toggleFullscreen();
          break;
      }
    };

    const onFullscreenChange = () => {
      fullscreen = document.fullscreenElement === dialogEl;
    };

    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('keydown', onKeydown, true);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      if (document.fullscreenElement) void document.exitFullscreen?.();
      fullscreen = false;
      release();
      if (restoreTo?.isConnected) restoreTo.focus?.();
    };
  });

  // Focus lands in the dialog so the label is announced and the trap has an
  // anchor; the arrow keys work from there without hunting for a control.
  $effect(() => {
    if (!lightbox.isOpen) return;
    void tick().then(() => dialogEl?.focus());
  });

  // Preload the neighbours so ← / → paint immediately (legacy did the same).
  $effect(() => {
    if (!lightbox.isOpen || typeof Image === 'undefined') return;
    const count = lightbox.count;
    const at = lightbox.index;
    for (const offset of [1, -1]) {
      const neighbour = lightbox.photos[(at + offset + count) % count];
      const url = neighbour ? photoSrc(neighbour) : '';
      if (url && url !== src) new Image().src = url;
    }
  });

  function trapFocus(event: KeyboardEvent): void {
    if (!dialogEl) return;
    const items = [...dialogEl.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialogEl)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function toggleFullscreen(): Promise<void> {
    if (!dialogEl) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen?.();
      else if (typeof dialogEl.requestFullscreen === 'function')
        await dialogEl.requestFullscreen({ navigationUI: 'hide' });
    } catch (error) {
      // Denied by the browser (permission, an iframe without allowfullscreen).
      // Nothing is broken — the viewer just stays windowed.
      console.warn('[lightbox] fullscreen:', error);
    }
  }

  function onTouchStart(event: TouchEvent): void {
    if (event.touches.length !== 1) {
      swiping = false;
      return;
    }
    touchX = event.touches[0].clientX;
    touchY = event.touches[0].clientY;
    swiping = true;
  }

  function onTouchEnd(event: TouchEvent): void {
    if (!swiping) return;
    swiping = false;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - touchX;
    const dy = touch.clientY - touchY;
    // A horizontal gesture wins; only a clearly downward one closes.
    if (Math.abs(dx) > SWIPE_NEXT_PX && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) lightbox.next();
      else lightbox.prev();
    } else if (dy > SWIPE_CLOSE_PX && Math.abs(dy) > Math.abs(dx)) {
      lightbox.close();
    }
  }
</script>

{#if lightbox.isOpen && photo}
  <div
    class="lightbox"
    bind:this={dialogEl}
    role="dialog"
    aria-modal="true"
    aria-label="Visor de imagen"
    tabindex="-1"
    ontouchstart={onTouchStart}
    ontouchend={onTouchEnd}
  >
    <!-- A real button as the backdrop: click-to-close with an accessible name
         and no click handler on a non-interactive element. It is out of the
         tab order because the labelled Cerrar button is the keyboard route. -->
    <button
      type="button"
      class="lightbox__scrim"
      aria-label="Cerrar"
      tabindex="-1"
      onclick={lightbox.close}
    ></button>

    <button type="button" class="lightbox__close" aria-label="Cerrar" onclick={lightbox.close}>
      <Icon name="xmark" />
    </button>

    <button
      type="button"
      class="lightbox__nav lightbox__nav--prev"
      aria-label="Foto anterior"
      disabled={single}
      onclick={lightbox.prev}
    >
      <Icon name="chevron-left" />
    </button>

    <button
      type="button"
      class="lightbox__nav lightbox__nav--next"
      aria-label="Foto siguiente"
      disabled={single}
      onclick={lightbox.next}
    >
      <Icon name="chevron-right" />
    </button>

    <div class="lightbox__stage">
      <img
        class="lightbox__img"
        src={src || undefined}
        {alt}
        width={photo.width ?? undefined}
        height={photo.height ?? undefined}
        decoding="async"
      />
    </div>

    <div class="lightbox__bar">
      <p class="lightbox__counter">{lightbox.index + 1} / {lightbox.count}</p>
      <p class="lightbox__caption">{caption}</p>

      <div class="lightbox__actions">
        <button
          type="button"
          class="lightbox__btn"
          aria-label="Compartir la foto"
          onclick={lightbox.share}
        >
          <Icon name="share-nodes" />
        </button>

        <button
          type="button"
          class="lightbox__btn"
          aria-label="Descargar la foto"
          aria-busy={lightbox.downloading}
          disabled={lightbox.downloading}
          onclick={lightbox.download}
        >
          <Icon name={lightbox.downloading ? 'spinner' : 'download'} spin={lightbox.downloading} />
        </button>

        <button
          type="button"
          class="lightbox__btn"
          aria-label={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          onclick={toggleFullscreen}
        >
          <Icon name={fullscreen ? 'compress' : 'expand'} />
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* A photo viewer is a fixed-dark surface in BOTH themes, so its ink is
     --static-white and its scrim --static-black — never --color-surface /
     --color-text, which reverse (CLAUDE.md §4 surface-vs-ink). */
  .lightbox {
    position: fixed;
    inset: 0;
    z-index: var(--z-lightbox);
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--static-black) 92%, transparent);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    /* Keeps a rubber-band scroll inside the overlay instead of the page under
       it — the half of the scroll lock that overflow:hidden cannot do on iOS. */
    overscroll-behavior: contain;
    animation: lightbox-in 0.25s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .lightbox:focus-visible {
    outline: none;
  }

  .lightbox__scrim {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    background: transparent;
    cursor: zoom-out;
  }

  .lightbox__close,
  .lightbox__nav,
  .lightbox__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-full);
    background: color-mix(in srgb, var(--static-white) 12%, transparent);
    color: var(--static-white);
    font: inherit;
    transition: background-color 0.15s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .lightbox__close:hover:not(:disabled),
  .lightbox__nav:hover:not(:disabled),
  .lightbox__btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--static-white) 24%, transparent);
  }

  /* The global ring is --color-focus (dark ink) — invisible on this scrim, so
     it is restated in the ink the viewer actually uses. */
  .lightbox__close:focus-visible,
  .lightbox__nav:focus-visible,
  .lightbox__btn:focus-visible {
    outline: 2px solid var(--static-white);
    outline-offset: 2px;
  }

  .lightbox__close:disabled,
  .lightbox__nav:disabled,
  .lightbox__btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .lightbox__close {
    position: absolute;
    inset-block-start: 1rem;
    inset-inline-end: 1rem;
    z-index: 2;
    width: 2.75rem;
    height: 2.75rem;
    font-size: var(--fs-md);
  }

  .lightbox__nav {
    position: absolute;
    inset-block-start: 50%;
    z-index: 2;
    width: 3.125rem;
    height: 3.125rem;
    transform: translateY(-50%);
    font-size: var(--fs-lg);
  }

  .lightbox__nav--prev {
    inset-inline-start: 1rem;
  }

  .lightbox__nav--next {
    inset-inline-end: 1rem;
  }

  /* The stage is click-through so the space AROUND the photo closes the viewer
     (the scrim is underneath); only the photo itself swallows the click. */
  .lightbox__stage {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    max-width: 92vw;
    max-height: calc(100vh - 7.5rem);
    max-height: calc(100dvh - 7.5rem);
    pointer-events: none;
  }

  .lightbox__img {
    pointer-events: auto;
    width: auto;
    height: auto;
    max-width: 92vw;
    max-height: calc(100vh - 7.5rem);
    max-height: calc(100dvh - 7.5rem);
    object-fit: contain;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    animation: lightbox-zoom 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .lightbox__bar {
    position: absolute;
    inset-inline: 0;
    inset-block-end: 0;
    z-index: 2;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--mg-sm);
    padding: var(--pd-sm) var(--pd-sm) calc(var(--pd-sm) + env(safe-area-inset-bottom));
    background: linear-gradient(
      to top,
      color-mix(in srgb, var(--static-black) 70%, transparent),
      transparent
    );
    color: var(--static-white);
    font-family: var(--font-Geist);
    font-size: var(--fs-xs);
  }

  .lightbox__counter {
    margin: 0;
    font-weight: var(--fw-semibold);
    letter-spacing: 0.08em;
    font-variant-numeric: tabular-nums;
  }

  /* The legacy hid the caption below 540px. It is content, not chrome: it wraps
     onto its own row instead, capped at two lines. */
  .lightbox__caption {
    flex: 1 1 12rem;
    min-width: 0;
    margin: 0;
    text-align: center;
    font-size: var(--fs-sm);
    opacity: 0.85;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }

  .lightbox__actions {
    display: inline-flex;
    margin-inline-start: auto;
    gap: var(--mg-xs);
  }

  .lightbox__btn {
    width: 2.5rem;
    height: 2.5rem;
    font-size: var(--fs-base);
  }

  @keyframes lightbox-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes lightbox-zoom {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @media (max-width: 640px) {
    .lightbox__nav {
      width: 2.5rem;
      height: 2.5rem;
      font-size: var(--fs-base);
    }

    .lightbox__nav--prev {
      inset-inline-start: 0.4rem;
    }

    .lightbox__nav--next {
      inset-inline-end: 0.4rem;
    }

    /* Counter + actions on the first row, caption on its own below. */
    .lightbox__caption {
      order: 1;
      flex-basis: 100%;
      text-align: start;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .lightbox,
    .lightbox__img {
      animation: none;
    }

    .lightbox__close,
    .lightbox__nav,
    .lightbox__btn {
      transition: none;
    }
  }
</style>
