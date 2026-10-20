<!--
  StepUpDialog — "prove it is you, now" before a sensitive change (S45,
  ASVS 5.0 V6 re-authentication). The session is already two-step verified;
  this asks for a FRESH code from the authenticator app right before the
  change — removing a two-factor device, creating a first password — so an
  unlocked, unattended browser is not enough to make it.

  Opens → beginChallenge() (every verified device's code counts) → CodeInput
  → submitCode() → onVerified(). A wrong code stays in the dialog as an inline
  error; a failure to prepare is an error with Retry; an account with no
  verified device (which the admin gate makes impossible) says so instead of
  asking for a code it can't have. Cancel, Escape or the × close it with no
  change made.

  Usage:
    <StepUpDialog bind:open={stepUp} description="…para quitar el dispositivo."
      onVerified={removeIt} />
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import Alert from '#lib/components/Alert.svelte';
  import Button from '#lib/components/Button.svelte';
  import CodeInput from '#lib/components/CodeInput.svelte';
  import { CODE_LENGTH } from '#lib/components/code-input.js';
  import Modal from '#lib/components/Modal.svelte';
  import StateError from '#lib/components/StateError.svelte';
  import StateLoading from '#lib/components/StateLoading.svelte';
  import { beginChallenge, submitCode } from '#lib/auth/mfa.js';
  import type { RepoError } from '#lib/repos/types.js';

  interface Props {
    /** Bindable. Opening it prepares a new challenge. */
    open?: boolean;
    /** What the code is for, as one sentence. */
    description: string;
    /** The code was right: make the change. The dialog is already closed. */
    onVerified: () => void;
    /** Closed without a code. */
    onCancel?: () => void;
  }

  let { open = $bindable(false), description, onVerified, onCancel }: Props = $props();

  type Phase = 'preparing' | 'ready' | 'unavailable' | 'failed';

  let phase = $state<Phase>('preparing');
  let failure = $state<RepoError | null>(null);
  let code = $state('');
  let codeError = $state<string | null>(null);
  let verifying = $state(false);
  let codeInput = $state<ReturnType<typeof CodeInput>>();

  const uid = $props.id();
  const formId = `stepup-${uid}`;

  async function prepare(): Promise<void> {
    const res = await beginChallenge();
    if (!res.ok) {
      failure = res.error;
      phase = 'failed';
      return;
    }
    failure = null;
    phase = res.data ? 'ready' : 'unavailable';
  }

  // Every opening is a new challenge.
  $effect(() => {
    if (!open) return;
    untrack(() => {
      phase = 'preparing';
      failure = null;
      code = '';
      codeError = null;
      void prepare();
    });
  });

  // The code is the one thing to do here: put the caret in it once it can take one.
  $effect(() => {
    if (open && phase === 'ready') codeInput?.focus();
  });

  async function verify(value: string = code): Promise<void> {
    if (verifying || phase !== 'ready') return;
    verifying = true;
    const res = await submitCode(value);
    verifying = false;
    if (res.ok) {
      open = false;
      onVerified();
      return;
    }
    codeError = res.error.message;
    code = '';
    codeInput?.focus();
  }

  function cancel(): void {
    open = false;
    onCancel?.();
  }
</script>

<Modal bind:open title="Confirma que eres tú" onclose={() => onCancel?.()}>
  <p class="stepup__lede">{description}</p>
  {#if phase === 'preparing'}
    <StateLoading shape="detail" rows={1} label="Preparando la verificación…" />
  {:else if phase === 'failed'}
    <StateError compact message={failure?.message} onRetry={prepare} />
  {:else if phase === 'unavailable'}
    <Alert
      tone="error"
      message="Tu cuenta no tiene un dispositivo de verificación activo. Recarga la página e inténtalo de nuevo."
    />
  {:else}
    <form
      id={formId}
      novalidate
      onsubmit={(event) => {
        event.preventDefault();
        void verify();
      }}
    >
      <CodeInput
        bind:this={codeInput}
        bind:value={code}
        bind:error={codeError}
        loading={verifying}
        hint="Escribe el código de 6 dígitos que muestra ahora tu app de autenticación."
        onComplete={(value) => void verify(value)}
      />
    </form>
  {/if}
  {#snippet footer()}
    <Button variant="ghost" onclick={cancel}>Cancelar</Button>
    <Button
      type="submit"
      form={formId}
      loading={verifying}
      disabled={phase !== 'ready' || code.length < CODE_LENGTH}
    >
      Confirmar
    </Button>
  {/snippet}
</Modal>

<style>
  .stepup__lede {
    margin: 0 0 var(--mg-sm);
    color: var(--color-text);
    font-size: var(--fs-sm);
    line-height: 1.5;
  }
</style>
