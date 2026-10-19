<script lang="ts">
  // acceso/sin-acceso/ — signed in, but no way into the panel (S39): no
  // profile, or a role the panel does not know (resolveAccess → 'forbidden';
  // unknown roles fail closed, D-006). Says so plainly and offers to sign out.
  // Legacy bootApp() signed the person out on its own with "Tu cuenta no
  // tiene un perfil asignado"; here the choice is theirs, and the account they
  // are signed in with is named, in case it is the wrong one. "Cerrar sesión"
  // is the shell's own way out (signOutAndLeave): this device only, then a
  // reload into the sign-in page with "Sesión cerrada.".
  //
  // Anyone else who lands here moves on: signed out → sign-in, a second
  // factor pending → verificar/, full access → Inicio.
  import { onMount } from 'svelte';
  import { ROUTES } from '#lib/auth/routes.js';
  import Button from '#lib/components/Button.svelte';
  import StateError from '#lib/components/StateError.svelte';
  import AccessHeading from '#lib/components/admin/auth/AccessHeading.svelte';
  import { destinationFor, leaveTo } from '#lib/components/admin/auth/destination.js';
  import { signOutAndLeave } from '#lib/components/admin/shell/sign-out.svelte.js';
  import { REPO_ERROR_MESSAGES } from '#lib/repos/errors.js';
  import { session } from '#lib/stores/session.svelte.js';

  let step = $state<'loading' | 'forbidden' | 'error'>('loading');
  let failure = $state<string | null>(null);
  let signingOut = $state(false);

  const email = $derived(session.user?.email ?? '');

  onMount(() => {
    void (async () => {
      await session.ready();
      await route();
    })();
  });

  async function route(): Promise<void> {
    await session.settled();
    const status = session.status;
    if (status === 'forbidden') {
      step = 'forbidden';
    } else if (status === 'error' || status === 'loading') {
      failure = session.error?.message ?? REPO_ERROR_MESSAGES.unknown;
      step = 'error';
    } else {
      const to = destinationFor(status, ROUTES.home);
      if (to) await leaveTo(to);
    }
  }

  async function retry(): Promise<void> {
    await session.retry();
    await route();
  }

  async function signOutHere(): Promise<void> {
    if (signingOut) return;
    signingOut = true;
    await signOutAndLeave('local');
  }
</script>

{#if step === 'forbidden'}
  <AccessHeading title="Tu cuenta no tiene acceso al panel" />
  <div class="no-access">
    <p>
      {#if email}
        Iniciaste sesión como <strong>{email}</strong>, pero esta cuenta no tiene un rol en el panel
        de administración.
      {:else}
        Iniciaste sesión, pero esta cuenta no tiene un rol en el panel de administración.
      {/if}
    </p>
    <p>
      Si crees que es un error, pide al administrador que revise tu cuenta. Si entraste con otra
      cuenta por equivocación, cierra la sesión y vuelve a entrar.
    </p>
  </div>
  <Button size="full" loading={signingOut} onclick={signOutHere}>Cerrar sesión</Button>
{:else if step === 'error'}
  <AccessHeading title="Acceso al panel" />
  <StateError message={failure} onRetry={retry} />
{:else}
  <AccessHeading title="Acceso al panel" />
  <p class="no-access__pending" role="status">Comprobando tu cuenta…</p>
{/if}

<style>
  .no-access {
    display: flex;
    flex-direction: column;
    gap: var(--mg-sm);
  }

  .no-access p {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .no-access__pending {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
</style>
