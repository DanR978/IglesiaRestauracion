<!--
  Card — the one card (S14, DESIGN-SYSTEM §4.1).
  One radius (--radius-md) and one shadow for every surface that used to be a
  .dash-card / .trez-card / .acct-card / .se-evcard / .dscp-card / album card.

  A card is `static` (a <div>: no hover, no cursor, no promise) or
  `interactive` (a real <a>/<button> that performs the primary action). Nothing
  in between — the legacy .se-evcard looks clickable and only re-fires a hidden
  kebab, and the dashboard .dash-next rows hover but do nothing. See card.ts.

  The KPI sub-variant is a tile with an honest `scope`: the number, what it
  counts, and the period it covers, so a month figure never sits beside an
  all-time one looking identical.

  Grids of cards are pure CSS — `repeat(auto-fit, minmax(180px, 1fr))` — never
  the legacy autoBalance()/grid-balance.js hack. No card touches
  element.style.gridColumn at runtime (G-010).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import { CARD_BLOCK, type CardVariant, type KpiTile } from './card';

  interface Props {
    /** `static` renders a <div>; `interactive` renders an <a> (href) or <button>. */
    variant?: CardVariant;
    /** Interactive + href → <a>. Ignored on a static card. */
    href?: string;
    /** `<a>` only. With `target="_blank"`, `rel` defaults to `noopener noreferrer`. */
    target?: string;
    /** `<a>` only. */
    rel?: string;
    /** Card title. Rendered at --fs-lg, the mid-range step between the ~12px
        label and the ~30px KPI number that the legacy scale was missing (D-015). */
    heading?: string;
    /** Heading level, so the card fits the page outline. */
    headingLevel?: 2 | 3 | 4 | 5;
    /** Font Awesome solid glyph beside the heading (decorative). */
    headingIcon?: string;
    /** The KPI-tile sub-variant. `scope` is required — see card.ts. */
    kpi?: KpiTile;
    /** Accessible name for an interactive card whose content does not read as one. */
    ariaLabel?: string;
    onclick?: (event: MouseEvent) => void;
    class?: string;
    children?: Snippet;
  }

  let {
    variant = 'static',
    href,
    target,
    rel,
    heading,
    headingLevel = 3,
    headingIcon,
    kpi,
    ariaLabel,
    onclick,
    class: className = '',
    children,
  }: Props = $props();

  const interactive = $derived(variant === 'interactive');
  const tone = $derived(kpi?.tone ?? 'default');

  const classes = $derived(
    [
      CARD_BLOCK,
      `${CARD_BLOCK}--${variant}`,
      kpi ? `${CARD_BLOCK}--kpi` : '',
      tone === 'alert' ? `${CARD_BLOCK}--alert` : '',
      className,
    ]
      .filter(Boolean)
      .join(' '),
  );

  const linkRel = $derived(rel ?? (target === '_blank' ? 'noopener noreferrer' : undefined));
</script>

{#snippet content()}
  {#if heading}
    <svelte:element this={`h${headingLevel}`} class="ird-card__heading">
      {#if headingIcon}
        <span class="ird-card__heading-icon"><Icon set="fas" name={headingIcon} /></span>
      {/if}
      {heading}
    </svelte:element>
  {/if}
  {#if kpi}
    {#if kpi.icon}
      <span class="ird-card__kpi-icon"><Icon set="fas" name={kpi.icon} /></span>
    {/if}
    <span class="ird-card__kpi-value">{kpi.value}</span>
    <span class="ird-card__kpi-label">{kpi.label}</span>
    <span class="ird-card__kpi-scope">{kpi.scope}</span>
  {/if}
  {@render children?.()}
{/snippet}

{#if interactive && href !== undefined}
  <!-- Same as Button: the caller owns resolve() — see Button.svelte. -->
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
  <a class={classes} {href} {target} rel={linkRel} aria-label={ariaLabel} {onclick}>
    {@render content()}
  </a>
{:else if interactive}
  <button type="button" class={classes} aria-label={ariaLabel} {onclick}>
    {@render content()}
  </button>
{:else}
  <div class={classes}>
    {@render content()}
  </div>
{/if}

<style>
  /* One radius, one resting shadow. The border is the theme-neutral gray idiom
     rather than --gray-40, which goes LIGHTER in dark (#d8d8d8) and would draw
     a glaring hairline on a dark panel; rgba(127,127,127,.18) over white
     resolves to --gray-40 exactly (CLAUDE.md §4). */
  .ird-card {
    display: block;
    padding: var(--pd-sm);
    border: 1px solid rgba(127, 127, 127, 0.18);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-sm);
    color: var(--color-text);
    text-align: left;
  }

  /* A <button> keeps none of the reset's stripping: give it back the box, the
     type and the full width so it lays out exactly like the static <div>. */
  .ird-card--interactive {
    width: 100%;
    font: inherit;
    text-decoration: none;
    cursor: pointer;
    transition:
      border-color 0.18s cubic-bezier(0.22, 1, 0.36, 1),
      box-shadow 0.18s cubic-bezier(0.22, 1, 0.36, 1),
      transform 0.1s cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* Slate accent, never amber, and no 3px lift: the border strengthens to the
     reversing ink and the card raises by one shadow step. */
  .ird-card--interactive:hover {
    border-color: var(--color-text);
    box-shadow: var(--shadow-md);
  }

  .ird-card--interactive:active {
    transform: scale(0.99);
  }

  .ird-card--interactive:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }

  .ird-card__heading {
    display: flex;
    align-items: center;
    gap: var(--mg-xs);
    margin: 0 0 var(--mg-sm);
    font-size: var(--fs-lg);
    font-weight: var(--fw-semibold);
    line-height: 1.2;
    color: var(--color-text);
  }

  .ird-card__heading-icon {
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }

  .ird-card--kpi {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
  }

  /* The tile glyph: a neutral tint that reads on both palettes, replacing
     .dash-card's amber-on-hover icon tile. */
  .ird-card__kpi-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.375rem;
    height: 2.375rem;
    margin-bottom: var(--mg-xs);
    border-radius: var(--radius-md);
    background: rgba(127, 127, 127, 0.12);
    color: var(--color-text);
    font-size: var(--fs-sm);
  }

  .ird-card__kpi-value {
    font-size: var(--fs-xl);
    font-weight: var(--fw-extrabold);
    line-height: 1;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    color: var(--color-text);
  }

  .ird-card__kpi-label {
    margin-top: var(--mg-xxs);
    font-size: var(--fs-xs);
    font-weight: var(--fw-semibold);
    letter-spacing: 0.02em;
    color: var(--color-muted);
  }

  /* The honest-scope line. Always rendered: a tile that cannot say what period
     it covers is the bug this component exists to stop. */
  .ird-card__kpi-scope {
    font-size: var(--fs-xxs);
    color: var(--color-muted);
  }

  .ird-card--alert .ird-card__kpi-icon {
    background: var(--status-overdue-bg);
    color: var(--status-overdue);
  }

  .ird-card--alert .ird-card__kpi-value {
    color: var(--status-overdue);
  }

  @media (prefers-reduced-motion: reduce) {
    .ird-card--interactive {
      transition: none;
    }

    .ird-card--interactive:active {
      transform: none;
    }
  }
</style>
