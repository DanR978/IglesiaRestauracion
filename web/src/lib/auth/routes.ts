/* ============================================================================
 * web/src/lib/auth/routes.ts — the admin's own URLs (S38 · D-036)
 * ----------------------------------------------------------------------------
 * Every admin page is a prerendered `ssr = false` shell at a folder URL, so
 * these are resolved pathnames with the trailing slash: `/app/admin/…/` under
 * BASE_PATH=/app, `/admin/…/` once the admin is served from the domain root
 * (G-008). Spanish slugs. The guard, the auth calls and the surface registry
 * all build links from here; nothing spells an admin path by hand.
 *
 * Built with resolve() from $app/paths, never `base`. The pages are created by
 * S37 (Inicio), S39 (acceso/*) and S45 (cuenta); until a page exists the
 * generated `Path` union has no entry for it, so `page()` calls an untyped
 * view of resolve() — same value at runtime. When all of them exist, call
 * resolve('admin/…/') directly so a typo fails the type check.
 *
 * Usage:
 *   import { ROUTES } from '#lib/auth/routes.js';
 *   await leaveTo(`${ROUTES.login}?next=${encodeURIComponent(next)}`);
 * ========================================================================== */

import { resolve } from '$app/paths';

const page = resolve as unknown as (pathname: string) => string;

export const ROUTES = {
  /** Inicio — where a sign-in lands when there is no safe `next`. */
  home: page('admin/'),
  /** Mi cuenta (S45). */
  account: page('admin/cuenta/'),
  /** Sign in: email + password, Google, Microsoft (S39). */
  login: page('admin/acceso/'),
  /** The second factor: challenge or first enrollment (S39). */
  verify: page('admin/acceso/verificar/'),
  /** The OAuth callback: exchanges `?code=` for a session (S39, D-035). */
  oauth: page('admin/acceso/oauth/'),
  /** Accept an invitation (`token_hash` link) and set a first password. */
  invite: page('admin/acceso/invitacion/'),
  /** A password-recovery link (`token_hash`): set a new password. */
  reset: page('admin/acceso/restablecer/'),
  /** Ask for a recovery email. */
  recover: page('admin/acceso/recuperar/'),
  /** Signed in, but this account has no access to the admin. */
  noAccess: page('admin/acceso/sin-acceso/'),
} as const;
