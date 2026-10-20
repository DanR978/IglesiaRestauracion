<!--
  AvatarUploader — the account photo (S45; DESIGN-SYSTEM §4.1 "Avatar":
  "Uploader behaviour … is account-specific → AvatarUploader in S45").
  Retires account.js onAvatarPick / removeAvatar / paintAvatar.

  Pick → check (an image, at most 5 MB) → the centred square at 512px as a
  JPEG (#lib/image-optimizer, the DF-004 port) → upload to the account's own
  folder → point the profile at it (set_my_avatar) → session.refresh(), so
  every avatar on screen follows. The button carries the progress (Button
  `loading`) and a polite status line names the stage — storage-js uploads
  with fetch, so there is no byte count to show. "Quitar foto" asks first.
  Every outcome is a Spanish toast; no backend text reaches the screen.

  What the legacy did and this does not: upload the raw file (up to 5 MB, in
  any format, `upsert: true`), show the failure in a box that printed the
  backend's message, and lose keyboard focus when the button it was on went
  busy.

  Usage:
    <AvatarUploader userId={user.id} name={displayName} photo={profile.avatar_url} />
-->
<script lang="ts">
  import Avatar from '#lib/components/Avatar.svelte';
  import Button from '#lib/components/Button.svelte';
  import { ImageOptimizerError, optimizeSquare } from '#lib/image-optimizer.js';
  import { setAvatarUrl, uploadAvatar } from '#lib/repos/profiles.js';
  import { confirm } from '#lib/stores/confirm.svelte.js';
  import { session } from '#lib/stores/session.svelte.js';
  import { toast } from '#lib/stores/toast.svelte.js';
  import { AVATAR_ACCEPT, avatarFileProblem } from './account';

  interface Props {
    /** The signed-in user's id: the storage folder the photo goes to. */
    userId: string;
    /** Whose initials stand in for a missing photo. */
    name: string;
    /** profiles.avatar_url. */
    photo: string | null;
  }

  let { userId, name, photo }: Props = $props();

  type Stage = 'idle' | 'preparing' | 'uploading' | 'saving' | 'removing';

  const STAGE_TEXT: Readonly<Record<Exclude<Stage, 'idle'>, string>> = {
    preparing: 'Preparando la foto…',
    uploading: 'Subiendo la foto…',
    saving: 'Guardando la foto…',
    removing: 'Quitando la foto…',
  };

  let stage = $state<Stage>('idle');
  let root = $state<HTMLElement>();
  let picker = $state<HTMLInputElement>();

  const busy = $derived(stage !== 'idle');
  const statusText = $derived(stage === 'idle' ? '' : STAGE_TEXT[stage]);
  const uid = $props.id();
  const hintId = `avatar-${uid}-hint`;

  /**
   * A busy Button is disabled, and a disabled control drops keyboard focus;
   * hand it back to the photo button once the work is done.
   */
  function keepFocus(): void {
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    root?.querySelector<HTMLButtonElement>('.avatar-up__pick')?.focus();
  }

  async function upload(file: File): Promise<void> {
    stage = 'preparing';
    let jpeg: Blob;
    try {
      jpeg = (await optimizeSquare(file)).blob;
    } catch (error) {
      if (!(error instanceof ImageOptimizerError)) console.error('[account] avatar:', error);
      toast.error(
        error instanceof ImageOptimizerError
          ? error.message
          : 'No pudimos preparar la foto. Inténtalo con otra imagen.',
      );
      return;
    }
    stage = 'uploading';
    const uploaded = await uploadAvatar(userId, jpeg, 'jpg');
    if (!uploaded.ok) {
      toast.error(uploaded.error.message);
      return;
    }
    stage = 'saving';
    const saved = await setAvatarUrl(uploaded.data);
    if (!saved.ok) {
      toast.error(saved.error.message);
      return;
    }
    await session.refresh();
    toast.success('Foto actualizada');
  }

  async function handlePick(event: Event & { currentTarget: HTMLInputElement }): Promise<void> {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = ''; // picking the same file again still fires `change`
    if (!file || busy) return;
    const problem = avatarFileProblem(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    try {
      await upload(file);
    } finally {
      stage = 'idle';
      keepFocus();
    }
  }

  async function remove(): Promise<void> {
    if (busy) return;
    const yes = await confirm(
      '¿Quitar tu foto?',
      'En el panel se verán tus iniciales en su lugar.',
      {
        confirmLabel: 'Quitar foto',
        cancelLabel: 'Cancelar',
      },
    );
    if (!yes) return;
    stage = 'removing';
    try {
      const res = await setAvatarUrl(null);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      await session.refresh();
      toast.success('Foto quitada');
    } finally {
      stage = 'idle';
      keepFocus();
    }
  }
</script>

<div class="avatar-up" bind:this={root}>
  <!-- Decorative: the name it stands for is the field right below. -->
  <Avatar {name} src={photo} size={96} decorative />
  <div class="avatar-up__side">
    <div class="avatar-up__actions">
      <Button
        variant="ghost"
        icon="camera"
        class="avatar-up__pick"
        loading={busy && stage !== 'removing'}
        disabled={busy}
        aria-describedby={hintId}
        onclick={() => picker?.click()}
      >
        {photo ? 'Cambiar foto' : 'Subir foto'}
      </Button>
      {#if photo}
        <Button
          variant="ghost"
          icon="trash"
          loading={stage === 'removing'}
          disabled={busy}
          onclick={() => void remove()}
        >
          Quitar foto
        </Button>
      {/if}
    </div>
    <p class="avatar-up__hint" id={hintId}>
      JPG, PNG o WebP de hasta 5 MB. Usamos el centro de la imagen, en un cuadrado.
    </p>
    <!-- Always in the tree, so the stage is announced as it changes; empty, it takes no room. -->
    <p class="avatar-up__status" role="status">{statusText}</p>
    <!-- Opened by the photo button; never shown, never a tab stop. -->
    <input
      bind:this={picker}
      class="avatar-up__file"
      type="file"
      accept={AVATAR_ACCEPT}
      onchange={(event) => void handlePick(event)}
    />
  </div>
</div>

<style>
  .avatar-up {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--mg-sm) var(--mg-md);
  }

  .avatar-up__side {
    flex: 1 1 14rem;
    min-width: 0;
  }

  .avatar-up__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mg-xs);
  }

  .avatar-up__hint,
  .avatar-up__status {
    margin: var(--mg-xs) 0 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
    line-height: 1.45;
  }

  .avatar-up__status:empty {
    margin: 0;
  }

  .avatar-up__file {
    display: none;
  }
</style>
