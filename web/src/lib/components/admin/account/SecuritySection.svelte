<!--
  SecuritySection — Mi cuenta › Seguridad (S45, ASVS 5.0 V6/V7, D-033,
  D-035, D-040). Retires account.js renderSecuritySection / changePassword /
  refresh2faRow and the synthetic "Actividad" timeline, which dressed four
  fields of the auth user up as a feed (PORT-DEBT S45: cut, not ported).

    Contraseña                   change it, or create a first one (PasswordPanel)
    Verificación en dos pasos    the devices: add, remove (TwoFactorPanel)
    Métodos de inicio de sesión  read-only (SignInMethods)
    Sesiones                     "Cerrar sesión en todos los dispositivos"

  After a password or device change the panel that changed is followed by
  the offer to close the other sessions (SignOutOthersOffer). Closing every
  session asks first (ConfirmDialog, danger), signs out everywhere —
  this browser included, and with it the legacy panel, which shares the
  session — and goes to the sign-in page.

  Usage:
    <SecuritySection {user} />
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import Button from '#lib/components/Button.svelte';
  import { ROUTES } from '#lib/auth/routes.js';
  import { confirm } from '#lib/stores/confirm.svelte.js';
  import { session, type SessionUser } from '#lib/stores/session.svelte.js';
  import { toast } from '#lib/stores/toast.svelte.js';
  import AccountPanel from './AccountPanel.svelte';
  import AccountSection from './AccountSection.svelte';
  import PasswordPanel from './PasswordPanel.svelte';
  import SignInMethods from './SignInMethods.svelte';
  import SignOutOthersOffer from './SignOutOthersOffer.svelte';
  import TwoFactorPanel from './TwoFactorPanel.svelte';

  interface Props {
    user: SessionUser;
  }

  let { user }: Props = $props();

  /** Which panel's change the sign-out offer follows. */
  let offerAfter = $state<'password' | 'devices' | null>(null);
  let leaving = $state(false);

  async function signOutEverywhere(): Promise<void> {
    if (leaving) return;
    const yes = await confirm(
      '¿Cerrar sesión en todos los dispositivos?',
      'También se cerrará aquí. Tendrás que volver a iniciar sesión en cada dispositivo.',
      { confirmLabel: 'Cerrar sesión en todos', cancelLabel: 'Cancelar' },
    );
    if (!yes) return;
    leaving = true;
    const res = await session.signOut('global');
    if (!res.ok && session.status === 'ready') {
      // Nothing ended, not even here: the session could not be read.
      leaving = false;
      toast.error(res.error.message);
      return;
    }
    if (res.ok) {
      toast.success('Cerraste tu sesión en todos tus dispositivos.');
    } else {
      // auth-js ended this session anyway; the server did not confirm the rest.
      toast.error(
        'Cerramos tu sesión aquí, pero no pudimos confirmar el cierre en tus otros dispositivos. Vuelve a entrar e inténtalo de nuevo.',
      );
    }
    // ROUTES.login is resolve()d in #lib/auth/routes (its page is S39's).
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    await goto(ROUTES.login, { replace: true });
  }
</script>

<AccountSection
  title="Seguridad"
  lede="Tu contraseña, tus dispositivos de verificación y las sesiones abiertas."
>
  <PasswordPanel {user} onChanged={() => (offerAfter = 'password')} />
  {#if offerAfter === 'password'}
    <SignOutOthersOffer onClose={() => (offerAfter = null)} />
  {/if}

  <TwoFactorPanel onChanged={() => (offerAfter = 'devices')} />
  {#if offerAfter === 'devices'}
    <SignOutOthersOffer onClose={() => (offerAfter = null)} />
  {/if}

  <SignInMethods identities={user.identities} />

  <AccountPanel
    title="Sesiones"
    description="Si entraste desde otra computadora o teléfono y no cerraste la sesión, puedes cerrarla desde aquí. Se cierran todas, incluida esta."
  >
    <Button
      variant="ghost"
      icon="right-from-bracket"
      loading={leaving}
      onclick={() => void signOutEverywhere()}
    >
      Cerrar sesión en todos los dispositivos
    </Button>
  </AccountPanel>
</AccountSection>
