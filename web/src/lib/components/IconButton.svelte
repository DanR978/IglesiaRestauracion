<!--
  IconButton — the one icon-only control (PR-C2, DESIGN-SYSTEM §4.1).
  Retires `.icon-btn__admin` + `.adm-icon-btn` and the `title=`-only designer
  controls. `label` is REQUIRED and becomes the accessible name (aria-label);
  the glyph is decorative.

  `href` decides the element, exactly as in Button: an <a> with it, a <button>
  without it; a disabled or loading link drops its href and says aria-disabled.
  `pressed` turns the button into a toggle (aria-pressed true/false); leave it
  undefined for a plain action. `loading` swaps the glyph for a spinner in the
  same square, disables the control and sets aria-busy.

  `touch` grows the HIT AREA to 44px without growing the square (a centred
  ::after the pointer lands on), for primary controls such as the drawer burger.
  ARIA states (aria-expanded/-controls/-haspopup/-describedby) and data-* pass
  through, as explicit attributes and an attachment — never a spread (button.ts).
-->
<script lang="ts">
  import Icon from './Icon.svelte';
  import { dataAttributes, dataAttributesOf, type ButtonAria, type DataAttributes } from './button';
  import {
    ICON_BUTTON_BLOCK,
    hasAccessibleName,
    type IconButtonSize,
    type IconButtonVariant,
  } from './icon-button';

  interface Props extends Omit<ButtonAria, 'aria-label' | 'aria-pressed'>, DataAttributes {
    /** Font Awesome solid glyph without the `fa-` prefix. Decorative: `label` names the control. */
    icon: string;
    /** The accessible name — required. A Spanish verb phrase: "Cerrar aviso", "Abrir menú". */
    label: string;
    variant?: IconButtonVariant;
    /** `sm` 32px · `md` 40px (default). */
    size?: IconButtonSize;
    /** Hit area ≥ 44px around the same visual square — primary and touch controls. */
    touch?: boolean;
    /** Spinner in place of the glyph, control disabled, `aria-busy`. */
    loading?: boolean;
    disabled?: boolean;
    /** A toggle: true/false render aria-pressed and the "on" look; undefined is a plain button. */
    pressed?: boolean;
    /** Present → renders an `<a>` (the caller resolves internal paths, as with Button). */
    href?: string;
    /** `<a>` only. With `target="_blank"`, `rel` defaults to `noopener noreferrer`. */
    target?: string;
    /** `<a>` only. */
    rel?: string;
    /** `<button>` only. Defaults to `button` so it never submits a form by accident. */
    type?: 'button' | 'submit' | 'reset';
    /** `<button>` only — the id of a form this control submits from outside it. */
    form?: string;
    id?: string;
    onclick?: (event: MouseEvent) => void;
    class?: string;
  }

  let {
    icon,
    label,
    variant = 'ghost',
    size = 'md',
    touch = false,
    loading = false,
    disabled = false,
    pressed,
    href,
    target,
    rel,
    type = 'button',
    form,
    id,
    onclick,
    class: className = '',
    'aria-expanded': ariaExpanded,
    'aria-controls': ariaControls,
    'aria-haspopup': ariaHaspopup,
    'aria-describedby': ariaDescribedby,
    ...rest
  }: Props = $props();

  const data = $derived(dataAttributesOf(rest));
  const inert = $derived(disabled || loading);
  const isToggle = $derived(href === undefined && pressed !== undefined);

  const classes = $derived(
    [
      ICON_BUTTON_BLOCK,
      `${ICON_BUTTON_BLOCK}--${variant}`,
      `${ICON_BUTTON_BLOCK}--${size}`,
      touch ? `${ICON_BUTTON_BLOCK}--touch` : '',
      loading ? 'is-loading' : '',
      inert ? 'is-disabled' : '',
      isToggle && pressed ? 'is-pressed' : '',
      className,
    ]
      .filter(Boolean)
      .join(' '),
  );

  const linkHref = $derived(inert ? undefined : href);
  const linkRel = $derived(rel ?? (target === '_blank' ? 'noopener noreferrer' : undefined));

  $effect(() => {
    if (!hasAccessibleName(label)) {
      console.warn(`[icon-button] "${icon}" has no accessible name — pass a Spanish label`);
    }
  });

  function handleClick(event: MouseEvent) {
    if (inert) {
      event.preventDefault();
      return;
    }
    onclick?.(event);
  }
</script>

