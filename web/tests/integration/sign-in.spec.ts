// Signing in to the new admin with the real GoTrue (S39, D-033): the two ways
// a staff member reaches Inicio with a password — the code of an
// authenticator they already have, and a first-time enrollment from the QR
// screen's key. Each lands on Inicio at aal2 with every card answered by the
// real schema under RLS (no card in its error state), so the S40 / S41 reads
// are checked against the database they will meet in production.
import type { Page } from '@playwright/test';
import { appPath, jwtClaims } from './helpers/stack';
import { expect, test } from './helpers/fixtures';
import { expectInicio, heading, setupKey, storedSession, submitSignIn } from './helpers/ui';
import { totp } from './helpers/totp';

/** An admin's tiles (S41 dashboard.ts TILES), in order. */
const ADMIN_TILES = [
  'Próximos eventos',
  'Eventos este mes',
  'Interesados pendientes',
  'Álbumes',
  'Balance',
];

/**
 * Inicio's cards for an admin have all settled with an answer — a figure, a
 * list or an empty state, never the error state. "Actividad reciente" is
 * there only for the holder of the activity tab.
 */
async function expectCardsAnswered(page: Page, { activity }: { activity: boolean }): Promise<void> {
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
  const tiles = page.getByRole('region', { name: 'Resumen' }).getByRole('listitem');
  await expect(tiles).toHaveCount(ADMIN_TILES.length);
  await expect(tiles).toContainText(ADMIN_TILES);
  await expect(page.getByRole('heading', { level: 2, name: 'Próximos eventos' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Actividad reciente' })).toHaveCount(
    activity ? 1 : 0,
  );
  await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
}

test('password + TOTP: the challenge, then Inicio at aal2', async ({ page, stack }) => {
  const ana = await stack.createAccount({
    preset: 'developer',
    factor: true,
    displayName: 'Ana Prueba',
  });

  await page.goto(appPath('admin/'));
  await expect(heading(page, 'Iniciar sesión')).toBeVisible();
  await page.getByLabel('Correo electrónico').fill(ana.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(ana.password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  // A password alone is aal1: the panel asks for the code, it does not open.
  await expect(heading(page, 'Verifica tu identidad')).toBeVisible();
  const aal1 = await storedSession(page, stack.storageKey);
  expect(jwtClaims(aal1!.access_token)).toMatchObject({ sub: ana.id, aal: 'aal1' });

  await page.getByLabel('Código de verificación').fill(totp(ana.secret!));
  await expectInicio(page);
  await expect(page.getByText('Hola, Ana')).toBeVisible();
  const aal2 = await storedSession(page, stack.storageKey);
  expect(jwtClaims(aal2!.access_token)).toMatchObject({
    sub: ana.id,
    aal: 'aal2',
    session_id: jwtClaims(aal1!.access_token).session_id,
  });
  await expectCardsAnswered(page, { activity: true });
});

test('first sign-in without an authenticator: enroll from the QR screen, then Inicio', async ({
  page,
  stack,
}) => {
  const rut = await stack.createAccount({ preset: 'administrador', displayName: 'Rut Prueba' });

  await submitSignIn(page, rut.email, rut.password);
  await expect(heading(page, 'Protege tu cuenta')).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Código QR para tu app de autenticación' }),
  ).toBeVisible();
  // The key under the QR — what a person types into the app — is the enrolled secret.
  await page.getByLabel('Código de verificación').fill(totp(await setupKey(page)));
  await expectInicio(page);
  await expect(page.getByText('Hola, Rut')).toBeVisible();
  const session = await storedSession(page, stack.storageKey);
  expect(jwtClaims(session!.access_token).aal).toBe('aal2');
  expect(await stack.factors(rut)).toEqual([expect.objectContaining({ status: 'verified' })]);
  await expectCardsAnswered(page, { activity: false });
});
