<!--
  SectionNav — in-page section navigation (PR-C2 primitives; DESIGN-SYSTEM
  §4.3 "SegmentedControl / SectionNav", S21; first consumer S45 Mi cuenta).
  Retires the account `.acct-nav` (css/pages/admin/account.css) and the
  Usuarios sub-tabs. The legacy bar collapsed at a stray 860px, hid its icons
  with no fallback, and its active item (`.active`) was a class only — no
  aria-current, so a screen reader never knew which section was open.

  A vertical list on a desktop. At ≤900px (the admin drawer breakpoint, which
  the stray 860 is reconciled to) it becomes a horizontal pill bar that
  scrolls on its own — the BAR scrolls, never the page — and keeps the
  current item scrolled into view by moving only the bar.

  Two modes, chosen by the items (./section-nav.ts):
    links    every item has an href (`?seccion=…` URL state): <a> with
             aria-current="page", in the natural tab order.
    buttons  no hrefs: <button> with aria-current="true", ONE tab stop, Arrow
             keys / Home / End move between items, Enter/Space select.
  Targets are 40px on a desktop (WCAG 2.5.8 asks 24) and 44px at ≤900px.

  Usage:
    <SectionNav label="Secciones de Mi cuenta" current={seccion} items={[
      { id: 'perfil', label: 'Perfil', icon: 'user', href: '?seccion=perfil' },
      { id: 'seguridad', label: 'Seguridad', icon: 'shield-halved', href: '?seccion=seguridad' },
    ]} />

    <SectionNav label="Usuarios" bind:current={tab} items={TABS} onSelect={load} />
-->
<script lang="ts">
  import type { ClassValue } from 'svelte/elements';
  import { prefersReducedMotion } from '#lib/reduced-motion.js';
  import Icon from './Icon.svelte';
  import {
    centredScrollLeft,
    rovingTarget,
    sectionNavMode,
    type SectionNavItem,
  } from './section-nav';

  interface Props {
    items: SectionNavItem[];
    /** The active item's id. Bindable: button mode writes the selection back. */
    current?: string;
    /** The nav landmark's accessible name, e.g. "Secciones de Mi cuenta". */
    label: string;
    /** Button mode: a section was chosen (not called for the current one). */
    onSelect?: (id: string) => void;
    class?: ClassValue;
  }

  let { items, current = $bindable(), label, onSelect, class: className = '' }: Props = $props();

  const mode = $derived(sectionNavMode(items));
  const currentIndex = $derived(items.findIndex((item) => item.id === current));

  /** Button mode: the item the arrows last moved to; -1 follows `current`. */
  let focusIndex = $state(-1);
  const tabStop = $derived(
    focusIndex >= 0 && focusIndex < items.length ? focusIndex : Math.max(currentIndex, 0),
  );

  let list = $state<HTMLUListElement>();
  const buttons: HTMLButtonElement[] = [];

  function select(id: string): void {
    focusIndex = -1;
    if (id === current) return;
    current = id;
    onSelect?.(id);
  }

  function handleKeydown(event: KeyboardEvent, index: number): void {
    const target = rovingTarget(event.key, index, items.length);
    if (target === null) return;
    event.preventDefault();
    focusIndex = target;
    buttons[target]?.focus();
  }

  // Tabbing away hands the single tab stop back to the current section.
  function handleFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !list?.contains(next)) focusIndex = -1;
  }

  // Keep the current item in view inside the pill bar. Only the bar moves:
  // scrollIntoView() would also scroll the page to reach it.
  let settled = false;
  $effect(() => {
    void current;
    const bar = list;
    if (!bar) return;
    const active = bar.querySelector<HTMLElement>('[aria-current]');
    if (active && bar.scrollWidth > bar.clientWidth) {
      const left = centredScrollLeft(
        active.offsetLeft,
        active.offsetWidth,
        bar.clientWidth,
        bar.scrollWidth,
      );
      const smooth = settled && !prefersReducedMotion.current;
      bar.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
    }
    settled = true;
  });
