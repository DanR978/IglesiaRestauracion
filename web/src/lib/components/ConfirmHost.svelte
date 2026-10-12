<!--
  ConfirmHost — the ONE renderer for `await confirm(…)` (S16, DESIGN-SYSTEM §4.2).
  Mount it exactly once per app shell, INSIDE the surface wrapper (a DOM
  descendant of the (admin) layout's [data-surface="admin"] element — a host
  portaled to <body> would fall back to the public gold palette), next to
  <ToastHost>.

  It is pure presentation: the queue, the promises and their resolution live in
  $lib/stores/confirm.svelte, so a repo module can ask the question without a
  component in the loop (S38).

  It is a Modal with variant="confirm", which is what makes the dialog stack
  above an already-open Modal (z-index: calc(var(--z-modal) + 10)) and gives it
  the reference-counted scroll lock and its own focus trap for free — closing
  it returns focus and the lock to the modal underneath.

  Focus lands on the SAFER button: the cancel action is what a stray Enter or
  Space should hit, never the red one.
-->
<script lang="ts">
  import Button from './Button.svelte';
  import Modal from './Modal.svelte';
  import { confirmState } from '$lib/stores/confirm.svelte';

  const request = $derived(confirmState.current);
</script>

{#if request}
  {@const req = request}
  <!-- Keyed on the request: answering one while another is queued must build a
       fresh dialog, not reuse the closed one. -->
  {#key req.id}
    <Modal
      open
      variant="confirm"
      title={req.title}
      initialFocus=".ird-confirm__cancel"
      onclose={() => confirmState.answer(false)}
    >
      {#if req.message}
        <p class="ird-confirm__msg">{req.message}</p>
      {/if}
      {#snippet footer()}
        <Button
          variant="ghost"
          class="ird-confirm__cancel"
          onclick={() => confirmState.answer(false)}
        >
          {req.cancelLabel}
        </Button>
        <Button
          variant={req.danger ? 'danger' : 'primary'}
          onclick={() => confirmState.answer(true)}
        >
          {req.confirmLabel}
        </Button>
      {/snippet}
    </Modal>
  {/key}
{/if}

<style>
  /* Legacy .confirm-msg: dimmed body copy under the question. */
  .ird-confirm__msg {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
    line-height: 1.5;
  }
</style>
