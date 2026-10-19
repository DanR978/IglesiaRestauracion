/* ============================================================================
 * web/src/lib/auth/next.ts — where to go after signing in, safely (S38 · S39)
 * ----------------------------------------------------------------------------
 * The guard sends a signed-out visitor to the sign-in page with
 * `?next=<the page they asked for>`, and the OAuth start keeps it for the
 * callback. `next` arrives from a URL anyone can craft, so it is an open
 * redirect unless it is checked. safeNext() accepts only a page of this app's
 * admin, validated against the app's own routes with match() from
 * $app/paths; anything else — another site, another part of irdlex.org, a
 * sign-in page, a path that is not a route — becomes Inicio.
 *
 * Refused before parsing: anything but one leading slash (`//host`, `/\host`,
 * `https:`, `javascript:`), backslashes, and the control characters a
 * browser strips while parsing (`/\t/host` would become `//host`). After
 * parsing: another origin, dot segments that climb out of the admin
 * (`%2e%2e` included — the URL parser resolves them), the acceso/ pages.
 * The result is a same-origin path (with its query and hash), never a URL.
 *
 * Browser-only: it reads `location.origin`, and match() needs the client router.
 *
 * Usage:
 *   import { safeNext } from '#lib/auth/next.js';
 *   const target = await safeNext(page.url.searchParams.get('next'));
 * ========================================================================== */

import { match } from '$app/paths';
import { ROUTES } from './routes';

/** Longer than any admin URL, short enough to refuse padding tricks. */
const MAX_LENGTH = 2048;
/** One leading slash, then anything but a second slash or a backslash. */
const ROOT_RELATIVE = /^\/(?![/\\])/;
// Backslash, C0 controls, DEL: what browsers rewrite or drop inside a URL.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const UNSAFE = /[\\\u0000-\u001f\u007f]/;

/** A same-app admin path (pathname + query + hash) for `raw`, else Inicio. */
export async function safeNext(raw: unknown): Promise<string> {
  if (typeof raw !== 'string' || raw.length > MAX_LENGTH) return ROUTES.home;
  if (!ROOT_RELATIVE.test(raw) || UNSAFE.test(raw)) return ROUTES.home;

  let url: URL;
  try {
    url = new URL(raw, location.origin);
  } catch {
    return ROUTES.home;
  }
  if (url.origin !== location.origin) return ROUTES.home;
  if (!url.pathname.startsWith(ROUTES.home) || url.pathname.startsWith(ROUTES.login)) {
    return ROUTES.home;
  }

  try {
    if (!(await match(url))) return ROUTES.home;
  } catch {
    return ROUTES.home;
  }
  return url.pathname + url.search + url.hash;
}
