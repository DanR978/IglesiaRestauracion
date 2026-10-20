<!--
  TwoFactorPanel — Mi cuenta › Seguridad › Verificación en dos pasos (S45,
  D-033). Retires account.js refresh2faRow: one "Activada / No configurada"
  badge and a "Reconfigurar" button that replaced the factor through the
  sign-in screen.

  The verified devices, oldest first (name, the date it was added,
  "Verificado"), fetched fresh from the server (listFactors): a list skeleton,
  an error with Retry, or an empty state with the add action. "Agregar
  dispositivo" enrols another app (AddDeviceDialog). "Quitar" asks first
  (ConfirmDialog, danger), then a fresh code (StepUpDialog), then removes —
  and it exists only while two devices or more remain: two-step verification
  is required for every staff account (D-033), so the last device stays, and
  the panel says why. #lib/auth/mfa removeFactor refuses the last one too.
  Every change ends in a toast, a fresh list and onChanged() (the section then
  offers to close the other sessions).

  Usage:
    <TwoFactorPanel onChanged={offerSignOut} />
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Badge from '#lib/components/Badge.svelte';
  import Button from '#lib/components/Button.svelte';
  import Icon from '#lib/components/Icon.svelte';
  import StateEmpty from '#lib/components/StateEmpty.svelte';
  import StateError from '#lib/components/StateError.svelte';
  import StateLoading from '#lib/components/StateLoading.svelte';
  import { listFactors, removeFactor, type Factor } from '#lib/auth/mfa.js';
  import type { RepoError } from '#lib/repos/types.js';
  import { confirm } from '#lib/stores/confirm.svelte.js';
  import { toast } from '#lib/stores/toast.svelte.js';
  import AccountPanel from './AccountPanel.svelte';
  import AddDeviceDialog from './AddDeviceDialog.svelte';
  import StepUpDialog from './StepUpDialog.svelte';
  import { canRemoveDevice, deviceName, formatDate, verifiedFactors } from './account';

  interface Props {
    /** A device was added or removed. */
    onChanged: () => void;
  }

  let { onChanged }: Props = $props();

  /** null until the first answer. */
  let devices = $state.raw<Factor[] | null>(null);
  let failure = $state.raw<RepoError | null>(null);
  let adding = $state(false);
  let stepUp = $state(false);
  /** The device the step-up is for. */
  let target = $state.raw<Factor | null>(null);
  let removingId = $state<string | null>(null);
  let root = $state<HTMLElement>();

  const removable = $derived(devices !== null && canRemoveDevice(devices.length));

  async function load(): Promise<void> {
    const res = await listFactors();
    if (res.ok) {
      devices = verifiedFactors(res.data);
      failure = null;
    } else {
      failure = res.error;
    }
  }

  onMount(() => {
    void load();
  });

  async function added(): Promise<void> {
    toast.success('Dispositivo agregado');
    await load();
    onChanged();
  }

  async function askToRemove(device: Factor): Promise<void> {
    const yes = await confirm(
      `¿Quitar «${deviceName(device)}»?`,
      'Ya no podrás usar ese dispositivo para entrar al panel. Antes te pediremos un código para confirmar que eres tú.',
      { confirmLabel: 'Quitar dispositivo', cancelLabel: 'Cancelar' },
    );
    if (!yes) return;
    target = device;
    stepUp = true;
  }

  async function removeTarget(): Promise<void> {
    const device = target;
    target = null;
    if (!device) return;
    removingId = device.id;
    const res = await removeFactor(device.id);
    removingId = null;
    if (res.ok) toast.success('Dispositivo quitado');
    else toast.error(res.error.message);
    await load();
    if (res.ok) onChanged();
    await tick();
    // The device's button was busy (and is gone now): focus lands on the add action.
    if (document.activeElement === document.body) {
      root?.querySelector<HTMLButtonElement>('.devices__add')?.focus();
    }
  }
