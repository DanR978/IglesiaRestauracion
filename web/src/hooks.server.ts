/* ============================================================================
 * web/src/hooks.server.ts — what the prerendered HTML carries (S37)
 * ----------------------------------------------------------------------------
 * Runs at build time only: adapter-static prerenders every route and nothing
 * runs on a server afterwards.
 *
 * Every page: Kit's stylesheet links go ahead of its module preloads. Kit
 * writes the preloads first, so on an HTTP/1.1 connection limit (six per
 * host; the lab profile's preview, and phones that fall back to it) the first
 * round of requests went to JavaScript the first paint does not need, and the
 * render-blocking CSS waited a round or two behind it (S37 session file,
 * "Public-page cost"). The links keep their order; the CSP meta stays first.
 *
 * The admin's routes are `ssr = false` shells (D-036), so they never render
 * a page's <svelte:head>; whatever their HTML must say before the app boots
 * is written here, into every page of the (admin) route group — the sign-in
 * screens included (D-037):
 *   · <meta name="robots" content="noindex, nofollow"> — search engines keep
 *     out (robots.txt covers only the legacy /admin/, not /app/admin/);
 *   · a generic <title> until the page sets its own, so the tab is named
 *     before JavaScript runs (or if it never does).
 *
 * Usage: SvelteKit calls `handle` for every page it renders.
 * ========================================================================== */
import type { Handle } from '@sveltejs/kit/hooks';

/** Route ids of the (admin) group start with this (`/(admin)/admin/(app)`, `/(admin)/admin/acceso`, …). */
const ADMIN_ROUTES = '/(admin)/';

const ROBOTS = '<meta name="robots" content="noindex, nofollow" />';
/** shell.ts documentTitle('') — kept literal: this file must not pull UI modules into the server build. */
const TITLE = '<title>Panel · Iglesia Restauración Divina</title>';

/** A link tag exactly as Kit's Head writes it: `<link href="…" rel="…">` on one line. */
const KIT_STYLESHEET = /\s*<link href="[^"]*" rel="stylesheet"[^>]*>/g;
const KIT_MODULEPRELOAD = /<link href="[^"]*" rel="modulepreload"[^>]*>/;

/** Kit's stylesheet links, in their order, moved ahead of its first module preload. */
function stylesheetsFirst(html: string): string {
  const sheets = [...html.matchAll(KIT_STYLESHEET)].map((match) => match[0].trim());
  if (sheets.length === 0 || !KIT_MODULEPRELOAD.test(html)) return html;
  const rest = html.replace(KIT_STYLESHEET, '');
  const at = rest.search(KIT_MODULEPRELOAD);
  return `${rest.slice(0, at)}${sheets.join('\n\t\t')}\n\t\t${rest.slice(at)}`;
}

function adminHead(html: string): string {
  const missing = [
    /<meta\s[^>]*name=["']robots["']/i.test(html) ? '' : ROBOTS,
    /<title[\s>]/i.test(html) ? '' : TITLE,
  ].filter(Boolean);
  if (missing.length === 0) return html;
  return html.replace('</head>', `${missing.join('\n')}\n</head>`);
}

export const handle: Handle = ({ event, resolve }) => {
  const admin = event.route.id?.startsWith(ADMIN_ROUTES) ?? false;
  return resolve(event, {
    transformPageChunk: ({ html }) => {
      const ordered = stylesheetsFirst(html);
      return admin ? adminHead(ordered) : ordered;
    },
  });
};
