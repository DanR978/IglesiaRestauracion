// S45 — Mi cuenta (/admin/cuenta/) in a real browser, every engine, inside the
// S37 shell, with the backend MOCKED: a signed-in, two-step-verified session
// is seeded in localStorage before the app boots, and every request that
// leaves the preview origin is answered here (profile, auth user, logout) or
// refused — nothing reaches a Supabase project, local or production. Checks
// what jsdom can't: the sections follow `?seccion=` through the real router
// (links, Back, a deep link); an unsaved name survives a switch of section,
// while a trip to another page asks first; "Cerrar sesión en todos los
// dispositivos" ends the other sessions, then this one, and leaves for the
// sign-in page with its notice; nothing scrolls sideways at 360px; axe finds
// nothing serious in either theme on the populated page; and Preferencias
// paints the admin's own theme and keeps it across a reload (D-038).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { gotoWithTheme } from './helpers/theme';
import { STORAGE_KEY, supabasePath } from './helpers/supabase';

/** The build's Supabase URL (web/.env locally, the CI env in CI): its first host label names the session key. */
const CDN_ORIGIN = 'https://cdnjs.cloudflare.com';

const USER_ID = '6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';
const EMAIL = 'ana@example.org';
const NOW = Math.floor(Date.now() / 1000);
const YEAR = 365 * 24 * 3600;

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** A 3-part token auth-js can decode: aal2 after password + TOTP. Never verified here. */
const ACCESS_TOKEN = [
  base64url({ alg: 'HS256', typ: 'JWT' }),
  base64url({
    sub: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: EMAIL,
    aal: 'aal2',
    amr: [
      { method: 'password', timestamp: NOW },
      { method: 'totp', timestamp: NOW },
    ],
    session_id: 'e2e-session',
    iat: NOW,
    exp: NOW + YEAR,
  }),
  // auth-js checks each segment is well-formed base64url; nothing checks the signature.
  Buffer.from('e2e-signature').toString('base64url'),
].join('.');

const FACTORS = [
  {
    id: 'f-1',
    friendly_name: 'Teléfono de Ana',
    factor_type: 'totp',
    status: 'verified',
    created_at: '2026-03-01T12:00:00Z',
    updated_at: '2026-03-01T12:00:00Z',
  },
  {
    id: 'f-2',
    friendly_name: 'Tableta',
    factor_type: 'totp',
    status: 'verified',
    created_at: '2026-05-01T12:00:00Z',
    updated_at: '2026-05-01T12:00:00Z',
  },
];

const USER = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: EMAIL,
  email_confirmed_at: '2026-01-15T12:00:00Z',
  created_at: '2026-01-15T12:00:00Z',
  last_sign_in_at: '2026-10-19T12:00:00Z',
  app_metadata: { provider: 'email', providers: ['email', 'google'] },
  user_metadata: {},
  identities: [
    {
      id: 'i-email',
      identity_id: 'ii-email',
      user_id: USER_ID,
      provider: 'email',
      created_at: '2026-01-15T12:00:00Z',
      last_sign_in_at: '2026-10-19T12:00:00Z',
    },
    {
      id: 'i-google',
      identity_id: 'ii-google',
      user_id: USER_ID,
      provider: 'google',
      created_at: '2026-06-01T12:00:00Z',
      last_sign_in_at: '2026-10-18T12:00:00Z',
    },
  ],
  factors: FACTORS,
};

const SESSION = {
  access_token: ACCESS_TOKEN,
  token_type: 'bearer',
  expires_in: YEAR,
  expires_at: NOW + YEAR,
  refresh_token: 'e2e-refresh-token',
  user: USER,
};

const PROFILE = {
  id: USER_ID,
  display_name: 'Ana Pérez',
  role: 'admin',
  allowed_tabs: [],
  ministry_id: null,
  ministry_ids: [],
  preset_id: '7a1c4c55-0d6b-4b5e-9f3a-1e2d3c4b5a69',
  avatar_url: null,
  created_at: '2026-01-15T12:00:00Z',
  ministries: null,
  role_presets: { name: 'Desarrollador' },
};

