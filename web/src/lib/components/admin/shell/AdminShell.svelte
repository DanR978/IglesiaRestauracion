<!--
  AdminShell — the frame of every signed-in admin page (S37, D-036). The
  (app) layout renders it around its pages; the guard in that layout's load
  has already decided the visit may stay. Retires the legacy #app chrome
  (admin/index.html, shell.css) — see the parts for what each one fixes.

    skip link → <main id="contenido">        topbar <header> (burger, title)
    sidebar <nav "Navegación del panel">     its drawer at ≤900px
    <main id="contenido" tabindex="-1">      the content column: max 1200px,
                                             token padding (≥16px at 360px)

  It consumes the S38 stores and owns no access logic: the nav is perms.nav
  grouped, the account footer reads the session's profile and perms.roleLabel.
  What the session says decides the screen:
    ready      the shell around the page
    expired    "Tu sesión expiró" (ExpiredSession) — never stale data
    error      what failed + Reintentar (session.retry())
    otherwise  a loading state while the visit leaves for where the guard
               would have sent it — a Retry or a background read can end in
               signed-out / a second factor / no access after the page loaded

  The drawer is a shallow history entry (pushState, page.state.drawer), so
  the Back gesture closes it; it exists only at ≤900px.

  Logout asks first ("¿Cerrar sesión?"), signs this device out
  (signOut('local')) and leaves by a full page load for the sign-in page
  with the "Sesión cerrada." notice — signOutAndLeave() (./sign-out).

  Usage (src/routes/(admin)/admin/(app)/+layout.svelte):
    <AdminShell>{@render children()}</AdminShell>
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { pushState } from '$app/navigation';
  import { page } from '$app/state';
  import { accessTarget } from '#lib/auth/guard.js';
  import { withSignInNotice } from '#lib/auth/notice.js';
  import { ROUTES } from '#lib/auth/routes.js';
  import type { Surface } from '#lib/auth/surfaces.js';
  import StateError from '#lib/components/StateError.svelte';
  import StateLoading from '#lib/components/StateLoading.svelte';
  import { closeActionSheet } from '#lib/components/action-sheet.svelte.js';
  import { confirm } from '#lib/stores/confirm.svelte.js';
  import { perms } from '#lib/stores/perms.svelte.js';
  import { session, type SessionStatus } from '#lib/stores/session.svelte.js';
  import ExpiredSession from './ExpiredSession.svelte';
  import PageHeader from './PageHeader.svelte';
  import Sidebar from './Sidebar.svelte';
  import Topbar from './Topbar.svelte';
  import { pageTitle } from './page-title.svelte';
  import { CONTENT_ID, DRAWER_QUERY, SKIP_LINK_LABEL, groupNav, leaveTo } from './shell';
  import { signOutAndLeave, signingOut } from './sign-out.svelte';

  interface Props {
    children: Snippet;
    /** The topbar's right-hand slot (S43: the notifications bell). */
    topbarEnd?: Snippet;
    /** A nav item's count, by surface — NavItem's badge slot. */
    navBadge?: Snippet<[Surface]>;
  }

  let { children, topbarEnd, navBadge }: Props = $props();

  const uid = $props.id();
  const menuId = `${uid}-menu`;
  const sidebarId = `${uid}-nav`;

  /** States the guard turns away (#lib/auth/guard accessTarget). */
  const TURNED_AWAY: ReadonlySet<SessionStatus> = new Set([
    'signed-out',
    'needs-mfa',
    'needs-enroll',
    'forbidden',
  ]);

  const status = $derived(session.status);
  /** Keeps the error screen (and its button's spinner) up while Retry runs. */
  let retrying = $state(false);

  const drawerQuery =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? new MediaQuery(DRAWER_QUERY)
      : null;
  /** ≤900px: the sidebar is a drawer behind the burger. */
  const drawer = $derived(drawerQuery?.current ?? false);
  // Above 900px there is no drawer, whatever the history entry says.
  const drawerOpen = $derived(drawer && page.state.drawer === true);
  /** A tap's history entry is on its way: a second tap must not push another. */
  let opening = false;

  const sections = $derived(groupNav(perms.nav));
  const account = $derived({
    name: session.profile?.display_name?.trim() || session.user?.email || 'Tu cuenta',
    role: perms.roleLabel,
    avatarUrl: session.profile?.avatar_url ?? null,
  });
  /** The open page's address (page.url is a read-only view). */
  const here = $derived(new URL(page.url.href));
  const expiredHref = $derived(
    withSignInNotice(accessTarget(here, 'expired') ?? ROUTES.login, 'expired'),
  );

  // A deliberate sign-out leaves by itself (./sign-out).
  $effect(() => {
    if (signingOut.current || !TURNED_AWAY.has(status)) return;
    const target = accessTarget(here, status);
    if (target) leaveTo(target);
  });

  // The panel is gone: so is any menu it had open.
  $effect(() => {
    if (status === 'expired') closeActionSheet();
  });

  function openDrawer(): void {
    if (opening || drawerOpen) return;
    opening = true;
    void pushState('', { drawer: true }).finally(() => {
      opening = false;
    });
  }

  function closeDrawer(): void {
    if (page.state.drawer) history.back();
  }

  async function logout(): Promise<void> {
    const sure = await confirm(
      '¿Cerrar sesión?',
      'Para volver al panel tendrás que iniciar sesión de nuevo.',
      { confirmLabel: 'Cerrar sesión', cancelLabel: 'Cancelar', danger: false },
    );
    if (sure) await signOutAndLeave('local');
  }

  async function retry(): Promise<void> {
    retrying = true;
    try {
      await session.retry();
    } finally {
      retrying = false;
    }
  }
