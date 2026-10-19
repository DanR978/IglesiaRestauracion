<script lang="ts">
  // The admin surface root (D-021): admin tokens apply under [data-surface="admin"].
  // S37 builds the shell's hosts and frame guard here.
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
</script>

<div data-surface="admin">
  {@render children()}
</div>
