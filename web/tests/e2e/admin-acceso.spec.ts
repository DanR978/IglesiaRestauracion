// S39 — the sign-in pages in a real browser, all four projects. Signed out,
// with every Supabase call answered in-process (helpers/supabase.ts — the e2e
// build's Supabase is the preview under /__supabase): never a real backend,
// and the network guard proves nothing left the preview origin.
//
//   · each acceso/ page renders (or moves on) signed out, at 360px without
//     sideways scroll, h1 focused, one help line
//   · Google through the real signInWithOAuth: /authorize answered with a 302
//     to the callback, which exchanges the code (PKCE) and goes on to enroll
//   · the callback's error mapping, from the query and the fragment
//   · the legacy email contract (`?action=…&token_hash=…&type=…`, D-001) on
//     invitacion/ and restablecer/, scrubbed before anything is sent; a
//     recovery with an authenticator asks for the code BEFORE the password
//   · recuperar/'s non-committal answer and the email carried in memory
import { expect, test, type Page } from '@playwright/test';
import { watchOffOriginRequests } from './helpers/network';
import {
  gotrueError,
  mockSupabase,
  profileResponse,
  sessionResponse,
  userResponse,
  type Handler,
} from './helpers/supabase';

const HELP = '¿Problemas para entrar? Escribe a contactanos@irdlex.org';
const NO_PROVIDERS: Handler = { json: { external: { email: true } } };

/** Supabase answered for a signed-out visit, plus `extra`. */
function supabase(page: Page, extra: Record<string, Handler> = {}) {
  return mockSupabase(page, { 'GET /auth/v1/settings': NO_PROVIDERS, ...extra });
}

const address = (page: Page) => {
  const url = new URL(page.url());
  return url.pathname + url.search + url.hash;
};

async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

let offOrigin: () => string[];

test.beforeEach(async ({ page, baseURL }) => {
  offOrigin = watchOffOriginRequests(page, baseURL);
});

test.afterEach(() => {
  expect(offOrigin(), 'requests outside the preview origin and the pinned CDN').toEqual([]);
});

test.describe('signed out, at 360px', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('acceso/ — the sign-in form, h1 focused, one help line', async ({ page }) => {
    await supabase(page);
    await page.goto('/admin/acceso/');
    const heading = page.getByRole('heading', { level: 1, name: 'Iniciar sesión' });
    await expect(heading).toBeFocused();
    await expect(page).toHaveTitle('Iniciar sesión · Panel · Iglesia Restauración Divina');
    await expect(page.getByLabel('Correo electrónico')).toHaveAttribute('autocomplete', 'username');
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveAttribute(
      'autocomplete',
      'current-password',
    );
    await expect(page.getByRole('contentinfo')).toHaveText(HELP);
    await expect(page.getByRole('button', { name: /Continuar con/ })).toHaveCount(0);
    await expectNoSidewaysScroll(page);
  });

  test('recuperar/ — the form', async ({ page }) => {
    await supabase(page);
    await page.goto('/admin/acceso/recuperar/');
    await expect(
      page.getByRole('heading', { level: 1, name: '¿Olvidaste tu contraseña?' }),
    ).toBeFocused();
    await expect(page.getByRole('contentinfo')).toHaveText(HELP);
    await expectNoSidewaysScroll(page);
  });

  test('invitacion/ and restablecer/ without a link say what to do next', async ({ page }) => {
    await supabase(page);
    await page.goto('/admin/acceso/invitacion/');
    await expect(page.getByRole('alert')).toContainText(
      'Pide al administrador que te envíe una invitación nueva.',
    );
    await page.goto('/admin/acceso/restablecer/');
    await expect(page.getByRole('link', { name: 'Pedir un enlace nuevo' })).toBeVisible();
    await expectNoSidewaysScroll(page);
  });

  test('oauth/ without a code or an error: incomplete', async ({ page }) => {
    await supabase(page);
    await page.goto('/admin/acceso/oauth/');
    await expect(
      page.getByRole('heading', { level: 1, name: 'No pudimos iniciar tu sesión' }),
    ).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('incompleto');
    await expectNoSidewaysScroll(page);
  });

  test('verificar/ and sin-acceso/ send a signed-out visit to sign in', async ({ page }) => {
    await supabase(page);
    await page.goto('/admin/acceso/verificar/');
    await expect(page).toHaveURL(/\/admin\/acceso\/$/);
    await page.goto('/admin/acceso/sin-acceso/');
    await expect(page).toHaveURL(/\/admin\/acceso\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeVisible();
  });
});

