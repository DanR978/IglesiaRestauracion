<!--
  MfaChallenge — the code for an account that already has an authenticator
  (S39 · D-033). The challenge half of legacy admin/index.html #mfaCard and
  auth.js showMfaChallenge() as DF-006 fixed it: a code from ANY verified
  factor counts (auth/mfa.ts tries each), the code field is a real
  one-time-code input (CodeInput) that submits itself on the sixth digit,
  and cancelling waits for a verify in flight (and the reverse), so a cancel
  can never race a code that was just accepted.

  Preparing the step lists the account's factors. No TOTP factor at all →
  `onNeedsEnroll` (the page shows enrollment); a verified factor of a kind
  this panel cannot use (phone, passkey) → a plain message and the way out.
  A failed preparation leaves the field usable: submitting prepares again.

  Used by verificar/ (a sign-in at aal1) and by the email-link pages, where a
  recovery or invitation must step up before a password can change.

  Usage:
    <MfaChallenge onVerified={finish} onCancel={signOutHere} onNeedsEnroll={() => (step = 'enroll')} />
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { beginChallenge, listFactors, submitCode } from '#lib/auth/mfa.js';
  import Alert from '#lib/components/Alert.svelte';
  import Button from '#lib/components/Button.svelte';
  import CodeInput from '#lib/components/CodeInput.svelte';
  import StateError from '#lib/components/StateError.svelte';
  import { CODE_LENGTH } from '#lib/components/code-input.js';

  interface Props {
    /** The code was accepted: the session is now aal2. */
    onVerified: () => void | Promise<void>;
    /** The way out ("Cancelar y cerrar sesión" on a sign-in). */
    onCancel: () => void | Promise<void>;
    cancelLabel?: string;
    /** The account has no verified factor after all: enroll instead. */
    onNeedsEnroll: () => void;
  }

  let {
    onVerified,
    onCancel,
    cancelLabel = 'Cancelar y cerrar sesión',
    onNeedsEnroll,
  }: Props = $props();

  const UNSUPPORTED =
    'Tu cuenta usa un método de verificación que este panel no admite. Contacta al administrador.';

  let phase = $state<'ready' | 'unsupported' | 'failed'>('ready');
  let failure = $state<string | null>(null);
  let code = $state('');
  let error = $state<string | null>(null);
  let verifying = $state(false);
  let cancelling = $state(false);
  let input = $state<ReturnType<typeof CodeInput>>();

  onMount(() => {
    void prepare();
  });

  async function prepare(): Promise<void> {
    phase = 'ready';
    const res = await beginChallenge();
    if (!res.ok) {
      error = res.error.message;
      return;
    }
    if (res.data) return;
    const factors = await listFactors();
    if (!factors.ok) {
      failure = factors.error.message;
      phase = 'failed';
    } else if (factors.data.some((f) => f.status === 'verified')) {
      phase = 'unsupported';
    } else {
      onNeedsEnroll();
    }
  }

  async function verify(): Promise<void> {
    if (verifying || cancelling) return;
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
      await onCancel();
    } finally {
      cancelling = false;
    }
  }
</script>

{#if phase === 'unsupported'}
  <Alert tone="error" message={UNSUPPORTED} />
{:else if phase === 'failed'}
  <StateError message={failure} onRetry={prepare} compact />
{:else}
  <form
    class="mfa-step"
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
      loading={verifying}
      hint="Sirve el código de cualquiera de los dispositivos que registraste."
      onComplete={() => void verify()}
    />
    <Button type="submit" size="full" loading={verifying}>Verificar</Button>
  </form>
{/if}
<Button variant="ghost" size="full" disabled={verifying} loading={cancelling} onclick={cancel}>
  {cancelLabel}
</Button>

<style>
  .mfa-step {
    display: flex;
    flex-direction: column;
    gap: var(--mg-md);
  }
</style>
