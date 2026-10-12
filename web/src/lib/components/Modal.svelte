<!--
  Modal — the ONE overlay (S16, DESIGN-SYSTEM §4.2).
  Retires all three legacy systems: `.modal-backdrop`/`.modal` + ui.js
  openModal/closeModal, the designer `.dz-modal`, and `.wizard-backdrop`.

  Every instance owns its state. There is no element id to collide with, and
  the header id is generated per instance — the legacy failure where two
  different modals both used id="presetModal" (admin/index.html:1283 and
  :1376), so `getElementById` returned the first and the second modal was
  unreachable with a double-bound Save button, is not expressible here (G-009).

  What it adds over legacy, all of which legacy lacks:
    · Escape closes — and only the TOPMOST overlay does (focus-trap stack).
    · a reference-counted scroll lock that RESTORES the previous body overflow,
      so closing a confirm over a modal does not unlock the page ($lib/scroll-lock).
    · focus moves into the dialog on open, is trapped while open, and returns
      to the trigger on close ($lib/focus-trap).
    · role="dialog" + aria-modal + an accessible name.

  Content comes in as three snippets — `header` (optional, replaces the title),
  `children` (the scrollable body) and `footer` (the actions, right-aligned;
  put `class="ird-modal__spacer"` on an empty element to split the row).
  `error` renders a role="alert" region between body and footer.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import { MODAL_BLOCK, MODAL_CLOSE_LABEL, type ModalVariant } from './modal';
  import { lockBodyScroll } from '$lib/scroll-lock';
  import { isTopmostTrap, trapFocus } from '$lib/focus-trap';

  interface Props {
    /** Two-way: `bind:open`. The component sets it to false on every close path. */
    open?: boolean;
    /** Panel width. `confirm` also stacks above an already-open modal. */
    variant?: ModalVariant;
    /** Header text and, unless `header` is given, the dialog's accessible name. */
    title?: string;
    /** Accessible name when there is no `title` (e.g. a custom `header` snippet). */
    ariaLabel?: string;
    /** Human Spanish copy — shown in a role="alert" region. Never a raw backend string. */
    error?: string | null;
    /** Clicking the scrim closes. Turn off for a modal with unsaved work. */
    closeOnBackdrop?: boolean;
    /** Escape closes. Turn off only together with `closeOnBackdrop`. */
    closeOnEscape?: boolean;
    /** The header × button. */
    showClose?: boolean;
    /**
     * CSS selector, resolved INSIDE this dialog, for what should receive focus
     * on open — e.g. ConfirmDialog points it at the safer cancel button. A
     * selector (not an id) keeps every instance collision-free. Falls back to
     * the dialog container, which is the safe default: it announces the title
     * and cannot land the user on a destructive action.
     */
    initialFocus?: string;
    /** Fired when the USER dismisses (Escape / scrim / ×), not on a parent-driven close. */
    onclose?: () => void;
    class?: string;
    /** Replaces the default title row (the × button stays). */
    header?: Snippet;
    /** The body. Scrolls on its own so the header and footer stay put. */
    children?: Snippet;
    /** The action row. */
    footer?: Snippet;
  }

  let {
    open = $bindable(false),
    variant = 'standard',
    title,
    ariaLabel,
    error = null,
    closeOnBackdrop = true,
    closeOnEscape = true,
    showClose = true,
    initialFocus,
    onclose,
    class: className = '',
    header,
    children,
    footer,
  }: Props = $props();

  // Per-instance, stable across SSR and hydration — the structural answer to
  // the duplicated-global-id bug (G-009). `$props.id()` must be its own
  // top-level declaration initializer, so the suffix is derived separately.
  const uid = $props.id();
  const titleId = `${uid}-title`;

  let dialogEl = $state<HTMLElement>();
  /** A drag that STARTS inside the dialog and ends on the scrim must not close it. */
  let pressedScrim = false;

  const classes = $derived(
    [MODAL_BLOCK, `${MODAL_BLOCK}--${variant}`, className].filter(Boolean).join(' '),
  );
  const labelledBy = $derived(header === undefined && title !== undefined ? titleId : undefined);
  const hasHeader = $derived(header !== undefined || title !== undefined || showClose);

  function requestClose(): void {
    if (!open) return;
    open = false;
    onclose?.();
  }

  function onScrimMouseDown(event: MouseEvent): void {
    pressedScrim = event.target === event.currentTarget;
  }

  function onScrimClick(event: MouseEvent): void {
    if (!closeOnBackdrop) return;
    if (!pressedScrim || event.target !== event.currentTarget) return;
    requestClose();
  }

  function onWindowKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !closeOnEscape || !open) return;
    // Every open Modal hears this; only the one on top may act on it.
    if (!dialogEl || !isTopmostTrap(dialogEl)) return;
    event.stopPropagation();
    requestClose();
  }

  // One effect owns the whole open/close side-effect pairing, so nothing can be
  // released out of order or forgotten: lock → trap → focus in, then on close
  // untrap → unlock → focus back to whatever opened us.
  $effect(() => {
    const dialog = dialogEl;
    if (!open || !dialog) return;

    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseScroll = lockBodyScroll();
    const releaseTrap = trapFocus(dialog);
    const wanted = initialFocus ? dialog.querySelector<HTMLElement>(initialFocus) : null;
    (wanted ?? dialog).focus();

    return () => {
      releaseTrap();
      releaseScroll();
      // A trigger that was itself removed while the modal was open (a deleted
      // row's button) cannot take focus back; the page keeps it.
      if (trigger?.isConnected) trigger.focus();
    };
  });
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if open}
  <!-- The scrim is a convenience duplicate of two keyboard-reachable controls
       (Escape and the × button), so it needs no role and no key handler of its
       own; giving it one would put a phantom stop in the tab ring. -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class={classes} onmousedown={onScrimMouseDown} onclick={onScrimClick}>
    <div
      bind:this={dialogEl}
      class="ird-modal__dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-label={labelledBy === undefined ? ariaLabel : undefined}
      tabindex="-1"
    >
      {#if hasHeader}
        <header class="ird-modal__header">
          {#if header}
            {@render header()}
          {:else if title !== undefined}
            <h2 class="ird-modal__title" id={titleId}>{title}</h2>
          {/if}
          {#if showClose}
            <button
              type="button"
              class="ird-modal__close"
              aria-label={MODAL_CLOSE_LABEL}
              onclick={requestClose}
            >
              <Icon set="fas" name="xmark" />
            </button>
          {/if}
        </header>
      {/if}

      {#if children}
        <div class="ird-modal__body">{@render children()}</div>
      {/if}

      {#if error}
        <p class="ird-modal__error" role="alert">{error}</p>
      {/if}

      {#if footer}
        <footer class="ird-modal__footer">{@render footer()}</footer>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* The scrim. --static-black, not --color-black: that token reverses to
     #dfdedc in dark mode, which would turn the scrim into a white wash. */
  .ird-modal {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--pd-sm);
    background: color-mix(in srgb, var(--static-black) 40%, transparent);
    backdrop-filter: blur(3px);
    animation: modal-scrim-in 0.2s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  /* Variants differ in width only. The confirm is the exception: it is a
     meta-modal that opens ON TOP of another modal (a delete inside an open
     detail panel), so it keeps legacy #confirmModal's z-index bump. */
  .ird-modal--standard {
    --modal-max: 500px;
  }
  .ird-modal--wide {
    --modal-max: 760px;
  }
  .ird-modal--confirm {
    --modal-max: 360px;
    z-index: calc(var(--z-modal) + 10);
  }
  .ird-modal--tool {
    --modal-max: 420px;
  }

  /* --color-surface, not --color-white: the panel has to reverse with the
     theme or --color-text is stranded light-on-light (CLAUDE.md §4). */
  .ird-modal__dialog {
    display: flex;
    flex-direction: column;
    inline-size: 100%;
    max-inline-size: var(--modal-max, 500px);
    max-block-size: 90vh;
    padding: var(--pd-md);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    color: var(--color-text);
    box-shadow: var(--shadow-lg);
    animation: modal-in 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .ird-modal__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--mg-sm);
    margin-block-end: var(--mg-md);
  }

  .ird-modal__title {
    margin: 0;
    font-size: var(--fs-md);
    font-weight: var(--fw-bold);
    line-height: 1.25;
  }

  /* Same 2.25rem tap target as the toast close (S15), not the legacy 30px:
     an icon-only control still has to be hittable on a phone. */
  .ird-modal__close {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 2.25rem;
    block-size: 2.25rem;
    margin-inline-end: calc(-1 * var(--pd-xs));
    border-radius: var(--radius-full);
    /* The theme-neutral gray idiom: --gray-* goes LIGHTER in dark mode and
       would glare on the dark panel (CLAUDE.md §4). */
    background: rgba(127, 127, 127, 0.12);
    color: var(--color-muted);
    font-family: inherit;
    font-size: var(--fs-sm);
    cursor: pointer;
    transition:
      background-color 0.15s cubic-bezier(0.22, 1, 0.36, 1),
      color 0.15s cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* Hover to --color-text, never --color-dark: "go darker" makes the glyph
     disappear on a dark panel. */
  .ird-modal__close:hover {
    background: rgba(127, 127, 127, 0.22);
    color: var(--color-text);
  }

  /* base/reset.css clears the outline on button:active, which would blink the
     ring off mid-keypress; (0,2,0) wins it back. */
  .ird-modal__close:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }

  /* Only the body scrolls, so the title and the actions stay reachable in a
     long form (legacy scrolled the whole panel, header included).
     min-block-size:0 is what lets a flex child actually shrink and scroll. */
  .ird-modal__body {
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  /* --money-neg is the AA-tuned, theme-reversing red ink; --color-danger is a
     FILL token and only ~3.2:1 as text on the dark surface (S14 decision 9). */
  .ird-modal__error {
    margin: var(--mg-sm) 0 0;
    padding: var(--pd-xs) var(--pd-sm);
    border-radius: var(--radius-sm);
    background: var(--money-neg-bg);
    color: var(--money-neg);
    font-size: var(--fs-sm);
    line-height: 1.45;
  }

  .ird-modal__footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--mg-sm);
    margin-block-start: var(--mg-md);
    padding-block-start: var(--pd-sm);
    border-block-start: 1px solid rgba(127, 127, 127, 0.18);
  }

  /* The utility that replaces the legacy footers' raw style="flex:1" span.
     :global because the footer content is the CALLER's markup. */
  .ird-modal__footer :global(.ird-modal__spacer) {
    flex: 1 1 auto;
  }

  @keyframes modal-scrim-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* DESIGN-SYSTEM §4.2: translateY(16px) scale(.97) → settled, house easing. */
  @keyframes modal-in {
    from {
      opacity: 0;
      transform: translateY(16px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  /* Near-full-bleed on a phone, per the legacy 480px rule — with the token
     radius (10px) in place of its literal 12px. */
  @media (max-width: 480px) {
    .ird-modal {
      padding: var(--pd-xs);
    }

    .ird-modal__dialog {
      max-inline-size: 100%;
      max-block-size: 94vh;
      border-radius: var(--radius-md);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ird-modal,
    .ird-modal__dialog {
      animation: none;
    }

    .ird-modal__close {
      transition: none;
    }
  }
</style>
