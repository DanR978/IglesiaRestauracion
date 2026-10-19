<!--
  PasswordField — a password input with show/hide, strength and confirmation
  (PR-C2 primitives; DESIGN-SYSTEM §4.3 "PasswordField", S21/S39). Built on
  FormField, so label, hint, error and aria wiring are the shared ones.
  Retires the bare `<input type="password">`s of the legacy login, the
  invite/reset form (`invitePassword` / `invitePassword2`, admin/index.html) and
  Mi cuenta's changePassword: none had a toggle or a meter, and the invite form
  kept its only instruction ("Mínimo 8 caracteres") in a placeholder that
  vanishes on the first keystroke.

  • Show/hide is a real <button type="button" aria-pressed>, always visible and
    in the tab order. Its name stays "Mostrar contraseña" and "pressed" means
    shown (WAI-ARIA APG: a toggle's label must not change with its state). The
    field flips back to hidden when its form submits, so the browser's password
    manager still sees a password field.
  • `strength` (new passwords): three bars plus a sentence that leads with the
    level ("Débil: …") in an aria-live="polite" region the input also points
    at, so the level is never colour alone. Scored by the pure scorePassword()
    in ./password-field.ts.
  • `match` (a confirm field): "Las contraseñas no coinciden." after a blur or
    a submit of the enclosing form. It clears the moment the two agree and
    returns only on the next blur or submit, never while someone is typing.
  • Paste is never blocked (WCAG 3.3.8): there is no paste handler at all.

  Usage:
    <PasswordField autocomplete="current-password" bind:value={password} />

    <PasswordField label="Nueva contraseña" autocomplete="new-password" strength
      bind:value={next} />
    <PasswordField label="Confirma la contraseña" autocomplete="new-password"
      match={next} bind:value={confirm} />
-->
<script lang="ts">
  import type { ClassValue } from 'svelte/elements';
  import FormField from './FormField.svelte';
  import Icon from './Icon.svelte';
  import {
    DEFAULT_PASSWORD_LABEL,
    MISMATCH_MESSAGE,
    TOGGLE_LABEL,
    scorePassword,
    strengthBars,
    strengthMessage,
    type PasswordAutocomplete,
  } from './password-field';

  interface Props {
    label?: string;
    /** Bindable. */
    value?: string;
    /** `current-password` to sign in, `new-password` to set one (WCAG 1.3.5). */
    autocomplete?: PasswordAutocomplete;
    name?: string;
    hint?: string;
    /** The caller's error (e.g. a refused sign-in). Wins over the mismatch message. */
    error?: string | null;
    required?: boolean;
    disabled?: boolean;
    /** The show/hide button. On by default. */
    toggle?: boolean;
    /** The strength meter — for `new-password` fields. */
    strength?: boolean;
    /** Makes this a confirm field: the password it must equal. */
    match?: string;
    /** The input's id. Generated per instance when omitted. */
    id?: string;
    class?: ClassValue;
  }

  let {
    label = DEFAULT_PASSWORD_LABEL,
    value = $bindable(''),
    autocomplete = 'current-password',
    name,
    hint,
    error = null,
    required = false,
    disabled = false,
    toggle = true,
    strength = false,
    match,
    id,
    class: className = '',
  }: Props = $props();

  const uid = $props.id();
  const meterId = `pw-${uid}-meter`;

  let input = $state<HTMLInputElement>();
  let visible = $state(false);
  /** A mismatch was reported at the last blur/submit and not yet resolved. */
  let flagged = $state(false);

  const score = $derived(scorePassword(value));
  const bars = $derived(strengthBars(score.level));
  const mismatch = $derived(match !== undefined && value !== match);
  const shownError = $derived(error || (flagged && mismatch ? MISMATCH_MESSAGE : null));

  // Once the two agree, a new mismatch waits for the next blur or submit.
  $effect(() => {
    if (!mismatch) flagged = false;
  });

  // The enclosing form's submit: report a mismatch, and hide the password so
  // the browser saves it from a password field.
  $effect(() => {
    const form = input?.form;
    if (!form) return;
    const onSubmit = () => {
      visible = false;
      if (mismatch) flagged = true;
    };
    form.addEventListener('submit', onSubmit);
    return () => form.removeEventListener('submit', onSubmit);
  });

  function handleBlur(): void {
    // Tabbing past an empty confirm field is not a mistake yet.
    if (value !== '' && mismatch) flagged = true;
  }

  /** Move focus into the input (e.g. to the first invalid field after a submit). */
  export function focus(): void {
    input?.focus();
  }
</script>

<FormField
  {label}
  {hint}
  error={shownError}
  {required}
  {disabled}
  {id}
  describedBy={strength ? meterId : undefined}
  class={['ird-pw', className]}
>
  {#snippet control(attrs)}
    <div class="ird-pw__wrap">
      <input
        {...attrs}
        bind:this={input}
        bind:value
        class={[attrs.class, 'ird-pw__input', toggle && 'has-toggle']}
        type={visible ? 'text' : 'password'}
        {name}
        {autocomplete}
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        onblur={handleBlur}
      />
      {#if toggle}
        <button
          type="button"
          class="ird-pw__toggle"
          aria-label={TOGGLE_LABEL}
          aria-pressed={visible}
          aria-controls={attrs.id}
          {disabled}
          onclick={() => (visible = !visible)}
        >
          <Icon name={visible ? 'eye-slash' : 'eye'} />
        </button>
      {/if}
    </div>

    {#if strength}
      <div class="ird-pw__meter" data-level={score.level}>
        <span class="ird-pw__bars" aria-hidden="true">
          {#each [1, 2, 3] as bar (bar)}
            <span class={['ird-pw__bar', bar <= bars && 'is-on']}></span>
          {/each}
        </span>
        <p class="ird-pw__meter-text" id={meterId} aria-live="polite">
          {strengthMessage(score)}
        </p>
      </div>
    {/if}
  {/snippet}
</FormField>

<style>
  .ird-pw__wrap {
    position: relative;
  }

  /* Room for the toggle. Two classes deep so it outranks FormField's padding. */
  .ird-pw__wrap .ird-pw__input.has-toggle {
    padding-inline-end: 3rem;
  }

  .ird-pw__toggle {
    position: absolute;
    inset-block: 0;
    inset-inline-end: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    border-radius: var(--radius-md);
    color: var(--color-muted);
    font-size: var(--fs-md);
    cursor: pointer;
    transition: color 0.15s cubic-bezier(0.22, 1, 0.36, 1);
  }

  @media (hover: hover) {
    .ird-pw__toggle:hover:not(:disabled) {
      color: var(--color-text);
    }
  }

  /* Press feedback for touch, where there is no hover. */
  .ird-pw__toggle:active:not(:disabled) {
    background: rgba(127, 127, 127, 0.12);
  }

  .ird-pw__toggle[aria-pressed='true'] {
    color: var(--color-text);
  }

  /* Inset, so the ring stays inside the field instead of riding its border. */
  .ird-pw__toggle:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: -5px;
  }

  .ird-pw__toggle:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .ird-pw__meter {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem 0.6rem;
  }

  .ird-pw__bars {
    display: inline-flex;
    flex: 0 0 auto;
    gap: 0.25rem;
  }

  .ird-pw__bar {
    width: 2rem;
    height: 0.3rem;
    border-radius: var(--radius-full);
    background: var(--status-neutral-bg);
    transition: background-color 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* Semantic, not decorative: red / amber / green MEAN weak / ok / strong —
     and the sentence beside the bars says it in words. */
  .ird-pw__meter[data-level='weak'] .ird-pw__bar.is-on {
    background: var(--money-neg);
  }

  .ird-pw__meter[data-level='ok'] .ird-pw__bar.is-on {
    background: var(--money-warn);
  }

  .ird-pw__meter[data-level='strong'] .ird-pw__bar.is-on {
    background: var(--money-pos);
  }

  .ird-pw__meter-text {
    flex: 1 1 12rem;
    min-width: 0;
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
    line-height: 1.4;
  }

  @media (prefers-reduced-motion: reduce) {
    .ird-pw__toggle,
    .ird-pw__bar {
      transition: none;
    }
  }
</style>