</script>

{#snippet content(item: SectionNavItem)}
  {#if item.icon}<Icon name={item.icon} class="ird-snav__icon" />{/if}
  <span class="ird-snav__label">{item.label}</span>
{/snippet}

<nav class={['ird-snav', className]} aria-label={label}>
  <!-- role="list" restores the list semantics `list-style: none` strips in Safari. -->
  <ul
    class="ird-snav__list"
    role="list"
    bind:this={list}
    onfocusout={mode === 'buttons' ? handleFocusOut : undefined}
  >
    {#each items as item, i (item.id)}
      <li class="ird-snav__entry">
        {#if mode === 'links'}
          <!-- The href is the caller's, already resolved (or a bare ?query) —
               a library primitive cannot resolve() what it does not own. -->
          <!-- eslint-disable svelte/no-navigation-without-resolve -->
          <a
            class="ird-snav__item"
            href={item.href}
            aria-current={item.id === current ? 'page' : undefined}
          >
            {@render content(item)}
          </a>
          <!-- eslint-enable svelte/no-navigation-without-resolve -->
        {:else}
          <button
            type="button"
            class="ird-snav__item"
            bind:this={buttons[i]}
            aria-current={item.id === current ? 'true' : undefined}
            tabindex={i === tabStop ? 0 : -1}
            onclick={() => select(item.id)}
            onkeydown={(event) => handleKeydown(event, i)}
          >
            {@render content(item)}
          </button>
        {/if}
      </li>
    {/each}
  </ul>
</nav>

<style>
  .ird-snav {
    min-width: 0;
    max-width: 100%;
  }

  .ird-snav__list {
    position: relative; /* the items' offsetParent, for the bar arithmetic */
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .ird-snav__item {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    width: 100%;
    min-height: 2.5rem;
    padding: 0.45rem 0.75rem;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-size: var(--fs-sm);
    font-weight: var(--fw-medium);
    line-height: 1.3;
    text-align: start;
    text-decoration: none;
    cursor: pointer;
    transition:
      background-color 0.15s cubic-bezier(0.22, 1, 0.36, 1),
      border-color 0.15s cubic-bezier(0.22, 1, 0.36, 1),
      color 0.15s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .ird-snav__item :global(.ird-snav__icon) {
    flex: 0 0 1.25rem;
    width: 1.25rem;
    color: var(--color-muted);
    font-size: var(--fs-md);
    text-align: center;
  }

  @media (hover: hover) {
    .ird-snav__item:not([aria-current]):hover {
      background: rgba(127, 127, 127, 0.12);
    }
  }

  .ird-snav__item:not([aria-current]):active {
    background: rgba(127, 127, 127, 0.18);
  }

  .ird-snav__item:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }

  /* The admin's active item (visual brief): solid slate fill, light ink —
     plus a --color-text edge. In dark mode the slate fill sits at ~1.4:1 on
     the page, so the edge is what marks the state (WCAG 1.4.11); in light
     mode it melts into the fill. */
  .ird-snav__item[aria-current] {
    border-color: var(--color-text);
    background: var(--color-dark);
    color: var(--color-white);
    font-weight: var(--fw-semibold);
  }

  .ird-snav__item[aria-current] :global(.ird-snav__icon) {
    color: inherit;
  }

  /* ≤900px: a pill bar that scrolls by itself. The padding keeps the focus
     ring inside the scroller, which would otherwise clip it. */
  @media (max-width: 900px) {
    .ird-snav__list {
      flex-direction: row;
      gap: 0.4rem;
      padding: 0.3rem;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      scroll-padding-inline: 1rem;
      scrollbar-width: thin;
    }

    .ird-snav__entry {
      flex: 0 0 auto;
    }

    .ird-snav__item {
      width: auto;
      min-height: 2.75rem;
      padding: 0.5rem 1rem;
      border-color: rgba(127, 127, 127, 0.18);
      border-radius: var(--radius-full);
      white-space: nowrap;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ird-snav__item {
      transition: none;
    }
  }
</style>
