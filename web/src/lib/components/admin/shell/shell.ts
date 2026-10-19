/* ============================================================================
 * web/src/lib/components/admin/shell/shell.ts — the admin shell's contract (S37)
 * ----------------------------------------------------------------------------
 * The non-visual half of AdminShell and its parts: the Spanish words, the
 * drawer breakpoint, how the nav is grouped, which item is the current page,
 * the document title, the frame check and the one way the shell leaves the
 * app. Retires the chrome of admin/index.html (#app: .topbar, #admNav,
 * #admNavBackdrop) and its wiring in js/pages/admin/index.js; pure apart from
 * isFramed() and leaveTo(), which read and move the window.
 *
 * Usage:
 *   import { groupNav, isCurrentRoute, documentTitle } from './shell';
 *   const sections = groupNav(perms.nav);
 *   const current = isCurrentRoute(item.route, page.url.pathname, ROUTES.home);
 * ========================================================================== */

import type { Surface, SurfaceGroup } from '#lib/auth/surfaces.js';

export const CHURCH_NAME = 'Iglesia Restauración Divina';

/** The nav landmark's name (legacy #admNav's aria-label). */
export const NAV_LABEL = 'Navegación del panel';
/** The drawer's name while it is a dialog (≤900px). */
export const DRAWER_LABEL = 'Menú del panel';
export const MENU_LABEL = 'Abrir menú';
export const CLOSE_MENU_LABEL = 'Cerrar menú';
export const LOGOUT_LABEL = 'Cerrar sesión';

/** The skip link's target: every admin page's <main>. */
export const CONTENT_ID = 'contenido';
export const SKIP_LINK_LABEL = 'Saltar al contenido';

/** At or below this width the sidebar is a drawer behind the burger (visual brief). */
export const DRAWER_QUERY = '(max-width: 900px)';

/**
 * The legacy panel, at the domain root whatever the app's base path is: the
 * port lives under /app until the cutover, the legacy panel never does. Never
 * through resolve(), which would put it under /app.
 */
export const LEGACY_PANEL_HREF = '/admin/';
export const LEGACY_PANEL_LABEL = 'Abrir panel actual';
export const LEGACY_PANEL_HINT = 'Las demás secciones siguen en el panel actual.';

/** The legacy nav's group order (admin/index.html #admNav). */
export const NAV_GROUPS: readonly SurfaceGroup[] = [
  'Principal',
  'Eventos',
  'Finanzas',
  'Comunidad',
  'Administración',
];

/** A surface the nav can link to: a ported one, with its route. */
export type NavEntry = Surface & { readonly route: string };

export interface NavSection {
  readonly group: SurfaceGroup;
  readonly items: readonly NavEntry[];
}

const linkable = (surface: Surface): surface is NavEntry => typeof surface.route === 'string';

/**
 * The nav's sections in group order, each item in the order it arrived
 * (the registry's). Groups with nothing visible are left out — legacy hid
 * an empty group's heading by hand (auth.js updateGroupHeadings) — and so is
 * a surface with no route of its own.
 */
export function groupNav(surfaces: readonly Surface[]): NavSection[] {
  const entries = surfaces.filter(linkable);
  return NAV_GROUPS.map((group) => ({
    group,
    items: entries.filter((entry) => entry.group === group),
  })).filter((section) => section.items.length > 0);
}

/**
 * Whether `route` is the page at `pathname`, or a page inside it. Inicio
 * (`home`) is the prefix of every admin route, so it matches exactly only.
 */
export function isCurrentRoute(route: string, pathname: string, home: string): boolean {
  if (pathname === route) return true;
  return route !== home && pathname.startsWith(route);
}

const TITLE_SUFFIX = `Panel · ${CHURCH_NAME}`;

/** "<title> · Panel · Iglesia Restauración Divina" — the browser tab's words. */
export function documentTitle(title: string): string {
  const own = title.trim();
  return own ? `${own} · ${TITLE_SUFFIX}` : TITLE_SUFFIX;
}

/**
 * Whether this window is inside a frame (D-037): `frame-ancestors` cannot be
 * sent from a <meta>, and Pages sends no headers. A browser that refuses to
 * say counts as framed.
 */
export function isFramed(
  view: { readonly top: unknown; readonly self: unknown } = window,
): boolean {
  try {
    return view.top !== view.self;
  } catch {
    return true;
  }
}

/**
 * Leave by a full page load that replaces this history entry: after a sign-out
 * nothing of the old session may stay in memory (legacy logout reloads too).
 */
export function leaveTo(url: string): void {
  window.location.replace(url);
}
