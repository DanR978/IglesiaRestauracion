<!--
  StateLoading — the loading state of an async view (PR-C2, DESIGN-SYSTEM §5.1).
  Retires the one "Cargando..." spinner string every legacy view reused: a
  skeleton matched to the layout it stands in for, so nothing jumps when the
  data lands.
    card-grid  N cards at the real card size (KPI tiles, albums, presets)
    table      a header + N rows at row height (treasury, registrants)
    list       N rows with an avatar and two lines (notifications, activity)
    detail     a title bar + N label/value fields (a record, the account)

  For assistive tech the region is aria-busy and says "Cargando…" through its
  own small status node. The two are separate elements on purpose: aria-busy
  on a live region asks assistive tech to hold that region's announcements
  until it is no longer busy — which, for a skeleton, is never.
  The bones are decorative. The pulse stops under prefers-reduced-motion.

  Sizes come from component tokens a parent may set on any ancestor:
  --state-grid-min · --state-card-height · --state-row-height (see states.ts).
-->
<script lang="ts">
  import {
    STATE_BLOCK,
    STATE_LOADING_LABEL,
    skeletonColumns,
    skeletonRows,
    type LoadingShape,
  } from './states';

  interface Props {
    /** The layout being loaded. Defaults to `list`. */
    shape?: LoadingShape;
    /** Placeholders: cards (card-grid), rows (table, list) or fields (detail). 1–24. */
    rows?: number;
    /** `table` only: cells per row. 1–8, default 4. */
    columns?: number;
    /** The visually hidden announcement. */
    label?: string;
    class?: string;
  }

  let {
    shape = 'list',
    rows,
    columns,
    label = STATE_LOADING_LABEL,
    class: className = '',
  }: Props = $props();

  const count = $derived(skeletonRows(shape, rows));
  const cells = $derived(skeletonColumns(columns));
  const classes = $derived(
    [STATE_BLOCK, `${STATE_BLOCK}--loading`, `${STATE_BLOCK}--${shape}`, className]
      .filter(Boolean)
      .join(' '),
  );
</script>