{#snippet glyph()}
  <span class="ird-icon-btn__icon"><Icon set="fas" name={icon} /></span>
  {#if loading}
    <span class="ird-icon-btn__spinner"><Icon set="fas" name="spinner" spin /></span>
  {/if}
{/snippet}

{#if href !== undefined}
  <!-- The caller owns resolve() for internal paths — see Button.svelte. -->
  <!-- eslint-disable svelte/no-navigation-without-resolve -->
  <a
    {id}
    class={classes}
    href={linkHref}
    {target}
    rel={linkRel}
    role={inert ? 'link' : undefined}
    tabindex={inert ? -1 : undefined}
    aria-label={label}
    aria-expanded={ariaExpanded}
    aria-controls={ariaControls}
    aria-haspopup={ariaHaspopup}
    aria-describedby={ariaDescribedby}
    aria-disabled={inert ? 'true' : undefined}
    aria-busy={loading ? 'true' : undefined}
    onclick={handleClick}
    {@attach dataAttributes(data)}
  >
    {@render glyph()}
  </a>
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
{:else}
  <button
    {id}
    class={classes}
    {type}
    {form}
    disabled={inert}
    aria-label={label}
    aria-expanded={ariaExpanded}
    aria-controls={ariaControls}
    aria-haspopup={ariaHaspopup}
    aria-describedby={ariaDescribedby}
    aria-pressed={isToggle ? (pressed ? 'true' : 'false') : undefined}
    aria-busy={loading ? 'true' : undefined}
    onclick={handleClick}
    {@attach dataAttributes(data)}
  >
    {@render glyph()}
  </button>
{/if}

<style>
  /* Legacy baseline (.adm-icon-btn): a 32px square, --radius-sm, muted glyph.
     The square is a component token so the two sizes share every other rule. */
  .ird-icon-btn {
    position: relative;
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    inline-size: var(--icon-btn-size);
    block-size: var(--icon-btn-size);
    padding: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: inherit;
    font-family: inherit;
    line-height: 1;
    text-decoration: none;
    cursor: pointer;
    transition:
      background-color 0.15s cubic-bezier(0.22, 1, 0.36, 1),
      color 0.15s cubic-bezier(0.22, 1, 0.36, 1),
      transform 0.1s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .ird-icon-btn--sm {
    --icon-btn-size: 2rem;
    font-size: var(--fs-sm);
  }

  .ird-icon-btn--md {
    --icon-btn-size: 2.5rem;
    font-size: var(--fs-base);
  }

  /* The 44px hit area, centred on the square and invisible: the pointer lands
     on the pseudo-element, which belongs to the control, so the click does too.
     Physical insets on purpose — the centring must not flip in RTL. */
  .ird-icon-btn--touch::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    inline-size: max(100%, 2.75rem);
    block-size: max(100%, 2.75rem);
    transform: translate(-50%, -50%);
  }

  /* ghost inherits the ink around it, so the same control reads on the dark
     top bar and on a light card; the hover tint is mixed from that ink. */
  .ird-icon-btn--ghost {
    color: inherit;
  }

  /* The theme-neutral gray idiom: --gray-* goes LIGHTER in dark mode and would
     glare on a dark panel (CLAUDE.md §4). Muted ink at rest, as in legacy. */
  .ird-icon-btn--subtle {
    background: rgba(127, 127, 127, 0.12);
    color: var(--color-muted);
  }

  /* --money-neg is the AA-tuned red INK that reverses with the theme;
     --color-danger is a fill and only ~3.2:1 on the dark surface. */
  .ird-icon-btn--danger {
    color: var(--money-neg);
  }

  /* Pressed = the inverse pair: the reversing ink as the fill and the surface
     as the glyph, so "on" is unmistakable in both themes. */
  .ird-icon-btn.is-pressed {
    background: var(--color-text);
    color: var(--color-surface);
  }

  @media (hover: hover) {
    .ird-icon-btn--ghost:not(.is-disabled):not(.is-pressed):hover {
      background: color-mix(in srgb, currentColor 12%, transparent);
    }

    /* Hover to --color-text, never --color-dark: "go darker" vanishes on a
       dark page (CLAUDE.md §4). */
    .ird-icon-btn--subtle:not(.is-disabled):not(.is-pressed):hover {
      background: rgba(127, 127, 127, 0.2);
      color: var(--color-text);
    }

    .ird-icon-btn--danger:not(.is-disabled):not(.is-pressed):hover {
      background: var(--money-neg-bg);
    }
  }

  .ird-icon-btn--ghost:not(.is-disabled):not(.is-pressed):active {
    background: color-mix(in srgb, currentColor 20%, transparent);
  }

  .ird-icon-btn--subtle:not(.is-disabled):not(.is-pressed):active {
    background: rgba(127, 127, 127, 0.28);
    color: var(--color-text);
  }

  .ird-icon-btn--danger:not(.is-disabled):not(.is-pressed):active {
    background: color-mix(in srgb, var(--money-neg) 22%, transparent);
  }

  .ird-icon-btn:not(.is-disabled):active {
    transform: scale(0.94);
  }

  /* The ring takes the control's own ink: --color-focus is the page ink, which
     disappears on the dark top bar a ghost button inherits its colour from.
     (0,2,0) also beats base/reset.css clearing the outline on button:active. */
  .ird-icon-btn:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }

  /* …except when pressed, where the ink is the SURFACE colour and the ring,
     drawn outside the fill, would be surface-on-surface. */
  .ird-icon-btn.is-pressed:focus-visible {
    outline-color: var(--color-focus);
  }

  .ird-icon-btn.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .ird-icon-btn__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  /* opacity, not display: the square never changes and the name stays put. */
  .ird-icon-btn.is-loading .ird-icon-btn__icon {
    opacity: 0;
  }

  .ird-icon-btn__spinner {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  @media (prefers-reduced-motion: reduce) {
    .ird-icon-btn {
      transition: none;
    }

    .ird-icon-btn:not(.is-disabled):active {
      transform: none;
    }
  }
</style>
