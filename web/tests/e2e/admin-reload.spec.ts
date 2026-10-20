// D-036 — every admin route is a real prerendered file, so a reload (or a
// bookmark, or a link opened again) lands on the same page: the host answers
// 200 with that route's shell, the app boots again, and the page renders its
// own content — never a 404, never a blank shell. Each route is reloaded in
// the state where it shows itself: Inicio and Mi cuenta signed in, the
// sign-in pages signed out, verificar/ with a second factor pending,
// sin-acceso/ for an account that is not staff. The first test keeps the
// list honest: a new admin route needs its case here.
import { expect, test } from '@playwright/test';
import {
  CHALLENGE,
  DEVELOPER,
  NO_ACCESS,
  signedOutBackend,
  staffBackend,
  type StaffAccount,
} from './helpers/admin-backend';
import { prerenderedRoutes } from './helpers/routes';

interface ReloadCase {
  /** null: signed out. */
  account: StaffAccount | null;
  h1: string;
  /** The address to open, when it is more than the route (a query). */
  open?: string;
}

const CASES: Record<string, ReloadCase> = {
  '/admin/': { account: DEVELOPER, h1: 'Inicio' },
  '/admin/cuenta/': {
    account: DEVELOPER,
    h1: 'Mi cuenta',
    open: '/admin/cuenta/?seccion=seguridad',
  },
  '/admin/acceso/': { account: null, h1: 'Iniciar sesión' },
  '/admin/acceso/invitacion/': { account: null, h1: 'El enlace de invitación no es válido' },
  '/admin/acceso/oauth/': { account: null, h1: 'No pudimos iniciar tu sesión' },
  '/admin/acceso/recuperar/': { account: null, h1: '¿Olvidaste tu contraseña?' },
  '/admin/acceso/restablecer/': { account: null, h1: 'El enlace no es válido' },
  '/admin/acceso/sin-acceso/': { account: NO_ACCESS, h1: 'Tu cuenta no tiene acceso al panel' },
  '/admin/acceso/verificar/': { account: CHALLENGE, h1: 'Verifica tu identidad' },
};

test('every prerendered admin route has a reload case', () => {
  const routes = prerenderedRoutes().filter((route) => route.startsWith('/admin/'));
  expect(routes).toEqual(Object.keys(CASES).sort());
});

for (const [route, { account, h1, open = route }] of Object.entries(CASES)) {
  test(`${open} — a reload lands on the same page`, async ({ page }) => {
    if (account) await staffBackend(page, account);
    else await signedOutBackend(page);
    await page.goto(open);
    const heading = page.getByRole('heading', { level: 1, name: h1 });
    await expect(heading).toBeVisible();
    const address = page.url();

    const response = await page.reload();
    expect(response?.status(), 'the route is a real file').toBe(200);
    await expect(heading).toBeVisible();
    expect(page.url()).toBe(address);
  });
}
