<!--
  PageHeader — an admin page's own title (S37, D-036 "the page owns its title").
  Fixes PORT-DEBT S37's missing titles: legacy Inicio and Mi cuenta had none,
  because the topbar only ever said the church's name.

  One per page, first thing in it. It renders the page's h1 (and an optional
  one-line description), puts the title in the browser tab as
  "<title> · Panel · Iglesia Restauración Divina", and hands it to the topbar,
  which shows it at ≤900px (the page-title store). It moves no focus:
  SvelteKit's own focus reset after a navigation is what screen readers get.

  `actions` sit on the right of the title on a desktop and stack under it at
  ≤640px. The page renders inside the shell's content column (max 1200px,
  token padding) — no outer container of its own.

  Usage:
    <PageHeader title="Inicio" />
    <PageHeader title="Mi cuenta" description="Tu perfil, la seguridad de tu cuenta y tus preferencias." />
    <PageHeader title="Tesorería">
      {#snippet actions()}<Button icon="plus">Agregar ingreso</Button>{/snippet}
    </PageHeader>
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { setPageTitle } from './page-title.svelte';
  import { documentTitle } from './shell';

  interface Props {
    /** The h1, and the source of the tab title and the mobile topbar title. */
    title: string;
    /** One muted line under the h1. */
    description?: string;
    /** The page's primary actions. */
    actions?: Snippet;
  }

  let { title, description, actions }: Props = $props();

  $effect(() => setPageTitle(title));
</script>

<svelte:head>
  <title>{documentTitle(title)}</title>
</svelte:head>

<!-- A <div>, not <header>: the topbar is the page's one banner. -->
<div class="adm-page-header">
  <div class="adm-page-header__text">
    <h1 class="adm-page-header__title">{title}</h1>
    {#if description}
      <p class="adm-page-header__description">{description}</p>
    {/if}
  </div>
  {#if actions}
    <div class="adm-page-header__actions">{@render actions()}</div>
  {/if}
</div>

<style>
  .adm-page-header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--mg-sm) var(--mg-md);
    margin-block-end: var(--mg-md);
  }

  .adm-page-header__text {
    flex: 1 1 18rem;
    min-inline-size: 0;
  }

  /* A long title wraps; it never widens the page at 360px. */
  .adm-page-header__title {
    color: var(--color-text);
    font-size: var(--fs-xl);
    font-weight: var(--fw-bold);
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  .adm-page-header__description {
    max-inline-size: 65ch;
    margin: 0.4rem 0 0;
    color: var(--color-muted);
    font-size: var(--fs-base);
    line-height: 1.5;
  }

  .adm-page-header__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  @media (max-width: 640px) {
    .adm-page-header {
      flex-direction: column;
      align-items: stretch;
    }

    .adm-page-header__text {
      flex-basis: auto;
    }

    .adm-page-header__actions {
      justify-content: flex-start;
    }
  }
</style>
