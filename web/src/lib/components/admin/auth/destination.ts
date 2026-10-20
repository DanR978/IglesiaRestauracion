/* ============================================================================
 * web/src/lib/components/admin/auth/destination.ts — where a sign-in step leads (S39)
 * ----------------------------------------------------------------------------
 * Every acceso/ page ends the same way: once the session store has settled
 * (await session.settled() after a sign-in, a code, an exchange), its status
 * picks the next page — the decision legacy auth.js made in routeAfterLogin()
 * and bootApp(), now one pure function the pages share:
 *
 *   ready                      → `next` (a safeNext() result; Inicio by default)
 *   needs-mfa / needs-enroll   → verificar/ (keeping `next`)
 *   forbidden                  → sin-acceso/
 *   signed-out / expired       → the sign-in page (keeping `next`)
 *   error / loading            → null: stay, and show the store's error with Retry
 *
 * The sign-in steps replace their history entry (leaveTo): Back from the admin
 * never lands on a spent code, a callback or a used email link. Targets are
 * already resolved (ROUTES, safeNext), so navigation lives here, in TS, rather
 * than as unresolved-looking goto() calls in the pages.
 *
 * Usage:
 *   import { destinationFor, leaveTo } from '#lib/components/admin/auth/destination.js';
 *   await session.settled();
 *   const to = destinationFor(session.status, next);
 *   if (to) await leaveTo(to);
 * ========================================================================== */

import { goto } from '$app/navigation';
import { ROUTES } from '#lib/auth/routes.js';
import type { SessionStatus } from '#lib/stores/session.svelte.js';

/** `route` with `?next=` — left off when `next` is Inicio, where a sign-in lands anyway. */
export function withNext(route: string, next: string): string {
  return next === ROUTES.home ? route : `${route}?next=${encodeURIComponent(next)}`;
}

/** The page a settled session goes to next; null to stay and offer Retry. */
export function destinationFor(status: SessionStatus, next: string): string | null {
  switch (status) {
    case 'ready':
      return next;
    case 'needs-mfa':
    case 'needs-enroll':
      return withNext(ROUTES.verify, next);
    case 'forbidden':
      return ROUTES.noAccess;
    case 'signed-out':
    case 'expired':
      return withNext(ROUTES.login, next);
    case 'error':
    case 'loading':
      return null;
  }
}

/** Navigate to an already-resolved app path, replacing this history entry. */
export async function leaveTo(href: string): Promise<void> {
  try {
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass resolved paths only: ROUTES, safeNext(), loginHref(), emailLinkTarget()
    await goto(href, { replace: true });
  } catch (e) {
    // Superseded by a newer navigation — that one is already on its way.
    console.warn('[acceso] leaveTo:', e instanceof Error ? e.message : String(e));
  }
}
