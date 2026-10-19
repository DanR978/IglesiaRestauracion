// S05b — VERIFICATION box 17, lab half: Largest Contentful Paint ≤ 2.5 s and
// Cumulative Layout Shift ≤ 0.1 for every prerendered page, grouped by route
// group, on a throttled mobile profile. Chromium only (playwright.config): the
// throttling goes through the DevTools protocol, and WebKit reports neither
// LCP nor layout-shift entries.
//
// Profile = Lighthouse's default mobile run, applied for real rather than
// simulated: a 412×823 phone at DPR 1.75, "Slow 4G" (562.5 ms request latency,
// 1.47 Mbit/s down, 675 kbit/s up) and a 4× CPU slowdown. Every test is a fresh
// context, so the cache is cold. `vite preview` serves uncompressed HTTP/1.1, so
// the render-blocking CSS shares the throttled link with every module preload:
// pessimistic next to Pages (gzip over HTTP/2).
import { expect, test } from '@playwright/test';
import { watchOffOriginRequests } from './helpers/network';
import { prerenderedRoutes, routeGroup } from './helpers/routes';

const LCP_BUDGET_MS = 2500;
const CLS_BUDGET = 0.1;
/** After `networkidle`: late shifts (web fonts, hydration) still count. */
const SETTLE_MS = 1500;
const SLOW_4G = {
  offline: false,
  latency: 562.5,
  downloadThroughput: (1474.56 * 1024) / 8,
  uploadThroughput: (675 * 1024) / 8,
};
const CPU_SLOWDOWN = 4;

const ROUTES = prerenderedRoutes();

interface Vitals {
  lcp: number;
  cls: number;
}

/** Runs in the page before any of its scripts: records LCP and windowed CLS. */
function observeVitals(): void {
  interface LayoutShiftEntry extends PerformanceEntry {
    value: number;
    hadRecentInput: boolean;
  }
  const vitals: Vitals = { lcp: 0, cls: 0 };
  Object.defineProperty(window, '__vitals', { value: vitals });

  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) vitals.lcp = entry.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });

  // CLS = the worst session window: shifts less than 1 s apart, capped at 5 s.
  let session = 0;
  let first = 0;
  let last = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as LayoutShiftEntry[]) {
      if (entry.hadRecentInput) continue;
      if (session > 0 && entry.startTime - last < 1000 && entry.startTime - first < 5000) {
        session += entry.value;
      } else {
        session = entry.value;
        first = entry.startTime;
      }
      last = entry.startTime;
      vitals.cls = Math.max(vitals.cls, session);
    }
  }).observe({ type: 'layout-shift', buffered: true });
}

test.use({
  viewport: { width: 412, height: 823 },
  deviceScaleFactor: 1.75,
  isMobile: true,
  hasTouch: true,
});

// Warm the machine, not the page: one unthrottled visit per route fills the
// DNS cache (cdnjs) and the OS file cache behind the preview server, so the
// first measurement is not charged for this runner's cold start. Every
// measured test still gets a fresh context — cold HTTP cache, new connections.
test.beforeAll(async ({ browser }, workerInfo) => {
  const context = await browser.newContext({ baseURL: workerInfo.project.use.baseURL });
  const page = await context.newPage();
  for (const route of ROUTES) await page.goto(route, { waitUntil: 'load' });
  await context.close();
});

test('vitals — the build prerendered pages to measure', () => {
  expect(ROUTES.length, 'no prerendered pages found in build/').toBeGreaterThan(0);
});

for (const route of ROUTES) {
  const group = routeGroup(route);

  test(`vitals — ${group} · ${route} stays within LCP ${LCP_BUDGET_MS} ms and CLS ${CLS_BUDGET}`, async ({
    page,
  }, testInfo) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
    await page.addInitScript(observeVitals);
    const offOrigin = watchOffOriginRequests(page);

    await page.goto(route, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(SETTLE_MS);
    const vitals = await page.evaluate(() => (window as unknown as { __vitals: Vitals }).__vitals);

    const line = `${group} ${route} LCP ${Math.round(vitals.lcp)} ms · CLS ${vitals.cls.toFixed(3)}`;
    testInfo.annotations.push({ type: 'vitals', description: line });
    process.stdout.write(`[perf] ${line}\n`);

    expect(vitals.lcp, 'no largest-contentful-paint entry was recorded').toBeGreaterThan(0);
    expect(vitals.lcp, `LCP on ${route}`).toBeLessThanOrEqual(LCP_BUDGET_MS);
    expect(vitals.cls, `CLS on ${route}`).toBeLessThanOrEqual(CLS_BUDGET);
    expect(offOrigin(), 'requests outside the preview origin and the pinned CDN').toEqual([]);
  });
}