test.describe('sign in', () => {
  test('a refused password is an Alert in Spanish', async ({ page }) => {
    const api = await supabase(page, {
      'POST /auth/v1/token': gotrueError(400, 'invalid_credentials', 'Invalid login credentials'),
    });
    await page.goto('/admin/acceso/');
    await page.getByLabel('Correo electrónico').fill('ana@example.org');
    await page.getByLabel('Contraseña', { exact: true }).fill('no-es-esta');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('alert')).toHaveText(/Correo o contraseña incorrectos\./);
    await expect(page.getByText('Invalid login credentials')).toHaveCount(0);
    expect(api.bodies('POST /auth/v1/token')[0]).toMatchObject({
      email: 'ana@example.org',
      password: 'no-es-esta',
    });
  });

  test('Spanish validation before anything is sent', async ({ page }) => {
    const api = await supabase(page);
    await page.goto('/admin/acceso/');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('Escribe tu correo electrónico.')).toBeVisible();
    await expect(page.getByLabel('Correo electrónico')).toBeFocused();
    expect(api.calls()).not.toContain('POST /auth/v1/token');
  });

  test("the shell's notice (#lib/auth/notice) shows once and leaves the address", async ({
    page,
  }) => {
    await supabase(page);
    await page.goto('/admin/acceso/?next=%2Fadmin%2F&aviso=sesion-expirada');
    await expect(page.getByRole('status')).toHaveText(/Tu sesión expiró\./);
    await expect.poll(() => address(page)).toBe('/admin/acceso/?next=%2Fadmin%2F');
    await page.goto('/admin/acceso/?aviso=sesion-cerrada');
    await expect(page.getByRole('status')).toHaveText(/Sesión cerrada\./);
    await expect.poll(() => address(page)).toBe('/admin/acceso/');
  });

  test('the email goes to recuperar/ in memory, never in the URL', async ({ page }) => {
    const api = await supabase(page, { 'POST /auth/v1/recover': { json: {} } });
    await page.goto('/admin/acceso/');
    await page.getByLabel('Correo electrónico').fill('ana@example.org');
    await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
    await expect(page).toHaveURL(/\/admin\/acceso\/recuperar\/$/);
    expect(page.url()).not.toContain('ana');
    await expect(page.getByLabel('Correo electrónico')).toHaveValue('ana@example.org');

    await page.getByRole('button', { name: 'Enviar enlace' }).click();
    await expect(page.getByRole('status')).toHaveText(
      /Si la cuenta existe, te enviamos un enlace para restablecer tu contraseña\./,
    );
    expect(api.bodies('POST /auth/v1/recover')[0]).toMatchObject({ email: 'ana@example.org' });
  });

  test('recuperar/ says so when there were too many attempts', async ({ page }) => {
    await supabase(page, {
      'POST /auth/v1/recover': gotrueError(429, 'over_email_send_rate_limit'),
    });
    await page.goto('/admin/acceso/recuperar/');
    await page.getByLabel('Correo electrónico').fill('ana@example.org');
    await page.getByRole('button', { name: 'Enviar enlace' }).click();
    await expect(page.getByRole('alert')).toHaveText(/Demasiados intentos\./);
  });
});

