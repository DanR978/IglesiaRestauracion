<!--
  Disclosure — the one expand/collapse (S21, DESIGN-SYSTEM §4.4).
  Retires `.se-collapse` + `wireCollapse()` and every per-namespace collapse
  (`js/pages/admin/special-events-tab.js`, discipleship Miembros, the report
  "Secciones" group). docs/admin-ux.md §1: secondary controls — QR/share,
  Filtros, bulk/config — start COLLAPSED behind a labeled toggle.

  Three things the legacy got wrong and this fixes:
   • `refresh()` — content can be reloaded programmatically WITHOUT
     re-toggling. The discipleship panel is refreshed today by calling
     openMembersInline() twice through reopenMembers().
   • the ACTIVE STATE IS VISIBLE WHILE COLLAPSED (`summary` / `count`), so a
     filter panel does not hide what it is filtering by.
   • ids are per-instance (`$props.id()`), so two Disclosures can never share
     one element id the way the two legacy `#presetModal` blocks do (G-009).

  Do not default-collapse a panel that IS the primary control of the screen
  (the report builder's "Secciones") — that is the legacy mistake, not a
  pattern.

  Usage:
    <Disclosure label="Filtros" icon="filter" count={activeFilters}>
      …panel content…
    </Disclosure>

    let panel: Disclosure;
    <Disclosure bind:this={panel} label="Miembros" onLoad={loadMembers}>…</Disclosure>
    await panel.refresh();   // reload without collapsing
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { prefersReducedMotion } from '$lib/reduced-motion';
  import Icon from './Icon.svelte';

  interface Props {
    /** Trigger text. Spanish, user-facing. */
    label: string;
    /** Font Awesome name (no `fa-`) shown before the label. */
    icon?: string;
    /** Expanded state. Bindable; defaults to collapsed (admin-ux §1). */
    open?: boolean;
    disabled?: boolean;
    /** The applied state, readable WHILE COLLAPSED (e.g. "Este mes · Misiones"). */
    summary?: string;
    /** Badge on the trigger — how many filters/items are active. 0 hides it. */
    count?: number;
    /** Explicit panel id. One is generated per instance when omitted. */
    panelId?: string;
    /**
     * Loads the panel's content. Called once when the panel first opens, and
     * again by refresh(). Optional — content that is already reactive needs it
     * not.
     */
    onLoad?: () => void | Promise<void>;
    /** Notified after every toggle, with the new state. */
    onToggle?: (open: boolean) => void;
    children: Snippet;
    /** Controls rendered beside the trigger, outside its hit area. */
    trailing?: Snippet;
  }

  let {
    label,
    icon,
    open = $bindable(false),
    disabled = false,
    summary,
    count,
    panelId,
    onLoad,
    onToggle,
    children,
    trailing,
  }: Props = $props();

  const uid = $props.id();
  const bodyId = $derived(panelId ?? `disclosure-panel-${uid}`);
  const triggerId = `disclosure-trigger-${uid}`;

  let loading = $state(false);
  let animating = $state(false);
  /** Non-reactive: the first open triggers onLoad, later ones do not. */
  let loadedOnce = false;

  async function runLoad(): Promise<void> {
    if (!onLoad) return;
    loading = true;
    try {
      await onLoad();
    } finally {
      loading = false;
    }
  }

  // Lazy content loads the first time the panel is shown — whether the user
  // toggled it or the parent set `open` through the binding.
  $effect(() => {
    if (!open || loadedOnce) return;
    loadedOnce = true;
    void runLoad();
  });

  /**
   * Reload the panel's content in place. Safe while collapsed, and it never
   * toggles — this is what replaces the legacy "call the opener twice" hack.
   */
  export async function refresh(): Promise<void> {
    loadedOnce = true;
    await runLoad();
  }

  function toggle(): void {
    if (disabled) return;
    open = !open;
    // Guarded in JS as well as CSS: with the animation off there is no
    // animationend to clear the flag.
    if (open) animating = !prefersReducedMotion.current;
    onToggle?.(open);
  }

  const hasCount = $derived(typeof count === 'number' && count > 0);
</script>

<div class="disclosure" class:is-open={open} class:is-disabled={disabled}>
  <div class="disclosure__head">
    <button
      type="button"
      id={triggerId}
      class="disclosure__trigger"
      class:is-active={open}
      aria-expanded={open}
      aria-controls={bodyId}
      {disabled}
      onclick={toggle}
    >
      {#if icon}
        <Icon name={icon} class="disclosure__icon" />
      {/if}
      <span class="disclosure__label">{label}</span>
      {#if hasCount}
        <span class="disclosure__count">{count}</span>
      {/if}
      {#if summary}
        <span class="disclosure__summary">{summary}</span>
      {/if}
      <Icon name="chevron-down" class="disclosure__chevron" />
    </button>
    {#if trailing}
      <div class="disclosure__trailing">{@render trailing()}</div>
    {/if}
  </div>

  <div
    class="disclosure__panel"
    class:is-animating={animating}
    id={bodyId}
    role="region"
    aria-labelledby={triggerId}
    aria-busy={loading || undefined}
    hidden={!open}
    onanimationend={() => (animating = false)}
  >
    <div class="disclosure__inner">
      {@render children()}
    </div>
  </div>
</div>

<style>
  .disclosure {
    margin-block-end: var(--mg-sm);
  }

  .disclosure__head {
    display: flex;
    align-items: center;
    gap: var(--mg-xs);
    flex-wrap: wrap;
  }

  /* The toggle. A real <button>: Enter/Space come free, and it is reachable by
     tap — never a hover-only affordance (DESIGN-SYSTEM §1). */
  .disclosure__trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    min-height: 2.75rem; /* ≥44px touch target */
    padding: 0.5rem 0.9rem;
    border: 1.5px solid var(--gray-50);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-size: var(--fs-btn);
    font-weight: var(--fw-semibold);
    cursor: pointer;
    transition:
      border-color 0.15s cubic-bezier(0.22, 1, 0.36, 1),
      background-color 0.15s cubic-bezier(0.22, 1, 0.36, 1),
      color 0.15s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .disclosure__trigger:hover:not(:disabled) {
    border-color: var(--color-dark);
    color: var(--color-text);
  }

  .disclosure__trigger:active:not(:disabled) {
    transform: scale(0.98);
  }

  /* The global :focus-visible ring (S12 base/reset.css) is the baseline; this
     only reinforces the border so the control reads as focused on a light row. */
  .disclosure__trigger:focus-visible {
    border-color: var(--color-dark);
  }

  .disclosure__trigger.is-active {
    border-color: var(--color-dark);
    background: var(--color-dark);
    color: var(--color-white);
  }

  .disclosure__trigger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .disclosure__label {
    white-space: nowrap;
  }

  /* Active state visible WHILE COLLAPSED — the count badge and the summary are
     the panel's applied state, surfaced without expanding it. */
  .disclosure__count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.35rem;
    padding: 0 0.35rem;
    border-radius: var(--radius-full);
    background: var(--color-secondary);
    color: var(--color-white);
    font-size: var(--fs-xxs);
    font-weight: var(--fw-bold);
    font-variant-numeric: tabular-nums;
  }

  .disclosure__summary {
    max-width: 22ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--fs-xs);
    font-weight: var(--fw-regular);
    color: var(--color-muted);
  }

  .disclosure__trigger.is-active .disclosure__summary {
    color: var(--color-white);
    opacity: 0.85;
  }

  .disclosure__trigger :global(.disclosure__chevron) {
    margin-inline-start: 0.15rem;
    transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .disclosure__trigger.is-active :global(.disclosure__chevron) {
    transform: rotate(180deg);
  }

  .disclosure__trailing {
    display: inline-flex;
    align-items: center;
    gap: var(--mg-xs);
  }

  /* The panel. `hidden` is the state (admin-ux §1); the open animation runs on
     the frame the element becomes rendered. `overflow: hidden` is carried only
     while animating, so an absolutely-positioned child inside the panel is not
     clipped at rest. */
  .disclosure__panel {
    display: grid;
    grid-template-rows: 1fr;
    margin-block-start: var(--mg-xs);
  }

  .disclosure__panel[hidden] {
    display: none;
  }

  .disclosure__panel.is-animating {
    overflow: hidden;
    animation: disclosure-open 0.18s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .disclosure__inner {
    min-height: 0;
  }

  @keyframes disclosure-open {
    from {
      grid-template-rows: 0fr;
      opacity: 0;
    }
    to {
      grid-template-rows: 1fr;
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .disclosure__panel.is-animating {
      animation: none;
      overflow: visible;
    }
    .disclosure__trigger,
    .disclosure__trigger :global(.disclosure__chevron) {
      transition: none;
    }
    .disclosure__trigger:active:not(:disabled) {
      transform: none;
    }
  }
</style>
