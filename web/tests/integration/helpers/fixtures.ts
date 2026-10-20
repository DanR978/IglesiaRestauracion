/* ============================================================================
 * web/tests/integration/helpers/fixtures.ts — `test` for the integration specs
 * ----------------------------------------------------------------------------
 * Playwright's test with two fixtures every spec gets:
 *
 *   stack       a Stack (./stack) on the running local Supabase; its
 *               cleanup() runs after the test whether it passed or not, so
 *               no account, row, audit entry or email outlives the test
 *   (automatic) the network guard on the test's browser context: a request
 *               to any origin but the preview, the local stack and the
 *               pinned Font Awesome CDN (app.html) is ABORTED and recorded,
 *               and the test fails listing it. The invitation and recovery
 *               emails link to production; nothing here may follow them.
 *
 * A spec that opens a second context guards it itself (guardNetwork).
 *
 * Usage:
 *   import { expect, test } from './helpers/fixtures';
 *   test('…', async ({ page, stack }) => { const ana = await stack.createAccount(); … });
 * ========================================================================== */
import { test as base, expect, type BrowserContext } from '@playwright/test';
import { INTEGRATION_ORIGIN, Stack, localStack } from './stack';

/** The one third-party origin app.html loads from: the pinned Font Awesome stylesheet. */
const CDN_ORIGIN = 'https://cdnjs.cloudflare.com';

/**
 * Abort every http(s) request `context` makes outside the preview, the local
 * stack's gateway and the CDN. Returns a reader of what was blocked.
 */
export async function guardNetwork(
  context: BrowserContext,
  apiUrl: string,
): Promise<() => string[]> {
  const allowed = new Set([INTEGRATION_ORIGIN, new URL(apiUrl).origin, CDN_ORIGIN]);
  const blocked: string[] = [];
  await context.route(
    (url) => (url.protocol === 'http:' || url.protocol === 'https:') && !allowed.has(url.origin),
    async (route) => {
      const url = new URL(route.request().url());
      blocked.push(`${route.request().method()} ${url.origin}${url.pathname}`);
      await route.abort('blockedbyclient');
    },
  );
  return () => [...blocked];
}

export const test = base.extend<{ stack: Stack; networkGuard: void }>({
  // A fixture that needs no other fixture still takes Playwright's object argument.
  // eslint-disable-next-line no-empty-pattern
  stack: async ({}, use) => {
    const stack = new Stack(localStack());
    await use(stack);
    await stack.cleanup();
  },
  networkGuard: [
    async ({ context, stack }, use) => {
      const blocked = await guardNetwork(context, stack.keys.apiUrl);
      await use();
      expect(blocked(), 'requests outside the preview, the local stack and the CDN').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
