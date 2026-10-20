<!--
  MfaEnroll — set up the first authenticator (S39 · D-033). The enrollment
  half of legacy admin/index.html #mfaCard and auth.js showMfaEnroll() as
  DF-006 fixed it, split into its own state (PORT-DEBT S39): which apps work,
  the QR code, the same key as text with a copy button, then the code the app
  shows. Every staff account needs this before the panel opens.

  • The QR is GoTrue's SVG data URL in an <img> with a real alt. While a new
    one is created nothing of the previous attempt is shown — the box holds a
    placeholder of the same size, so the card does not jump when it lands.
  • The key sits in a read-only field (selectable, copyable by hand), in
    groups of four on two rows so all 32 characters stay readable at 360px
    (authenticator apps ignore the spaces); "Copiar clave" copies it without
    them, and the result is said in a polite status line.
  • A verified factor already on the account makes GoTrue refuse a new one at
    aal1 (`insufficient_aal`): `onNeedsChallenge` sends the page to the code
    step instead (DF-006).
  • Cancelling removes the new factor only while the server still lists it
    unverified (auth/mfa.ts cancelEnroll) — a code accepted a moment ago makes
    it the account's — and never while a verify is in flight.

  Usage:
    <MfaEnroll onVerified={finish} onCancel={signOutHere} onNeedsChallenge={() => (step = 'challenge')} />
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { beginEnroll, cancelEnroll, submitCode, type TotpEnrollment } from '#lib/auth/mfa.js';
  import Button from '#lib/components/Button.svelte';
  import CodeInput from '#lib/components/CodeInput.svelte';
  import FormField from '#lib/components/FormField.svelte';
  import Icon from '#lib/components/Icon.svelte';
  import StateError from '#lib/components/StateError.svelte';
  import { CODE_LENGTH } from '#lib/components/code-input.js';

  interface Props {
    /** The new factor is verified: the session is now aal2. */
    onVerified: () => void | Promise<void>;
    /** The way out, after the unverified factor is removed. */
    onCancel: () => void | Promise<void>;
    cancelLabel?: string;
    /** The account already has a verified factor: prove it instead. */
    onNeedsChallenge: () => void;
  }

  let {
    onVerified,
    onCancel,
    cancelLabel = 'Cancelar y cerrar sesión',
    onNeedsChallenge,
  }: Props = $props();

  const COPY_OK = 'Clave copiada.';
  const COPY_FAILED = 'No se pudo copiar. Selecciona la clave y cópiala.';

  let enrollment = $state.raw<TotpEnrollment | null>(null);
  let failure = $state<string | null>(null);
  let code = $state('');
  let error = $state<string | null>(null);
  let verifying = $state(false);
  let cancelling = $state(false);
  let copied = $state('');
  let input = $state<ReturnType<typeof CodeInput>>();
  let secretField = $state<HTMLTextAreaElement>();

  /** "JBSW Y3DP EHPK 3PXP …" — read and typed in fours. */
  const shownSecret = $derived(enrollment?.secret.replace(/(.{4})(?=.)/g, '$1 ') ?? '');

  onMount(() => {
    void start();
  });

  async function start(): Promise<void> {
    enrollment = null;
    failure = null;
    copied = '';
    const res = await beginEnroll();
    if (res.ok) {
      enrollment = res.data;
    } else if (res.error.code === 'insufficient_aal') {
      onNeedsChallenge();
    } else {
      failure = res.error.message;
    }
  }

  async function copySecret(): Promise<void> {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      copied = COPY_OK;
    } catch {
      secretField?.select();
      copied = COPY_FAILED;
    }
  }

  async function verify(): Promise<void> {
    if (verifying || cancelling || !enrollment) return;
    if (code.length !== CODE_LENGTH) {
      error = 'Escribe el código de 6 dígitos.';
      input?.focus();
      return;
    }
    verifying = true;
    const res = await submitCode(code);
    if (!res.ok) {
      verifying = false;
      error = res.error.message;
      code = '';
      input?.focus();
      return;
    }
    await onVerified();
  }

  async function cancel(): Promise<void> {
    if (verifying || cancelling) return;
    cancelling = true;
    try {
      // Best effort: a factor left unverified only blocks its own name, and
      // the next enrollment clears it (auth/mfa.ts beginEnroll).
      await cancelEnroll();
      await onCancel();
    } finally {
      cancelling = false;
    }
  }
