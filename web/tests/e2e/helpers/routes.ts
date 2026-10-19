/* ============================================================================
 * web/tests/e2e/helpers/routes.ts — the pages this build prerendered
 * ----------------------------------------------------------------------------
 * The axe (box 15) and lab-vitals (box 17) specs visit EVERY prerendered page,
 * so a route is covered the day it lands, with no list to keep in sync. The
 * list is read from build/ when a spec file loads: Playwright runs webServer
 * (`npm run build && npm run preview`) before it loads any spec, so build/ is
 * always this run's build. `x/index.html` is the page at `/x/` (trailingSlash
 * 'always', D-001). An empty or missing build/ yields [] — the specs turn that
 * into a failing test instead of passing with nothing checked.
 *
 * Usage:
 *   import { prerenderedRoutes, routeGroup } from './helpers/routes';
 *   for (const route of prerenderedRoutes()) test(route, …);
 * ========================================================================== */
import { existsSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILD_DIR = fileURLToPath(new URL('../../../build/', import.meta.url));

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.name.endsWith('.html') ? [path] : [];
  });
}

/** Every prerendered page as a root path (`/`, `/kit/button/`), sorted. */
export function prerenderedRoutes(): string[] {
  if (!existsSync(BUILD_DIR)) return [];
  return htmlFiles(BUILD_DIR)
    .map((file) => relative(BUILD_DIR, file).split(sep).join('/'))
    .map((file) =>
      file.endsWith('index.html') ? `/${file.slice(0, -'index.html'.length)}` : `/${file}`,
    )
    .sort();
}

/** A route's group: its first path segment (`/kit/button/` → `kit`), `home` for `/`. */
export function routeGroup(route: string): string {
  return route.split('/')[1] || 'home';
}