test.describe('Google and Microsoft (D-035)', () => {
  test('only the enabled providers, after the form, with the in-app browser hint', async ({
    page,
  }) => {
    await mockSupabase(page, {
      'GET /auth/v1/settings': { json: { external: { email: true, google: true, azure: true } } },
    });
    await page.goto('/admin/acceso/');
    await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continuar con Microsoft' })).toBeVisible();
    await expect(
      page.getByText(
        'Si Google o Microsoft no te dejan entrar desde otra app, abre esta página en Safari o Chrome.',
      ),
    ).toBeVisible();
  });

  test('Google round trip: /authorize → callback → code exchanged (PKCE) → enroll', async ({
    page,
    baseURL,
  }) => {
    const api = await mockSupabase(page, {
      'GET /auth/v1/settings': { json: { external: { google: true } } },
      'POST /auth/v1/token': { json: sessionResponse({ aal: 'aal1' }) },
      'GET /rest/v1/profiles': { json: profileResponse() },
      'GET /auth/v1/user': { json: userResponse([]) },
      'POST /auth/v1/factors': {
        json: {
          id: 'f-e2e',
          type: 'totp',
          friendly_name: 'IRD e2e',
          totp: {
            qr_code: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>',
            secret: 'JBSWY3DPEHPK3PXP',
            uri: 'otpauth://totp/IRD:ana@example.org?secret=JBSWY3DPEHPK3PXP',
          },
        },
      },
    });
    // The provider's round trip in one hop: an HTML page that sends the browser
    // on to the callback (Playwright's WebKit cannot fulfill a navigation with
    // a 3xx). Registered after mockSupabase: Playwright tries the newest route
    // first.
    let redirectTo = '';
    await page.route(
      (url) => url.pathname.endsWith('/__supabase/auth/v1/authorize'),
      async (route) => {
        const url = new URL(route.request().url());
        redirectTo = url.searchParams.get('redirect_to') ?? '';
        expect(url.searchParams.get('provider')).toBe('google');
        expect(url.searchParams.get('code_challenge_method')).toBe('s256');
        await route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><meta http-equiv="refresh" content="0;url=/admin/acceso/oauth/?code=e2e-auth-code">',
        });
      },
    );
    await page.goto('/admin/acceso/');
    await page.getByRole('button', { name: 'Continuar con Google' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Protege tu cuenta' })).toBeVisible();
    expect(redirectTo).toBe(`${baseURL}/admin/acceso/oauth/`);
    expect(address(page)).toBe('/admin/acceso/verificar/');
    const [exchange] = api.bodies('POST /auth/v1/token');
    expect(exchange).toMatchObject({ auth_code: 'e2e-auth-code' });
    expect((exchange as { code_verifier: string }).code_verifier).toMatch(/^[0-9a-f]{40,}$/);
    await expect(page.getByLabel('Clave de configuración')).toHaveValue('JBSW Y3DP EHPK 3PXP');
  });

  test.describe('the callback maps every failure, from the query or the fragment', () => {
    const CASES: Array<[string, string, RegExp]> = [
      [
        'a cancel at the provider',
        '?error=access_denied&error_description=The+user+denied+access',
        /Cancelaste el inicio de sesión\./,
      ],
      [
        'no invitation',
        '?error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed',
        /no tiene una invitación vigente/,
      ],
      [
        'no invitation, fragment only',
        '#error=access_denied&error_code=signup_disabled&sb=',
        /no tiene una invitación vigente/,
      ],
      [
        'an expired attempt',
        '?error=invalid_request&error_code=bad_oauth_state',
        /El enlace de inicio de sesión expiró\./,
      ],
      [
        'a code from another browser',
        '?code=e2e-auth-code',
        /Abre el enlace en el mismo navegador donde iniciaste sesión\./,
      ],
    ];
    for (const [label, tail, message] of CASES) {
      test(label, async ({ page }) => {
        const api = await supabase(page);
        await page.goto(`/admin/acceso/oauth/${tail}`);
        await expect(page.getByRole('alert')).toHaveText(message);
        expect(address(page)).toBe('/admin/acceso/oauth/');
        await expect(page.getByText(/Signups not allowed|denied access/)).toHaveCount(0);
        expect(api.calls()).not.toContain('POST /auth/v1/token');
      });
    }
  });
});