<div class={classes} aria-busy="true">
  <span class="sr-only" role="status">{label}</span>
  <div class="ird-state__skeleton" aria-hidden="true">
    {#if shape === 'card-grid'}
      {#each { length: count }, i (i)}
        <div class="ird-state__card">
          <span class="ird-state__bone ird-state__bone--icon"></span>
          <span class="ird-state__bone ird-state__bone--value"></span>
          <span class="ird-state__bone ird-state__bone--meta"></span>
        </div>
      {/each}
    {:else if shape === 'table'}
      <div class="ird-state__row ird-state__row--head">
        {#each { length: cells }, c (c)}
          <span class="ird-state__bone ird-state__bone--cell"></span>
        {/each}
      </div>
      {#each { length: count }, i (i)}
        <div class="ird-state__row">
          {#each { length: cells }, c (c)}
            <span class="ird-state__bone ird-state__bone--cell"></span>
          {/each}
        </div>
      {/each}
    {:else if shape === 'list'}
      {#each { length: count }, i (i)}
        <div class="ird-state__item">
          <span class="ird-state__bone ird-state__bone--avatar"></span>
          <span class="ird-state__lines">
            <span class="ird-state__bone ird-state__bone--line"></span>
            <span class="ird-state__bone ird-state__bone--meta"></span>
          </span>
        </div>
      {/each}
    {:else}
      <span class="ird-state__bone ird-state__bone--title"></span>
      {#each { length: count }, i (i)}
        <div class="ird-state__field">
          <span class="ird-state__bone ird-state__bone--label"></span>
          <span class="ird-state__bone ird-state__bone--line"></span>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .ird-state {
    inline-size: 100%;
  }

  .ird-state__skeleton {
    display: grid;
    gap: var(--mg-sm);
  }

  /* The theme-neutral gray idiom: it reads as "not here yet" on the light and
     the dark surface alike, where --gray-* would glare in dark mode. */
  .ird-state__bone {
    display: block;
    border-radius: var(--radius-sm);
    background: rgba(127, 127, 127, 0.16);
    animation: state-pulse 1.4s cubic-bezier(0.22, 1, 0.36, 1) infinite alternate;
  }

  /* card-grid — the same pure-CSS grid the cards themselves use (G-010). */
  .ird-state--card-grid .ird-state__skeleton {
    grid-template-columns: repeat(
      auto-fit,
      minmax(min(100%, var(--state-grid-min, 11.25rem)), 1fr)
    );
  }

  /* The Card look (S14): one radius, the translucent border, the surface. */
  .ird-state__card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--mg-xs);
    min-block-size: var(--state-card-height, 8rem);
    padding: var(--pd-sm);
    border: 1px solid rgba(127, 127, 127, 0.18);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  /* table */
  .ird-state--table .ird-state__skeleton {
    gap: 0;
  }

  .ird-state__row {
    display: flex;
    align-items: center;
    gap: var(--mg-sm);
    min-block-size: var(--state-row-height, 2.75rem);
    padding-inline: var(--pd-xs);
    border-block-end: 1px solid rgba(127, 127, 127, 0.18);
  }

  .ird-state__row--head {
    min-block-size: 2.25rem;
  }

  .ird-state__bone--cell {
    flex: 1 1 0;
    min-inline-size: 0;
    block-size: 0.75rem;
  }

  .ird-state__row--head .ird-state__bone--cell {
    block-size: 0.6rem;
    background: rgba(127, 127, 127, 0.26);
  }

  .ird-state__row:not(.ird-state__row--head) .ird-state__bone--cell:nth-child(3n + 2) {
    max-inline-size: 70%;
  }

  /* list */
  .ird-state--list .ird-state__skeleton {
    gap: 0;
  }

  .ird-state__item {
    display: flex;
    align-items: center;
    gap: var(--mg-sm);
    min-block-size: var(--state-row-height, 3.5rem);
    padding-block: var(--pd-xs);
    border-block-end: 1px solid rgba(127, 127, 127, 0.18);
  }

  .ird-state__lines {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.4rem;
    min-inline-size: 0;
  }

  .ird-state__bone--avatar {
    flex-shrink: 0;
    inline-size: 2.25rem;
    block-size: 2.25rem;
    border-radius: var(--radius-full);
  }

  /* detail */
  .ird-state__field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .ird-state__bone--icon {
    inline-size: 2.375rem;
    block-size: 2.375rem;
    border-radius: var(--radius-md);
  }

  .ird-state__bone--value {
    inline-size: 55%;
    block-size: 1.75rem;
  }

  .ird-state__bone--title {
    inline-size: 45%;
    block-size: 1.5rem;
    margin-block-end: var(--mg-xs);
  }

  .ird-state__bone--line {
    inline-size: 80%;
    block-size: 0.8rem;
  }

  .ird-state__bone--meta {
    inline-size: 45%;
    block-size: 0.65rem;
  }

  .ird-state__bone--label {
    inline-size: 25%;
    block-size: 0.65rem;
  }

  /* A little irregularity, so the skeleton reads as content, not stripes. */
  .ird-state__item:nth-child(3n + 2) .ird-state__bone--line,
  .ird-state__field:nth-child(odd) .ird-state__bone--line {
    inline-size: 62%;
  }

  .ird-state__item:nth-child(3n) .ird-state__bone--line {
    inline-size: 72%;
  }

  @keyframes state-pulse {
    from {
      opacity: 1;
    }
    to {
      opacity: 0.45;
    }
  }

  /* A static placeholder: base/motion.css only shortens animations; this one
     would still flash once, so it is switched off outright. */
  @media (prefers-reduced-motion: reduce) {
    .ird-state__bone {
      animation: none;
    }
  }
</style>
