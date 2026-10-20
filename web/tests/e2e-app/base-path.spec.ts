// D-008 / D-036 — the admin at the base it is deployed under, /app, in all
// four projects (playwright.app.config.ts): every address the admin builds
// comes from resolve() / ROUTES, so under /app the guard sends a deep link
// to /app/admin/acceso/ with `next`, signing in returns there (or to
// /app/admin/), the legacy email contract is honoured on /app/admin/, the
// OAuth callback is /app/admin/acceso/oauth/, the nav stays under /app while
// "Abrir panel actual" is the SITE-ROOT /admin/ (the legacy panel, never
// based), and logout leaves for /app/admin/acceso/ with its notice. Every
// test also holds the CSP of this /app build to zero violations.
//
// The Supabase API is the preview itself under /__supabase (outside the
// base), answered by page.route: nothing reaches a backend.
import { expect, test, type Page } from '@playwright/test';
import { DEVELOPER, EMAIL, staffBackend, staffHandlers } from '../e2e/helpers/admin-backend';
import { watchViolations, type Violation } from '../e2e/helpers/csp';
import { watchOffOriginRequests } from '../e2e/helpers/network';
import {
  mockSupabase,
  profileResponse,
  sessionResponse,
  userResponse,
} from '../e2e/helpers/supabase';
import { APP_ORIGIN, under } from './app-base';

const VERIFIED = [{ id: 'f-1', status: 'verified' as const, factor_type: 'totp' as const }];

let violations: Violation[];
let offOrigin: () => string[];

test.beforeEach(async ({ page, baseURL }) => {
  violations = await watchViolations(page);
  offOrigin = watchOffOriginRequests(page, baseURL);
});

test.afterEach(() => {
  expect(violations, 'CSP violations under /app').toEqual([]);
  expect(offOrigin(), 'requests outside the preview origin and the pinned CDN').toEqual([]);
});

/** The page's path and query, base included. */
const address = (page: Page) => {
  const url = new URL(page.url());
  return url.pathname + url.search;
};

/** Sign in on the form with the mocked password grant. */
async function signIn(page: Page): Promise<void> {
  await page.getByLabel('Correo electrónico').fill(EMAIL);
  await page.getByLabel('Contraseña', { exact: true }).fill('una contraseña larga');
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test.describe('signed out', () => {
  /** The backend of a staff account that has not signed in yet; the password grant opens aal2. */
  const backend = (page: Page) =>
    mockSupabase(page, {
      ...staffHandlers(DEVELOPER),
      'POST /auth/v1/token': { json: sessionResponse({ aal: 'aal2', factors: VERIFIED }) },
    });

  test('a deep link goes to /app/admin/acceso/ with `next`, and signing in returns there', async ({
    page,
  }) => {
    const api = await backend(page);
    await page.goto('admin/cuenta/?seccion=seguridad');
    await page.waitForURL(
      (url) =>
        url.pathname === under('admin/acceso/') &&
        url.searchParams.get('next') === under('admin/cuenta/?seccion=seguridad'),
    );
    await expect(page.getByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeVisible();

    await signIn(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Mi cuenta' })).toBeVisible();
    expect(address(page)).toBe(under('admin/cuenta/?seccion=seguridad'));
    expect(api.bodies('POST /auth/v1/token')[0]).toMatchObject({ email: EMAIL });
  });

  test('signing in with no `next` opens Inicio at /app/admin/', async ({ page }) => {
    await backend(page);
    await page.goto('admin/acceso/');
    await signIn(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
    expect(address(page)).toBe(under('admin/'));
  });

  test('the legacy email contract is honoured on /app/admin/', async ({ page }) => {
    const api = await mockSupabase(page, {
      'GET /auth/v1/settings': { json: { external: { email: true } } },
      'POST /auth/v1/verify': { json: sessionResponse({ aal: 'aal1' }) },
      'GET /rest/v1/profiles': { json: profileResponse() },
      'GET /auth/v1/user': { json: userResponse([]) },
    });
    await page.goto('admin/?action=accept-invite&token_hash=pkce_app0a1b2c&type=invite');
    await expect(page.getByRole('heading', { level: 1, name: 'Activa tu cuenta' })).toBeVisible();
    expect(address(page)).toBe(under('admin/acceso/invitacion/'));
    expect(api.bodies('POST /auth/v1/verify')).toEqual([
      expect.objectContaining({ token_hash: 'pkce_app0a1b2c', type: 'invite' }),
    ]);
  });

  test('Google: the callback is /app/admin/acceso/oauth/, and the code is exchanged there', async ({
    page,
  }) => {
    const api = await mockSupabase(page, {
      ...staffHandlers({ ...DEVELOPER, aal: 'aal1', factors: [] }),
      'GET /auth/v1/settings': { json: { external: { google: true } } },
      'POST /auth/v1/token': { json: sessionResponse({ aal: 'aal1' }) },
    });
    // The provider's round trip in one hop (see admin-acceso.spec.ts): a page
    // that sends the browser on to the callback. Newest route first.
    let redirectTo = '';
    await page.route(
      (url) => url.pathname.endsWith('/__supabase/auth/v1/authorize'),
      async (route) => {
        redirectTo = new URL(route.request().url()).searchParams.get('redirect_to') ?? '';
        await route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><meta http-equiv="refresh" content="0;url=${under('admin/acceso/oauth/')}?code=app-auth-code">`,
        });
      },
    );
    await page.goto('admin/acceso/');
    await page.getByRole('button', { name: 'Continuar con Google' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Protege tu cuenta' })).toBeVisible();
    expect(redirectTo).toBe(`${APP_ORIGIN}${under('admin/acceso/oauth/')}`);
    expect(address(page)).toBe(under('admin/acceso/verificar/'));
    expect(api.bodies('POST /auth/v1/token')[0]).toMatchObject({ auth_code: 'app-auth-code' });
  });
});

test.describe('signed in', () => {
  // The sidebar, not the drawer: the nav's links are on screen in every project.
  test.use({ viewport: { width: 1280, height: 900 } });

  const nav = (page: Page) => page.getByRole('navigation', { name: 'Navegación del panel' });

  test('the nav stays under /app; "Abrir panel actual" is the site-root /admin/', async ({
    page,
  }) => {
    await staffBackend(page, DEVELOPER);
    await page.goto('admin/');
    await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();

    await expect(nav(page).getByRole('link', { name: 'Inicio' })).toHaveAttribute(
      'href',
      under('admin/'),
    );
    await expect(nav(page).getByRole('link', { name: 'Mi cuenta' })).toHaveAttribute(
      'href',
      under('admin/cuenta/'),
    );
    await expect(nav(page).getByRole('link', { name: 'Abrir panel actual' })).toHaveAttribute(
      'href',
      '/admin/',
    );

    await nav(page).getByRole('link', { name: 'Mi cuenta' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Mi cuenta' })).toBeVisible();
    expect(address(page)).toBe(under('admin/cuenta/'));
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
    expect(address(page)).toBe(under('admin/'));
  });

  test('logout leaves for /app/admin/acceso/ with the notice', async ({ page }) => {
    const api = await staffBackend(page, DEVELOPER);
    await page.goto('admin/');
    await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    const dialog = page.getByRole('dialog', { name: '¿Cerrar sesión?' });
    await dialog.getByRole('button', { name: 'Cerrar sesión' }).click();

    await page.waitForURL((url) => url.pathname === under('admin/acceso/'));
    await expect(page.getByRole('status')).toHaveText(/Sesión cerrada\./);
    expect(api.calls()).toContain('POST /auth/v1/logout');
  });
});
