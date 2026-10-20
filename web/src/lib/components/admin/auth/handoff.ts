/* ============================================================================
 * web/src/lib/components/admin/auth/handoff.ts — the email one acceso page hands the next (S39)
 * ----------------------------------------------------------------------------
 * The address typed on the sign-in page goes to recuperar/ and back in module
 * memory — never the URL, never storage — so nobody types it twice (WCAG
 * 3.3.7 Redundant Entry). A reload forgets it.
 *
 * Why the sign-in page opened ("Sesión cerrada." / "Tu sesión expiró.") is
 * not carried here: that is #lib/auth/notice.ts, the shell's `?aviso=`.
 *
 * Usage:
 *   import { carryEmail, carriedEmail } from '#lib/components/admin/auth/handoff.js';
 *   carryEmail(email);                    // before following "¿Olvidaste tu contraseña?"
 *   let email = $state(carriedEmail());   // on the next page
 * ========================================================================== */

let email = '';

/** Keep the typed address for the next acceso page (memory only). */
export function carryEmail(value: string): void {
  email = value.trim();
}

/** The address the previous acceso page kept, or ''. */
export function carriedEmail(): string {
  return email;
}
