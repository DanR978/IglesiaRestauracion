<script lang="ts">
  // Every page of the signed-in admin renders inside the shell (S37): topbar,
  // grouped navigation (its drawer at ≤900px), the account footer, and the
  // content column the page fills — max 1200px, token padding.
  //
  // The S38 guard runs here, in the browser, before the group's first page
  // renders: the legacy email-link contract first, then the access state
  // (signed out → acceso/, a second factor pending → verificar/, no access →
  // sin-acceso/). Nothing renders until it answers; when it names another
  // page, the visit goes there in place of this history entry, as a redirect
  // from a load would. It decides again on each visit inside the group (a
  // new path or query; a hash or the drawer's shallow entry is not a visit).
  // A component, not a universal load: that load was the app's only one, and
  // Kit leaves universal-load support out of every page's runtime while no
  // route has one (S37 session file, "Public-page cost").
  import { page } from '$app/state';
  import { leaveTo } from '#lib/components/admin/auth/destination.js';
  import AdminShell from '#lib/components/admin/shell/AdminShell.svelte';
  import { guardAdmin } from '#lib/stores/session.svelte.js';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();

  /** What the guard decides on: the path and the query. */
  const visit = $derived(page.url.pathname + page.url.search);
  /** The guard has let a visit in; from then on the shell stays. */
  let entered = $state(false);

  $effect(() => {
    let current = true;
    void guardAdmin(new URL(visit, location.origin)).then((target) => {
      if (!current) return; // a newer visit decides
      if (target) void leaveTo(target);
      else entered = true;
    });
    return () => {
      current = false;
    };
  });
</script>

{#if entered}
  <AdminShell>
    {@render children()}
  </AdminShell>
{/if}