interface Backend {
  /** Requests to anything not answered here, as "METHOD origin/path" — aborted. */
  readonly refused: string[];
  /** The `scope` of each sign-out request, in order. */
  readonly logouts: string[];
}

/**
 * Answer every request that leaves the preview origin: the reads Mi cuenta
 * and the shell make, an empty list for any other REST read, the sign-outs,
 * and a refusal for the rest.
 */
async function mockBackend(page: Page, baseURL: string): Promise<Backend> {
  const backend: Backend = { refused: [], logouts: [] };
  const preview = new URL(baseURL).origin;
  await page.route(
    (url) => supabasePath(url) !== null || (url.origin !== preview && url.origin !== CDN_ORIGIN),
    async (route: Route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = supabasePath(url);
      const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*', ...headers },
          body: JSON.stringify(body),
        });
      if (request.method() === 'OPTIONS') {
        return route.fulfill({
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-headers': '*',
            'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          },
        });
      }
      if (path === '/rest/v1/profiles') {
        const single = (request.headers()['accept'] ?? '').includes('vnd.pgrst.object');
        return json(200, single ? PROFILE : [PROFILE]);
      }
      if (path === '/auth/v1/user') return json(200, USER);
      if (path === '/auth/v1/logout') {
        backend.logouts.push(url.searchParams.get('scope') ?? 'global');
        return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      }
      if (path?.startsWith('/rest/v1/') && request.method() === 'GET') {
        return json(200, [], { 'content-range': '*/0' });
      }
      backend.refused.push(`${request.method()} ${url.origin}${url.pathname}`);
      return route.abort('blockedbyclient');
    },
  );
  await page.addInitScript(
    ({ key, session }) => {
      try {
        localStorage.setItem(key, JSON.stringify(session));
      } catch {
        // Storage refused: the page stays on its skeleton and the test fails loudly.
      }
    },
    { key: STORAGE_KEY, session: SESSION },
  );
  return backend;
}

const ready = (page: Page) =>
  expect(page.getByRole('heading', { level: 3, name: 'Datos de la cuenta' })).toBeVisible();

const sectionLink = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Secciones de Mi cuenta' }).getByRole('link', { name });

