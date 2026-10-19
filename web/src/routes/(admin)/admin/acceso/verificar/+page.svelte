<script lang="ts">
  // acceso/verificar/ — the second factor (S39 · D-033). Every staff session
  // reaches the panel at aal2: legacy auth.js routeAfterLogin() →
  // mfaStatus() → showMfaChallenge() | showMfaEnroll(), as DF-006 restored it,
  // with the one card split into two states that look and read differently:
  //
  //   challenge  the account has an authenticator: its code (any device)
  //   enroll     it has none yet: which apps work, the QR, the key, the code
  //
  // The session store's settled status decides (needs-mfa / needs-enroll);
  // anything else leaves at once — signed out → sign-in, already aal2 → `next`,
  // no access → sin-acceso/. "Cancelar y cerrar sesión" ends only this
  // device's session and reloads into the sign-in page, like the legacy cancel
  // — the shell's own way out (signOutAndLeave), "Sesión cerrada." included.
  import { onMount } from 'svelte';
  import { safeNext } from '#lib/auth/next.js';
  import { ROUTES } from '#lib/auth/routes.js';
  import StateError from '#lib/components/StateError.svelte';
  import AccessHeading from '#lib/components/admin/auth/AccessHeading.svelte';
  import MfaChallenge from '#lib/components/admin/auth/MfaChallenge.svelte';
  import MfaEnroll from '#lib/components/admin/auth/MfaEnroll.svelte';
  import { destinationFor, leaveTo } from '#lib/components/admin/auth/destination.js';
  import { signOutAndLeave } from '#lib/components/admin/shell/sign-out.svelte.js';
  import { REPO_ERROR_MESSAGES } from '#lib/repos/errors.js';
  import { session } from '#lib/stores/session.svelte.js';
  import { toast } from '#lib/stores/toast.svelte.js';

  type Step = 'loading' | 'challenge' | 'enroll' | 'error';

  const TITLES: Record<Step, { title: string; lede?: string }> = {
    loading: { title: 'Verificación en dos pasos' },
    challenge: {
      title: 'Verifica tu identidad',
      lede: 'Escribe el código de 6 dígitos que muestra tu app de autenticación.',
    },
    enroll: {
      title: 'Protege tu cuenta',
      lede: 'Para entrar al panel se necesita un segundo paso: un código de una app en tu teléfono. Solo hay que configurarlo una vez.',
    },
    error: { title: 'Verificación en dos pasos' },
  };

  let step = $state<Step>('loading');
  let failure = $state<string | null>(null);
  let next = ROUTES.home;

  onMount(() => {
    void (async () => {
      next = await safeNext(new URL(location.href).searchParams.get('next'));
      await session.ready();
      await route();
    })();
  });

  /** Show the step the settled session needs, or leave for the page it should be on. */
  async function route(): Promise<void> {
    await session.settled();
    const status = session.status;
    if (status === 'needs-mfa') step = 'challenge';
    else if (status === 'needs-enroll') step = 'enroll';
    else if (status === 'error' || status === 'loading') {
      failure = session.error?.message ?? REPO_ERROR_MESSAGES.unknown;
      step = 'error';
    } else {
      const to = destinationFor(status, next);
      if (to) await leaveTo(to);
    }
  }

  async function retry(): Promise<void> {
    await session.retry();
    await route();
  }

  async function verified(): Promise<void> {
    toast.success('Verificación completada.');
    await session.settled();
    const to = destinationFor(session.status, next);
    if (to) return leaveTo(to);
    failure = session.error?.message ?? REPO_ERROR_MESSAGES.unknown;
    step = 'error';
  }
</script>

<AccessHeading title={TITLES[step].title} lede={TITLES[step].lede} />

{#if step === 'challenge'}
  <MfaChallenge
    onVerified={verified}
    onCancel={() => signOutAndLeave('local')}
    onNeedsEnroll={() => (step = 'enroll')}
  />
{:else if step === 'enroll'}
  <MfaEnroll
    onVerified={verified}
    onCancel={() => signOutAndLeave('local')}
    onNeedsChallenge={() => (step = 'challenge')}
  />
{:else if step === 'error'}
  <StateError message={failure} onRetry={retry} />
{:else}
  <p class="verify__pending" role="status">Comprobando tu sesión…</p>
{/if}

<style>
  .verify__pending {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
</style>
