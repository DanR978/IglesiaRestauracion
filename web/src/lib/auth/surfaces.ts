/* ============================================================================
 * web/src/lib/auth/surfaces.ts — every admin surface, and who sees which (S38)
 * ----------------------------------------------------------------------------
 * The D-006 oracle. The registry lists every surface of the legacy panel
 * (admin/index.html #admNav, the Eventos pills, Mi cuenta); visibleSurfacesFor()
 * reproduces the legacy gating — js/pages/admin/auth.js applyTabAccess() plus
 * the `data-admin-only` / `data-finance-only` rules in shell.css — and the
 * developer tier of 20261019000001_enforce_mfa_and_tiers.sql:
 *
 *   admin            everything but the four system surfaces; each of those
 *                    (Ministerios, Usuarios, Actividad, Configuración) only
 *                    with its own key in allowed_tabs — account_has_system_tab()
 *                    on the server, so "Administrador" (no keys) gets none
 *   treasurer        Inicio, Mi cuenta, Calendario + Próximos (read-only),
 *                    Tesorería — never Registraciones, Discipulado or any
 *                    other personal data; allowed_tabs is ignored
 *   ministry_leader  Inicio, Mi cuenta + the operational keys an admin granted
 *                    (the grantable set admin-invite enforces); Tesorería there
 *                    is the ministry's own books, never the church's
 *   any other role   nothing (fail closed); unknown keys are ignored
 *
 * Capabilities that are not surfaces: `church-books` (the church treasury —
 * is_finance(): admin, treasurer) and `notifications` (the bell — admin).
 *
 * UX only: navigation and Inicio's tiles are shaped by it; RLS and the aal2
 * layer are the guard (D-002, D-006). Every negative case is a unit test.
 * `ported` marks what the new admin serves; the shell lists those and sends
 * the rest to the legacy panel (D-036).
 *
 * Usage:
 *   import { visibleSurfacesFor, capabilitiesFor } from '#lib/auth/surfaces.js';
 *   const nav = visibleSurfacesFor(profile).filter((s) => s.ported);
 *   if (capabilitiesFor(profile).has('church-books')) showBooksTile();
 * ========================================================================== */

import { isStaffRole, type StaffRole } from '#lib/roles.js';
import { ROUTES } from './routes';

export type SurfaceKey =
  | 'inicio'
  | 'cuenta'
  | 'analytics'
  | 'calendario'
  | 'upcoming'
  | 'special-events'
  | 'treasury'
  | 'discipulado'
  | 'galeria'
  | 'leaders'
  | 'ministries'
  | 'users'
  | 'activity'
  | 'settings';

export type SurfaceGroup = 'Principal' | 'Eventos' | 'Finanzas' | 'Comunidad' | 'Administración';

export interface Surface {
  readonly key: SurfaceKey;
  /** Spanish nav label. */
  readonly label: string;
  /** Font Awesome 6 solid icon name (Icon `set="fas"`). */
  readonly icon: string;
  readonly group: SurfaceGroup;
  /** Served by the new admin; otherwise it opens in the legacy panel. */
  readonly ported: boolean;
  /** The resolved page URL, once ported. */
  readonly route?: string;
}

