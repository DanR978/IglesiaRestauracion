// S37 — the admin shell in real browsers, against `vite preview` (base '').
// What jsdom cannot show: the prerendered shell is a real file that boots
// (D-036) and carries noindex; a signed-out visit is turned to the sign-in
// page; and, with a mocked signed-in session, the rendered shell — landmarks,
// nav, the drawer at 360px with the Back gesture, logout, the expired screen,
// the sticky topbar's scroll padding, no sideways scroll, axe in both themes.
//
// No backend is contacted: the e2e build's Supabase is the preview itself,
// under SUPABASE_PATH (playwright.config.ts, S39) — the few endpoints the
// shell uses are answered here; every request to another origin than the
// preview and the pinned CDN is aborted and recorded. The session is seeded in
// localStorage before the app boots (a 3-part JWT at aal2: the store reads
// the level from the token, with no network call).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Request } from '@playwright/test';
import { SUPABASE_PATH } from './helpers/supabase';

/**
 * supabase-js's default storage key, `sb-<first label of the Supabase host>-auth-token`
 * — the session the legacy /admin shares (D-040). The e2e build's host is localhost.
 */
const STORAGE_KEY = 'sb-localhost-auth-token';
const CDN_ORIGIN = 'https://cdnjs.cloudflare.com';
const ADMIN_THEME_KEY = 'ird.app.admin.theme';

const USER_ID = '6f1c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f';
const PROFILE = {
  id: USER_ID,
  display_name: 'Ana Pérez',
  role: 'admin',
  allowed_tabs: [],
  ministry_id: null,
  ministry_ids: [],
  preset_id: null,
  avatar_url: null,
  created_at: '2026-01-01T00:00:00Z',
  ministries: null,
};

const base64url = (value: object | string) =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

/** A session as supabase-js stores it, valid for an hour, two-step verified. */
function storedSession(): object {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    aud: 'authenticated',
    exp: now + 3600,
    iat: now,
    sub: USER_ID,
    email: 'ana@example.org',
    role: 'authenticated',
    aal: 'aal2',
    amr: [
      { method: 'totp', timestamp: now },
      { method: 'password', timestamp: now },
    ],
    session_id: '0b0e2f6c-9c4d-4f8e-9a1b-2c3d4e5f6a7b',
  };
  return {
    // auth-js checks each part is base64url before it reads the claims; nothing verifies the signature.
    access_token: [{ alg: 'HS256', typ: 'JWT' }, claims, 'e2e-mock-signature']
      .map(base64url)
      .join('.'),
    refresh_token: 'refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    user: {
      id: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'ana@example.org',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      factors: [{ id: 'f-1', status: 'verified', factor_type: 'totp' }],
      created_at: '2026-01-01T00:00:00Z',
    },
  };
}

interface Backend {
  /** Requests answered from the mock, as "METHOD /path". */
  readonly answered: string[];
  /** Requests to an origin the page has no business with — aborted. */
  readonly refused: string[];
}

/** Answer the app's Supabase (on the preview); refuse everything off the preview origin. */
async function fakeBackend(page: Page, baseURL: string | undefined): Promise<Backend> {
  const preview = new URL(baseURL ?? 'http://localhost').origin;
  const backend: Backend = { answered: [], refused: [] };
  await page.route(
    (url) =>
      (url.origin !== preview && url.origin !== CDN_ORIGIN) ||
      url.pathname.startsWith(`${SUPABASE_PATH}/`),
    async (route) => {
      const request: Request = route.request();
      const url = new URL(request.url());
      if (url.origin !== preview) {
        backend.refused.push(`${request.method()} ${url.pathname} @ ${url.origin}`);
        return route.abort();
      }
      const path = url.pathname.slice(SUPABASE_PATH.length);
      const call = `${request.method()} ${path}`;
      backend.answered.push(call);
      if (path === '/rest/v1/profiles' && request.method() === 'GET') {
        return route.fulfill({ status: 200, json: [PROFILE] });
      }
      if (path === '/auth/v1/logout') return route.fulfill({ status: 204 });
      if (path === '/auth/v1/settings') {
        return route.fulfill({ status: 200, json: { external: {} } });
      }
      return route.fulfill({ status: 404, json: { message: 'not mocked' } });
    },
  );
  return backend;
}

/** Store the session (and a forced admin theme) before any of the app's scripts run. */
async function signIn(page: Page, theme?: 'light' | 'dark'): Promise<void> {
  await page.addInitScript(
    ({ key, session, themeKey, theme: forced }) => {
      try {
        // Only once per test: a later page load must see what the app left there.
        if (sessionStorage.getItem('e2e-seeded')) return;
        sessionStorage.setItem('e2e-seeded', '1');
        localStorage.setItem(key, JSON.stringify(session));
        if (forced) localStorage.setItem(themeKey, forced);
      } catch {
        // Storage refused: the shell assertions below fail loudly instead.
      }
    },
    { key: STORAGE_KEY, session: storedSession(), themeKey: ADMIN_THEME_KEY, theme },
  );
}

