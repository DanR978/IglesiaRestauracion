/* ============================================================================
 * web/tests/e2e/helpers/network.ts — prove a page stayed off other origins
 * ----------------------------------------------------------------------------
 * The e2e suite runs against `vite preview` and must never reach a Supabase
 * project — production, or the LOCAL one: the e2e build points
 * PUBLIC_SUPABASE_URL at http://127.0.0.1:54321, which is "localhost" too.
 * So this compares full ORIGINS (scheme, host and port), never hostnames: a
 * page may reach only the preview server it was loaded from (the test's
 * `baseURL`) and the pinned Font Awesome CDN (app.html, S13). A WebSocket
 * counts as its http(s) twin.
 *
 * Passive on purpose: it listens to `request` and `websocket` events instead
 * of routing, so it adds no interception round-trip to what the lab-vitals
 * spec measures. It reports after the fact; nothing in the kit pages writes
 * anywhere. tests/e2e/network-guard.spec.ts proves it.
 *
 * Usage:
 *   test('…', async ({ page, baseURL }) => {
 *     const offOrigin = watchOffOriginRequests(page, baseURL);
 *     await page.goto('/kit/button/');
 *     expect(offOrigin()).toEqual([]);
 *   });
 * ========================================================================== */
import type { Page } from '@playwright/test';

/** The one other origin app.html loads from: the pinned Font Awesome stylesheet. */
const CDN_ORIGIN = 'https://cdnjs.cloudflare.com';
const NETWORK_PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:']);

/** Start recording requests to any other origin; call the result to read them. */
export function watchOffOriginRequests(page: Page, baseURL: string | undefined): () => string[] {
  if (!baseURL) throw new Error('watchOffOriginRequests: no baseURL, so no preview origin');
  const allowed = new Set([new URL(baseURL).origin, CDN_ORIGIN]);
  const offenders: string[] = [];
  const record = (method: string, raw: string): void => {
    const url = new URL(raw);
    if (!NETWORK_PROTOCOLS.has(url.protocol)) return;
    if (allowed.has(url.origin.replace(/^ws(s?):/, 'http$1:'))) return;
    offenders.push(`${method} ${url.origin}${url.pathname}`);
  };
  page.on('request', (request) => record(request.method(), request.url()));
  page.on('websocket', (socket) => record('WS', socket.url()));
  return () => [...offenders];
}
