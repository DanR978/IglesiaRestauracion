/* ============================================================================
 * web/src/hooks.server.ts — what the admin's prerendered HTML carries (S37)
 * ----------------------------------------------------------------------------
 * Runs at build time only: adapter-static prerenders every route and nothing
 * runs on a server afterwards. The admin's routes are `ssr = false` shells
 * (D-036), so they never render a page's <svelte:head>; whatever their HTML
 * must say before the app boots is written here, into every page of the
 * (admin) route group — the sign-in screens included (D-037):
 *   · <meta name="robots" content="noindex, nofollow"> — search engines keep
 *     out (robots.txt covers only the legacy /admin/, not /app/admin/);
 *   · a generic <title> until the page sets its own, so the tab is named
 *     before JavaScript runs (or if it never does).
 * Public pages pass through untouched.
 *
 * Usage: SvelteKit calls `handle` for every page it renders.
 * ========================================================================== */
import type { Handle } from '@sveltejs/kit/hooks';

/** Route ids of the (admin) group start with this (`/(admin)/admin/(app)`, `/(admin)/admin/acceso`, …). */
const ADMIN_ROUTES = '/(admin)/';

const ROBOTS = '<meta name="robots" content="noindex, nofollow" />';
/** shell.ts documentTitle('') — kept literal: this file must not pull UI modules into the server build. */
const TITLE = '<title>Panel · Iglesia Restauración Divina</title>';

function adminHead(html: string): string {
  const missing = [
    /<meta\s[^>]*name=["']robots["']/i.test(html) ? '' : ROBOTS,
    /<title[\s>]/i.test(html) ? '' : TITLE,
  ].filter(Boolean);
  if (missing.length === 0) return html;
  return html.replace('</head>', `${missing.join('\n')}\n</head>`);
}

export const handle: Handle = ({ event, resolve }) => {
  if (!event.route.id?.startsWith(ADMIN_ROUTES)) return resolve(event);
  return resolve(event, { transformPageChunk: ({ html }) => adminHead(html) });
};
