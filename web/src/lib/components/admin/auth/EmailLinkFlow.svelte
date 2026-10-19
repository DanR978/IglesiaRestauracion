<!--
  EmailLinkFlow — an invitation or a password-recovery link, end to end (S39).
  The page behind acceso/invitacion/ and acceso/restablecer/. Ports the email
  half of legacy auth.js boot() steps 0–2, showSetPassword(), startRecovery()
  and submitSetPassword() as DF-006 fixed them:

    1. The legacy email contract is accepted as is — `?action=accept-invite|
       reset-password&token_hash=…&type=…` (supabase/email-templates, D-001
       until S64) and a plain `?token_hash=…&type=…`, query or fragment. A link
       meant for the other page goes there unspent (auth/guard.ts decides,
       exactly as the admin guard does).
    2. The one-time values leave the address bar before anything is sent;
       then verifyOtp spends the token — nothing is spent before this script
       runs, so a mail scanner that only fetches the link cannot use it up.
    3. An account with a verified factor steps up FIRST: GoTrue refuses a new
       password at aal1 (`insufficient_aal`), so the code comes before the
       password, never after a refusal (legacy startRecovery).
    4. The password: PasswordField twice (new-password, strength meter, live
       mismatch). An invitation may use Google / Microsoft instead.
    5. The settled session goes on: an invitee with no authenticator to
       verificar/ to enroll one (D-033); a stepped-up recovery to Inicio.

  A reload after the token was spent finds the link's session and carries on
  (legacy kept `?action=` for that). An expired, used or broken link — or a
  session that is gone — says so plainly, with the next step.

  Usage:
    <EmailLinkFlow kind="invite" />      (invitacion/)
    <EmailLinkFlow kind="recovery" />    (restablecer/)
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { emailLinkTarget } from '#lib/auth/guard.js';
  import { ROUTES } from '#lib/auth/routes.js';
  import { updatePassword, verifyOtp } from '#lib/auth/session.js';
  import Alert from '#lib/components/Alert.svelte';
  import Button from '#lib/components/Button.svelte';
  import PasswordField from '#lib/components/PasswordField.svelte';
  import ReadonlyField from '#lib/components/ReadonlyField.svelte';
  import StateError from '#lib/components/StateError.svelte';
  import { scorePassword } from '#lib/components/password-field.js';
  import { REPO_ERROR_MESSAGES } from '#lib/repos/errors.js';
  import { session } from '#lib/stores/session.svelte.js';
  import { toast } from '#lib/stores/toast.svelte.js';
  import AccessHeading from './AccessHeading.svelte';
  import MfaChallenge from './MfaChallenge.svelte';
  import ProviderButtons from './ProviderButtons.svelte';
  import { authParams, scrubLocation } from './auth-url';
  import { destinationFor, leaveTo } from './destination';
  import { loginHref } from './handoff';

  interface Props {
    kind: 'invite' | 'recovery';
  }

  let { kind }: Props = $props();

  type Step = 'checking' | 'challenge' | 'password' | 'invalid' | 'error';

  const COPY = {
    invite: {
      title: 'Activa tu cuenta',
      lede: 'Crea la contraseña con la que vas a entrar al panel.',
      invalidTitle: 'El enlace de invitación no es válido',
      invalid:
        'El enlace expiró o ya se usó. Pide al administrador que te envíe una invitación nueva.',
      stepUp:
        'Antes de crear tu contraseña, escribe el código de 6 dígitos de tu app de autenticación.',
      submit: 'Crear contraseña',
      saved: 'Contraseña creada.',
    },
    recovery: {
      title: 'Restablece tu contraseña',
      lede: 'Elige una contraseña nueva para tu cuenta.',
      invalidTitle: 'El enlace no es válido',
      invalid: 'El enlace para restablecer tu contraseña expiró o ya se usó. Pide uno nuevo.',
      stepUp:
        'Antes de cambiar tu contraseña, escribe el código de 6 dígitos de tu app de autenticación.',
      submit: 'Guardar contraseña',
      saved: 'Contraseña actualizada.',
    },
  } as const;

  /** GoTrue / auth-js codes that mean the link's session is no longer there. */
  const SESSION_GONE = new Set([
    'session_not_found',
    'session_expired',
    'refresh_token_not_found',
    'refresh_token_already_used',
    'user_not_found',
    'bad_jwt',
  ]);

  const copy = $derived(COPY[kind]);

  // Decided before the first render: a link for the other page leaves with its
  // token unspent; otherwise the one-time values are read, then scrubbed.
  const url = new URL(location.href);
  const target = emailLinkTarget(url, url.hash);
  const elsewhere = target && new URL(target, url.origin).pathname !== url.pathname ? target : null;
  const params = authParams(url);
  if (!elsewhere) scrubLocation();

  let step = $state<Step>('checking');
  let failure = $state<string | null>(null);
  let retryStep = $state.raw<() => Promise<void>>(async () => {});
  let password = $state('');
  let confirm = $state('');
  let passwordError = $state<string | null>(null);
  let confirmError = $state<string | null>(null);
  let saveError = $state<string | null>(null);
  let saving = $state(false);
  let passwordField = $state<ReturnType<typeof PasswordField>>();
  let confirmField = $state<ReturnType<typeof PasswordField>>();

  const email = $derived(session.user?.email ?? '');
  // The lede is the same while the link is checked and once the form shows,
  // so only the content under it changes.
  const heading = $derived(
    step === 'challenge'
      ? { title: 'Verifica tu identidad', lede: copy.stepUp }
      : step === 'invalid'
        ? { title: copy.invalidTitle, lede: undefined }
        : { title: copy.title, lede: copy.lede },
  );

  $effect(() => {
    if (password) passwordError = null;
  });
  $effect(() => {
    if (confirm) confirmError = null;
  });

  onMount(() => {
    void start();
  });

  async function start(): Promise<void> {
    // The store must be listening before verifyOtp signs this tab in.
    await session.ready();
    if (elsewhere) return leaveTo(elsewhere);
    const linkError = params.get('error_code') || params.get('error');
    if (linkError) {
      console.warn('[acceso] email link:', linkError, params.get('error_description') ?? '');
      step = 'invalid';
      return;
    }
    const tokenHash = params.get('token_hash');
    const type = params.get('type');
    if (tokenHash && type) await spend(tokenHash, type);
    else await resume();
  }

  async function spend(tokenHash: string, type: string): Promise<void> {
    step = 'checking';
    const res = await verifyOtp(tokenHash, type);
    if (res.ok) return resume();
    if (res.error.kind === 'network') fail(res.error.message, () => spend(tokenHash, type));
    else step = 'invalid';
  }

  /** The step the link's session needs: the code first when it has a factor, else the password. */
  async function resume(): Promise<void> {
    await session.settled();
    switch (session.status) {
      case 'needs-mfa':
        step = 'challenge';
        return;
      case 'needs-enroll':
      case 'ready':
        step = 'password';
        return;
      case 'forbidden':
        return leaveTo(ROUTES.noAccess);
      case 'error':
      case 'loading':
        fail(session.error?.message ?? REPO_ERROR_MESSAGES.unknown, async () => {
          await session.retry();
          await resume();
        });
        return;
      default:
        step = 'invalid';
    }
  }

  function fail(message: string, again: () => Promise<void>): void {
    failure = message;
    retryStep = again;
    step = 'error';
  }

  function validate(): boolean {
    const score = scorePassword(password);
    passwordError = !password
      ? 'Escribe una contraseña nueva.'
      : score.acceptable
        ? null
        : score.reason === 'short'
          ? 'La contraseña debe tener al menos 8 caracteres.'
          : 'Esa contraseña es fácil de adivinar. Evita palabras comunes, fechas, repeticiones y secuencias.';
    confirmError = confirm ? null : 'Escribe la contraseña otra vez para confirmarla.';
    if (passwordError) passwordField?.focus();
    else if (confirmError || confirm !== password) confirmField?.focus();
    return !passwordError && !confirmError && confirm === password;
  }

  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (saving) return;
    saveError = null;
    if (!validate()) return;
    saving = true;
    const res = await updatePassword({ password });
    if (!res.ok) {
      saving = false;
      const { code, kind: errorKind } = res.error;
      // A factor this session has not proven yet: the code, then save again —
      // the two fields keep what was typed.
      if (code === 'insufficient_aal') step = 'challenge';
      else if (errorKind === 'auth' && (code === null || SESSION_GONE.has(code))) step = 'invalid';
      else saveError = res.error.message;
      return;
    }
    toast.success(copy.saved);
    await finish();
  }

  async function finish(): Promise<void> {
    await session.settled();
    const to = destinationFor(session.status, ROUTES.home);
    if (to) return leaveTo(to);
    saving = false;
    fail(session.error?.message ?? REPO_ERROR_MESSAGES.unknown, async () => {
      await session.retry();
      await finish();
    });
  }

  async function signOutHere(): Promise<void> {
    await session.signOut('local');
    await leaveTo(loginHref('signed-out'));
  }
