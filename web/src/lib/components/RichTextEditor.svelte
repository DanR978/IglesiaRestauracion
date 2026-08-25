<!--
  RichTextEditor — the one rich-text field (S18, DESIGN-SYSTEM §4.3 `rich-text`).
  Port of js/lib/rich-text.js `mountRichText()`: the same Teams-style compose box
  (clean writing surface, formatting bar hidden behind a "Formato" toggle), the
  same execCommand commands, icons and Spanish labels.

  TWO RULES HOLD THIS COMPONENT UP.

  1. SANITIZE BOTH WAYS (MIGRATION.md D-005). Everything that enters the surface
     — an initial `value`, a programmatic setHtml(), a paste, a drop — goes
     through the allowlist first, and everything that leaves it (getHtml(), the
     bound `value`, `onchange`) is sanitized again. The registrations form's two
     editors are stored and re-rendered on the PUBLIC event page, so neither
     direction may assume the other one cleaned up.

  2. THE CARET NEVER MOVES WHILE YOU TYPE. The writing surface is a
     contenteditable managed IMPERATIVELY: `innerHTML` is written only by
     applyHtml(), and only when the incoming value differs from the last value
     this component itself emitted. Typing emits, the echo comes back, the guard
     matches and the DOM is left alone — Svelte never re-renders the surface, so
     the selection survives. NEVER bind innerHTML to reactive state here.

  The value is `$bindable`, and the legacy imperative API (getHtml / setHtml /
  focus / isEmpty) is exported as component methods for `bind:this`, so both a
  Svelte-idiomatic form and a ported screen can drive it.
