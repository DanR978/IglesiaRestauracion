<script lang="ts">
  // The admin surface root (D-021): admin tokens apply under
  // [data-surface="admin"], so the overlay hosts live inside it — a host
  // portaled to <body> would paint the public gold. Links preload on tap, not
  // hover: an admin route's load runs the session guard.
  //
  // Frame guard (D-037): `frame-ancestors` cannot come from a <meta> and Pages
  // sends no headers, so a framed admin page mounts nothing but a refusal —
  // nothing to click through to. Theme: the root layout applies the admin's
  // own preference on admin paths (D-038); nothing to do here.
  import ActionSheetHost from '#lib/components/ActionSheetHost.svelte';
  import ConfirmHost from '#lib/components/ConfirmHost.svelte';
  import ToastHost from '#lib/components/ToastHost.svelte';
  import { isFramed } from '#lib/components/admin/shell/shell.js';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();

  const framed = isFramed();
</script>

<div data-surface="admin" data-sveltekit-preload-data="tap">
  {#if framed}
    <main class="adm-framed">
      <h1 class="adm-framed__title">El panel no se puede abrir aquí</h1>
      <p class="adm-framed__text">
        Por seguridad, el panel de la iglesia solo funciona en su propia ventana.
      </p>
      <!-- This page's own address, opened outside the frame. -->
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
      <a class="adm-framed__link" href={location.href} target="_blank" rel="noopener noreferrer">
        Abrir el panel en una pestaña nueva
      </a>
    </main>
  {:else}
    {@render children()}
    <ToastHost />
    <ConfirmHost />
    <ActionSheetHost />
  {/if}
</div>

<style>
  .adm-framed {
    max-inline-size: 32rem;
    margin-inline: auto;
    padding: var(--pd-lg) var(--pd-md);
    color: var(--color-text);
  }

  .adm-framed__title {
    font-size: var(--fs-xl);
    font-weight: var(--fw-bold);
    line-height: 1.2;
  }

  .adm-framed__text {
    margin: 0.75rem 0 1rem;
    color: var(--color-muted);
    font-size: var(--fs-base);
    line-height: 1.5;
  }

  .adm-framed__link {
    color: var(--color-text);
    font-weight: var(--fw-semibold);
  }
</style>
