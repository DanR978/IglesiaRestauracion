<!--
  ExpiredSession — "Tu sesión expiró" (S37 · S38, target-architecture §5).
  Shown in place of the whole panel when the session store says `expired`:
  the session ended without this tab asking — a sign-out in another tab, a
  refresh the server refused. Legacy had no such screen; its next request
  just failed. The page's data goes with the panel (the session that read it
  is gone), and the one way forward signs in again and comes back here.

  The heading takes focus as the screen appears: whatever had focus was just
  removed, and a screen reader must hear what happened. The link is a full
  page load (data-sveltekit-reload), so nothing of the old session stays in
  memory.
-->
<script lang="ts">
  import Button from '#lib/components/Button.svelte';
  import Icon from '#lib/components/Icon.svelte';
  import { CONTENT_ID, documentTitle } from './shell';

  interface Props {
    /** The sign-in page, with `next` = this page and the expired notice. */
    href: string;
  }

  let { href }: Props = $props();

  const TITLE = 'Tu sesión expiró';

  let heading = $state<HTMLElement>();

  $effect(() => {
    heading?.focus();
  });
</script>

<svelte:head>
  <title>{documentTitle(TITLE)}</title>
</svelte:head>

<main class="adm-expired" id={CONTENT_ID} tabindex="-1">
  <div class="adm-expired__card">
    <span class="adm-expired__icon"><Icon name="user-clock" /></span>
    <h1 class="adm-expired__title" tabindex="-1" bind:this={heading}>{TITLE}</h1>
    <p class="adm-expired__text">
      Por seguridad, tu sesión se cerró. Inicia sesión de nuevo para volver a esta página.
    </p>
    <Button {href} icon="right-to-bracket" data-sveltekit-reload="">Iniciar sesión de nuevo</Button>
  </div>
</main>

<style>
  .adm-expired {
    display: grid;
    place-items: center;
    min-block-size: 100vh;
    min-block-size: 100dvh;
    padding: var(--pd-md);
  }

  .adm-expired__card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.9rem;
    inline-size: 100%;
    max-inline-size: 28rem;
    padding: var(--pd-lg) var(--pd-md);
    border: 1px solid rgba(127, 127, 127, 0.18);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    text-align: center;
  }

  .adm-expired__icon {
    display: inline-flex;
    color: var(--color-muted);
    font-size: var(--fs-2xl);
  }

  .adm-expired__title {
    font-size: var(--fs-xl);
    font-weight: var(--fw-bold);
    line-height: 1.2;
  }

  .adm-expired__title:focus {
    outline: none;
  }

  .adm-expired__text {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-base);
    line-height: 1.5;
  }
</style>