</script>

<AccessHeading title={heading.title} lede={heading.lede} />

{#if step === 'challenge'}
  <MfaChallenge
    onVerified={async () => {
      await session.settled();
      step = 'password';
    }}
    onCancel={signOutHere}
    onNeedsEnroll={() => (step = 'password')}
  />
{:else if step === 'password'}
  <form class="link__form" novalidate onsubmit={save}>
    {#if email}
      <ReadonlyField label="Cuenta" value={email} />
      <!-- For password managers: the account this new password belongs to. -->
      <input type="email" name="username" autocomplete="username" value={email} readonly hidden />
    {/if}
    <PasswordField
      bind:this={passwordField}
      bind:value={password}
      label="Contraseña nueva"
      name="new-password"
      autocomplete="new-password"
      strength
      error={passwordError}
    />
    <PasswordField
      bind:this={confirmField}
      bind:value={confirm}
      label="Confirma la contraseña"
      name="confirm-password"
      autocomplete="new-password"
      match={password}
      error={confirmError}
    />
    {#if saveError}
      <Alert tone="error" message={saveError} />
    {/if}
    <Button type="submit" size="full" loading={saving}>{copy.submit}</Button>
  </form>
  {#if kind === 'invite'}
    <ProviderButtons disabled={saving} onError={(message) => (saveError = message)} />
  {/if}
{:else if step === 'invalid'}
  <Alert tone="error" message={copy.invalid} />
  <div class="link__actions">
    {#if kind === 'recovery'}
      <Button size="full" href={resolve('admin/acceso/recuperar/')}>Pedir un enlace nuevo</Button>
      <Button variant="ghost" size="full" href={resolve('admin/acceso/')}>
        Volver a iniciar sesión
      </Button>
    {:else}
      <Button variant="ghost" size="full" href={resolve('admin/acceso/')}>
        Ir a iniciar sesión
      </Button>
    {/if}
  </div>
{:else if step === 'error'}
  <StateError message={failure} onRetry={() => retryStep()} />
{:else}
  <p class="link__pending" role="status">Comprobando el enlace…</p>
{/if}

<style>
  .link__form {
    display: flex;
    flex-direction: column;
    gap: var(--mg-md);
  }

  .link__actions {
    display: flex;
    flex-direction: column;
    gap: var(--mg-xs);
  }

  .link__pending {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
</style>