async function blockingViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('shows the signed-in account on Perfil, each fact once', async ({ page, baseURL }) => {
  const { refused } = await mockBackend(page, baseURL!);
  await page.goto('/admin/cuenta/');
  await ready(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Mi cuenta' })).toBeVisible();
  await expect(sectionLink(page, 'Perfil')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('textbox', { name: /Nombre visible/ })).toHaveValue('Ana Pérez');
  await expect(page.getByText(EMAIL, { exact: true })).toHaveCount(1);
  await expect(page.getByText('Desarrollador')).toBeVisible();
  await expect(page.getByText(/Zona horaria|Idioma/)).toHaveCount(0);
  expect(refused).toEqual([]);
});

test('sections follow the URL: links, Back, and a deep link', async ({ page, baseURL }) => {
  await mockBackend(page, baseURL!);
  await page.goto('/admin/cuenta/');
  await ready(page);

  await sectionLink(page, 'Seguridad').click();
  await expect(page).toHaveURL(/\?seccion=seguridad$/);
  await expect(sectionLink(page, 'Seguridad')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('region', { name: 'Seguridad' })).toBeVisible();
  await expect(page.getByText('Tableta')).toBeVisible();
  await expect(page.getByText('Correo y contraseña')).toBeVisible();

  await page.goBack();
  await expect(page).not.toHaveURL(/seccion=seguridad/);
  await expect(page.getByRole('region', { name: 'Perfil' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Seguridad' })).toBeHidden();

  await page.goto('/admin/cuenta/?seccion=preferencias');
  await expect(page.getByRole('radiogroup', { name: 'Tema del panel' })).toBeVisible();
  await expect(sectionLink(page, 'Preferencias')).toHaveAttribute('aria-current', 'page');
});

test('an unsaved name survives a switch of section; another page asks first', async ({
  page,
  baseURL,
}) => {
  await mockBackend(page, baseURL!);
  await page.goto('/admin/cuenta/');
  await ready(page);
  const name = page.getByRole('textbox', { name: /Nombre visible/ });
  await name.fill('Ana María Pérez');

  await sectionLink(page, 'Seguridad').click();
  await expect(page).toHaveURL(/\?seccion=seguridad$/);
  await sectionLink(page, 'Perfil').click();
  await expect(name).toHaveValue('Ana María Pérez');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // A link to another page of the app, handled by the client router.
  await page.evaluate(() => {
    const link = document.createElement('a');
    link.href = '/kit/button/';
    link.textContent = 'Otra página';
    link.id = 'e2e-elsewhere';
    document.querySelector('main')?.append(link);
  });
  const leave = page.getByRole('dialog', { name: '¿Salir sin guardar los cambios?' });

  await page.locator('#e2e-elsewhere').click();
  await expect(leave).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/cuenta\/\?seccion=perfil$/);
  await leave.getByRole('button', { name: 'Seguir editando' }).click();
  await expect(leave).toBeHidden();
  await expect(name).toHaveValue('Ana María Pérez');

  await page.locator('#e2e-elsewhere').click();
  await leave.getByRole('button', { name: 'Salir sin guardar' }).click();
  await expect(page).toHaveURL(/\/kit\/button\/$/);
});

test('"Cerrar sesión en todos los dispositivos" ends the others, then this one, and leaves', async ({
  page,
  baseURL,
}) => {
  const backend = await mockBackend(page, baseURL!);
  await page.goto('/admin/cuenta/?seccion=seguridad');
  await expect(page.getByRole('region', { name: 'Seguridad' })).toBeVisible();

  await page.getByRole('button', { name: 'Cerrar sesión en todos los dispositivos' }).click();
  const dialog = page.getByRole('dialog', { name: '¿Cerrar sesión en todos los dispositivos?' });
  await dialog.getByRole('button', { name: 'Cerrar sesión en todos' }).click();

  // The shell's signOutAndLeave: a full load of the sign-in page, with its notice (S37).
  await expect(page).toHaveURL(/\/admin\/acceso\/\?aviso=sesion-cerrada$/);
  expect(backend.logouts).toEqual(['others', 'local']);
});

test('nothing scrolls sideways at 360px, in any section', async ({ page, baseURL }) => {
  await mockBackend(page, baseURL!);
  await page.setViewportSize({ width: 360, height: 780 });
  for (const section of ['perfil', 'seguridad', 'preferencias']) {
    await page.goto(`/admin/cuenta/?seccion=${section}`);
    await expect(sectionLink(page, 'Perfil')).toBeVisible();
    await expect(page.locator('.ird-state--loading')).toHaveCount(0);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `?seccion=${section} scrolls sideways`).toBeLessThanOrEqual(0);
  }
});

for (const theme of ['light', 'dark'] as const) {
  test(`axe finds nothing serious on the populated page — ${theme}`, async ({ page, baseURL }) => {
    await mockBackend(page, baseURL!);
    for (const section of ['perfil', 'seguridad', 'preferencias']) {
      await gotoWithTheme(page, `/admin/cuenta/?seccion=${section}`, theme);
      await expect(page.locator('.ird-state--loading')).toHaveCount(0);
      await expect(sectionLink(page, 'Perfil')).toBeVisible();
      expect(await blockingViolations(page), `axe (${theme}) on ?seccion=${section}`).toEqual([]);
    }
  });
}

test('Preferencias paints the admin theme and keeps it across a reload (D-038)', async ({
  page,
  baseURL,
}) => {
  await mockBackend(page, baseURL!);
  await page.goto('/admin/cuenta/?seccion=preferencias');
  await expect(page.getByRole('radiogroup', { name: 'Tema del panel' })).toBeVisible();

  // The radio covers its whole segment, so the segment is what a tap lands on.
  await page.getByRole('radio', { name: 'Oscuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('ird.app.admin.theme'))).toBe('dark');
  expect(await page.evaluate(() => localStorage.getItem('ird.theme'))).toBeNull();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radio', { name: 'Oscuro' })).toBeChecked();

  await page.getByRole('radio', { name: 'Sistema' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
});