/** Legacy nav order (admin/index.html #admNav, the Eventos pills in order). */
export const SURFACES: readonly Surface[] = [
  {
    key: 'inicio',
    label: 'Inicio',
    icon: 'house',
    group: 'Principal',
    ported: true,
    route: ROUTES.home,
  },
  {
    key: 'cuenta',
    label: 'Mi cuenta',
    icon: 'circle-user',
    group: 'Principal',
    ported: true,
    route: ROUTES.account,
  },
  { key: 'analytics', label: 'Analíticas', icon: 'chart-line', group: 'Principal', ported: false },
  {
    key: 'calendario',
    label: 'Calendario',
    icon: 'calendar-week',
    group: 'Eventos',
    ported: false,
  },
  { key: 'upcoming', label: 'Próximos', icon: 'calendar-day', group: 'Eventos', ported: false },
  {
    key: 'special-events',
    label: 'Registraciones',
    icon: 'clipboard-list',
    group: 'Eventos',
    ported: false,
  },
  { key: 'treasury', label: 'Tesorería', icon: 'coins', group: 'Finanzas', ported: false },
  {
    key: 'discipulado',
    label: 'Discipulado',
    icon: 'hand-holding-heart',
    group: 'Comunidad',
    ported: false,
  },
  { key: 'galeria', label: 'Galería', icon: 'images', group: 'Comunidad', ported: false },
  { key: 'leaders', label: 'Líderes', icon: 'people-group', group: 'Comunidad', ported: false },
  { key: 'ministries', label: 'Ministerios', icon: 'church', group: 'Comunidad', ported: false },
  { key: 'users', label: 'Usuarios', icon: 'users', group: 'Administración', ported: false },
  {
    key: 'activity',
    label: 'Actividad',
    icon: 'clock-rotate-left',
    group: 'Administración',
    ported: false,
  },
  { key: 'settings', label: 'Configuración', icon: 'gear', group: 'Administración', ported: false },
];

/** What the oracle reads from a profile; anything it does not recognise fails closed. */
export interface AccessProfile {
  readonly role: string | null;
  readonly allowed_tabs?: readonly string[] | null;
}

/** The developer-tier keys an admin holds one by one (admin-invite ADMIN_SYSTEM_TABS). */
const SYSTEM_KEYS: readonly SurfaceKey[] = ['ministries', 'users', 'activity', 'settings'];
/** The keys an admin can grant a ministry leader (admin-invite OPERATIONAL_TABS). */
const OPERATIONAL_KEYS: readonly SurfaceKey[] = [
  'upcoming',
  'calendario',
  'special-events',
  'discipulado',
  'galeria',
  'treasury',
];

const ALWAYS: readonly SurfaceKey[] = ['inicio', 'cuenta'];
const ADMIN_BASE: readonly SurfaceKey[] = [
  ...ALWAYS,
  'analytics',
  'calendario',
  'upcoming',
  'special-events',
  'treasury',
  'discipulado',
  'galeria',
  'leaders',
];
const TREASURER: readonly SurfaceKey[] = [...ALWAYS, 'calendario', 'upcoming', 'treasury'];

function grantedOf(profile: AccessProfile, from: readonly SurfaceKey[]): SurfaceKey[] {
  const tabs = Array.isArray(profile.allowed_tabs) ? profile.allowed_tabs : [];
  return from.filter((key) => tabs.includes(key));
}

function keysFor(profile: AccessProfile | null | undefined): ReadonlySet<SurfaceKey> {
  if (!profile || !isStaffRole(profile.role)) return new Set();
  const byRole: Record<StaffRole, () => readonly SurfaceKey[]> = {
    admin: () => [...ADMIN_BASE, ...grantedOf(profile, SYSTEM_KEYS)],
    treasurer: () => TREASURER,
    ministry_leader: () => [...ALWAYS, ...grantedOf(profile, OPERATIONAL_KEYS)],
  };
  return new Set(byRole[profile.role]());
}

/** The surfaces this profile may see, in registry order. Empty for no / unknown profile. */
export function visibleSurfacesFor(profile: AccessProfile | null | undefined): Surface[] {
  const keys = keysFor(profile);
  return SURFACES.filter((s) => keys.has(s.key));
}

export type Capability = 'church-books' | 'notifications';

/** The non-surface rights: the church books (is_finance) and the bell (admins). */
export function capabilitiesFor(
  profile: AccessProfile | null | undefined,
): ReadonlySet<Capability> {
  if (!profile || !isStaffRole(profile.role)) return new Set();
  if (profile.role === 'admin') return new Set(['church-books', 'notifications']);
  if (profile.role === 'treasurer') return new Set(['church-books']);
  return new Set();
}
