<!--
  CodeInput — the 6-digit one-time code (PR-C2 primitives; DESIGN-SYSTEM §4.3
  "CodeInput (OTP)", S39). Built on FormField. Retires the legacy MFA field —
  one text box spaced out with letter-spacing (`.mfa-code-input`,
  admin/index.html:119) whose `<label>` had no `for`.

  DESIGN DECISION (deviates from the plan's @zag-js/pin-input): ONE real
  <input type="text" inputmode="numeric" autocomplete="one-time-code">, not six.
  iOS / Android code autofill, password managers, paste and screen readers all
  look for a single field, and a screen reader hears one "Código de
  verificación" edit field instead of six unlabelled ones. The segmented look
  is six aria-hidden boxes drawn over the transparent input (pointer events
  pass through to it); they show each digit and where the caret is, and the
  box at the caret carries the focus ring.

  Editing is the input's own (arrows, Home/End, Backspace, Delete, selection)
  with three additions: non-digits are dropped as they arrive; a paste is
  applied here, because `maxlength` would cut "123 456" to "123 45" before we
  saw it — a whole code replaces the field, the first six digits win; and a
  click on a box selects that digit, so typing or Backspace changes THAT box.

  `onComplete(code)` fires once each time a person's edit completes the code
  (typing the sixth digit, a paste, an autofill) — never for a value the
  parent sets. The error is bindable and clears on the next edit. `loading`
  keeps focus in the field (read-only, not disabled) and says "Verificando…"
  in a polite status region; `disabled` locks it.

  Usage:
    <CodeInput bind:value={code} bind:error loading={verifying}
      hint="Escribe el código de 6 dígitos de tu app de autenticación."
      onComplete={verify} />
-->
<script lang="ts">
  import type { ClassValue } from 'svelte/elements';
  import FormField from './FormField.svelte';
  import Icon from './Icon.svelte';
  import { hasErrorText } from './form-field';
  import {
    CODE_LENGTH,
    DEFAULT_CODE_LABEL,
    LOADING_LABEL,
    activeBox,
    caretAfterSanitize,
    insertCode,
    sanitizeCode,
  } from './code-input';

  interface Props {
    label?: string;
    /** Bindable. Always digits only — anything else is stripped. */
    value?: string;
    hint?: string;
    /** Bindable. Human Spanish copy; cleared by the next edit. */
    error?: string | null;
    disabled?: boolean;
    /** Verifying: read-only (focus stays), with a polite "Verificando…". */
    loading?: boolean;
    loadingLabel?: string;
    name?: string;
    /** The input's id. Generated per instance when omitted. */
    id?: string;
    class?: ClassValue;
    /** A person's edit completed the code. Not called for a value set by the parent. */
    onComplete?: (code: string) => void;
  }

  let {
    label = DEFAULT_CODE_LABEL,
    value = $bindable(''),
    hint,
    error = $bindable(null),
    disabled = false,
    loading = false,
    loadingLabel = LOADING_LABEL,
    name,
    id,
    class: className = '',
    onComplete,
  }: Props = $props();

  const SLOTS = Array.from({ length: CODE_LENGTH }, (_, i) => i);

  let input = $state<HTMLInputElement>();
  let boxes = $state<HTMLElement>();
  let focused = $state(false);
  let selStart = $state(0);
  let selEnd = $state(0);

  const digits = $derived(sanitizeCode(value ?? ''));
  const collapsed = $derived(selEnd <= selStart);
  /** The box with the focus ring: the caret's, or a selection's first. */
  const ringBox = $derived(activeBox(selStart));
  const invalid = $derived(hasErrorText(error));

  // A value the parent sets is held to the same rule as a typed one.
  $effect(() => {
    if (value !== digits) value = digits;
  });

  // Arrow keys, Home/End and drag-selection move the caret without an input
  // event; selectionchange reports them while the field has focus.
  $effect(() => {
    if (!focused) return;
    document.addEventListener('selectionchange', syncSelection);
    return () => document.removeEventListener('selectionchange', syncSelection);
  });

  function syncSelection(): void {
    if (!input) return;
    selStart = input.selectionStart ?? input.value.length;
    selEnd = input.selectionEnd ?? selStart;
  }

  /** Write an edit back: DOM value, caret, state — and the side effects of a change. */
  function commit(next: string, caret: number): void {
    if (!input) return;
    const changed = next !== digits;
    if (input.value !== next) input.value = next;
    // Only a focused field gets a caret: on iOS, setting a selection on an
    // unfocused input can pull focus (and the keyboard) to it.
    if (document.activeElement === input) input.setSelectionRange(caret, caret);
    syncSelection();
    if (!changed) return;
    value = next;
    if (error) error = null;
    if (next.length === CODE_LENGTH) onComplete?.(next);
  }

  function handleInput(event: Event & { currentTarget: HTMLInputElement }): void {
    const el = event.currentTarget;
    // Read-only and disabled fields take no edits; anything that slips
    // through (a script, an extension) is put back.
    if (disabled || loading) {
      el.value = digits;
      return;
    }
    const raw = el.value;
    commit(sanitizeCode(raw), caretAfterSanitize(raw, el.selectionStart ?? raw.length));
  }

  function handlePaste(event: ClipboardEvent & { currentTarget: HTMLInputElement }): void {
    const text = event.clipboardData?.getData('text');
    if (text === undefined) return; // no clipboard data: let the browser paste
    event.preventDefault();
    if (disabled || loading) return;
    const el = event.currentTarget;
    const result = insertCode(
      digits,
      el.selectionStart ?? digits.length,
      el.selectionEnd ?? digits.length,
      text,
    );
    if (result) commit(result.value, result.caret);
  }

  /** A click on a box selects its digit (or lands on the next empty box). */
  function handleClick(event: MouseEvent): void {
    if (!input || !boxes) return;
    // A double-click's word selection is the browser's; keep it.
    if (input.selectionStart !== input.selectionEnd) return syncSelection();
    const rects = [...boxes.children].map((box) => box.getBoundingClientRect());
    const hit = rects.findIndex((rect) => event.clientX <= rect.right);
    const index = hit === -1 ? CODE_LENGTH - 1 : hit;
    if (index < digits.length) input.setSelectionRange(index, index + 1);
    else input.setSelectionRange(digits.length, digits.length);
    syncSelection();
  }

  /** Where box `i` draws the caret, if it does: in an empty box, before a digit, or after the last. */
  function caretAt(i: number): 'center' | 'start' | 'end' | null {
    if (!focused || !collapsed) return null;
    if (selStart >= CODE_LENGTH) return i === CODE_LENGTH - 1 ? 'end' : null;
    if (i !== selStart) return null;
    return i >= digits.length ? 'center' : 'start';
  }

  /** Move focus into the field (e.g. when the challenge screen opens). */
  export function focus(): void {
    input?.focus();
  }
</script>

<FormField {label} {hint} {error} {disabled} {id} class={['ird-code', className]}>
  {#snippet control(attrs)}
    <div
      class={[
        'ird-code__field',
        focused && 'is-focused',
        invalid && 'is-invalid',
        disabled && 'is-disabled',
        loading && 'is-loading',
      ]}
    >
      <input
        {...attrs}
        bind:this={input}
        class="ird-code__input"
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        pattern="[0-9]*"
        maxlength={CODE_LENGTH}
        {name}
        value={digits}
        readonly={loading}
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        oninput={handleInput}
        onpaste={handlePaste}
        onclick={handleClick}
        onkeydown={() => setTimeout(syncSelection)}
        onkeyup={syncSelection}
        onselect={syncSelection}
        onfocus={() => {
          focused = true;
          syncSelection();
        }}
        onblur={() => (focused = false)}
      />
      <div class="ird-code__boxes" aria-hidden="true" bind:this={boxes}>
        {#each SLOTS as i (i)}
          {@const caret = caretAt(i)}
          <span
            class={[
              'ird-code__box',
              i < digits.length && 'is-filled',
              focused && i === ringBox && 'is-active',
              !collapsed && i >= selStart && i < selEnd && 'is-selected',
              caret && `has-caret caret-${caret}`,
            ]}>{digits[i] ?? ''}</span
          >
        {/each}
      </div>
    </div>
    <p class="ird-code__status" role="status">
      {#if loading}<Icon name="spinner" spin />{loadingLabel}{/if}
    </p>
  {/snippet}
</FormField>

<style>
  .ird-code__field {
    /* 3:1 against the surface in both themes — the same derivation as
       FormField's control border (WCAG 1.4.11). */
    --code-border: color-mix(in srgb, var(--color-text) 60%, var(--color-surface));
    --code-selected: color-mix(in srgb, var(--color-text) 14%, var(--color-surface));
    position: relative;
    width: 100%;
    max-width: 22rem;
  }

  /* The real field: full size under the boxes, so a tap anywhere lands in it,
     with its own text, caret and selection painted transparent — the boxes
     draw all three. Its font-size stays ≥16px (and base/forms.css floors it
     at ≤768px), so iOS does not zoom on focus. */
  .ird-code__input {
    position: absolute;
    inset: 0;
    z-index: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0 0.5rem;
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: transparent;
    -webkit-text-fill-color: transparent;
    caret-color: transparent;
    font-size: var(--fs-base);
    cursor: text;
  }

  .ird-code__input::selection {
    background: transparent;
  }

  /* No ring on the invisible input: the box at the caret carries it
     (.is-active below), which is where the eye is. */
  .ird-code__input:focus,
  .ird-code__input:focus-visible {
    outline: none;
  }

  .ird-code__field.is-disabled .ird-code__input {
    cursor: not-allowed;
  }

  .ird-code__boxes {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: clamp(0.25rem, 1.5vw, 0.5rem);
    pointer-events: none;
  }

  .ird-code__box {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 3.25rem;
    border: 1.5px solid var(--code-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: var(--fs-xl);
    font-weight: var(--fw-semibold);
    font-variant-numeric: tabular-nums;
    line-height: 1;
    transition:
      border-color 0.15s cubic-bezier(0.22, 1, 0.36, 1),
      background-color 0.15s cubic-bezier(0.22, 1, 0.36, 1);
  }

  @media (hover: hover) {
    .ird-code__field:not(.is-disabled):not(.is-invalid):hover .ird-code__box {
      border-color: var(--color-text);
    }
  }

  .ird-code__box.is-active {
    border-color: var(--color-text);
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }

  .ird-code__box.is-selected {
    background: var(--code-selected);
  }

  .ird-code__field.is-invalid .ird-code__box {
    border-color: var(--money-neg);
  }

  /* Locked, but the digits stay legible (muted ink, not faded opacity). */
  .ird-code__field.is-disabled .ird-code__box {
    border-color: rgba(127, 127, 127, 0.18);
    background: var(--status-neutral-bg);
    color: var(--color-muted);
  }

  .ird-code__field.is-loading .ird-code__box {
    background: var(--status-neutral-bg);
  }

  /* The drawn caret: centred in the next empty box, at the left edge of a
     digit it sits before, or after the last digit once the code is full. */
  .ird-code__box.has-caret::after {
    content: '';
    position: absolute;
    top: 50%;
    left: calc(50% - 1px);
    width: 2px;
    height: 1.5rem;
    margin-top: -0.75rem;
    background: var(--color-text);
    animation: ird-code-caret 1.1s step-end infinite;
  }

  .ird-code__box.caret-start::after {
    left: 0.3rem;
  }

  .ird-code__box.caret-end::after {
    left: auto;
    right: 0.3rem;
  }

  @keyframes ird-code-caret {
    50% {
      opacity: 0;
    }
  }

  .ird-code__status {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }

  @media (prefers-reduced-motion: reduce) {
    .ird-code__box {
      transition: none;
    }

    /* A steady caret instead of a blinking one. */
    .ird-code__box.has-caret::after {
      animation: none;
    }
  }
</style>
