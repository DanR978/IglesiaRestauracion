/* ============================================================================
 * web/src/lib/components/admin/shell/sign-out.svelte.ts — signing out on purpose (S37)
 * ----------------------------------------------------------------------------
 * The one way the admin ends this device's session deliberately: the sidebar's
 * logout (after "¿Cerrar sesión?") and S45's "Cerrar sesión en todos los
 * dispositivos". It signs out, then leaves for the sign-in page with the
 * "Sesión cerrada." notice by a full page load, so nothing of the session
 * stays in memory (legacy logout reloaded too).
 *
 * While it runs, `signingOut.current` is true and the shell does not treat
 * the `signed-out` status as a session that went away under the page (it
 * would send the visit to sign in again with `next`, and no notice).
 *
 * auth-js drops this device's session even when the server cannot be
 * reached, so the page leaves whatever the result. To report a failure in
 * place, end the other sessions first — signOut('others') keeps this one and
 * says whether the server heard it — then call this with 'local'.
 *
 * Usage:
 *   import { signOutAndLeave } from '#lib/components/admin/shell/sign-out.svelte.js';
 *   if (await confirm('¿Cerrar sesión?', …)) await signOutAndLeave('local');
 * ========================================================================== */

import { withSignInNotice } from '#lib/auth/notice.js';
import { ROUTES } from '#lib/auth/routes.js';
import { session } from '#lib/stores/session.svelte.js';
import { leaveTo } from './shell';

let leaving = $state(false);

export const signingOut = {
  /** A deliberate sign-out is under way: the page is about to leave. */
  get current(): boolean {
    return leaving;
  },
};

/** Sign this device out (`local`) or every device (`global`), then open the sign-in page. */
export async function signOutAndLeave(scope: 'local' | 'global'): Promise<void> {
  leaving = true;
  await session.signOut(scope);
  leaveTo(withSignInNotice(ROUTES.login, 'signed-out'));
}