async function openShell(page: Page, theme?: 'light' | 'dark'): Promise<void> {
  await signIn(page, theme);
  await page.goto('/admin/');
  await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
  if (theme) await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

const navigation = (page: Page) => page.getByRole('navigation', { name: 'Navegación del panel' });
const burger = (page: Page) => page.getByRole('button', { name: 'Abrir menú' });
const drawer = (page: Page) => page.getByRole('dialog', { name: 'Menú del panel' });

async function seriousViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

const scrollsSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

test.describe('the prerendered admin shell', () => {
  test('is a real page that carries noindex and a title before the app boots', async ({
    request,
  }) => {
    const response = await request.get('/admin/');
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(html).toContain('<title>Panel · Iglesia Restauración Divina</title>');
    // Client-rendered (ssr = false): nothing of the panel is in the file.
    expect(html).not.toContain('adm-shell');
  });

  test('a signed-out visit is turned to the sign-in page, keeping where it was going', async ({
    page,
    baseURL,
  }) => {
    await fakeBackend(page, baseURL);

    await page.goto('/admin/');
    await page.waitForURL((url) => url.pathname === '/admin/acceso/');

    await page.goto('/admin/?seccion=resumen');
    await page.waitForURL(
      (url) =>
        url.pathname === '/admin/acceso/' &&
        url.searchParams.get('next') === '/admin/?seccion=resumen',
    );
  });

  test('the legacy email contract is honoured before anything else', async ({ page, baseURL }) => {
    await fakeBackend(page, baseURL);
    // invitacion/ (S39) scrubs the one-time query from the address the moment
    // it starts, so the proof is what it spends: the token from this URL.
    const spent = page.waitForRequest(
      (request) => request.method() === 'POST' && request.url().endsWith('/auth/v1/verify'),
    );

    await page.goto('/admin/?action=accept-invite&token_hash=abc123&type=invite');
    await page.waitForURL((url) => url.pathname === '/admin/acceso/invitacion/');
    expect((await spent).postDataJSON()).toMatchObject({ token_hash: 'abc123', type: 'invite' });
  });
});

test.describe('signed in — desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('renders the shell: landmarks, grouped nav, the legacy link, the account', async ({
    page,
    baseURL,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const backend = await fakeBackend(page, baseURL);
    await openShell(page);

    await expect(page).toHaveTitle('Inicio · Panel · Iglesia Restauración Divina');
    await expect(page.getByRole('banner')).toContainText('Iglesia Restauración Divina');
    await expect(burger(page)).toBeHidden();
    const nav = navigation(page);
    await expect(nav.getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Mi cuenta' })).toHaveAttribute(
      'href',
      '/admin/cuenta/',
    );
    const legacy = nav.getByRole('link', { name: 'Abrir panel actual' });
    await expect(legacy).toHaveAttribute('href', '/admin/');
    await expect(legacy).toHaveAccessibleDescription(
      'Las demás secciones siguen en el panel actual.',
    );
    await expect(page.getByText('Ana Pérez')).toBeVisible();
    await expect(page.getByText('Administrador')).toBeVisible();
    await expect(page.getByRole('main')).toHaveAttribute('id', 'contenido');

    // The sticky topbar's height is the page's scroll padding (WCAG 2.4.11).
    const padding = await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollPaddingTop,
    );
    const bar = await page.getByRole('banner').boundingBox();
    expect(Number.parseFloat(padding)).toBeCloseTo(bar?.height ?? 0, 0);
    expect(bar?.height).toBeCloseTo(60, 0);

    expect(await scrollsSideways(page)).toBe(false);
    expect(backend.refused).toEqual([]);
    // Only the profile is read (twice in WebKit, where supabase-js reports the
    // restored session while the store's first read is still running).
    expect(backend.answered.length).toBeGreaterThan(0);
    expect(new Set(backend.answered)).toEqual(new Set(['GET /rest/v1/profiles']));
    expect(errors).toEqual([]);
  });

  test('the skip link is the first stop and lands on the content', async ({
    page,
    baseURL,
    browserName,
  }) => {
    await fakeBackend(page, baseURL);
    await openShell(page);
    const skip = page.getByRole('link', { name: 'Saltar al contenido' });

    if (browserName === 'webkit') {
      // WebKit does not Tab to links by default: check where the link lands only.
      await skip.focus();
    } else {
      await page.keyboard.press('Tab');
      await expect(skip).toBeFocused();
    }
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
  });

  test('a reload keeps the page (every admin route is a real file)', async ({ page, baseURL }) => {
    await fakeBackend(page, baseURL);
    await openShell(page);

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
    await expect(navigation(page)).toBeVisible();
  });

  test('logout asks, signs this device out and opens the sign-in page with the notice', async ({
    page,
    baseURL,
  }) => {
    const backend = await fakeBackend(page, baseURL);
    await openShell(page);

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    const dialog = page.getByRole('dialog', { name: '¿Cerrar sesión?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cerrar sesión' }).click();

    // The sign-in page (S39) reads `?aviso=` and then scrubs it from the
    // address: the notice it shows is the proof the reason arrived.
    await page.waitForURL((url) => url.pathname === '/admin/acceso/');
    await expect(page.getByRole('status')).toHaveText(/Sesión cerrada\./);
    expect(backend.answered).toContain('POST /auth/v1/logout');
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  });

  test('a session ended elsewhere shows "Tu sesión expiró" with a way back in', async ({
    page,
    baseURL,
  }) => {
    await fakeBackend(page, baseURL);
    await openShell(page);

    // Another tab signs out: supabase-js tells every tab on its channel.
    await page.evaluate((key) => {
      const channel = new BroadcastChannel(key);
      channel.postMessage({ event: 'SIGNED_OUT', session: null });
      channel.close();
    }, STORAGE_KEY);

    const heading = page.getByRole('heading', { level: 1, name: 'Tu sesión expiró' });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    await expect(navigation(page)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Iniciar sesión de nuevo' })).toHaveAttribute(
      'href',
      '/admin/acceso/?aviso=sesion-expirada',
    );
    await expect(page).toHaveTitle('Tu sesión expiró · Panel · Iglesia Restauración Divina');
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`axe: no serious or critical violations (${theme})`, async ({ page, baseURL }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await fakeBackend(page, baseURL);
      await openShell(page, theme);

      expect(await seriousViolations(page)).toEqual([]);
    });
  }
});

