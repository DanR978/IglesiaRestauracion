/* ============================================================================
 * web/tests/e2e/helpers/network.ts — prove a page stayed off other origins
 * ----------------------------------------------------------------------------
 * The e2e suite runs against `vite preview` and must never reach the
 * production Supabase project (or anything else). The only other host a page
 * loads by design is the pinned Font Awesome stylesheet (app.html, S13).
 *
 * Passive on purpose: it listens to `request` events instead of routing, so
 * it adds no interception round-trip to what the lab-vitals spec measures.
 * It reports after the fact; nothing in the kit pages writes anywhere.
 *
 * Usage:
 *   const offOrigin = watchOffOriginRequests(page);
 *   await page.goto('/kit/button/');
 *   expect(offOrigin()).toEqual([]);
 * ========================================================================== */
import type { Page } from '@playwright/test';

/** Hosts a page may reach: the preview server and the CDN app.html pins. */
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', 'cdnjs.cloudflare.com']);
const NETWORK_PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:']);

/** Start recording requests to any other host; call the result to read them. */
export function watchOffOriginRequests(page: Page): () => string[] {
  const offenders: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!NETWORK_PROTOCOLS.has(url.protocol) || ALLOWED_HOSTS.has(url.hostname)) return;
    offenders.push(`${request.method()} ${url.origin}${url.pathname}`);
  });
  return () => [...offenders];
}
