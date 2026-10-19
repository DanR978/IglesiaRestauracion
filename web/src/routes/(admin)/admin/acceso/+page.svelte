<script lang="ts">
  // acceso/ — sign in (S39). Retires the legacy #loginCard (admin/index.html)
  // and auth.js doLogin(): email + password with Spanish validation, GoTrue's
  // refusals mapped by code (never its text), then Google / Microsoft when the
  // project has them on (D-035). A session that already exists moves on at
  // once; after a sign-in the settled session store picks the next page —
  // verificar/ for the second factor (D-033), or the validated `next`.
  //
  // The notice ("Sesión cerrada." / "Tu sesión expiró…") and the email carried
  // back from recuperar/ are both known when the page is created, so they are
  // in the first paint and nothing jumps.
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { safeNext } from '#lib/auth/next.js';
  import { ROUTES } from '#lib/auth/routes.js';
  import { signInWithPassword } from '#lib/auth/session.js';
  import Alert from '#lib/components/Alert.svelte';
  import Button from '#lib/components/Button.svelte';
  import FormField from '#lib/components/FormField.svelte';
  import PasswordField from '#lib/components/PasswordField.svelte';
  import AccessHeading from '#lib/components/admin/auth/AccessHeading.svelte';
  import ProviderButtons from '#lib/components/admin/auth/ProviderButtons.svelte';
  import { destinationFor, leaveTo } from '#lib/components/admin/auth/destination.js';
  import {
    LOGIN_NOTICE_COPY,
    carriedEmail,
    carryEmail,
    loginNoticeFor,
  } from '#lib/components/admin/auth/handoff.js';
  import { REPO_ERROR_MESSAGES } from '#lib/repos/errors.js';
  import { session, type SessionStatus } from '#lib/stores/session.svelte.js';
  import { isValidEmail } from '#lib/validators.js';

  /** Statuses that mean this browser already holds a session to carry on with. */
  const SIGNED_IN: ReadonlySet<SessionStatus> = new Set([
    'ready',
    'needs-mfa',
    'needs-enroll',
    'forbidden',
  ]);

  const params = new URL(location.href).searchParams;

  let email = $state(carriedEmail());
  let password = $state('');
  let emailError = $state<string | null>(null);
  let passwordError = $state<string | null>(null);
  let formError = $state<string | null>(null);
  let notice = $state(loginNoticeFor(params, session.status));
  let signingIn = $state(false);
  let next = $state(ROUTES.home);
  let emailInput = $state<HTMLInputElement>();
  let passwordField = $state<ReturnType<typeof PasswordField>>();

  $effect(() => {
    if (password) passwordError = null;
  });

  onMount(() => {
    void (async () => {
      next = await safeNext(params.get('next'));
      await session.ready();
      const to = SIGNED_IN.has(session.status) ? destinationFor(session.status, next) : null;
      if (to) await leaveTo(to);
    })();
  });

  function validate(): boolean {
    const address = email.trim();
    emailError = !address
      ? 'Escribe tu correo electrónico.'
      : isValidEmail(address)
        ? null
        : 'Escribe un correo electrónico válido, por ejemplo nombre@ejemplo.com.';
    passwordError = password ? null : 'Escribe tu contraseña.';
    if (emailError) emailInput?.focus();
    else if (passwordError) passwordField?.focus();
    return !emailError && !passwordError;
  }

  async function signIn(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (signingIn) return;
    formError = null;
    notice = null;
    if (!validate()) return;
    signingIn = true;
    const res = await signInWithPassword(email, password);
    if (!res.ok) {
      formError = res.error.message;
      signingIn = false;
      return;
    }
    await session.settled();
    const to = SIGNED_IN.has(session.status) ? destinationFor(session.status, next) : null;
    if (to) return leaveTo(to);
    formError = session.error?.message ?? REPO_ERROR_MESSAGES.unknown;
    signingIn = false;
  }
</script>

<AccessHeading title="Iniciar sesión" lede="Usa la cuenta con la que te invitaron al panel." />

{#if notice}
  <Alert tone={notice === 'expired' ? 'warn' : 'info'} message={LOGIN_NOTICE_COPY[notice]} />
{/if}

<form class="login" novalidate onsubmit={signIn}>
  <FormField label="Correo electrónico" error={emailError}>
    {#snippet control(attrs)}
      <input
        id={attrs.id}
        class={attrs.class}
        aria-describedby={attrs['aria-describedby']}
        aria-invalid={attrs['aria-invalid']}
        aria-required={attrs['aria-required']}
        disabled={attrs.disabled}
        bind:this={emailInput}
        bind:value={email}
        type="email"
        name="email"
        autocomplete="username"
        inputmode="email"
        autocapitalize="off"
        spellcheck="false"
        oninput={() => (emailError = null)}
      />
    {/snippet}
  </FormField>

  <div class="login__password">
    <PasswordField
      bind:this={passwordField}
      bind:value={password}
      name="password"
      autocomplete="current-password"
      error={passwordError}
    />
    <a
      class="login__forgot"
      href={resolve('admin/acceso/recuperar/')}
      onclick={() => carryEmail(email)}
    >
      ¿Olvidaste tu contraseña?
    </a>
  </div>

  {#if formError}
    <Alert tone="error" message={formError} />
  {/if}

  <Button type="submit" size="full" loading={signingIn}>Entrar</Button>
</form>

<ProviderButtons {next} disabled={signingIn} onError={(message) => (formError = message)} />

<style>
  .login {
    display: flex;
    flex-direction: column;
    gap: var(--mg-md);
  }

  .login__password {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .login__password > :global(.ird-field) {
    align-self: stretch;
  }

  /* A full 44px row to tap, though it reads as a plain link. */
  .login__forgot {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    color: var(--color-accent-ink);
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
    text-decoration: underline;
    text-underline-offset: 0.15em;
  }

  @media (hover: hover) {
    .login__forgot:hover {
      color: var(--color-text);
    }
  }
</style>
