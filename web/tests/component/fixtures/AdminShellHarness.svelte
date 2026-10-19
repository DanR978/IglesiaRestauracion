<!--
  Test fixture (S37): AdminShell as the (app) layout renders it, with a page
  inside (PageHeader + a field to focus) and the confirm host the admin
  layout mounts, so logout's "¿Cerrar sesión?" can be answered. `badge`
  turns on the nav's count slot for one surface.
-->
<script lang="ts">
  import AdminShell from '#lib/components/admin/shell/AdminShell.svelte';
  import PageHeader from '#lib/components/admin/shell/PageHeader.svelte';
  import ConfirmHost from '#lib/components/ConfirmHost.svelte';

  interface Props {
    /** Show a count on this surface's nav item. */
    badge?: string;
  }

  let { badge }: Props = $props();
</script>

{#snippet navBadge(surface: { key: string })}
  {#if surface.key === badge}
    <span data-testid="nav-badge">3 <span class="sr-only">pendientes</span></span>
  {/if}
{/snippet}

<AdminShell navBadge={badge ? navBadge : undefined}>
  <PageHeader title="Inicio" />
  <label for="fx-search">Buscar</label>
  <input id="fx-search" data-testid="page-input" />
</AdminShell>
<ConfirmHost />