</script>

{#if status === 'expired'}
  <ExpiredSession href={expiredHref} />
{:else if status === 'error' || retrying}
  <main class="adm-shell-state" id={CONTENT_ID} tabindex="-1">
    <PageHeader title="No pudimos abrir el panel" />
    <StateError message={session.error?.message} onRetry={retry} />
  </main>
{:else if status === 'ready'}
  <a class="skip-link" href="#{CONTENT_ID}">{SKIP_LINK_LABEL}</a>
  <div class="adm-shell">
    <Topbar
      title={pageTitle.current}
      {menuId}
      controls={sidebarId}
      expanded={drawerOpen}
      onMenu={openDrawer}
      end={topbarEnd}
    />
    <Sidebar
      id={sidebarId}
      {sections}
      pathname={page.url.pathname}
      home={ROUTES.home}
      legacy={perms.legacy.length > 0}
      {account}
      {drawer}
      open={drawerOpen}
      onClose={closeDrawer}
      trigger={() => document.getElementById(menuId)}
      onLogout={logout}
      loggingOut={signingOut.current}
      badge={navBadge}
    />
    <main class="adm-main" id={CONTENT_ID} tabindex="-1">
      <div class="adm-main__column">{@render children()}</div>
    </main>
  </div>
{:else}
  <main class="adm-shell-state" id={CONTENT_ID} tabindex="-1">
    <StateLoading shape="detail" />
  </main>
{/if}

<style>
  /* The topbar's height, on <html> so the sticky sidebar, the drawer head and
     scroll-padding-top read one value: anything scrolled or tabbed into view
     stops below the sticky bar, never under it (WCAG 2.4.11). */
  :global(html:has(.adm-shell)) {
    --adm-topbar-h: 3.75rem;
    scroll-padding-top: var(--adm-topbar-h);
  }

  .adm-shell {
    display: grid;
    grid-template-columns: 14.875rem minmax(0, 1fr);
    grid-template-rows: auto 1fr;
    grid-template-areas:
      'top top'
      'side main';
    min-block-size: 100vh;
    min-block-size: 100dvh;
    background: var(--color-bg-light);
  }

  .adm-main {
    grid-area: main;
    min-inline-size: 0;
  }

  .adm-main__column {
    max-inline-size: 1200px;
    margin-inline: auto;
    padding: var(--pd-md) var(--pd-md) var(--pd-lg);
  }

  .adm-shell-state {
    max-inline-size: 40rem;
    margin-inline: auto;
    padding: var(--pd-lg) var(--pd-md);
  }

  @media (max-width: 900px) {
    .adm-shell {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        'top'
        'main';
    }
  }

  @media (max-width: 640px) {
    :global(html:has(.adm-shell)) {
      --adm-topbar-h: 3.5rem;
    }
  }
</style>
