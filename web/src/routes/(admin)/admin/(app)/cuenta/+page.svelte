<!--
  /admin/cuenta/ — Mi cuenta (S45; PORT-DEBT S45, D-033, D-036, D-038, D-040).
  Retires js/pages/admin/account.js (the #tab-account page) and the dead
  prefs plumbing of js/pages/admin/prefs.js.

  Three sections — Perfil, Seguridad, Preferencias — chosen by `?seccion=`
  (the URL is the state, D-036: a section can be linked, reloaded, and Back
  returns to the one before; anything unknown is Perfil). SectionNav links
  switch it without a reload, keeping focus and scroll where they are
  (data-sveltekit-reset="false"). A section stays mounted once opened, only
  hidden while another is open, so an unsaved name survives a look at
  Seguridad and its guard keeps watching.

  Rendered in the S37 shell's content column, which shows a page only for a
  ready session (the (app) guard and the shell own every other state); the
  skeleton below is the type-level fallback for a session without its user
  or profile, which `ready` rules out.

  Prerendered as an empty `ssr = false` shell (D-036): nothing here runs
  while prerendering, so reading the query is safe.
-->
<script lang="ts">
  import { page } from '$app/state';
  import SectionNav from '#lib/components/SectionNav.svelte';
  import StateError from '#lib/components/StateError.svelte';
  import StateLoading from '#lib/components/StateLoading.svelte';
  import PreferencesSection from '#lib/components/admin/account/PreferencesSection.svelte';
  import ProfileSection from '#lib/components/admin/account/ProfileSection.svelte';
  import SecuritySection from '#lib/components/admin/account/SecuritySection.svelte';
  import {
    SECTION_NAV_ITEMS,
    SECTION_PARAM,
    sectionFrom,
    type AccountSectionId,
  } from '#lib/components/admin/account/account.js';
  import PageHeader from '#lib/components/admin/shell/PageHeader.svelte';
  import { session } from '#lib/stores/session.svelte.js';

  const current = $derived(sectionFrom(page.url.searchParams.get(SECTION_PARAM)));

  /**
   * Sections opened at least once: they stay mounted. A plain record, not a
   * SvelteSet — that class would ride into the shared svelte/reactivity chunk
   * every page loads for the theme's MediaQuery (box 17).
   */
  const opened = $state<Record<AccountSectionId, boolean>>({
    perfil: false,
    seguridad: false,
    preferencias: false,
  });
  $effect(() => {
    opened[current] = true;
  });
  const shown = (id: AccountSectionId): boolean => id === current || opened[id];

  const user = $derived(session.status === 'ready' ? session.user : null);
  const profile = $derived(session.status === 'ready' ? session.profile : null);

  function report(error: unknown): void {
    console.error('[account] a section failed to render:', error);
  }
</script>

<PageHeader
  title="Mi cuenta"
  description="Tu perfil, la seguridad de tu cuenta y tus preferencias."
/>

<!-- The error is logged by `report`; the screen gets human copy and Retry, never its text. -->
<!-- eslint-disable-next-line @typescript-eslint/no-unused-vars -->
{#snippet failed(_error: unknown, reset: () => void)}
  <StateError message="No pudimos mostrar esta sección. Inténtalo de nuevo." onRetry={reset} />
{/snippet}

<div class="account">
  <div class="account__nav" data-sveltekit-reset="false">
    <SectionNav label="Secciones de Mi cuenta" items={SECTION_NAV_ITEMS} {current} />
  </div>

  <div class="account__body">
    {#if user && profile}
      {#if shown('perfil')}
        <div class="account__section" hidden={current !== 'perfil'}>
          <svelte:boundary onerror={report} {failed}>
            <ProfileSection {user} {profile} />
          </svelte:boundary>
        </div>
      {/if}
      {#if shown('seguridad')}
        <div class="account__section" hidden={current !== 'seguridad'}>
          <svelte:boundary onerror={report} {failed}>
            <SecuritySection {user} />
          </svelte:boundary>
        </div>
      {/if}
      {#if shown('preferencias')}
        <div class="account__section" hidden={current !== 'preferencias'}>
          <svelte:boundary onerror={report} {failed}>
            <PreferencesSection />
          </svelte:boundary>
        </div>
      {/if}
    {:else}
      <StateLoading shape="detail" rows={5} label="Cargando tu cuenta…" />
    {/if}
  </div>
</div>

<style>
  /* The section list beside the open section on a desktop; at ≤900px
     SectionNav turns itself into a pill bar above it (the bar scrolls, the
     page never does). */
  .account {
    display: grid;
    grid-template-columns: 13rem minmax(0, 1fr);
    gap: var(--mg-md);
    align-items: start;
  }

  .account__nav,
  .account__body {
    min-width: 0;
  }

  .account__body {
    max-width: 48rem;
  }

  @media (max-width: 900px) {
    .account {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--mg-sm);
    }
  }
</style>
