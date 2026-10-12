<!--
  FormWizard — the shared step machine (S21, DESIGN-SYSTEM §4.4).
  One config-driven engine, ported from js/pages/admin/form-wizard.js. Retires
  the three hand-rolled wizards (event, discipleship, gallery) and the four
  form vocabularies (.form-group / .wiz-field / .rb-* / .settings-field).
  The pure logic — defaults, showIf, validation, the ONE review renderer —
  lives in ./wizard.ts.

  Kept from legacy: the config shape, the field-type union
  (text·textarea·number·money·date·select·choice), the step→review flow, the
  inline `#fwErr` error region, and the treasury WIZ spec shape
  (title/editTitle/icon/submitLabel/steps/toData/toPayload) so S53 ports those
  specs verbatim.

  Dropped on purpose (PORT-DEBT S21 "DO NOT PORT"):
   • `window.__wizBack` / `__dwizBack` / `__gwizBack` and inline `onclick=`;
   • the hard-coded 4-dot progress strips — the strip is `steps.length + 1`;
   • the three divergent review renderers;
   • the unescaped money `value="${v ?? ''}"` (values are bound now);
   • `document.body.style.overflow = ''` on close — the lock is
     reference-counted ($lib/scroll-lock), so a nested overlay cannot unlock
     the page underneath this one;
   • the click-only, non-focusable `<div>` choice cards — `choice` is a real
     radio group (arrow keys, Space, labels).
  The "step done" dot is RE-THEMED to var(--color-done), not deleted: it is
  live code (G-012 / form-wizard.js:66).

  Usage:
    <FormWizard bind:open title="Nuevo ingreso" icon="arrow-down"
      submitLabel="Guardar ingreso" steps={WIZ.income.steps}
      data={row ? WIZ.income.toData(row) : {}}
      onSubmit={(d) => repo.saveIncome(WIZ.income.toPayload(d))}
      onDone={reload} />
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { lockBodyScroll } from '$lib/scroll-lock';
  import Icon from './Icon.svelte';
  import {
    applyDefaults,
    allVisibleFields,
    formatFieldValue,
    reviewIcon,
    submitErrorMessage,
    visibleFields,
    validateStep,
    REVIEW_TITLE,
    type WizardData,
    type WizardField,
    type WizardStep,
    type WizardSubmitResult,
  } from './wizard';

  interface Props {
    /** Bindable. The wizard renders nothing while false and resets on each open. */
    open?: boolean;
    title: string;
    /** Font Awesome name (no `fa-`). */
    icon?: string;
    submitLabel?: string;
    /** Initial values — a spec's `toData(row)` in edit mode. Never mutated. */
    data?: WizardData;
    steps: WizardStep[];
    /** Returns `{ error }` to keep the wizard open and show the message inline. */
    onSubmit: (data: WizardData) => WizardSubmitResult | Promise<WizardSubmitResult>;
    /** Called with the submitted data after a successful save (reload, toast…). */
    onDone?: (data: WizardData) => void;
    /** Called whenever the wizard closes without saving. */
    onClose?: () => void;
  }

  let {
    open = $bindable(false),
    title,
    icon,
    submitLabel = 'Guardar',
    data = {},
    steps,
    onSubmit,
    onDone,
    onClose,
  }: Props = $props();

  const uid = $props.id();
  const titleId = `fw-title-${uid}`;
  const errorId = `fw-error-${uid}`;
  const fieldId = (id: string) => `fw-${uid}-${id}`;

  /** 0 … steps.length; the last index is the auto-generated review screen. */
  let index = $state(0);
  let values = $state<WizardData>({});
  let errorMessage = $state('');
  let submitting = $state(false);
  let dialogEl = $state<HTMLDivElement | undefined>();

  const total = $derived(steps.length + 1);
  const onReview = $derived(index >= steps.length);
  const step = $derived(onReview ? undefined : steps[index]);
  const fields = $derived(step ? visibleFields(step, values) : []);
  const reviewFields = $derived(onReview ? allVisibleFields(steps, values) : []);
  const dots = $derived([...Array(total).keys()]);

  function setValue(id: string, value: string): void {
    values[id] = value;
    // Any edit clears the step error; the message returns on the next attempt.
    if (errorMessage) errorMessage = '';
  }

  // Reset on every open. `untrack` keeps a re-created `steps`/`data` literal in
  // the parent from wiping what the user has typed.
  $effect(() => {
    if (!open) return;
    untrack(() => {
      index = 0;
      errorMessage = '';
      submitting = false;
      values = applyDefaults(steps, data);
    });
  });

  // Escape, the focus trap, the reference-counted scroll lock, and returning
  // focus to whatever opened the wizard.
  $effect(() => {
    if (!open) return;
    const release = lockBodyScroll();
    const restoreTo = document.activeElement as HTMLElement | null;

    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === 'Tab') trapFocus(event);
    };

    document.addEventListener('keydown', onKeydown, true);
    return () => {
      document.removeEventListener('keydown', onKeydown, true);
      release();
      restoreTo?.focus?.();
    };
  });

  // Move focus to the step's first control on open and on every step change —
  // the legacy did this too, and it is what makes the wizard usable by keyboard.
  $effect(() => {
    if (!open) return;
    const showing = index; // the dependency: refocus on every step change
    void tick().then(() => {
      if (!dialogEl || showing !== index) return;
      const first = dialogEl.querySelector<HTMLElement>(
        '.wiz__field input, .wiz__field textarea, .wiz__field select',
      );
      (first ?? dialogEl).focus();
    });
  });

  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function trapFocus(event: KeyboardEvent): void {
    if (!dialogEl) return;
    const items = [...dialogEl.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialogEl)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function close(): void {
    if (submitting) return;
    open = false;
    onClose?.();
  }

  function back(): void {
    if (index === 0) return;
    errorMessage = '';
    index -= 1;
  }

  async function next(): Promise<void> {
    const current = steps[index];
    if (!current) return;
    const bad = validateStep(current, values);
    if (bad) {
      errorMessage = bad.message;
      await tick();
      focusField(bad.field);
      return;
    }
    errorMessage = '';
    index += 1;
  }

  function focusField(field: WizardField): void {
    if (!dialogEl) return;
    const wrapper = [...dialogEl.querySelectorAll<HTMLElement>('[data-field]')].find(
      (el) => el.dataset.field === field.id,
    );
    wrapper?.querySelector<HTMLElement>('input, textarea, select, button')?.focus();
  }

  async function submit(): Promise<void> {
    submitting = true;
    errorMessage = '';
    let result: WizardSubmitResult;
    try {
      result = await onSubmit({ ...values });
    } catch (error) {
      result = { error: { message: error instanceof Error ? error.message : null } };
    }
    const message = submitErrorMessage(result);
    if (message) {
      // Stay open, re-enable, surface it inline — never a toast, never a close.
      submitting = false;
      errorMessage = message;
      return;
    }
    const saved = { ...values };
    submitting = false;
    open = false;
    onDone?.(saved);
  }
</script>

{#if open}
  <div class="wiz__backdrop">
    <!-- A real button as the scrim: click-to-close with a name, no click
         handler on a non-interactive element. -->
    <button type="button" class="wiz__scrim" aria-label="Cerrar" onclick={close}></button>

    <div
      class="wiz"
      bind:this={dialogEl}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabindex="-1"
    >
      <div class="wiz__header">
        <h3 class="wiz__title" id={titleId}>
          {#if icon}<Icon name={icon} class="wiz__title-icon" />{/if}
          {title}
        </h3>
        <button type="button" class="wiz__close" aria-label="Cerrar" onclick={close}>
          <Icon name="xmark" />
        </button>
      </div>

      <!-- The strip adapts to the step count: steps + the review screen.
           Never a hard-coded 4 dots. -->
      <div
        class="wiz__progress"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={index + 1}
        aria-valuetext="Paso {index + 1} de {total}"
      >
        {#each dots as i (i)}
          <span class="wiz__dot" class:is-active={i === index} class:is-done={i < index}></span>
        {/each}
      </div>

      <div class="wiz__body">
        {#if step}
          <p class="wiz__steplabel">Paso {index + 1} de {steps.length}</p>
          {#if step.label}<h4 class="wiz__question">{step.label}</h4>{/if}
          {#if step.hint}<p class="wiz__hint">{step.hint}</p>{/if}

          {#each fields as field (field.id)}
            <div class="wiz__field" data-field={field.id}>
              {#if field.type === 'choice'}
                <fieldset class="wiz__choice">
                  <legend class="wiz__label wiz__label--legend">
                    {field.label ?? step.label ?? ''}
                  </legend>
                  <div class="wiz__choice-grid">
                    {#each field.options ?? [] as option (option.value)}
                      <label
                        class="wiz__card"
                        class:is-selected={String(values[field.id] ?? '') === String(option.value)}
                      >
                        <input
                          class="wiz__card-input"
                          type="radio"
                          name={fieldId(field.id)}
                          value={option.value}
                          checked={String(values[field.id] ?? '') === String(option.value)}
                          onchange={() => setValue(field.id, option.value)}
                        />
                        {#if option.icon}
                          <Icon name={option.icon} class="wiz__card-icon" />
                        {/if}
                        <span class="wiz__card-title">{option.label}</span>
                        {#if option.desc}<span class="wiz__card-desc">{option.desc}</span>{/if}
                      </label>
                    {/each}
                  </div>
                </fieldset>
              {:else}
                <label class="wiz__label" for={fieldId(field.id)}>{field.label ?? ''}</label>
                {#if field.type === 'textarea'}
                  <textarea
                    class="wiz__control"
                    id={fieldId(field.id)}
                    rows={field.rows ?? 3}
                    placeholder={field.placeholder ?? ''}
                    value={values[field.id] ?? ''}
                    oninput={(e) => setValue(field.id, e.currentTarget.value)}></textarea>
                {:else if field.type === 'select'}
                  <select
                    class="wiz__control"
                    id={fieldId(field.id)}
                    value={String(values[field.id] ?? '')}
                    onchange={(e) => setValue(field.id, e.currentTarget.value)}
                  >
                    {#each field.options ?? [] as option (option.value)}
                      <option value={option.value}>{option.label}</option>
                    {/each}
                  </select>
                {:else if field.type === 'money'}
                  <div class="wiz__money">
                    <span class="wiz__money-prefix" aria-hidden="true">$</span>
                    <input
                      class="wiz__control wiz__control--money"
                      id={fieldId(field.id)}
                      type="number"
                      min="0"
                      step="0.01"
                      inputmode="decimal"
                      placeholder="0.00"
                      value={values[field.id] ?? ''}
                      oninput={(e) => setValue(field.id, e.currentTarget.value)}
                    />
                  </div>
                {:else}
                  <input
                    class="wiz__control"
                    id={fieldId(field.id)}
                    type={field.type === 'number'
                      ? 'number'
                      : field.type === 'date'
                        ? 'date'
                        : 'text'}
                    inputmode={field.type === 'number' ? 'decimal' : undefined}
                    placeholder={field.placeholder ?? ''}
                    value={values[field.id] ?? ''}
                    oninput={(e) => setValue(field.id, e.currentTarget.value)}
                  />
                {/if}
              {/if}
              {#if field.hint}<p class="wiz__hint wiz__hint--field">{field.hint}</p>{/if}
            </div>
          {/each}
        {:else}
          <p class="wiz__steplabel">{REVIEW_TITLE}</p>
          <dl class="wiz__review">
            {#each reviewFields as field (field.id)}
              <div class="wiz__review-row">
                <dt class="wiz__review-key">
                  <Icon name={reviewIcon(field)} class="wiz__review-icon" />
                  <span>{field.label ?? field.id}</span>
                </dt>
                <dd class="wiz__review-val">{formatFieldValue(field, values)}</dd>
              </div>
            {/each}
          </dl>
        {/if}

        <!-- The inline error region (legacy `#fwErr`). role=alert so a step
             failure is announced; it is not a toast. -->
        <p class="wiz__error" id={errorId} role="alert">{errorMessage}</p>
      </div>

      <div class="wiz__nav">
        {#if index > 0}
          <button type="button" class="ird-btn ird-btn--ghost wiz__btn" onclick={back}>
            <Icon name="arrow-left" /> Atrás
          </button>
        {/if}
        <span class="wiz__nav-spacer"></span>
        {#if onReview}
          <button
            type="button"
            class="ird-btn ird-btn--primary wiz__btn wiz__btn--submit"
            aria-describedby={errorId}
            aria-busy={submitting}
            disabled={submitting}
            onclick={submit}
          >
            <Icon name={submitting ? 'spinner' : 'check'} spin={submitting} />
            {submitting ? 'Guardando…' : submitLabel}
          </button>
        {:else}
          <button
            type="button"
            class="ird-btn ird-btn--primary wiz__btn"
            aria-describedby={errorId}
            onclick={next}
          >
            {index === steps.length - 1 ? 'Revisar' : 'Siguiente'}
            <Icon name="arrow-right" />
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .wiz__backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .wiz__scrim {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
    padding: 0;
    background: rgb(var(--shadow-rgb) / 0.55);
    cursor: pointer;
  }

  .wiz {
    position: relative;
    width: 100%;
    max-width: 540px;
    max-height: 90vh;
    overflow-y: auto;
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    box-shadow: var(--shadow-lg);
    animation: wiz-in 0.22s cubic-bezier(0.22, 1, 0.36, 1);
  }

  @keyframes wiz-in {
    from {
      opacity: 0;
      transform: translateY(16px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  .wiz__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 1.25rem 1.5rem 0.75rem;
    border-bottom: 1px solid var(--gray-40);
  }

  .wiz__title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    color: var(--color-text);
    font-size: var(--fs-md);
    font-weight: var(--fw-bold);
  }

  .wiz__title :global(.wiz__title-icon) {
    color: var(--color-muted);
  }

  .wiz__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-muted);
    font-size: var(--fs-md);
    cursor: pointer;
  }

  .wiz__close:hover {
    background: var(--status-neutral-bg);
    color: var(--color-text);
  }

  .wiz__progress {
    display: flex;
    gap: 4px;
    margin: 0.75rem 0;
    padding: 0 1.5rem;
  }

  .wiz__dot {
    flex: 1;
    height: 4px;
    border-radius: var(--radius-xs);
    background: var(--status-neutral-bg);
    transition: background-color 0.3s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .wiz__dot.is-active {
    background: var(--color-dark);
  }

  /* Re-themed from the one-off public green #72BB72 to the slate "done" token
     (DESIGN-SYSTEM §2.7). Live code — re-theme, never delete. */
  .wiz__dot.is-done {
    background: var(--color-done);
  }

  .wiz__body {
    padding: 1rem 1.5rem 0.5rem;
  }

  .wiz__steplabel {
    margin: 0 0 0.5rem;
    color: var(--color-muted);
    font-size: var(--fs-xxs);
    font-weight: var(--fw-bold);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .wiz__question {
    margin: 0.1rem 0 0.3rem;
    color: var(--color-text);
    font-size: var(--fs-md);
    font-weight: var(--fw-bold);
  }

  .wiz__hint {
    margin: 0 0 1rem;
    color: var(--color-muted);
    font-size: var(--fs-xs);
  }

  .wiz__hint--field {
    margin: 0.2rem 0 0;
  }

  /* ── the ONE form vocabulary ─────────────────────────────────────────── */
  .wiz__field {
    margin-block-end: 0.85rem;
  }

  .wiz__label {
    display: block;
    margin-block-end: 0.3rem;
    color: var(--color-muted);
    font-size: var(--fs-xs);
    font-weight: var(--fw-semibold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .wiz__label--legend {
    padding: 0;
  }

  .wiz__control {
    width: 100%;
    max-width: 100%;
    padding: 0.6rem 0.75rem;
    border: 1.5px solid var(--gray-50);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-size: var(--fs-sm);
  }

  .wiz__control:focus-visible {
    border-color: var(--color-dark);
  }

  .wiz__control:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .wiz__money {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .wiz__money-prefix {
    color: var(--color-muted);
    font-size: var(--fs-lg);
    font-weight: var(--fw-bold);
  }

  .wiz__control--money {
    font-size: var(--fs-lg);
    font-weight: var(--fw-bold);
    font-variant-numeric: tabular-nums;
    text-align: end;
  }

  /* ── choice cards: a real radio group ─────────────────────────────────── */
  .wiz__choice {
    margin: 0;
    padding: 0;
    border: 0;
  }

  .wiz__choice-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: 0.6rem;
    margin: 0.5rem 0;
  }

  .wiz__card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    min-height: 2.75rem;
    padding: 1.15rem 0.8rem;
    border: 2px solid var(--gray-40);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    text-align: center;
    cursor: pointer;
    transition: border-color 0.18s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .wiz__card:hover {
    border-color: var(--color-dark);
  }

  .wiz__card.is-selected {
    border-color: var(--color-dark);
    background: var(--status-neutral-bg);
  }

  /* The radio stays a real input (keyboard + AT) but is not drawn — the card
     is the affordance. Focus is mirrored onto the card. */
  .wiz__card-input {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .wiz__card:has(.wiz__card-input:focus-visible) {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }

  .wiz__card :global(.wiz__card-icon) {
    color: var(--color-secondary);
    font-size: var(--fs-md);
  }

  .wiz__card-title {
    color: var(--color-text);
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
  }

  .wiz__card-desc {
    color: var(--color-muted);
    font-size: var(--fs-xs);
  }

  /* ── review ───────────────────────────────────────────────────────────── */
  .wiz__review {
    margin: 0.5rem 0 0;
    padding: 0.95rem 1rem;
    border: 1px solid var(--gray-40);
    border-radius: var(--radius-md);
    background: var(--status-neutral-bg);
  }

  .wiz__review-row {
    display: flex;
    align-items: baseline;
    gap: 0.55rem;
    padding: 0.22rem 0;
  }

  .wiz__review-key {
    display: flex;
    align-items: baseline;
    gap: 0.45rem;
    flex: 0 0 auto;
    min-width: 8rem;
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-xs);
  }

  .wiz__review-key :global(.wiz__review-icon) {
    color: var(--color-secondary);
  }

  .wiz__review-val {
    margin: 0;
    color: var(--color-text);
    font-size: var(--fs-sm);
    font-weight: var(--fw-bold);
    overflow-wrap: anywhere;
  }

  .wiz__error {
    min-height: 1.1em;
    margin: 0.7rem 0 0;
    color: var(--money-neg);
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
  }

  /* ── nav ──────────────────────────────────────────────────────────────── */
  .wiz__nav {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem 1.25rem;
  }

  .wiz__nav-spacer {
    flex: 1;
  }

  /* INTERIM (S14 owns `.ird-btn`): a minimal token-only look so the nav is
     usable before the Button component lands. Delete this block when S14 ships;
     the `ird-btn` / `ird-btn--primary` / `ird-btn--ghost` classes are already
     on the elements so the global styles take over cleanly. */
  .wiz__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 2.75rem;
    min-width: 6.25rem;
    padding: 0.65rem 1.25rem;
    border: 0;
    border-radius: var(--radius-md);
    background: var(--color-dark);
    color: var(--color-white);
    box-shadow: var(--shadow-sm);
    font: inherit;
    font-size: var(--fs-btn);
    font-weight: var(--fw-semibold);
    cursor: pointer;
    transition:
      filter 0.15s cubic-bezier(0.22, 1, 0.36, 1),
      transform 0.1s cubic-bezier(0.22, 1, 0.36, 1),
      box-shadow 0.15s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .wiz__btn:hover:not(:disabled) {
    filter: brightness(1.08);
    box-shadow: var(--shadow-md);
  }

  .wiz__btn:active:not(:disabled) {
    transform: scale(0.97);
  }

  .wiz__btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .wiz__btn--submit {
    min-width: 8.75rem;
  }

  :global(.ird-btn--ghost).wiz__btn {
    border: 1px solid var(--gray-50);
    background: var(--color-surface);
    color: var(--color-muted);
    box-shadow: none;
  }

  :global(.ird-btn--ghost).wiz__btn:hover:not(:disabled) {
    border-color: var(--color-dark);
    color: var(--color-text);
    filter: none;
  }

  @media (max-width: 480px) {
    .wiz {
      max-width: 100%;
      border-radius: var(--radius-md);
    }
    .wiz__choice-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .wiz {
      animation: none;
    }
    .wiz__dot,
    .wiz__card,
    .wiz__btn {
      transition: none;
    }
    .wiz__btn:active:not(:disabled) {
      transform: none;
    }
  }
</style>