-->
<script lang="ts">
  import Icon from './Icon.svelte';
  import { htmlIsEmpty, sanitizeHtml } from '$lib/sanitize-html';
  import {
    RICH_TEXT_DEFAULT_COLOR,
    RICH_TEXT_STATEFUL_COMMANDS,
    RICH_TEXT_SWATCHES,
    RICH_TEXT_TOOL_GROUPS,
    normalizeLinkUrl,
    safeHexColor,
    type RichTextCommand,
  } from './rich-text';

  interface Props {
    /** The sanitized HTML. Bindable: reading it back after an edit is safe to store. */
    value?: string;
    /** Visible field label. Give this or `ariaLabel` — the surface needs a name. */
    label?: string;
    /** Accessible name when the label lives elsewhere (a wizard step heading). */
    ariaLabel?: string;
    /** Shown while the surface is empty (legacy `data-ph`). */
    placeholder?: string;
    /** Help text under the field, wired through `aria-describedby`. */
    hint?: string;
    /** Read-only: the surface stops accepting input and the toolbar is unavailable. */
    disabled?: boolean;
    /** Fires on every edit with the sanitized HTML. Not fired by setHtml(). */
    onchange?: (html: string) => void;
    class?: string;
  }

  let {
    value = $bindable(''),
    label,
    ariaLabel,
    placeholder = '',
    hint,
    disabled = false,
    onchange,
    class: className = '',
  }: Props = $props();

  const uid = $props.id();
  const labelId = `${uid}-label`;
  const hintId = `${uid}-hint`;
  const toolbarId = `${uid}-toolbar`;
  const colorPanelId = `${uid}-color`;
  const linkPanelId = `${uid}-link`;

  /** The roving-focus order across the toolbar, colour trigger included. */
  const TOOLBAR_KEYS: readonly string[] = RICH_TEXT_TOOL_GROUPS.flatMap((group) =>
    group.id === 'color' ? ['color'] : group.tools.map((tool) => tool.command),
  );

  let root: HTMLDivElement | undefined = $state();
  let area: HTMLDivElement | undefined = $state();
  let toolbarOpen = $state(false);
  let panel: 'color' | 'link' | null = $state(null);
  let empty = $state(true);
  let active: Partial<Record<RichTextCommand, boolean>> = $state({});
  let swatch = $state(RICH_TEXT_DEFAULT_COLOR);
  let linkUrl = $state('');
  let focusKey = $state(TOOLBAR_KEYS[0]);

  // Deliberately NOT $state: this is the echo guard. If it were reactive the
  // $effect below would re-run on every keystroke and rewrite the surface.
  let lastEmitted = '';
  let savedRange: Range | null = null;

  /**
   * Push `html` into the surface. The ONLY place `innerHTML` is written, and
   * only ever from a value that came from outside the editor.
   */
  function applyHtml(el: HTMLElement, html: string): void {
    el.innerHTML = sanitizeHtml(html);
    savedRange = null;
    lastEmitted = sanitizeHtml(el.innerHTML);
    value = lastEmitted;
    refresh();
  }

  /** Read the surface back out, sanitized, and publish it. */
  function emit(): void {
    if (!area) return;
    lastEmitted = sanitizeHtml(area.innerHTML);
    value = lastEmitted;
    onchange?.(lastEmitted);
  }

  function refresh(): void {
    if (!area) return;
    empty = !area.textContent?.trim();
    syncActive();
  }

  function selectionInside(): boolean {
    const selection = document.getSelection();
    return !!(
      area &&
      selection &&
      selection.rangeCount > 0 &&
      selection.anchorNode &&
      area.contains(selection.anchorNode)
    );
  }

  /** Mirror the browser's command state into `aria-pressed`. */
  function syncActive(): void {
    if (typeof document.queryCommandState !== 'function' || !selectionInside()) return;
    const next: Partial<Record<RichTextCommand, boolean>> = {};
    for (const command of RICH_TEXT_STATEFUL_COMMANDS) {
      try {
        next[command] = document.queryCommandState(command);
      } catch {
        next[command] = false;
      }
    }
    active = next;
  }

  function rememberSelection(): void {
    const selection = document.getSelection();
    if (!selectionInside() || !selection) return;
    savedRange = selection.getRangeAt(0).cloneRange();
  }

  /**
   * Put the caret back where it was before the toolbar took focus. The buttons
   * also cancel their `mousedown`, so this only has to cover the two controls
   * that legitimately take focus (the colour input and the link field).
   */
  function restoreSelection(el: HTMLElement): void {
    el.focus();
    const selection = document.getSelection();
    if (!selection || !savedRange || !el.contains(savedRange.commonAncestorContainer)) return;
    selection.removeAllRanges();
    selection.addRange(savedRange);
  }

  function exec(command: string, argument?: string): void {
    if (!area || disabled) return;
    restoreSelection(area);
    try {
      document.execCommand(command, false, argument);
    } catch {
      // execCommand is missing (jsdom) or refused the command — the surface is
      // simply left as it was; never let a formatting click throw at the user.
    }
    refresh();
    emit();
  }

  function runTool(command: RichTextCommand): void {
    if (command === 'createLink') {
      openLinkPanel();
      return;
    }
    panel = null;
    exec(command);
  }

  function openLinkPanel(): void {
    if (disabled) return;
    rememberSelection();
    linkUrl = '';
    panel = panel === 'link' ? null : 'link';
  }

  function toggleColorPanel(): void {
    if (disabled) return;
    rememberSelection();
    panel = panel === 'color' ? null : 'color';
  }

  function pickColor(hex: string): void {
    const safe = safeHexColor(hex);
    swatch = safe;
    panel = null;
    exec('foreColor', safe);
  }

  function applyLink(): void {
    const href = normalizeLinkUrl(linkUrl);
    panel = null;
    if (!href) return;
    exec('createLink', href);
  }

  function removeLink(): void {
    panel = null;
    exec('unlink');
  }

  function toggleToolbar(): void {
    toolbarOpen = !toolbarOpen;
    if (!toolbarOpen) panel = null;
  }

  function closePanel(returnFocusTo?: string): void {
    if (!panel) return;
    panel = null;
    const target = returnFocusTo
      ? root?.querySelector<HTMLElement>(`[data-rt-key="${returnFocusTo}"]`)
      : undefined;
    target?.focus();
  }

  function handleInput(): void {
    refresh();
    emit();
  }

  /** Paste and drop are the two ways foreign markup gets in — both are cleaned. */
  function insertClean(html: string, text: string): void {
    const clean = html
      ? sanitizeHtml(html)
      : sanitizeHtml(
          text
            .replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c)
            .replace(/\n/g, '<br>'),
        );
    try {
      document.execCommand('insertHTML', false, clean);
    } catch {
      // Same posture as exec(): a failed insert is a no-op, never an exception.
    }
    refresh();
    emit();
  }

  function handlePaste(event: ClipboardEvent): void {
    if (disabled) return;
    event.preventDefault();
    insertClean(
      event.clipboardData?.getData('text/html') ?? '',
      event.clipboardData?.getData('text/plain') ?? '',
    );
  }

  function handleDrop(event: DragEvent): void {
    if (disabled) return;
    event.preventDefault();
    // Drop the caret where the pointer is, when the browser exposes it, so the
    // content lands where the author aimed rather than at the old selection.
    const caret = caretFromPoint(event.clientX, event.clientY);
    if (caret && area?.contains(caret.commonAncestorContainer)) {
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(caret);
    } else if (area) {
      restoreSelection(area);
    }
    insertClean(
      event.dataTransfer?.getData('text/html') ?? '',
      event.dataTransfer?.getData('text/plain') ?? '',
    );
  }

  interface CaretDocument {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  }

  function caretFromPoint(x: number, y: number): Range | null {
    const doc = document as unknown as CaretDocument;
    if (typeof doc.caretRangeFromPoint === 'function') return doc.caretRangeFromPoint(x, y);
    const position = doc.caretPositionFromPoint?.(x, y);
    if (!position) return null;
    const range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
    return range;
  }

  /**
   * APG toolbar pattern: one tab stop, arrows move between the controls.
   * Escape closes an open panel and hands focus back to the control that
   * opened it — the panels live inside the toolbar, so it bubbles to here.
   */
  function handleToolbarKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && panel) {
      event.stopPropagation();
      closePanel(panel === 'color' ? 'color' : 'createLink');
      return;
    }
    if (event.target instanceof HTMLInputElement) return;
    const current = TOOLBAR_KEYS.indexOf(focusKey);
    let next = -1;
    if (event.key === 'ArrowRight') next = (current + 1) % TOOLBAR_KEYS.length;
    else if (event.key === 'ArrowLeft')
      next = (current - 1 + TOOLBAR_KEYS.length) % TOOLBAR_KEYS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TOOLBAR_KEYS.length - 1;
    if (next < 0) return;
    event.preventDefault();
    focusKey = TOOLBAR_KEYS[next];
    root?.querySelector<HTMLElement>(`[data-rt-key="${focusKey}"]`)?.focus();
  }

  /**
   * Keep the caret: cancelling mousedown stops the surface from losing focus,
   * which is what makes a formatting click apply to the current selection.
   *
   * The two PANEL TRIGGERS are exempt — they must take focus, or `aria-expanded`
   * is announced on a control nobody is on and Escape has nothing to reach. They
   * do not need the trick anyway: opening a panel calls rememberSelection() and
   * exec() puts the range back.
   */
  function keepSelection(event: MouseEvent): void {
    if (event.target instanceof HTMLInputElement) return;
    if (event.target instanceof Element && event.target.closest('[data-rt-trigger]')) return;
    event.preventDefault();
  }

  function handleLinkKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    applyLink();
  }

  // Sync an EXTERNAL value into the surface. `lastEmitted` makes our own echo a
  // no-op, which is what keeps the caret still while typing.
  $effect(() => {
    const incoming = value ?? '';
    const el = area;
    if (!el || incoming === lastEmitted) return;
    applyHtml(el, incoming);
  });

  $effect(() => {
    try {
      // Emit <span style="color:…"> rather than <font color> so the sanitizer's
      // style allowlist (not its FONT carve-out) governs the output.
      document.execCommand('styleWithCSS', false, 'true');
    } catch {
      // Not supported here; foreColor still works, it just emits <font>.
    }

    const onSelectionChange = () => {
      if (!selectionInside()) return;
      rememberSelection();
      syncActive();
    };
    const onPointerDown = (event: Event) => {
      if (event.target instanceof Node && root?.contains(event.target)) return;
      panel = null;
    };
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('mousedown', onPointerDown);
    };
  });

  export function getHtml(): string {
    return area ? sanitizeHtml(area.innerHTML) : sanitizeHtml(value);
  }

  export function setHtml(html: string): void {
    if (area) {
      applyHtml(area, html);
      return;
    }
    // Called before the surface exists: publish the value and let the mount
    // effect pour it in. `lastEmitted` is deliberately left alone — moving it
    // here would make that effect think the DOM already matched.
    value = sanitizeHtml(html);
  }

  export function focus(): void {
    area?.focus();
  }

  export function isEmpty(): boolean {
    return htmlIsEmpty(getHtml());
  }
