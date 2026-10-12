<!--
  Test fixture (S16): the only way to prove `bind:open` is two-way is to have a
  parent binding it. It mirrors the binding into a data attribute so a test can
  read the PARENT's value after the child closes itself, and offers a trigger
  button outside the dialog so focus-return has somewhere real to go back to.
-->
<script lang="ts">
  import Modal from '$lib/components/Modal.svelte';
  import type { ModalVariant } from '$lib/components/modal';

  interface Props {
    open?: boolean;
    variant?: ModalVariant;
    title?: string;
    error?: string | null;
    closeOnBackdrop?: boolean;
    closeOnEscape?: boolean;
    showClose?: boolean;
    initialFocus?: string;
    onclose?: () => void;
  }

  let {
    open = $bindable(false),
    variant = 'standard',
    title = 'Editar evento',
    error = null,
    closeOnBackdrop = true,
    closeOnEscape = true,
    showClose = true,
    initialFocus,
    onclose,
  }: Props = $props();
</script>

<p data-testid="open-state" data-open={String(open)}>{String(open)}</p>
<button type="button" data-testid="trigger" onclick={() => (open = true)}>Abrir</button>

<Modal
  bind:open
  {variant}
  {title}
  {error}
  {closeOnBackdrop}
  {closeOnEscape}
  {showClose}
  {initialFocus}
  {onclose}
>
  <label for="fx-name">Nombre</label>
  <input id="fx-name" data-testid="body-input" />
  {#snippet footer()}
    <span class="ird-modal__spacer"></span>
    <button type="button" data-testid="footer-save">Guardar</button>
  {/snippet}
</Modal>
