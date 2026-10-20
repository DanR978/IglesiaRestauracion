// D-037 — the Content-Security-Policy every /app page carries (web/csp.ts)
// holds in real browsers, all four projects. A `securitypolicyviolation`
// listener, installed before any of the page's scripts, reports every
// violation — from every document the test loads — to the test, and each
// test fails on the first one:
//
//   · every prerendered route, signed out — public pages and the admin's,
//     which send a signed-out visit on to the sign-in page;
//   · the admin as a signed-in account: Inicio and each section of Mi cuenta,
//     and verificar/ in both of its states (the code; the QR to enrol, a
//     data: image).
//
// The e2e build's Supabase is the preview itself, under /__supabase
// (helpers/supabase.ts), so the policy's connect-src and img-src name exactly
// that origin and every call is answered in-process; nothing reaches a backend.
import { expect, test, type Page } from '@playwright/test';
import {
  CHALLENGE,
  DEVELOPER,
  ENROLL,
  signedOutBackend,
  staffBackend,
  type StaffAccount,
} from './helpers/admin-backend';
import { watchViolations } from './helpers/csp';
import { prerenderedRoutes, routeGroup } from './helpers/routes';

const ROUTES = prerenderedRoutes();

/** The page has rendered its heading and stopped fetching; reports have had time to arrive. */
async function settle(page: Page): Promise<void> {
  await expect(page.locator('h1').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => new Promise((done) => setTimeout(done, 50)));
}

test('the build prerendered pages to check', () => {
  expect(ROUTES.length, 'no prerendered pages found in build/').toBeGreaterThan(0);
});

// The control: the policy blocks an injected inline script, and the watcher
// hears about it in this engine — so "no violation" below means something.
test('control — an injected inline script is refused and reported', async ({ page }) => {
  const violations = await watchViolations(page);
  await page.goto('/');
  await settle(page);
  const ran = await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'window.__e2eInjected = true';
    document.head.append(script);
    return (window as unknown as { __e2eInjected?: boolean }).__e2eInjected === true;
  });
  expect(ran).toBe(false);
  await expect
    .poll(() => violations.map((v) => v.directive))
    .toContainEqual(expect.stringMatching(/^script-src/));
});

for (const route of ROUTES) {
  test(`${routeGroup(route)} · ${route} — no violation, signed out`, async ({ page }) => {
    const violations = await watchViolations(page);
    await signedOutBackend(page);
    await page.goto(route);
    await settle(page);
    expect(violations).toEqual([]);
  });
}

const SIGNED_IN: ReadonlyArray<[label: string, account: StaffAccount, path: string, h1: string]> = [
  ['Inicio', DEVELOPER, '/admin/', 'Inicio'],
  ['Mi cuenta · Perfil', DEVELOPER, '/admin/cuenta/', 'Mi cuenta'],
  ['Mi cuenta · Seguridad', DEVELOPER, '/admin/cuenta/?seccion=seguridad', 'Mi cuenta'],
  ['Mi cuenta · Preferencias', DEVELOPER, '/admin/cuenta/?seccion=preferencias', 'Mi cuenta'],
  ['verificar/ — the code', CHALLENGE, '/admin/acceso/verificar/', 'Verifica tu identidad'],
  ['verificar/ — enrol with the QR', ENROLL, '/admin/acceso/verificar/', 'Protege tu cuenta'],
];

for (const [label, account, path, h1] of SIGNED_IN) {
  test(`admin · ${label} — no violation, signed in`, async ({ page }) => {
    const violations = await watchViolations(page);
    await staffBackend(page, account);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible();
    if (account === ENROLL) {
      // GoTrue's QR, an SVG data: URL in an <img> — what img-src's data: is for.
      const qr = page.getByRole('img', { name: 'Código QR para tu app de autenticación' });
      await expect(qr).toHaveAttribute('src', /^data:image\/svg\+xml/);
      await expect
        .poll(() => qr.evaluate((img: HTMLImageElement) => img.naturalWidth))
        .toBeGreaterThan(0);
    }
    await settle(page);
    expect(violations).toEqual([]);
  });
}
