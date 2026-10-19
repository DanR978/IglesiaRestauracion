<!--
  PageHeader — STAND-IN written by S45 so Mi cuenta builds before the admin
  shell (S37) is merged; the integrator keeps S37's PageHeader.svelte, which
  has this same API and also sets the mobile topbar title. This one renders
  the page's h1, an optional description and an optional actions row, and
  sets document.title — no store.

  Usage:
    <PageHeader title="Mi cuenta" description="Tu perfil, tu seguridad y tus preferencias." />
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    description?: string;
    actions?: Snippet;
  }

  let { title, description, actions }: Props = $props();
</script>

<svelte:head>
  <title>{title}</title>
</svelte:head>

<header class="page-header">
  <div class="page-header__text">
    <h1 class="page-header__title">{title}</h1>
    {#if description}
      <p class="page-header__description">{description}</p>
    {/if}
  </div>
  {#if actions}
    <div class="page-header__actions">{@render actions()}</div>
  {/if}
</header>

<style>
  .page-header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--mg-sm);
    margin-block-end: var(--mg-md);
  }

  .page-header__text {
    min-width: 0;
  }

  .page-header__title {
    margin: 0;
    color: var(--color-text);
    font-size: var(--fs-xl);
    font-weight: var(--fw-bold);
    line-height: 1.2;
  }

  .page-header__description {
    margin: var(--mg-xxs) 0 0;
    color: var(--color-muted);
    font-size: var(--fs-base);
    line-height: 1.5;
  }

  .page-header__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mg-xs);
  }
</style>
