<!--
  ActionSheetHost — mounts the singleton sheet that showActionSheet() drives.

  Put ONE of these inside each surface's layout, as a descendant of the element
  carrying data-surface="admin" (tokens/admin.css): the sheet is position:fixed
  but NOT portaled to <body>, because custom properties inherit through the DOM
  and a body-level host would fall back to the public gold palette.

    <div data-surface="admin"> … {@render children()} <ActionSheetHost /> </div>

  The instance is keyed on the request, so opening a second sheet from inside an
  action replaces the first cleanly. `onclose` is key-scoped for the same reason:
  the outgoing sheet's close timer must not clear its successor.
-->
<script lang="ts">
  import ActionSheet from './ActionSheet.svelte';
  import { actionSheet, closeActionSheet } from './action-sheet.svelte';

  const request = $derived(actionSheet.current);

  // A WRITABLE derived: it follows the singleton, and the sheet writes `false`
  // through the binding when it closes itself. The next store change wins again,
  // so the two can never disagree for longer than one close animation.
  let open = $derived(actionSheet.current !== null);
</script>

{#if request}
  {#key request.key}
    <ActionSheet
      bind:open
      trigger={request.trigger}
      title={request.title}
      subtitle={request.subtitle}
      actions={request.actions}
      groups={request.groups}
      cancelLabel={request.cancelLabel}
      onclose={() => closeActionSheet(request.key)}
    />
  {/key}
{/if}