</script>

<AccountPanel
  title="Verificación en dos pasos"
  description="Además de tu contraseña o de Google y Microsoft, al entrar te pedimos un código de tu app de autenticación. Es obligatoria para usar el panel."
>
  <div bind:this={root}>
    {#if failure}
      <StateError message={failure.message} onRetry={load} />
    {:else if devices === null}
      <StateLoading shape="list" rows={2} label="Cargando tus dispositivos…" />
    {:else if devices.length === 0}
      <StateEmpty
        icon="mobile-screen"
        message="Aún no tienes dispositivos de verificación."
        hint="Agrega tu app de autenticación para poder entrar al panel."
      >
        {#snippet action()}
          <Button icon="plus" onclick={() => (adding = true)}>Agregar dispositivo</Button>
        {/snippet}
      </StateEmpty>
    {:else}
      <!-- role="list": Safari drops list semantics under `list-style: none`. -->
      <ul class="devices" role="list">
        {#each devices as device (device.id)}
          {@const name = deviceName(device)}
          {@const addedOn = formatDate(device.created_at)}
          <li class="device">
            <span class="device__icon"><Icon name="mobile-screen" /></span>
            <span class="device__text">
              <span class="device__name">{name}</span>
              {#if addedOn}<span class="device__meta">Agregado el {addedOn}</span>{/if}
              <Badge tone="success" label="Verificado" class="device__status" />
            </span>
            {#if removable}
              <Button
                variant="ghost"
                size="sm"
                icon="trash"
                class="device__remove"
                aria-label={`Quitar ${name}`}
                loading={removingId === device.id}
                disabled={removingId !== null}
                onclick={() => void askToRemove(device)}
              >
                Quitar
              </Button>
            {/if}
          </li>
        {/each}
      </ul>
      {#if !removable}
        <p class="devices__note">
          <Icon name="lock" />
          <span>
            Es tu único dispositivo y la verificación en dos pasos es obligatoria, así que no se
            puede quitar. Si vas a cambiar de teléfono, agrega primero el nuevo.
          </span>
        </p>
      {/if}
      <div class="devices__actions">
        <Button variant="ghost" icon="plus" class="devices__add" onclick={() => (adding = true)}>
          Agregar dispositivo
        </Button>
      </div>
    {/if}
  </div>
</AccountPanel>

<AddDeviceDialog bind:open={adding} onAdded={() => void added()} />
<StepUpDialog
  bind:open={stepUp}
  description="Para quitar el dispositivo, escribe un código de tu app de autenticación. Sirve el de cualquiera de tus dispositivos."
  onVerified={() => void removeTarget()}
  onCancel={() => (target = null)}
/>

<style>
  .devices {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* Icon · name, date and status · the action: the action keeps its place at
     the end of the row, even at 360px, and the long name wraps instead. */
  .device {
    display: flex;
    align-items: flex-start;
    gap: var(--mg-sm);
    padding-block: var(--pd-xs);
    border-block-end: 1px solid rgba(127, 127, 127, 0.18);
  }

  .device:first-child {
    padding-block-start: 0;
  }

  .device__icon {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: var(--radius-md);
    background: rgba(127, 127, 127, 0.12);
    color: var(--color-text);
  }

  .device__text {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
    min-width: 0;
  }

  .device__text :global(.device__status) {
    margin-block-start: var(--mg-xxs);
  }

  .device :global(.device__remove) {
    flex: 0 0 auto;
  }

  .device__name {
    color: var(--color-text);
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
    overflow-wrap: anywhere;
  }

  .device__meta {
    color: var(--color-muted);
    font-size: var(--fs-xs);
  }

  .devices__note {
    display: flex;
    align-items: flex-start;
    gap: var(--mg-xs);
    margin: var(--mg-sm) 0 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
    line-height: 1.5;
  }

  .devices__actions {
    margin-block-start: var(--mg-sm);
  }
</style>