</script>

<div
  class="rt {className}"
  class:rt--open={toolbarOpen}
  class:rt--readonly={disabled}
  bind:this={root}
>
  {#if label}
    <span class="rt__label" id={labelId}>{label}</span>
  {/if}

  <div class="rt__box">
    <div
      class="rt__toolbar"
      id={toolbarId}
      role="toolbar"
      tabindex="-1"
      aria-label="Formato de texto"
      aria-orientation="horizontal"
      hidden={!toolbarOpen}
      onmousedown={keepSelection}
      onkeydown={handleToolbarKeydown}
    >
      {#each RICH_TEXT_TOOL_GROUPS as group, groupIndex (group.id)}
        {#if groupIndex > 0}
          <span class="rt__sep" aria-hidden="true"></span>
        {/if}
        {#if group.id === 'color'}
          <button
            type="button"
            class="rt__btn rt__btn--color"
            class:is-active={panel === 'color'}
            data-rt-key="color"
            data-rt-trigger
            tabindex={focusKey === 'color' ? 0 : -1}
            title="Color del texto"
            aria-label="Color del texto"
            aria-haspopup="true"
            aria-expanded={panel === 'color'}
            aria-controls={colorPanelId}
            {disabled}
            onfocus={() => (focusKey = 'color')}
            onclick={toggleColorPanel}
          >
            <Icon set="fas" name="font" />
            <span class="rt__swatch-bar" style:--rt-swatch={swatch}></span>
          </button>
        {:else}
          <span class="rt__group">
            {#each group.tools as tool (tool.command)}
              <button
                type="button"
                class="rt__btn"
                class:is-active={active[tool.command]}
                data-rt-key={tool.command}
                data-rt-trigger={tool.command === 'createLink' ? '' : undefined}
                tabindex={focusKey === tool.command ? 0 : -1}
                title={tool.label}
                aria-label={tool.label}
                aria-pressed={tool.stateful ? !!active[tool.command] : undefined}
                aria-expanded={tool.command === 'createLink' ? panel === 'link' : undefined}
                aria-controls={tool.command === 'createLink' ? linkPanelId : undefined}
                {disabled}
                onfocus={() => (focusKey = tool.command)}
                onclick={() => runTool(tool.command)}
              >
                <Icon set="fas" name={tool.icon} />
              </button>
            {/each}
          </span>
        {/if}
      {/each}

      <!-- The panels sit IN FLOW on their own toolbar row instead of floating.
           An absolutely-positioned popover has to solve viewport collision to
           stay inside a 360px screen or a modal; a wrapped flex row cannot
           overflow at any width. -->
      {#if panel === 'color'}
        <div class="rt__panel" id={colorPanelId}>
          <span class="rt__panel-label">Color del texto</span>
          <div class="rt__swatches">
            {#each RICH_TEXT_SWATCHES as option (option.value)}
              <button
                type="button"
                class="rt__swatch"
                style:--rt-swatch={option.value}
                title={option.label}
                aria-label={option.label}
                onclick={() => pickColor(option.value)}
              ></button>
            {/each}
          </div>
          <label class="rt__custom">
            <span>Personalizado</span>
            <input
              type="color"
              value={swatch}
              aria-label="Color personalizado"
              oninput={(event) => pickColor(event.currentTarget.value)}
            />
          </label>
        </div>
      {/if}

      {#if panel === 'link'}
        <div class="rt__panel" id={linkPanelId}>
          <label class="rt__panel-label" for="{uid}-link-url">Dirección del enlace</label>
          <div class="rt__panel-row">
            <!-- svelte-ignore a11y_autofocus -->
            <input
              id="{uid}-link-url"
              class="rt__input"
              type="url"
              inputmode="url"
              autocomplete="off"
              placeholder="https://"
              bind:value={linkUrl}
              onkeydown={handleLinkKeydown}
              autofocus
            />
            <button type="button" class="rt__panel-btn" onclick={applyLink}>Aplicar</button>
            <button type="button" class="rt__panel-btn" onclick={removeLink}>Quitar</button>
          </div>
        </div>
      {/if}
    </div>

    <div
      class="rt__area"
      class:is-empty={empty}
      bind:this={area}
      contenteditable={!disabled}
      role="textbox"
      tabindex="0"
      aria-multiline="true"
      aria-readonly={disabled ? 'true' : undefined}
      aria-labelledby={label ? labelId : undefined}
      aria-label={label ? undefined : ariaLabel}
      aria-describedby={hint ? hintId : undefined}
      data-placeholder={placeholder}
      oninput={handleInput}
      onpaste={handlePaste}
      ondrop={handleDrop}
      onblur={rememberSelection}
    ></div>

    <div class="rt__foot">
      <button
        type="button"
        class="rt__toggle"
        aria-pressed={toolbarOpen}
        aria-expanded={toolbarOpen}
        aria-controls={toolbarId}
        title="Opciones de formato"
        {disabled}
        onclick={toggleToolbar}
      >
        <Icon set="fas" name="font" />
        <span>Formato</span>
      </button>
    </div>
  </div>

  {#if hint}
    <p class="rt__hint" id={hintId}>{hint}</p>
  {/if}
</div>

<style>
  /* Borders use the theme-neutral rgba(127,127,127,α) idiom, not --gray-50:
     the gray ramp goes LIGHTER in dark mode and would draw a glaring hairline
     on a dark panel (CLAUDE.md §4). Over white, .25 resolves to --gray-50. */
  .rt {
    display: block;
  }

  .rt__label {
    display: block;
    margin-bottom: var(--mg-xxs);
    font-size: var(--fs-xs);
    font-weight: var(--fw-semibold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-muted);
  }

  .rt__box {
    border: 1.5px solid rgba(127, 127, 127, 0.25);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    transition:
      border-color 0.15s cubic-bezier(0.22, 1, 0.36, 1),
      box-shadow 0.15s cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* Ink, not --color-dark: "go darker" is invisible on a dark page. */
  .rt__box:focus-within {
    border-color: var(--color-text);
    box-shadow: 0 0 0 3px rgba(127, 127, 127, 0.22);
  }

  .rt--readonly .rt__box {
    opacity: 0.75;
  }

  .rt__hint {
    margin: var(--mg-xxs) 0 0;
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }

  /* ── Toolbar ─────────────────────────────────────────────────────────── */
  .rt__toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px;
    padding: var(--mg-xxs) var(--mg-xs);
    border-bottom: 1px solid rgba(127, 127, 127, 0.22);
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    background: rgba(127, 127, 127, 0.06);
    animation: rt-reveal 0.16s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .rt__toolbar[hidden] {
    display: none;
  }

  @keyframes rt-reveal {
    from {
      opacity: 0;
      transform: translateY(-3px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  .rt__group {
    display: inline-flex;
    align-items: center;
    gap: 1px;
  }

  .rt__sep {
    width: 1px;
    align-self: stretch;
    margin: var(--mg-xxs) var(--mg-xs);
    background: rgba(127, 127, 127, 0.28);
  }

  .rt__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    flex-direction: column;
    min-width: 2.25rem;
    min-height: 2.25rem;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text);
    font-family: inherit;
    font-size: var(--fs-xs);
    cursor: pointer;
    transition:
      background 0.12s cubic-bezier(0.22, 1, 0.36, 1),
      color 0.12s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .rt__btn:hover:not(:disabled) {
    background: rgba(127, 127, 127, 0.16);
  }

  .rt__btn:active:not(:disabled) {
    transform: translateY(1px);
  }

  .rt__btn.is-active {
    background: rgba(127, 127, 127, 0.22);
    color: var(--color-text);
    box-shadow: inset 0 0 0 1px rgba(127, 127, 127, 0.35);
  }

  .rt__btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* base/reset.css clears the outline on button:active — (0,2,0) wins it back. */
  .rt__btn:focus-visible,
  .rt__toggle:focus-visible,
  .rt__swatch:focus-visible,
  .rt__panel-btn:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }

  .rt__swatch-bar {
    display: block;
    width: 1rem;
    height: 3px;
    margin-top: 1px;
    border-radius: var(--radius-xs);
    background: var(--rt-swatch, var(--color-text));
  }

  /* ── In-flow panels (colour · link) ──────────────────────────────────── */
  .rt__panel {
    flex: 1 0 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--mg-xs);
    margin-top: var(--mg-xxs);
    padding: var(--mg-xs);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    box-shadow: var(--shadow-sm);
  }

  .rt__panel-label {
    font-size: var(--fs-xxs);
    font-weight: var(--fw-semibold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-muted);
  }

  .rt__panel-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--mg-xs);
    flex: 1 1 12rem;
  }

  .rt__swatches {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mg-xxs);
  }

  .rt__swatch {
    width: 1.75rem;
    height: 1.75rem;
    border: 1px solid rgba(127, 127, 127, 0.35);
    border-radius: var(--radius-full);
    background: var(--rt-swatch, var(--color-text));
    cursor: pointer;
    transition: transform 0.1s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .rt__swatch:hover {
    transform: scale(1.15);
  }

  .rt__custom {
    display: inline-flex;
    align-items: center;
    gap: var(--mg-xs);
    font-size: var(--fs-xxs);
    color: var(--color-muted);
  }

  .rt__custom input[type='color'] {
    width: 2rem;
    height: 1.75rem;
    padding: 0;
    background: none;
    cursor: pointer;
  }

  .rt__input {
    flex: 1 1 10rem;
    min-width: 0;
    padding: var(--mg-xxs) var(--mg-xs);
    border: 1.5px solid rgba(127, 127, 127, 0.25);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
    font-family: inherit;
    font-size: var(--fs-sm);
  }

  .rt__panel-btn {
    padding: var(--mg-xxs) var(--mg-sm);
    border: 1px solid rgba(127, 127, 127, 0.25);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text);
    font-family: inherit;
    font-size: var(--fs-xs);
    font-weight: var(--fw-semibold);
    cursor: pointer;
  }

  .rt__panel-btn:hover {
    background: rgba(127, 127, 127, 0.16);
  }

  /* ── Writing surface ─────────────────────────────────────────────────── */
  .rt__area {
    min-height: 6rem;
    max-height: 26rem;
    overflow-y: auto;
    padding: var(--mg-sm) var(--mg-md);
    color: var(--color-text);
    font-size: var(--fs-sm);
    line-height: 1.55;
    overflow-wrap: anywhere;
  }

  /* The ring stays (never `outline: none`); the negative offset keeps it inside
     the field box instead of doubling the wrapper's focus border. */
  .rt__area:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: -2px;
  }

  .rt__area.is-empty::before {
    content: attr(data-placeholder);
    color: var(--color-muted);
    pointer-events: none;
  }

  /* Authored content is created by execCommand, not by Svelte, so it carries no
     scoping attribute — these have to be :global. */
  .rt__area :global(p) {
    margin: 0 0 var(--mg-sm);
  }

  .rt__area :global(ul),
  .rt__area :global(ol) {
    margin: 0 0 var(--mg-sm);
    padding-left: var(--mg-ml);
  }

  .rt__area :global(li) {
    margin: var(--mg-xxs) 0;
  }

  .rt__area :global(a) {
    color: var(--color-secondary);
    text-decoration: underline;
  }

  /* ── Footer toggle ───────────────────────────────────────────────────── */
  .rt__foot {
    display: flex;
    align-items: center;
    padding: var(--mg-xxs) var(--mg-xs);
    border-top: 1px solid rgba(127, 127, 127, 0.16);
  }

  .rt__toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--mg-xs);
    min-height: 2.25rem;
    padding: var(--mg-xxs) var(--mg-sm);
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--color-muted);
    font-family: inherit;
    font-size: var(--fs-xs);
    font-weight: var(--fw-semibold);
    cursor: pointer;
    transition:
      background 0.12s cubic-bezier(0.22, 1, 0.36, 1),
      color 0.12s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .rt__toggle:hover:not(:disabled) {
    background: rgba(127, 127, 127, 0.14);
    color: var(--color-text);
  }

  .rt__toggle:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .rt--open .rt__toggle {
    background: rgba(127, 127, 127, 0.18);
    color: var(--color-text);
  }

  /* Touch targets: 44px on a phone, where the toolbar is thumb-operated. */
  @media (max-width: 768px) {
    .rt__btn,
    .rt__toggle {
      min-width: 2.75rem;
      min-height: 2.75rem;
    }

    .rt__swatch {
      width: 2.25rem;
      height: 2.25rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .rt__box,
    .rt__btn,
    .rt__toggle,
    .rt__swatch {
      transition: none;
    }

    .rt__toolbar {
      animation: none;
    }

    .rt__btn:active:not(:disabled),
    .rt__swatch:hover {
      transform: none;
    }
  }
</style>
