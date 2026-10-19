<script lang="ts">
  // Every page of the signed-in admin renders inside the shell (S37): topbar,
  // grouped navigation (its drawer at ≤900px), the account footer, and the
  // content column the page fills — max 1200px, token padding.
  import AdminShell from '#lib/components/admin/shell/AdminShell.svelte';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
</script>

<AdminShell>
  {@render children()}
</AdminShell>
