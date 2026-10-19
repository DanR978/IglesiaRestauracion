<!--
  PageHeader — a page's title row (S37 owns the real one; THIS IS S41's STUB).
  S41 (Inicio) was built beside S37 and needed the header before S37's shell
  existed, so this file carries exactly S37's announced API — `title`,
  `description?`, `actions?` — as an h1, an optional line under it and an
  actions slot. The real component also feeds the mobile topbar title; the
  stub only sets document.title (D-036: the page owns its title). On merge,
  keep S37's file and drop this one.

  Usage:
    <PageHeader title="Inicio" description="Hola, Ana">
      {#snippet actions()}<Button href="/admin/" variant="ghost">…</Button>{/snippet}
    </PageHeader>
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** The page's name: the h1 and the document title. */
    title: string;
    /** One short line under the title. */
    description?: string;
    /** The page's own actions, beside the title (below it on a phone). */
    actions?: Snippet;
  }

  let { title, description, actions }: Props = $props();

  $effect(() => {
    document.title = title;
  });
</script>

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
    gap: var(--mg-sm) var(--mg-md);
  }

  .page-header__text {
    min-inline-size: 0;
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
  }

  .page-header__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mg-xs);
  }
</style>
