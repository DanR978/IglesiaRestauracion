<!--
  Test stand-in for AdminShell: marks where the shell would be and renders
  the page inside it. Lets a test see what the (app) layout renders without
  the shell's stores.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<div data-testid="admin-shell">{@render children()}</div>
