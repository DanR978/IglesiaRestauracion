<!--
  SignaturePad — the drawn-signature field (S19, DESIGN-SYSTEM §4.3).
  Wraps the ported canvas controller ($lib/signature-pad): hi-DPI drawing with
  pointer events, a trimmed transparent PNG out, and clear / loadDataURL /
  isEmpty exposed both as component exports (bind:this) and through bind:value.

  The drawing surface is PERMANENTLY LIGHT in both themes. The stroke is fixed
  dark ink baked into the exported PNG and reproduced on the white page of the
  waiver PDF, so a reversing panel would hide the signature in dark mode; ink
  drawn on the paper therefore uses the permanently-light pair (--color-dark /
  --gray-*), never --color-text (CLAUDE.md §4).

  A canvas cannot be operated from a keyboard. The accessible alternative is the
  typed-name e-signature the registration wizard offers alongside this pad
  (S33) — this component states its purpose, announces its state, and keeps
  every control it does own reachable by tab.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import Icon from './Icon.svelte';
  import {
    createSignaturePad,
    SIGNATURE_MAX_BYTES,
    SIGNATURE_PAD_HEIGHT,
    type SignatureChangeReason,
    type SignaturePad as SignaturePadController,
  } from '$lib/signature-pad';

  interface Props {
    /** The captured signature as a trimmed PNG data URL. '' when unsigned. */
    value?: string;
    /** Drawing-area height in CSS px. Changing it rebuilds the pad and reloads `value`. */
    height?: number;
    /** `framed` = a bordered paper card. `bare` = transparent, for a host that draws the line. */
    variant?: 'framed' | 'bare';
    /** Accessible name of the drawing area. */
    label?: string;
    /** Placeholder shown on the empty pad. */
    hint?: string;
    /** Helper text under the pad, wired as the canvas description. '' removes it. */
    description?: string;
    disabled?: boolean;
    /** Render the built-in clear button. Off when the host supplies its own control. */
    clearable?: boolean;
    clearLabel?: string;
    /** Export cap in bytes (SEC-09). 0 disables it. */
    maxBytes?: number;
    onchange?: (dataUrl: string) => void;
    class?: string;
  }

  let {
    value = $bindable(''),
    height = SIGNATURE_PAD_HEIGHT,
    variant = 'framed',
    label = 'Área de firma',
    hint = 'Firma aquí',
    description = 'Dibuja tu firma con el dedo, el ratón o un lápiz.',
    disabled = false,
    clearable = true,
    clearLabel = 'Borrar firma',
    maxBytes = SIGNATURE_MAX_BYTES,
    onchange,
    class: className = '',
  }: Props = $props();

  const descriptionId = $props.id();

  let canvasEl: HTMLCanvasElement | undefined = $state();
  let inked = $state(false);
  let unsupported = $state(false);
  let pad: SignaturePadController | null = null;
  // The last data URL this component either emitted or painted onto the canvas.
  // A plain `let` on purpose: writing it must not re-run the sync effect below.
  let applied = '';

  function handleChange(reason: SignatureChangeReason, empty: boolean): void {
    inked = !empty;
    // Only a finished stroke or a clear produces a new payload. A programmatic
    // load must NOT emit: re-encoding it would replace the caller's own string.
    if (reason !== 'stroke-end' && reason !== 'clear') return;
    const url = reason === 'clear' ? '' : (pad?.toDataURL({ maxBytes }) ?? '');
    applied = url;
    value = url;
    onchange?.(url);
  }

  $effect(() => {
    const canvas = canvasEl;
    const padHeight = height;
    if (!canvas) return;

    let controller: SignaturePadController;
    try {
      controller = createSignaturePad(canvas, { height: padHeight, onChange: handleChange });
    } catch (err) {
      unsupported = true;
      console.warn('[signature-pad] canvas unavailable:', (err as Error).message);
      return;
    }

    pad = controller;
    unsupported = false;
    inked = false;
    // Untracked: the pad is rebuilt when the canvas or its height changes, never
    // when the bound value does — that is the sync effect's job.
    const initial = untrack(() => value);
    applied = initial;
    if (initial) void controller.loadDataURL(initial);

    return () => {
      controller.destroy();
      if (pad === controller) pad = null;
    };
  });

  // Adopt a value set from outside (restoring a draft, resetting a form).
  $effect(() => {
    const next = value;
    if (next === applied) return;
    applied = next;
    if (!pad) return;
    if (next) void pad.loadDataURL(next);
    else pad.clear();
  });

  /** Wipe the pad. Emits '' through `value` / `onchange`. */
  export function clear(): void {
    pad?.clear();
  }

  /** True until the first mark is made, and again after clear(). */
  export function isEmpty(): boolean {
    return pad?.isEmpty() ?? true;
  }

  /** The current signature as a trimmed PNG data URL, or '' when empty. */
  export function toDataURL(): string {
    return pad?.toDataURL({ maxBytes }) ?? '';
  }

  /** Paint a previously captured signature onto the pad and adopt it as `value`. */
  export async function loadDataURL(url: string): Promise<boolean> {
    if (!pad) return false;
    applied = url;
    const ok = await pad.loadDataURL(url);
    if (ok) value = url;
    return ok;
  }

  /** Re-measure after the container width changed. */
  export function resize(): void {
    void pad?.resize();
  }
