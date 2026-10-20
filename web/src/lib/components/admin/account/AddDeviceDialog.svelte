<!--
  AddDeviceDialog — add an authenticator app as a second device (S45). The
  session is at aal2, which is what GoTrue asks before a second TOTP factor.
  Retires account.js refresh2faRow's "Reconfigurar" (re-enrolment through the
  sign-in screen, replacing the old factor): a new device is ADDED here and
  the old one stays until it is removed on purpose.

  Opens → beginEnroll() (a unique name; half-finished enrolments cleared) →
  the three steps, the QR as an <img> with alt text, the secret in blocks of
  four with a copy button, and CodeInput → submitCode() → onAdded(). Cancel,
  Escape or the × call cancelEnroll(), which removes the new factor only
  while the server still lists it unverified. The scrim does not close it:
  someone switching to their phone to scan must not lose the code to a stray
  tap.

  Usage:
    <AddDeviceDialog bind:open={adding} onAdded={reload} />
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import Button from '#lib/components/Button.svelte';
  import CodeInput from '#lib/components/CodeInput.svelte';
  import { CODE_LENGTH } from '#lib/components/code-input.js';
  import Modal from '#lib/components/Modal.svelte';
  import StateError from '#lib/components/StateError.svelte';
  import StateLoading from '#lib/components/StateLoading.svelte';
  import { beginEnroll, cancelEnroll, submitCode, type TotpEnrollment } from '#lib/auth/mfa.js';
  import type { RepoError } from '#lib/repos/types.js';
  import { toast } from '#lib/stores/toast.svelte.js';
  import { groupSecret, qrImageSrc } from './account';

  interface Props {
    /** Bindable. Opening it starts a new enrolment. */
    open?: boolean;
    /** The device is verified and on the account. The dialog is already closed. */
    onAdded: () => void;
  }

  let { open = $bindable(false), onAdded }: Props = $props();

  type Phase = 'preparing' | 'ready' | 'failed';

  let phase = $state<Phase>('preparing');
  let failure = $state<RepoError | null>(null);
  let enrollment = $state.raw<TotpEnrollment | null>(null);
  let code = $state('');
  let codeError = $state<string | null>(null);
  let verifying = $state(false);

  const uid = $props.id();
  const formId = `enroll-${uid}`;
  const qrSrc = $derived(qrImageSrc(enrollment?.qrCode));

  async function prepare(): Promise<void> {
    const res = await beginEnroll();
    // Closed while the factor was being made: it must not linger half-enrolled.
    if (!open) {
      if (res.ok) abandon();
      return;
    }
    if (!res.ok) {
      failure = res.error;
      phase = 'failed';
      return;
    }
    failure = null;
    enrollment = res.data;
    phase = 'ready';
  }

  $effect(() => {
    if (!open) return;
    untrack(() => {
      phase = 'preparing';
      failure = null;
      enrollment = null;
      code = '';
      codeError = null;
      void prepare();
    });
  });

  async function verify(value: string = code): Promise<void> {
    if (verifying || phase !== 'ready') return;
    verifying = true;
    const res = await submitCode(value);
    verifying = false;
    if (res.ok) {
      open = false;
      onAdded();
      return;
    }
    codeError = res.error.message;
    code = '';
  }

  /** Walk away from the enrolment: the half-made factor goes, the account's devices stay. */
  function abandon(): void {
    void cancelEnroll();
  }

  function cancel(): void {
    open = false;
    abandon();
  }

  async function copySecret(): Promise<void> {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      toast.success('Clave copiada');
    } catch {
      toast.error('No pudimos copiar la clave. Selecciónala y cópiala a mano.');
    }
  }
</script>

<Modal bind:open title="Agregar un dispositivo" closeOnBackdrop={false} onclose={abandon}>
  {#if phase === 'preparing'}
    <StateLoading shape="detail" rows={3} label="Preparando el código QR…" />
  {:else if phase === 'failed'}
    <StateError compact message={failure?.message} onRetry={prepare} />
  {:else if enrollment}
    <ol class="enroll__steps">
      <li>
        Abre tu app de autenticación en el dispositivo nuevo (Google Authenticator, Microsoft
        Authenticator, Authy…).
      </li>
      <li>Escanea este código QR, o escribe la clave a mano.</li>
      <li>Escribe aquí el código de 6 dígitos que te muestra la app.</li>
    </ol>
    {#if qrSrc}
      <img
        class="enroll__qr"
        src={qrSrc}
        alt="Código QR para agregar este dispositivo a tu app de autenticación"
        width="176"
        height="176"
      />
    {/if}
    <div class="enroll__secret">
      <span class="enroll__secret-label">Clave para escribir a mano</span>
      <code class="enroll__secret-value">{groupSecret(enrollment.secret)}</code>
      <Button variant="ghost" size="sm" icon="copy" onclick={() => void copySecret()}>
        Copiar clave
      </Button>
    </div>
    <form
      id={formId}
      novalidate
      onsubmit={(event) => {
        event.preventDefault();
        void verify();
      }}
    >
      <CodeInput
        bind:value={code}
        bind:error={codeError}
        loading={verifying}
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
      Agregar dispositivo
    </Button>
  {/snippet}
</Modal>

<style>
  .enroll__steps {
    margin: 0 0 var(--mg-sm);
    padding-inline-start: 1.25rem;
    color: var(--color-text);
    font-size: var(--fs-sm);
    line-height: 1.5;
  }

  .enroll__steps li + li {
    margin-block-start: var(--mg-xxs);
  }

  /* The QR is black on white whatever the theme: a scanner needs the contrast,
     so it sits on a fixed white tile instead of the (dark-reversing) surface. */
  .enroll__qr {
    display: block;
    width: 11rem;
    height: 11rem;
    margin: 0 auto var(--mg-sm);
    padding: var(--pd-xs);
    border: 1px solid rgba(127, 127, 127, 0.18);
    border-radius: var(--radius-md);
    background: var(--static-white);
  }

  .enroll__secret {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--mg-xs);
    margin-block-end: var(--mg-sm);
  }

  .enroll__secret-label {
    flex: 1 0 100%;
    color: var(--color-text);
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
  }

  .enroll__secret-value {
    padding: var(--pd-xs) var(--pd-sm);
    border-radius: var(--radius-sm);
    background: var(--status-neutral-bg);
    color: var(--color-text);
    font-size: var(--fs-sm);
    letter-spacing: 0.06em;
    overflow-wrap: anywhere;
    user-select: all;
  }
</style>
