<!--
  FormField — the one form-field vocabulary (PR-C2 primitives; DESIGN-SYSTEM
  §4.3 "FormField base", owed by S21).
  Retires the four legacy vocabularies — `.form-group`/`.form-row`, `.wiz-field`,
  the report builder's `.rb-*`, `.settings-field` — and the dead `.trez-field`.

  Label above the control, optional hint below it, then the inline error. The
  control is the caller's (a snippet), and it receives the wiring as an
  attribute bag (`FormFieldControlAttrs`): the id the label points at,
  aria-describedby (hint + any extra ids + the error), aria-invalid and
  aria-required. The legacy got this wrong everywhere — the MFA code's
  `<label>` has no `for` at all (admin/index.html:118).

  The error is announced: it is rendered with role="alert" only while there is
  one, so it is read out when it appears (after a submit) and again when its
  text changes, and it starts with a visually hidden "Error:". The required
  marker is the word "(obligatorio)", never colour or a lone asterisk.

  Inputs are never under 16px on a phone (iOS zooms on focus otherwise): the
  global floor in base/forms.css outranks this component's font-size at ≤768px.

  One control per field: text-like inputs, <select>, <textarea>. A set of
  checkboxes or radios is a <fieldset> with a <legend> (or SegmentedControl).
  Dirty tracking stays with the caller, who owns the value.

  Usage:
    <FormField label="Nombre" hint="Como aparecerá en el panel." {error} required>
      {#snippet control(attrs)}
        <input
          id={attrs.id}
          class={attrs.class}
          aria-describedby={attrs['aria-describedby']}
          aria-invalid={attrs['aria-invalid']}
          aria-required={attrs['aria-required']}
          disabled={attrs.disabled}
          type="text"
          autocomplete="name"
          bind:value={name}
        />
      {/snippet}
    </FormField>
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ClassValue } from 'svelte/elements';
  import Icon from './Icon.svelte';
  import {
    ERROR_PREFIX,
    FIELD_BLOCK,
    FIELD_CONTROL_CLASS,
    REQUIRED_TEXT,
    hasErrorText,
    joinIds,
    type FormFieldControlAttrs,
  } from './form-field';

  interface Props {
    /** Visible label, always — it is the control's accessible name. */
    label: string;
    /** Help text under the control; read with it through aria-describedby. */
    hint?: string;
    /** Human Spanish copy for the inline error. Never a raw backend string. */
    error?: string | null;
    /** Shows "(obligatorio)" and sets aria-required on the control. */
    required?: boolean;
    /** Passed to the control (`attrs.disabled`). */
    disabled?: boolean;
    /** The control's id. One is generated per instance when omitted. */
    id?: string;
    /** More ids for the control's aria-describedby (e.g. a strength meter). */
    describedBy?: string;
    class?: ClassValue;
    /** The control. Set each of the attrs on it explicitly (see form-field.ts). */
    control: Snippet<[FormFieldControlAttrs]>;
  }

  let {
    label,
    hint,
    error = null,
    required = false,
    disabled = false,
    id,
    describedBy,
    class: className = '',
    control,
  }: Props = $props();

  const uid = $props.id();
  const controlId = $derived(id ?? `field-${uid}`);
  const hintId = `field-${uid}-hint`;
  const errorId = `field-${uid}-error`;

  const invalid = $derived(hasErrorText(error));

  const attrs: FormFieldControlAttrs = $derived({
    id: controlId,
    class: FIELD_CONTROL_CLASS,
    'aria-describedby': joinIds(hint ? hintId : null, describedBy, invalid ? errorId : null),
    'aria-invalid': invalid ? 'true' : undefined,
    'aria-required': required ? 'true' : undefined,
    disabled,
  });
</script>

<div class={[FIELD_BLOCK, invalid && 'is-invalid', disabled && 'is-disabled', className]}>
  <label class="ird-field__label" for={controlId}>
    {label}
    {#if required}<span class="ird-field__required">{REQUIRED_TEXT}</span>{/if}
  </label>

  {@render control(attrs)}

  {#if hint}
    <p class="ird-field__hint" id={hintId}>{hint}</p>
  {/if}

  {#if invalid}
    <!-- Inserted with role="alert", so it is announced when it appears and
         again when its text changes; aria-describedby reads it on focus. -->
    <p class="ird-field__error" id={errorId} role="alert">
      <Icon name="circle-exclamation" class="ird-field__error-icon" />
      <span><span class="ird-field__sr">{ERROR_PREFIX}</span> {error}</span>
    </p>
  {/if}
</div>

<style>
  .ird-field {
    /* The control border is the only thing that draws a field on a white page,
       so it gets 3:1 (WCAG 1.4.11) in both themes: the slate ink mixed into the
       surface. FormWizard's --gray-50 hairline is 1.3:1, and it turns
       glaring #cccccc on a dark panel. */
    --field-border: color-mix(in srgb, var(--color-text) 60%, var(--color-surface));
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 0;
  }

  .ird-field__label {
    color: var(--color-text);
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
    line-height: 1.35;
  }

  .ird-field__required {
    color: var(--color-muted);
    font-size: var(--fs-xs);
    font-weight: var(--fw-regular);
  }

  /* The control is rendered by the caller's snippet, so it carries the
     caller's scope; :global() reaches it, anchored to this block. A one-line
     control is exactly 44px: the padding leaves min-height in charge. */
  .ird-field :global(.ird-field__control) {
    width: 100%;
    max-width: 100%;
    min-height: 2.75rem;
    padding: 0.5rem 0.75rem;
    border: 1.5px solid var(--field-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-size: var(--fs-sm);
    line-height: 1.4;
    transition: border-color 0.15s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .ird-field :global(textarea.ird-field__control) {
    min-height: 5.5rem;
    resize: vertical;
  }

  .ird-field :global(.ird-field__control::placeholder) {
    color: var(--color-muted);
    opacity: 1;
  }

  /* Hover and focus move the border toward --color-text (the reversing ink),
     never --color-dark, which vanishes on a dark page (CLAUDE.md §4). An
     invalid field keeps its red border through both. */
  @media (hover: hover) {
    .ird-field:not(.is-invalid) :global(.ird-field__control:hover:not(:disabled):not([readonly])) {
      border-color: var(--color-text);
    }
  }

  .ird-field:not(.is-invalid) :global(.ird-field__control:focus-visible) {
    border-color: var(--color-text);
  }

  .ird-field :global(.ird-field__control:focus-visible) {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }

  .ird-field.is-invalid :global(.ird-field__control) {
    border-color: var(--money-neg);
  }

  .ird-field :global(.ird-field__control:disabled) {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Read-only is not disabled: legible at full ink, but flat and tinted so it
     does not invite typing. Immutable facts belong in ReadonlyField instead. */
  .ird-field :global(.ird-field__control[readonly]) {
    border-color: rgba(127, 127, 127, 0.18);
    background: var(--status-neutral-bg);
  }

  .ird-field__hint {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
    line-height: 1.4;
  }

  /* --money-neg is the AA red INK in both themes (6.8:1 / 6.5:1 on the
     surface); --color-danger is a fill. Icon + words: never colour alone. */
  .ird-field__error {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    margin: 0;
    color: var(--money-neg);
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
    line-height: 1.4;
  }

  .ird-field__error :global(.ird-field__error-icon) {
    flex-shrink: 0;
    margin-block-start: 0.2em;
  }

  /* Mirrors the global .sr-only utility so the component works standalone. */
  .ird-field__sr {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .ird-field :global(.ird-field__control) {
      transition: none;
    }
  }
</style>