</script>

<ol class="enroll__steps">
  <li>
    Instala en tu teléfono una app de autenticación, por ejemplo Google Authenticator, Microsoft
    Authenticator o 1Password.
  </li>
  <li>En la app, agrega una cuenta nueva y escanea este código QR.</li>
  <li>Escribe aquí el código de 6 dígitos que te muestre la app.</li>
</ol>

<div class={['enroll__qr', failure && 'is-failed']}>
  {#if enrollment}
    <img src={enrollment.qrCode} alt="Código QR para tu app de autenticación" />
  {:else if failure}
    <StateError message={failure} onRetry={start} compact />
  {:else}
    <p class="enroll__pending" role="status">
      <Icon name="spinner" spin />Preparando tu código QR…
    </p>
  {/if}
</div>

<FormField label="Clave de configuración" hint="¿No puedes escanear? Escribe esta clave en la app.">
  {#snippet control(attrs)}
    <div class="enroll__secret">
      <textarea
        id={attrs.id}
        class={[attrs.class, 'enroll__secret-input']}
        aria-describedby={attrs['aria-describedby']}
        aria-invalid={attrs['aria-invalid']}
        aria-required={attrs['aria-required']}
        disabled={attrs.disabled}
        bind:this={secretField}
        readonly
        rows="2"
        value={shownSecret}
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"></textarea>
      <Button variant="ghost" icon="copy" disabled={!enrollment} onclick={copySecret}>
        Copiar clave
      </Button>
    </div>
    <p class="enroll__copied" role="status">{copied}</p>
  {/snippet}
</FormField>

<form
  class="enroll__verify"
  novalidate
  onsubmit={(event) => {
    event.preventDefault();
    void verify();
  }}
>
  <CodeInput
    bind:this={input}
    bind:value={code}
    bind:error
    name="code"
    disabled={!enrollment}
    loading={verifying}
    onComplete={() => void verify()}
  />
  <Button type="submit" size="full" disabled={!enrollment} loading={verifying}>
    Verificar y continuar
  </Button>
</form>
<Button variant="ghost" size="full" disabled={verifying} loading={cancelling} onclick={cancel}>
  {cancelLabel}
</Button>

<style>
  .enroll__steps {
    display: flex;
    flex-direction: column;
    gap: var(--mg-xs);
    margin: 0;
    padding-inline-start: 1.25rem;
    color: var(--color-text);
    font-size: var(--fs-sm);
    line-height: 1.5;
  }

  /* A fixed square, so the placeholder, the image and the error all take the
     same room. The QR keeps a white quiet zone in both themes: scanners need
     dark modules on light, and GoTrue's SVG has no margin of its own. */
  .enroll__qr {
    display: grid;
    place-items: center;
    align-self: center;
    width: min(13rem, 100%);
    aspect-ratio: 1;
    padding: var(--pd-xs);
    border: 1px solid rgba(127, 127, 127, 0.18);
    border-radius: var(--radius-md);
    background: var(--static-white);
  }

  .enroll__qr img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  /* The placeholder and the error sit on the white box: dark ink there. */
  .enroll__pending {
    display: flex;
    align-items: center;
    gap: var(--mg-xs);
    margin: 0;
    padding: var(--pd-xs);
    color: var(--static-black);
    font-size: var(--fs-sm);
    text-align: center;
  }

  /* The error state is ordinary card content: the surface, not the white box. */
  .enroll__qr.is-failed {
    background: var(--color-surface);
  }

  .enroll__secret {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mg-xs);
  }

  /* Two fixed rows (no resize, no jump when the key lands), the whole width;
     the copy button wraps under it on a phone. The class is doubled to outrank
     FormField's `textarea.ird-field__control` (min-height 5.5rem, resizable):
     Svelte's trailing scope class is a zero-specificity :where(). */
  .enroll__secret .enroll__secret-input.enroll__secret-input {
    flex: 1 1 16rem;
    width: auto;
    min-width: 0;
    min-height: auto;
    resize: none;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    letter-spacing: 0.06em;
    line-height: 1.5;
  }

  .enroll__copied {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }

  .enroll__verify {
    display: flex;
    flex-direction: column;
    gap: var(--mg-md);
  }
</style>