test.describe('signed in — 360px, the drawer', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('the topbar shows the burger and the page title; nothing scrolls sideways', async ({
    page,
    baseURL,
  }) => {
    await fakeBackend(page, baseURL);
    await openShell(page);

    await expect(burger(page)).toBeVisible();
    await expect(burger(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.adm-topbar__title')).toHaveText('Inicio');
    await expect(page.locator('.adm-topbar__brand')).toBeHidden();
    // Closed, the drawer is out of reach: inert, and entirely off-screen.
    const sidebar = page.locator('.adm-sidebar');
    expect(await sidebar.evaluate((el) => (el as HTMLElement).inert)).toBe(true);
    const box = await sidebar.boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(0);
    const bar = await page.getByRole('banner').boundingBox();
    expect(bar?.height).toBeCloseTo(56, 0);
    expect(await scrollsSideways(page)).toBe(false);
  });

  test('opens as a dialog that holds focus; Escape closes it and focus returns', async ({
    page,
    baseURL,
  }) => {
    await fakeBackend(page, baseURL);
    await openShell(page);

    await burger(page).click();
    const panel = drawer(page);
    await expect(panel).toBeVisible();
    await expect(burger(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toBeFocused();
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');

    // Tab never leaves it.
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      expect(
        await panel.evaluate((el) => el.contains(document.activeElement)),
        `Tab ${i + 1} stays in the drawer`,
      ).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(drawer(page)).toHaveCount(0);
    await expect(burger(page)).toBeFocused();
    await expect(burger(page)).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');
    expect(await scrollsSideways(page)).toBe(false);
  });

  test('Back closes it without leaving the page', async ({ page, baseURL }) => {
    await fakeBackend(page, baseURL);
    await openShell(page);
    const here = page.url();

    await burger(page).click();
    await expect(drawer(page)).toBeVisible();
    await page.goBack();

    await expect(drawer(page)).toHaveCount(0);
    expect(page.url()).toBe(here);
    await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
  });

  test('the scrim and "Cerrar menú" close it', async ({ page, baseURL }) => {
    await fakeBackend(page, baseURL);
    await openShell(page);

    await burger(page).click();
    await expect(drawer(page)).toBeVisible();
    // The scrim, beside the 82vw panel.
    await page.mouse.click(345, 400);
    await expect(drawer(page)).toHaveCount(0);

    await burger(page).click();
    await drawer(page).getByRole('button', { name: 'Cerrar menú' }).click();
    await expect(drawer(page)).toHaveCount(0);
    await expect(burger(page)).toBeFocused();
  });

  test('picking a page closes it, and Back does not bring it back', async ({ page, baseURL }) => {
    await fakeBackend(page, baseURL);
    await openShell(page);

    await burger(page).click();
    await drawer(page).getByRole('link', { name: 'Inicio' }).click();
    await expect(drawer(page)).toHaveCount(0);

    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
    await expect(drawer(page)).toHaveCount(0);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`axe with the drawer open: no serious or critical violations (${theme})`, async ({
      page,
      baseURL,
    }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await fakeBackend(page, baseURL);
      await openShell(page, theme);
      await burger(page).click();
      await expect(drawer(page)).toBeVisible();

      expect(await seriousViolations(page)).toEqual([]);
    });
  }
});
