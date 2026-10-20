<!--
  SignOutOthersOffer — after a password or device change, the offer to end
  every other session (S45, D-040: no idle timeout while two admins share one
  session, so ending the others is the account's own lever). An in-flow Alert
  under the panel that changed — this session stays open (signOut('others')).

  Usage:
    {#if offered}<SignOutOthersOffer onClose={() => (offered = false)} />{/if}
-->
<script lang="ts">
  import Alert from '#lib/components/Alert.svelte';
  import Button from '#lib/components/Button.svelte';
  import { session } from '#lib/stores/session.svelte.js';
  import { toast } from '#lib/stores/toast.svelte.js';

  interface Props {
    /** Dismissed, or done. */
    onClose: () => void;
  }

  let { onClose }: Props = $props();

  let busy = $state(false);

  async function signOutOthers(): Promise<void> {
    if (busy) return;
    busy = true;
    const res = await session.signOut('others');
    busy = false;
    if (!res.ok) {
      toast.error(res.error.message);
      return;
    }
    toast.success('Cerramos tu sesión en tus otros dispositivos.');
    onClose();
  }
</script>

<Alert
  tone="info"
  title="¿Cerrar sesión en tus otros dispositivos?"
  message="Si hiciste este cambio porque alguien más pudo entrar a tu cuenta, cierra las sesiones abiertas en otros navegadores y teléfonos. Esta sesión sigue abierta."
  onDismiss={onClose}
>
  {#snippet actions()}
    <Button
      variant="secondary"
      icon="right-from-bracket"
      loading={busy}
      onclick={() => void signOutOthers()}
    >
      Cerrar sesión en otros dispositivos
    </Button>
  {/snippet}
</Alert>