test.describe('email links — the legacy contract (D-001)', () => {
  test('invitacion/?action=accept-invite: scrubbed, spent, then a first password', async ({
    page,
  }) => {
    const api = await supabase(page, {
      'POST /auth/v1/verify': { json: sessionResponse({ aal: 'aal1' }) },
      'GET /rest/v1/profiles': { json: profileResponse() },
      'GET /auth/v1/user': { json: userResponse([]) },
    });
    await page.goto(
      '/admin/acceso/invitacion/?action=accept-invite&token_hash=pkce_e2e0a1b2c&type=invite',
    );
    await expect(page.getByRole('heading', { level: 1, name: 'Activa tu cuenta' })).toBeVisible();
    await expect(page.getByLabel('Contraseña nueva')).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
    await expect(page.getByLabel('Confirma la contraseña')).toBeVisible();
    expect(address(page)).toBe('/admin/acceso/invitacion/');
    expect(api.bodies('POST /auth/v1/verify')).toEqual([
      expect.objectContaining({ token_hash: 'pkce_e2e0a1b2c', type: 'invite' }),
    ]);
    await expectNoSidewaysScroll(page);
  });

  test('an expired or used invitation says what to do next', async ({ page }) => {
    await supabase(page, {
      'POST /auth/v1/verify': gotrueError(
        403,
        'otp_expired',
        'Email link is invalid or has expired',
      ),
    });
    await page.goto('/admin/acceso/invitacion/?token_hash=e2e0a1b2c&type=invite');
    await expect(page.getByRole('alert')).toHaveText(
      /El enlace expiró o ya se usó\. Pide al administrador que te envíe una invitación nueva\./,
    );
    expect(address(page)).toBe('/admin/acceso/invitacion/');
  });

  test('restablecer/?action=reset-password with an authenticator: the code BEFORE the password', async ({
    page,
  }) => {
    const verified = [{ id: 'f-1', status: 'verified' as const, factor_type: 'totp' as const }];
    const api = await supabase(page, {
      'POST /auth/v1/verify': { json: sessionResponse({ aal: 'aal1', factors: verified }) },
      'GET /rest/v1/profiles': { json: profileResponse() },
      'GET /auth/v1/user': { json: userResponse(verified) },
    });
    await page.goto(
      '/admin/acceso/restablecer/?action=reset-password&token_hash=pkce_e2e9f8e7d&type=recovery',
    );
    await expect(
      page.getByRole('heading', { level: 1, name: 'Verifica tu identidad' }),
    ).toBeVisible();
    await expect(page.getByLabel('Código de verificación')).toHaveAttribute(
      'autocomplete',
      'one-time-code',
    );
    await expect(page.getByLabel('Contraseña nueva')).toHaveCount(0);
    expect(address(page)).toBe('/admin/acceso/restablecer/');
    expect(api.bodies('POST /auth/v1/verify')).toEqual([
      expect.objectContaining({ token_hash: 'pkce_e2e9f8e7d', type: 'recovery' }),
    ]);
  });

  test('a recovery link opened on invitacion/ goes to restablecer/ unspent', async ({ page }) => {
    const api = await supabase(page, {
      'POST /auth/v1/verify': gotrueError(403, 'otp_expired'),
    });
    await page.goto(
      '/admin/acceso/invitacion/?action=reset-password&token_hash=e2e9f8e7d&type=recovery',
    );
    await expect(page.getByRole('link', { name: 'Pedir un enlace nuevo' })).toBeVisible();
    expect(address(page)).toBe('/admin/acceso/restablecer/');
    expect(api.bodies('POST /auth/v1/verify')).toEqual([
      expect.objectContaining({ token_hash: 'e2e9f8e7d', type: 'recovery' }),
    ]);
  });
});
