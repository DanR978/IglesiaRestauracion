<!--
  Button — the one button (S14, DESIGN-SYSTEM §4.1).
  Retires the hand-rolled busy() spinner swaps in auth.js / form-wizard.js /
  event-form.js / gallery save: `loading` is a PROP, so no screen ever writes
  `btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…'` again.

  `href` decides the element: with it an <a>, without it a <button>. A disabled
  link drops its href (an <a> has no disabled attribute) and says so with
  aria-disabled, so it is neither clickable nor tabbable.

  While loading the label stays in the layout at opacity 0 and the spinner sits
  on top of it — the width never changes, and the accessible name survives
  (aria-busy announces the state instead of the name disappearing).

  Icon-only controls are IconButton's job, not this component's: a Button
  without a label has no accessible name.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import { BUTTON_BLOCK, type ButtonSize, type ButtonVariant } from './button';

  interface Props {
    /** Hierarchy: solid primary/secondary/danger, or the bordered ghost. */
    variant?: ButtonVariant;
    /** `sm` for dense rows, `full` for a stacked mobile action bar. */
    size?: ButtonSize;
    /** Leading Font Awesome solid glyph (decorative — the label names the control). */
    icon?: string;
    /** Spinner over the label, control disabled, `aria-busy`, width unchanged. */
    loading?: boolean;
    /** Load-bearing: e.g. "Agregar ingreso" until income categories exist. */
    disabled?: boolean;
    /** Present → renders an `<a>`; absent → renders a `<button>`. */
    href?: string;
    /** `<a>` only. With `target="_blank"`, `rel` defaults to `noopener noreferrer`. */
    target?: string;
    /** `<a>` only. */
    rel?: string;
    /** `<button>` only. Defaults to `button` so a button in a form never submits by accident. */
    type?: 'button' | 'submit' | 'reset';
    /** `<button>` only — the id of a form this control submits from outside it. */
    form?: string;
    title?: string;
    id?: string;
    onclick?: (event: MouseEvent) => void;
    class?: string;
    /** The label. Always give one — see the icon-only note above. */
    children?: Snippet;
  }

  let {
    variant = 'primary',
    size = 'default',
    icon,
    loading = false,
    disabled = false,
    href,
    target,
    rel,
    type = 'button',
    form,
    title,
    id,
    onclick,
    class: className = '',
    children,
  }: Props = $props();

  // Loading implies disabled: a second click must not fire the same save twice.
  const inert = $derived(disabled || loading);

  const classes = $derived(
    [
      BUTTON_BLOCK,
      `${BUTTON_BLOCK}--${variant}`,
      size === 'default' ? '' : `${BUTTON_BLOCK}--${size}`,
      loading ? 'is-loading' : '',
      inert ? 'is-disabled' : '',
      className,
    ]
      .filter(Boolean)
      .join(' '),
  );

  // A disabled <a> keeps its shape but loses its destination; `href={undefined}`
  // also drops it out of the tab order, so aria-disabled is the honest label.
  const linkHref = $derived(inert ? undefined : href);
  const linkRel = $derived(rel ?? (target === '_blank' ? 'noopener noreferrer' : undefined));

  function handleClick(event: MouseEvent) {
    if (inert) {
      event.preventDefault();
      return;
    }
    onclick?.(event);
  }
</script>

