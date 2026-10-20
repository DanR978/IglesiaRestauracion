<script lang="ts">
  // The admin's error page (S37, target-architecture §9): an error thrown
  // while loading or rendering an admin page. Calm Spanish, no technical text
  // (page.error.message is never shown), and two ways on: Inicio, or the
  // legacy panel, which still serves most of the work (D-036).
  import { page } from '$app/state';
  import { ROUTES } from '#lib/auth/routes.js';
  import Button from '#lib/components/Button.svelte';
  import Icon from '#lib/components/Icon.svelte';
  import {
    CONTENT_ID,
    LEGACY_PANEL_HREF,
    LEGACY_PANEL_LABEL,
    documentTitle,
  } from '#lib/components/admin/shell/shell.js';

  const notFound = $derived(page.status === 404);
  const title = $derived(notFound ? 'No encontramos esta página' : 'Algo salió mal');
  const text = $derived(
    notFound
      ? 'La dirección no corresponde a ninguna sección del panel. Puede que el enlace esté incompleto o que la sección se haya movido.'
      : 'No pudimos mostrar esta sección. Vuelve a Inicio e inténtalo de nuevo; si sigue pasando, usa el panel actual.',
  );
</script>

<svelte:head>
  <title>{documentTitle(title)}</title>
</svelte:head>

<main class="adm-error" id={CONTENT_ID} tabindex="-1">
  <div class="adm-error__card">
    <span class="adm-error__icon">
      <Icon name={notFound ? 'compass' : 'triangle-exclamation'} />
    </span>
    <h1 class="adm-error__title">{title}</h1>
    <p class="adm-error__text">{text}</p>
    <div class="adm-error__actions">
      <Button href={ROUTES.home} icon="house">Ir a Inicio</Button>
      <Button
        href={LEGACY_PANEL_HREF}
        rel="external"
        variant="ghost"
        icon="arrow-up-right-from-square"
      >
        {LEGACY_PANEL_LABEL}
      </Button>
    </div>
  </div>
</main>

<style>
  .adm-error {
    display: grid;
    place-items: center;
    min-block-size: 100vh;
    min-block-size: 100dvh;
    padding: var(--pd-md);
  }

  .adm-error__card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.9rem;
    inline-size: 100%;
    max-inline-size: 30rem;
    padding: var(--pd-lg) var(--pd-md);
    border: 1px solid rgba(127, 127, 127, 0.18);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    text-align: center;
  }

  .adm-error__icon {
    display: inline-flex;
    color: var(--color-muted);
    font-size: var(--fs-2xl);
  }

  .adm-error__title {
    font-size: var(--fs-xl);
    font-weight: var(--fw-bold);
    line-height: 1.2;
  }

  .adm-error__text {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-base);
    line-height: 1.5;
  }

  .adm-error__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.6rem;
  }
</style>