</script>

<div
  class="sigpad {className}"
  class:sigpad--framed={variant === 'framed'}
  class:sigpad--bare={variant === 'bare'}
  class:sigpad--inked={inked}
  class:sigpad--disabled={disabled}
>
  <!-- The name lives on the wrapper, not the <canvas>: canvas is embedded
       content and cannot take a non-interactive role, and role="img" makes the
       whole box (pad + hint) one named, presentational region. -->
  <div
    class="sigpad__paper"
    style="--sigpad-h: {height}px"
    role="img"
    aria-label={label}
    aria-describedby={description ? descriptionId : undefined}
  >
    <canvas bind:this={canvasEl} class="sigpad__canvas"></canvas>
    <span class="sigpad__hint">{hint}</span>
  </div>

  <p class="sr-only" role="status">{inked ? 'Firma capturada.' : 'Sin firma.'}</p>

  {#if unsupported}
    <p class="sigpad__note sigpad__note--error" role="alert">
      <Icon name="exclamation-triangle" /> Este navegador no permite dibujar la firma. Escribe tu nombre
      completo como firma electrónica.
    </p>
  {/if}

  {#if description || clearable}
    <div class="sigpad__footer">
      {#if description}
        <p class="sigpad__note" id={descriptionId}>{description}</p>
      {/if}
      {#if clearable}
        <button type="button" class="sigpad__clear" onclick={clear} disabled={disabled || !inked}>
          <Icon name="eraser" />
          <span>{clearLabel}</span>
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .sigpad {
    display: flex;
    flex-direction: column;
    gap: var(--mg-xs);
    min-width: 0;
  }

  /* Permanently light "paper": the stroke is fixed dark ink (see the header
     comment), so this surface must not reverse with the theme. */
  .sigpad__paper {
    position: relative;
    background: var(--static-white);
    border: 1.5px solid var(--gray-50);
    border-radius: var(--radius-md);
    overflow: hidden;
    /* A touch drag draws; it must never scroll the page instead. */
    touch-action: none;
  }

  /* The host owns the paper (the waiver document's own signature line). */
  .sigpad--bare .sigpad__paper {
    background: transparent;
    border: 0;
    border-radius: 0;
  }

  /* The signature rule, so it is obvious where to sign. The controller sets the
     same height inline once it has measured; this keeps the box reserved before
     hydration so nothing shifts. */
  .sigpad--framed .sigpad__paper::after {
    content: '';
    position: absolute;
    right: var(--mg-sm);
    bottom: var(--mg-ml);
    left: var(--mg-sm);
    border-bottom: 1px dashed var(--gray-60);
    pointer-events: none;
  }

  .sigpad__canvas {
    display: block;
    width: 100%;
    height: var(--sigpad-h);
    cursor: crosshair;
    touch-action: none;
  }

  .sigpad--disabled .sigpad__canvas {
    cursor: not-allowed;
    pointer-events: none;
  }

  .sigpad--disabled .sigpad__paper {
    opacity: 0.6;
  }

  /* Ink on the permanently-light paper: --color-dark reads on white in BOTH
     themes. --color-muted would go light here and vanish. */
  .sigpad__hint {
    position: absolute;
    bottom: var(--mg-xxs);
    left: var(--mg-sm);
    color: var(--color-dark);
    font-size: var(--fs-sm);
    opacity: 0.45;
    pointer-events: none;
  }

  .sigpad--inked .sigpad__hint {
    display: none;
  }

  .sigpad__footer {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mg-xs);
    align-items: center;
    justify-content: space-between;
  }

  /* Outside the paper — back on the page surface, so the reversing tokens. */
  .sigpad__note {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
    min-width: 0;
  }

  .sigpad__note--error {
    color: var(--color-danger);
  }

  .sigpad__clear {
    display: inline-flex;
    gap: var(--mg-xxs);
    align-items: center;
    /* Generous touch target — no hover-only affordances (DESIGN-SYSTEM §1). */
    min-height: 44px;
    margin-left: auto;
    padding: var(--btn-pd-y) var(--btn-pd-x);
    border: 1.5px solid var(--gray-50);
    border-radius: var(--radius-full);
    background: var(--color-surface);
    color: var(--color-muted);
    font: inherit;
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
    cursor: pointer;
    transition:
      color 0.18s cubic-bezier(0.22, 1, 0.36, 1),
      border-color 0.18s cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* focus-visible is the global ring from base/reset.css (S12) — the outline
     offset keeps it clear of the pill border. Do not replace it with none. */
  .sigpad__clear:hover:not(:disabled) {
    border-color: var(--color-text);
    color: var(--color-text);
  }

  .sigpad__clear:active:not(:disabled) {
    background: var(--status-neutral-bg);
  }

  .sigpad__clear:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    .sigpad__clear {
      transition: none;
    }
  }
</style>
