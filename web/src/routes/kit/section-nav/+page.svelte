<script lang="ts">
  // /kit/section-nav/ — the PR-C2 staging smoke page for SectionNav: link mode
  // driven by the URL (?seccion=, D-036), button mode with roving focus, the
  // vertical list on a desktop and the self-scrolling pill bar at ≤900px (the
  // bar scrolls, never the page), the current item kept in view, and both
  // palettes. Prerendered, no data fetching, noindex.
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import SectionNav from '#lib/components/SectionNav.svelte';
  import type { SectionNavItem } from '#lib/components/section-nav.js';

  /** Set once the page is interactive; the e2e specs wait for it before typing. */
  let hydrated = $state(false);
  onMount(() => (hydrated = true));

  const ACCOUNT: SectionNavItem[] = [
    { id: 'perfil', label: 'Perfil', icon: 'user', href: '?seccion=perfil' },
    { id: 'seguridad', label: 'Seguridad', icon: 'shield-halved', href: '?seccion=seguridad' },
    { id: 'preferencias', label: 'Preferencias', icon: 'sliders', href: '?seccion=preferencias' },
  ];
  const ACCOUNT_IDS = new Set(ACCOUNT.map((item) => item.id));

  const PANELS: Record<string, string> = {
    perfil: 'Nombre visible, foto y los datos que gestiona un administrador.',
    seguridad: 'Contraseña, verificación en dos pasos y sesiones abiertas.',
    preferencias: 'Tema claro, oscuro o el del sistema.',
  };

  const USERS: SectionNavItem[] = [
    { id: 'usuarios', label: 'Usuarios', icon: 'users' },
    { id: 'invitaciones', label: 'Invitaciones', icon: 'paper-plane' },
    { id: 'roles', label: 'Roles y accesos', icon: 'user-shield' },
    { id: 'ministerios', label: 'Ministerios', icon: 'people-group' },
    { id: 'actividad', label: 'Registro de actividad', icon: 'clock-rotate-left' },
    { id: 'ajustes', label: 'Configuración', icon: 'gear' },
  ];

  const ADMIN: SectionNavItem[] = [
    { id: 'resumen', label: 'Resumen', icon: 'chart-simple' },
    { id: 'ingresos', label: 'Ingresos', icon: 'arrow-down' },
    { id: 'gastos', label: 'Gastos', icon: 'arrow-up' },
  ];

  // The URL is the state. Read after hydration, so the prerendered markup
  // (Perfil) hydrates as it is and then follows ?seccion=.
  let seccion = $state('perfil');
  $effect(() => {
    const wanted = page.url.searchParams.get('seccion') ?? 'perfil';
    seccion = ACCOUNT_IDS.has(wanted) ? wanted : 'perfil';
  });

  let usersTab = $state('usuarios');
  let selections = $state(0);
  let adminTab = $state('resumen');

  const usersLabel = $derived(USERS.find((item) => item.id === usersTab)?.label ?? '');
</script>

<svelte:head>
  <title>Kit · SectionNav</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="kit" data-hydrated={hydrated || undefined}>
  <header class="kit__head">
    <h1 class="kit__title">SectionNav</h1>
    <p class="kit__lede">
      Página de prueba de PR-C2. Navegación entre secciones de una pantalla: lista vertical en el
      escritorio y, a 900px o menos, una barra de pastillas que se desplaza sola — la barra, nunca
      la página. La sección actual se anuncia (<code>aria-current</code>) y queda a la vista.
    </p>
  </header>

  <section class="kit__section" aria-labelledby="h-links">
    <h2 id="h-links">Enlaces con la sección en la URL</h2>
    <p class="kit__note">
      Cada sección es un enlace a <code>?seccion=…</code>: se puede compartir, recargar y volver
      atrás. Orden de tabulación natural.
    </p>
    <div class="layout">
      <SectionNav label="Secciones de Mi cuenta" items={ACCOUNT} current={seccion} />
      <div class="panel" data-testid="account-panel">
        <h3 class="panel__title">{ACCOUNT.find((item) => item.id === seccion)?.label}</h3>
        <p class="panel__text">{PANELS[seccion]}</p>
      </div>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-buttons">
    <h2 id="h-buttons">Botones con foco itinerante</h2>
    <p class="kit__note">
      Una sola parada de tabulación; las flechas, Inicio y Fin se mueven entre secciones, y Intro o
      Espacio la eligen.
    </p>
    <div class="layout">
      <SectionNav
        label="Pestañas de Usuarios"
        items={USERS}
        bind:current={usersTab}
        onSelect={() => (selections += 1)}
      />
      <div class="panel">
        <h3 class="panel__title" data-testid="users-panel">{usersLabel}</h3>
        <p class="panel__text">
          Elegidas: <span data-testid="users-selections">{selections}</span>
        </p>
      </div>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-admin" data-surface="admin">
    <h2 id="h-admin">Dentro del panel (<code>data-surface="admin"</code>)</h2>
    <div class="layout">
      <SectionNav label="Secciones de Tesorería" items={ADMIN} bind:current={adminTab} />
      <div class="panel">
        <h3 class="panel__title">{ADMIN.find((item) => item.id === adminTab)?.label}</h3>
        <p class="panel__text">La misma navegación, en la paleta pizarra (D-014).</p>
      </div>
    </div>
  </section>
</main>

<style>
  .kit {
    max-width: 64rem;
    margin: 0 auto;
    padding: var(--pd-md);
    font-family: var(--font-base);
    font-size: var(--fs-base);
    line-height: 1.5;
  }
  .kit__title {
    font-size: var(--fs-2xl);
    font-weight: var(--fw-bold);
  }
  .kit__lede,
  .kit__note {
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
  .kit__section {
    margin-top: var(--mg-lg);
  }
  .kit__section > h2 {
    margin-bottom: var(--mg-sm);
    font-size: var(--fs-lg);
    font-weight: var(--fw-semibold);
  }
  code {
    font-size: 0.85em;
  }

  /* minmax(0, …) lets the pill bar shrink below its content and scroll. */
  .layout {
    display: grid;
    grid-template-columns: 15rem minmax(0, 1fr);
    gap: var(--mg-md);
    align-items: start;
  }
  @media (max-width: 900px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .panel {
    padding: var(--pd-sm);
    border: 1px solid rgba(127, 127, 127, 0.18);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }
  .panel__title {
    margin: 0 0 var(--mg-xs);
    font-size: var(--fs-md);
    font-weight: var(--fw-semibold);
  }
  .panel__text {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
</style>
