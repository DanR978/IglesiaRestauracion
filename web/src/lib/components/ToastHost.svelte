<!--
  ToastHost — the ONE renderer for the toast stack (S15, DESIGN-SYSTEM §4.2).
  Mount it exactly once per app shell, INSIDE the surface wrapper (the (admin)
  layout's [data-surface="admin"] element — tokens/admin.css: a host portaled
  to <body> would fall back to the public palette).

  It is pure presentation: every piece of state, and the whole
  schedule → leaving → removed lifecycle, lives in $lib/stores/toast.svelte,
  so a repo module can raise a toast without a component in the loop (S38).

  The message is interpolated as TEXT — never {@html} (D-005). `error` carries
  role="alert" (assertive), everything else role="status" (polite), which is
  the legacy per-type behaviour preserved.
-->
<script lang="ts">
  import Icon from './Icon.svelte';
  import { toast, type ToastVariant } from '$lib/stores/toast.svelte';

  /** Colour already carries the meaning; the glyph repeats it (never colour alone). */
  const ICONS: Record<ToastVariant, string> = {
    success: 'circle-check',
    error: 'circle-exclamation',
    info: 'circle-info',
    undo: 'rotate-left',
  };
</script>

<div class="toast-host">
  {#each toast.items as item (item.id)}
    <div
      class="toast toast--{item.variant}"
      class:toast--leaving={item.leaving}
      role={item.role}
      onmouseenter={toast.pause}
      onmouseleave={toast.resume}
      onfocusin={toast.pause}
      onfocusout={toast.resume}
    >
      <span class="toast__icon"><Icon set="fas" name={ICONS[item.variant]} /></span>
      <p class="toast__msg">{item.message}</p>
      {#if item.action}
        {@const action = item.action}
        <button type="button" class="toast__action" onclick={() => toast.runAction(item.id)}>
          {action.label}
        </button>
      {/if}
      <button
        type="button"
        class="toast__close"
        aria-label="Cerrar"
        onclick={() => toast.dismiss(item.id)}
      >
        <Icon set="fas" name="xmark" />
      </button>
    </div>
  {/each}
</div>

<style>
  /* Bottom-right stack (legacy `#toast`), --z-max, click-through between toasts. */
  .toast-host {
    position: fixed;
    inset-block-end: var(--pd-sm);
    inset-inline-end: var(--pd-sm);
    z-index: var(--z-max);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--mg-sm);
    pointer-events: none;
  }

  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: var(--mg-sm);
    max-inline-size: min(92vw, 26rem);
    padding: var(--pd-sm);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    /* info + undo keep this slate fill; success/error override below. */
    background: var(--color-dark);
    /* --static-white, not --color-white: the fills are fixed-dark in both
       themes, and --color-white dims to #dfdedc in dark mode (white on
       --color-danger would drop from 4.8:1 to 3.6:1). */
    color: var(--static-white);
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
    line-height: 1.35;
    animation: toast-in 0.25s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .toast--success {
    /* --color-success is a FILL token, and white on it is only 3.3:1 — under
       AA. Compositing it onto the slate keeps the semantic hue and reaches
       5.1:1 (light) / 5.6:1 (dark) without a hex literal or a new token. */
    background: color-mix(in srgb, var(--color-success) 60%, var(--color-dark));
  }

  .toast--error {
    background: var(--color-danger);
  }

  .toast--leaving {
    animation: toast-out 0.18s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .toast__icon {
    flex-shrink: 0;
    font-size: var(--fs-md);
    line-height: 1;
  }

  /* A raw backend string or a long email must wrap, never widen the toast. */
  .toast__msg {
    margin: 0;
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .toast__action,
  .toast__close {
    flex-shrink: 0;
    font: inherit;
    color: inherit;
    cursor: pointer;
    background: transparent;
    transition: background-color 0.18s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .toast__action {
    padding: var(--pd-xs) var(--pd-sm);
    border: 1.5px solid color-mix(in srgb, var(--static-white) 55%, transparent);
    border-radius: var(--radius-full);
    white-space: nowrap;
  }

  /* A comfortable tap target, not just the glyph (no hover-only affordances). */
  .toast__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 2.25rem;
    block-size: 2.25rem;
    margin-inline-start: calc(-1 * var(--pd-xs));
    border-radius: var(--radius-sm);
    font-size: var(--fs-md);
  }

  .toast__action:hover,
  .toast__close:hover {
    background: color-mix(in srgb, var(--static-white) 16%, transparent);
  }

  .toast__action:active,
  .toast__close:active {
    background: color-mix(in srgb, var(--static-white) 26%, transparent);
  }

  /* The global ring is --color-focus (dark slate ink) — invisible on these
     fills, so the ring is restated in the ink the toast actually uses. */
  .toast__action:focus-visible,
  .toast__close:focus-visible {
    outline: 2px solid var(--static-white);
    outline-offset: 2px;
  }

  /* One rise+fade for both layouts: the stack sits at the bottom edge whether
     it is right-aligned or full-width, so the legacy desktop-X / mobile-Y
     keyframe split buys nothing. */
  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(0.75rem);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes toast-out {
    from {
      opacity: 1;
      transform: none;
    }
    to {
      opacity: 0;
      transform: translateY(0.5rem);
    }
  }

  /* Full-width stack on a phone (legacy centred at ≤768px; 640 is the
     canonical "mobile sheet" breakpoint the rest of the library uses). */
  @media (max-width: 640px) {
    .toast-host {
      inset-inline: var(--pd-sm);
      align-items: stretch;
    }

    .toast {
      max-inline-size: none;
    }
  }

  /* base/motion.css already collapses durations globally; this is the
     component's own guard (and the store zeroes the exit delay to match, so a
     dismissed toast disappears instead of lingering invisibly). */
  @media (prefers-reduced-motion: reduce) {
    .toast,
    .toast--leaving {
      animation: none;
    }

    .toast__action,
    .toast__close {
      transition: none;
    }
  }
</style>
