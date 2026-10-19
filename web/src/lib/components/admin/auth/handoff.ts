/* ============================================================================
 * web/src/lib/components/admin/auth/handoff.ts — what one acceso page hands the next (S39)
 * ----------------------------------------------------------------------------
 * Two small hand-offs between the sign-in pages:
 *
 *   The notice  why the sign-in page opened: `?aviso=sesion-cerrada` after the
 *               shell's logout, `?aviso=sesion-expirada` from its "expired"
 *               screen (S37 builds those links with loginHref()). A session
 *               the store saw end unasked (status 'expired') says so even
 *               without the parameter — the guard's redirect carries none.
 *               Rendered as text; an unknown value shows nothing.
 *
 *   The email   typed on the sign-in page, carried to recuperar/ and back in
 *               module memory — never the URL, never storage — so nobody types
 *               it twice (WCAG 3.3.7 Redundant Entry). A reload forgets it.
 *
 * Usage:
 *   import { loginHref, loginNoticeFor, carryEmail, carriedEmail } from '#lib/components/admin/auth/handoff.js';
 *   await leaveTo(loginHref('signed-out'));        // the shell, after signOut('local')
 *   const notice = loginNoticeFor(url.searchParams, session.status);
 *   carryEmail(email);                             // before following "¿Olvidaste tu contraseña?"
 * ========================================================================== */

import { ROUTES } from '#lib/auth/routes.js';
import type { SessionStatus } from '#lib/stores/session.svelte.js';

export type LoginNotice = 'signed-out' | 'expired';

/** The sign-in page's notice parameter and its (Spanish-slug) values. */
export const LOGIN_NOTICE_PARAM = 'aviso';
export const LOGIN_NOTICE_VALUES: Readonly<Record<LoginNotice, string>> = {
  'signed-out': 'sesion-cerrada',
  expired: 'sesion-expirada',
};

export const LOGIN_NOTICE_COPY: Readonly<Record<LoginNotice, string>> = {
  'signed-out': 'Sesión cerrada.',
  expired: 'Tu sesión expiró. Inicia sesión de nuevo para continuar.',
};

/** The notice to show: the URL's `?aviso=`, else `expired` when the store saw the session end. */
export function loginNoticeFor(params: URLSearchParams, status: SessionStatus): LoginNotice | null {
  const asked = params.get(LOGIN_NOTICE_PARAM);
  const named = (Object.keys(LOGIN_NOTICE_VALUES) as LoginNotice[]).find(
    (notice) => LOGIN_NOTICE_VALUES[notice] === asked,
  );
  return named ?? (status === 'expired' ? 'expired' : null);
}

/** The sign-in page with a notice and/or a `next` (an admin path; Inicio is left off). */
export function loginHref(notice: LoginNotice | null, next: string | null = null): string {
  const query = new URLSearchParams();
  if (next && next !== ROUTES.home) query.set('next', next);
  if (notice) query.set(LOGIN_NOTICE_PARAM, LOGIN_NOTICE_VALUES[notice]);
  const search = query.toString();
  return search ? `${ROUTES.login}?${search}` : ROUTES.login;
}

let email = '';

/** Keep the typed address for the next acceso page (memory only). */
export function carryEmail(value: string): void {
  email = value.trim();
}

/** The address the previous acceso page kept, or ''. */
export function carriedEmail(): string {
  return email;
}