{#snippet content()}
  {#if icon}
    <span class="ird-btn__icon"><Icon set="fas" name={icon} /></span>
  {/if}
  <span class="ird-btn__label">{@render children?.()}</span>
  {#if loading}
    <span class="ird-btn__spinner"><Icon set="fas" name="spinner" spin /></span>
  {/if}
{/snippet}

{#if href !== undefined}
  <!-- `href` is whatever the caller passed: an external URL, a mailto:, or an
       internal path the CALLER already put through resolve() from $app/paths.
       A library primitive cannot resolve it — it does not know which it is. -->
  <!-- eslint-disable svelte/no-navigation-without-resolve -->
  <a
    {id}
    class={classes}
    href={linkHref}
    {target}
    rel={linkRel}
    {title}
    role={inert ? 'link' : undefined}
    tabindex={inert ? -1 : undefined}
    aria-disabled={inert ? 'true' : undefined}
    aria-busy={loading ? 'true' : undefined}
    onclick={handleClick}
  >
    {@render content()}
  </a>
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
{:else}
  <button
    {id}
    class={classes}
    {type}
    {form}
    {title}
    disabled={inert}
    aria-busy={loading ? 'true' : undefined}
    onclick={handleClick}
  >
    {@render content()}
  </button>
{/if}

<style>
  /* Baseline: legacy .btn (padding .65rem 1.25rem, --radius-md, weight 600),
     with font-size reconciled from --size-base to --fs-btn (D-015) and the
     control padding taken from the tokens spacing.css already reserves for it.
     min-height keeps the tap target generous on a phone (§1). */
  .ird-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--mg-xs);
    min-height: 2.75rem;
    padding: var(--btn-pd-y) var(--btn-pd-x);
    border-radius: var(--radius-md);
    font-family: inherit;
    font-size: var(--fs-btn);
    font-weight: var(--fw-semibold);
    line-height: 1.2;
    text-align: center;
    text-decoration: none;
    cursor: pointer;
    transition:
      filter 0.15s cubic-bezier(0.22, 1, 0.36, 1),
      transform 0.1s cubic-bezier(0.22, 1, 0.36, 1),
      box-shadow 0.15s cubic-bezier(0.22, 1, 0.36, 1),
      border-color 0.15s cubic-bezier(0.22, 1, 0.36, 1),
      color 0.15s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .ird-btn--sm {
    min-height: 2.25rem;
    padding: var(--mg-xxs) var(--mg-sm);
    font-size: var(--fs-xs);
  }

  .ird-btn--full {
    width: 100%;
  }

  /* Solid fills take --static-white, not --color-white: the reversing white ink
     drops to #dfdedc in dark mode, which puts danger at 3.6:1 and secondary at
     3.5:1 on their own fill. Fixed white keeps both above 4.5:1 in both themes. */
  .ird-btn--primary,
  .ird-btn--secondary,
  .ird-btn--danger {
    color: var(--static-white);
    box-shadow: var(--shadow-sm);
  }

  .ird-btn--primary {
    background: var(--color-dark);
  }

  .ird-btn--secondary {
    background: var(--color-secondary);
  }

  .ird-btn--danger {
    background: var(--color-danger);
  }

  /* Ghost sits on --color-surface, NOT --color-white: that token is ink and
     stays light in dark mode, which would strand the label (CLAUDE.md §4).
     The border is the theme-neutral gray idiom rather than --gray-50, which
     goes LIGHTER in dark (#cccccc) and would draw a glaring hairline on a dark
     panel; rgba(127,127,127,.25) over white resolves to --gray-50 exactly. */
  .ird-btn--ghost {
    background: var(--color-surface);
    color: var(--color-muted);
    border: 1px solid rgba(127, 127, 127, 0.25);
  }

  .ird-btn--primary:not(.is-disabled):hover,
  .ird-btn--secondary:not(.is-disabled):hover,
  .ird-btn--danger:not(.is-disabled):hover {
    filter: brightness(1.08);
    box-shadow: var(--shadow-md);
  }

  /* Hover to --color-text, not --color-dark: "go darker" makes the label
     vanish on a dark page (CLAUDE.md §4). --color-text is the reversing ink. */
  .ird-btn--ghost:not(.is-disabled):hover {
    border-color: var(--color-text);
    color: var(--color-text);
  }

  .ird-btn:not(.is-disabled):active {
    transform: scale(0.97);
  }

  /* Explicit ring: base/reset.css clears the outline on button:active, which
     would blink the ring away mid-keypress. (0,2,0) wins that back. */
  .ird-btn:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }

  .ird-btn.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .ird-btn__icon,
  .ird-btn__label {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  /* opacity, not visibility/display: the label keeps its box (no width jump)
     AND its place in the accessibility tree, so the control keeps its name. */
  .ird-btn.is-loading .ird-btn__icon,
  .ird-btn.is-loading .ird-btn__label {
    opacity: 0;
  }

  .ird-btn__spinner {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  @media (prefers-reduced-motion: reduce) {
    .ird-btn {
      transition: none;
    }

    .ird-btn:not(.is-disabled):active {
      transform: none;
    }
  }
</style>
