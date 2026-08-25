<!--
  ActionSheet — the one contextual menu (S17, DESIGN-SYSTEM §4.2).

  Desktop: a popover anchored to the trigger — right-aligned, below it, flipped
  above when it would overflow the viewport bottom, clamped 12px inside both
  gutters, and repositioned on scroll + resize.
  Mobile (≤640px): a bottom sheet that slides up, with an explicit "Cancelar" row.

  role="menu" + role="menuitem" rows with a roving tabindex: ↑/↓ wrap, Home/End
  jump, Escape and Tab close and return focus to the trigger. Disabled rows stay
  focusable (aria-disabled) so they remain discoverable, but do nothing.

  Most callers use showActionSheet() + <ActionSheetHost/> instead of mounting
  this directly; see $lib/components/action-sheet.svelte.
-->
<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { motionMs } from '$lib/reduced-motion';
  import {
    ACTION_DEFER_MS,
    CLOSE_MS,
    DEFAULT_CANCEL_LABEL,
    DEFAULT_MENU_LABEL,
    buildSections,
    countRows,
    isMobileViewport,
    popoverPosition,
    type RenderRow,
    type SheetAction,
    type SheetGroup,
  } from './action-sheet.svelte';

  interface Props {
    /** Two-way: the sheet sets it false when it closes itself. */
    open?: boolean;
    /** Anchor for the popover and the element focus returns to. */
    trigger?: HTMLElement | null;
    title?: string;
    subtitle?: string;
    actions: SheetAction[];
    groups?: SheetGroup[];
    /** Mobile-only cancel row; `false` removes it. */
    cancelLabel?: string | false;
    /** Fired once the close animation has finished and the sheet is gone. */
    onclose?: () => void;
  }

  let {
    open = $bindable(false),
    trigger = null,
    title,
    subtitle,
    actions,
    groups,
    cancelLabel = DEFAULT_CANCEL_LABEL,
    onclose,
  }: Props = $props();

  const uid = $props.id();

  // `visible` = in the DOM (stays true through the close animation).
  // `shown`   = has .is-open, i.e. the animation has been kicked off.
  let visible = $state(false);
  let shown = $state(false);
  let positioned = $state(false);
  let mobile = $state(false);
  let flipped = $state(false);
  let top = $state(0);
  let left = $state(0);
  let focusIndex = $state(0);
  let sheetEl: HTMLDivElement | null = $state(null);

  const sections = $derived(buildSections(actions, groups));
  const rowCount = $derived(countRows(sections));
  const hasHeader = $derived(Boolean(title || subtitle));
  const showCancel = $derived(mobile && cancelLabel !== false && cancelLabel !== '');
  const cancelIndex = $derived(rowCount);
  const menuLabel = $derived([title, subtitle].filter(Boolean).join(' · ') || DEFAULT_MENU_LABEL);

  // Non-reactive bookkeeping: edge detection, timers and the focus/aria state
  // we borrowed from the trigger.
  let wasOpen = false;
  let closing = false;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let actionTimer: ReturnType<typeof setTimeout> | undefined;
  let frame = 0;
  let returnTo: HTMLElement | null = null;
  let priorHasPopup: string | null = null;
  let priorExpanded: string | null = null;
  // The anchor is captured at open time and never re-read from props. Props are
  // lazy getters: by teardown the host's request may already be null (or the
  // NEXT request), so reading `trigger` there would throw or restore the wrong
  // element's aria attributes.
  let anchor: HTMLElement | null = null;

  $effect(() => {
    const next = open;
    if (next === wasOpen) return;
    if (next) void doOpen();
    else close();
  });

  onDestroy(() => {
    clearTimeout(closeTimer);
    clearTimeout(actionTimer);
    if (frame) cancelAnimationFrame(frame);
    detach();
    restoreTrigger();
  });

  function menuItems(): HTMLElement[] {
    if (!sheetEl) return [];
    return Array.from(sheetEl.querySelectorAll<HTMLElement>('[role="menuitem"]'));
  }

  function focusItem(i: number): void {
    const items = menuItems();
    if (!items.length) {
      sheetEl?.focus();
      return;
    }
    const next = ((i % items.length) + items.length) % items.length;
    focusIndex = next;
    items[next]?.focus();
  }

  function reposition(): void {
    mobile = isMobileViewport();
    if (mobile || !sheetEl || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const pos = popoverPosition(
      { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left },
      { width: sheetEl.offsetWidth, height: sheetEl.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
    top = pos.top;
    left = pos.left;
    flipped = pos.flipped;
  }

  function onViewportChange(): void {
    if (visible) reposition();
  }

  function onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    close();
  }

  function attach(): void {
    window.addEventListener('resize', onViewportChange, { passive: true });
    window.addEventListener('scroll', onViewportChange, { passive: true, capture: true });
    document.addEventListener('keydown', onDocumentKeydown);
  }

  function detach(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('resize', onViewportChange);
    window.removeEventListener('scroll', onViewportChange, { capture: true });
    document.removeEventListener('keydown', onDocumentKeydown);
  }

  function markTrigger(): void {
    anchor = trigger ?? null;
    if (!anchor) return;
    priorHasPopup = anchor.getAttribute('aria-haspopup');
    priorExpanded = anchor.getAttribute('aria-expanded');
    anchor.setAttribute('aria-haspopup', 'menu');
    anchor.setAttribute('aria-expanded', 'true');
  }

  function restoreTrigger(): void {
    const el = anchor;
    anchor = null;
    if (!el) return;
    for (const [attr, prior] of [
      ['aria-haspopup', priorHasPopup],
      ['aria-expanded', priorExpanded],
    ] as const) {
      if (prior === null) el.removeAttribute(attr);
      else el.setAttribute(attr, prior);
    }
    priorHasPopup = null;
    priorExpanded = null;
  }

  async function doOpen(): Promise<void> {
    if (typeof window === 'undefined') return;
    wasOpen = true;
    closing = false;
    clearTimeout(closeTimer);
    markTrigger();
    returnTo = anchor ?? (document.activeElement as HTMLElement | null);
    visible = true;
    // Wait for the panel to exist before measuring it — the popover is
    // visibility:hidden until `positioned`, so nothing flashes at 0,0.
    await tick();
    reposition();
    positioned = true;
    // …and wait again: focus() is a no-op on a visibility:hidden element, so
    // the class has to reach the DOM before we move focus into the sheet.
    await tick();
    attach();
    focusItem(0);
    frame = requestAnimationFrame(() => {
      frame = 0;
      shown = true;
    });
  }

  function close(run?: () => void | Promise<void>): void {
    if (!visible || closing) return;
    closing = true;
    wasOpen = false;
    open = false;
    shown = false;
    detach();
    restoreTrigger();

    const back = returnTo;
    returnTo = null;
    if (back?.isConnected) back.focus();

    if (run) actionTimer = setTimeout(() => void runAction(run), motionMs(ACTION_DEFER_MS));
    closeTimer = setTimeout(() => {
      visible = false;
      positioned = false;
      closing = false;
      onclose?.();
    }, motionMs(CLOSE_MS));
  }

  async function runAction(run: () => void | Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      console.error('[action-sheet] action failed:', error);
    }
  }

  function activate(action: SheetAction): void {
    if (action.disabled) return;
    close(action.onClick);
  }

  function onSheetKeydown(event: KeyboardEvent): void {
    const last = showCancel ? cancelIndex : rowCount - 1;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusItem(focusIndex + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusItem(focusIndex - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusItem(0);
        break;
      case 'End':
        event.preventDefault();
        focusItem(last);
        break;
      case 'Tab':
        // A menu is not part of the tab sequence: Tab dismisses it (APG menu
        // button) rather than letting focus wander behind the backdrop.
        event.preventDefault();
        close();
        break;
      default:
        break;
    }
  }
</script>

{#snippet row(item: RenderRow)}
  <button
    type="button"
    class="act-sheet__row act-sheet__row--{item.action.variant ?? 'default'}"
    class:act-sheet__row--divided={!item.first}
    role="menuitem"
    tabindex={item.index === focusIndex ? 0 : -1}
    aria-disabled={item.action.disabled ? 'true' : undefined}
    onclick={() => activate(item.action)}
    onfocus={() => (focusIndex = item.index)}
  >
    {#if item.icon}
      <Icon name={item.icon} class="act-sheet__icon" />
    {/if}
    <span class="act-sheet__label">
      <span class="act-sheet__label-main">{item.action.label}</span>
      {#if item.action.description}
        <span class="act-sheet__label-sub">{item.action.description}</span>
      {/if}
    </span>
  </button>
{/snippet}

{#if visible}
  <!-- Scrim. A button so the dismiss affordance is a real control rather than a
       click handler on a div; hidden from assistive tech because Escape and the
       Cancelar row are the accessible ways out. -->
  <button
    type="button"
    class="act-sheet-backdrop"
    class:act-sheet-backdrop--mobile={mobile}
    class:is-open={shown}
    tabindex="-1"
    aria-hidden="true"
    onclick={(event) => {
      event.stopPropagation();
      close();
    }}
  ></button>

  <div
    bind:this={sheetEl}
    class="act-sheet"
    class:act-sheet--mobile={mobile}
    class:act-sheet--popover={!mobile}
    class:act-sheet--up={flipped}
    class:is-open={shown}
    class:is-positioned={positioned}
    role="menu"
    tabindex="-1"
    aria-label={menuLabel}
    aria-orientation="vertical"
    style:--act-sheet-top="{top}px"
    style:--act-sheet-left="{left}px"
    onkeydown={onSheetKeydown}
    onclick={(event) => event.stopPropagation()}
  >
    <div class="act-sheet__card">
      {#if hasHeader}
        <!-- The menu already carries this text as its accessible name. -->
        <div class="act-sheet__header" aria-hidden="true">
          {#if title}<span class="act-sheet__title">{title}</span>{/if}
          {#if subtitle}<span class="act-sheet__subtitle">{subtitle}</span>{/if}
        </div>
      {/if}

      {#each sections as section, i (section.id || `_${i}`)}
        {#if i > 0}
          <div class="act-sheet__divider" role="separator"></div>
        {/if}
        {#if section.label}
          <div class="act-sheet__group" role="group" aria-labelledby="{uid}-s{i}">
            <span class="act-sheet__section-label" id="{uid}-s{i}">{section.label}</span>
            {#each section.rows as item (item.index)}{@render row(item)}{/each}
            {#if !section.rows.length && section.empty}
              <p class="act-sheet__empty">{section.empty}</p>
            {/if}
          </div>
        {:else}
          {#each section.rows as item (item.index)}{@render row(item)}{/each}
          {#if !section.rows.length && section.empty}
            <p class="act-sheet__empty">{section.empty}</p>
          {/if}
        {/if}
      {/each}
    </div>

    {#if showCancel}
      <button
        type="button"
        class="act-sheet__cancel"
        role="menuitem"
        tabindex={cancelIndex === focusIndex ? 0 : -1}
        onclick={() => close()}
        onfocus={() => (focusIndex = cancelIndex)}
      >
        {cancelLabel}
      </button>
    {/if}
  </div>
{/if}

<style>
  .act-sheet-backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-action-backdrop);
    padding: 0;
    border-radius: 0;
    background: transparent;
    cursor: default;
    transition: background-color 220ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* Only the bottom sheet dims the page; the desktop popover is a light
     dismiss layer, exactly as in legacy. --static-black does not reverse with
     the theme — a scrim must darken in both palettes. */
  .act-sheet-backdrop--mobile.is-open {
    background: color-mix(in srgb, var(--static-black) 32%, transparent);
  }

  .act-sheet {
    position: fixed;
    z-index: var(--z-action-sheet);
    opacity: 0;
    pointer-events: none;
    font-family: var(--font-base);
    transition:
      opacity 220ms cubic-bezier(0.22, 1, 0.36, 1),
      transform 240ms cubic-bezier(0.22, 1, 0.36, 1);

    /* Ink for the two loud variants. --color-danger / --color-warn are FILL
       colours (3.1:1 as text on white); DESIGN-SYSTEM §2.1 sends TEXT to the
       AA-tuned, theme-reversing money/status inks instead. */
    --act-ink-warn: var(--money-warn);
    --act-ink-danger: var(--money-neg);
    /* Theme-neutral hairline: reverses with --color-text, so it is a dark rule
       on a light card and a light rule on a dark one. */
    --act-hairline: color-mix(in srgb, var(--color-text) 12%, transparent);
    --act-wash: color-mix(in srgb, var(--color-text) 6%, transparent);
    --act-wash-strong: color-mix(in srgb, var(--color-text) 11%, transparent);
  }

  .act-sheet.is-open {
    opacity: 1;
    pointer-events: auto;
  }

  /* ── Popover (desktop) ─────────────────────────────────────────────────── */
  .act-sheet--popover {
    top: var(--act-sheet-top, 0);
    left: var(--act-sheet-left, 0);
    min-width: 13.75rem;
    max-width: 17.5rem;
    transform: scale(0.96) translateY(-4px);
    transform-origin: top right;
  }

  .act-sheet--popover.act-sheet--up {
    transform: scale(0.96) translateY(4px);
    transform-origin: bottom right;
  }

  .act-sheet--popover.is-open {
    transform: scale(1) translateY(0);
  }

  /* Measured before it is placed — hidden, not merely transparent, so it never
     paints a frame at 0,0. */
  .act-sheet--popover:not(.is-positioned) {
    visibility: hidden;
  }

  /* ── Bottom sheet (≤640px) ─────────────────────────────────────────────── */
  .act-sheet--mobile {
    left: var(--pd-sm);
    right: var(--pd-sm);
    bottom: var(--pd-sm);
    transform: translateY(110%);
  }

  .act-sheet--mobile.is-open {
    transform: translateY(0);
  }

  .act-sheet__card {
    overflow: hidden;
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    box-shadow: var(--shadow-lg);
  }

  .act-sheet--mobile .act-sheet__card {
    margin-bottom: var(--mg-sm);
  }

  /* ── Header ────────────────────────────────────────────────────────────── */
  .act-sheet__header {
    display: flex;
    flex-direction: column;
    gap: var(--mg-xxs);
    padding: var(--pd-sm);
    border-bottom: 1px solid var(--act-hairline);
    text-align: center;
  }

  .act-sheet__title {
    font-size: var(--fs-xs);
    font-weight: var(--fw-semibold);
    color: var(--color-text);
    overflow-wrap: anywhere;
  }

  .act-sheet__subtitle {
    font-size: var(--fs-xxs);
    color: var(--color-muted);
    overflow-wrap: anywhere;
  }

  /* ── Sections ──────────────────────────────────────────────────────────── */
  .act-sheet__group {
    display: flex;
    flex-direction: column;
  }

  .act-sheet__section-label {
    padding: var(--pd-xs) var(--pd-sm);
    font-size: var(--fs-xxs);
    font-weight: var(--fw-semibold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-muted);
  }

  .act-sheet__divider {
    height: 1px;
    background: var(--act-hairline);
  }

  .act-sheet__empty {
    margin: 0;
    padding: var(--pd-sm);
    font-size: var(--fs-sm);
    color: var(--color-muted);
    text-align: center;
  }

  /* ── Rows ──────────────────────────────────────────────────────────────── */
  .act-sheet__row {
    display: flex;
    align-items: center;
    gap: var(--mg-sm);
    width: 100%;
    padding: var(--pd-sm);
    background: transparent;
    font-family: inherit;
    font-size: var(--fs-base);
    line-height: 1.3;
    color: var(--color-text);
    text-align: left;
    transition: background-color 120ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .act-sheet__row--divided {
    border-top: 1px solid var(--act-hairline);
  }

  /* PORT-DEBT S17: the legacy default row was iOS blue #0a84ff. --color-text is
     the slate the spec asks for AND the token that reverses — --color-dark
     would be dark-on-dark on a dark --color-surface (CLAUDE.md §4). */
  .act-sheet__row--warn {
    color: var(--act-ink-warn);
  }

  .act-sheet__row--danger {
    color: var(--act-ink-danger);
  }

  /* Hover is never the only cue: focus-visible paints the same wash, and touch
     gets :active. */
  @media (hover: hover) {
    .act-sheet__row:hover:not([aria-disabled='true']) {
      background: var(--act-wash);
    }
  }

  .act-sheet__row:active:not([aria-disabled='true']) {
    background: var(--act-wash-strong);
  }

  /* Rows run edge to edge inside an overflow:hidden card, so the ring is drawn
     inside the row instead of the global +2px offset (which would be clipped). */
  .act-sheet__row:focus-visible,
  .act-sheet__cancel:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: -3px;
    background: var(--act-wash);
  }

  .act-sheet__row[aria-disabled='true'] {
    color: var(--color-muted);
    cursor: not-allowed;
  }

  .act-sheet__row :global(.act-sheet__icon) {
    width: 1.25em;
    flex-shrink: 0;
    text-align: center;
  }

  .act-sheet__label {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .act-sheet__label-main {
    overflow-wrap: anywhere;
  }

  .act-sheet__label-sub {
    font-size: var(--fs-xs);
    color: var(--color-muted);
    overflow-wrap: anywhere;
  }

  /* ── Cancel (bottom sheet only) ────────────────────────────────────────── */
  .act-sheet__cancel {
    display: block;
    width: 100%;
    padding: var(--pd-sm);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    box-shadow: var(--shadow-lg);
    font-family: inherit;
    font-size: var(--fs-base);
    font-weight: var(--fw-semibold);
    color: var(--color-text);
    transition: background-color 120ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .act-sheet__cancel:active {
    background: var(--act-wash-strong);
  }

  @media (hover: hover) {
    .act-sheet__cancel:hover {
      background: var(--act-wash);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .act-sheet,
    .act-sheet-backdrop,
    .act-sheet__row,
    .act-sheet__cancel {
      transition: none;
    }

    .act-sheet--popover,
    .act-sheet--popover.act-sheet--up,
    .act-sheet--mobile {
      transform: none;
    }
  }
</style>
