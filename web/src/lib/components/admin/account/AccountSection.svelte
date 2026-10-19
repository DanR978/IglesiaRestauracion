<!--
  AccountSection — one of Mi cuenta's three sections (S45): an h2 under the
  page's h1, a one-line lede, then its panels. A labelled <section>, so each
  is a named region; only the open one is on screen (the page hides the rest).
  Retires the legacy `.acct-card__head` (account.js), whose sections all used
  one h3 and an icon in place of a page title.

  Usage:
    <AccountSection title="Seguridad" lede="Tu contraseña, tus dispositivos y tus sesiones.">
      <AccountPanel title="Contraseña">…</AccountPanel>
    </AccountSection>
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    lede?: string;
    children: Snippet;
  }

  let { title, lede, children }: Props = $props();

  const uid = $props.id();
  const titleId = `acct-section-${uid}`;
</script>

<section class="acct-section" aria-labelledby={titleId}>
  <header class="acct-section__head">
    <h2 class="acct-section__title" id={titleId}>{title}</h2>
    {#if lede}
      <p class="acct-section__lede">{lede}</p>
    {/if}
  </header>
  <div class="acct-section__body">
    {@render children()}
  </div>
</section>

<style>
  .acct-section {
    min-width: 0;
  }

  .acct-section__head {
    margin-block-end: var(--mg-sm);
  }

  .acct-section__title {
    margin: 0;
    color: var(--color-text);
    font-size: var(--fs-lg);
    font-weight: var(--fw-semibold);
    line-height: 1.25;
  }

  .acct-section__lede {
    margin: var(--mg-xxs) 0 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
    line-height: 1.5;
  }

  .acct-section__body {
    display: flex;
    flex-direction: column;
    gap: var(--mg-sm);
  }
</style>
