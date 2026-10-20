// The emailed links, end to end with the real GoTrue and its real emails
// (S39 EmailLinkFlow). GoTrue sends the repo's templates to Mailpit; the
// suite reads the link's one-time `token_hash` there and opens the NEW route
// on the local preview with the link's own query — the emailed URL itself
// points at the production legacy panel (D-001 until S64) and is never
// followed (the network guard would abort it).
//
//   invitation  the link → a new password → the first authenticator → Inicio
//   recovery    for an account WITH an authenticator, the code comes before
//               the new password — on screen, on the wire, and at the server,
//               which refuses the link's aal1 session a password change
//               (insufficient_aal, ASVS 6.4.3) — and the new password is the
//               one that signs in afterwards
import { appPath, jwtClaims, syntheticPassword } from './helpers/stack';
import { expect, test } from './helpers/fixtures';
import { emailLink, waitForMail } from './helpers/mailpit';
import { expectInicio, heading, storedSession } from './helpers/ui';
import { totp } from './helpers/totp';

const LEGACY_PANEL = 'https://www.irdlex.org/admin/';

test('an invitation: the emailed link, a new password, then Inicio', async ({ page, stack }) => {
  const rut = await stack.invite({ preset: 'administrador', displayName: 'Rut Invitada' });
  const mail = await waitForMail(stack.keys.mailpitUrl, rut.email, 'Te han invitado al panel');
  const link = emailLink(mail.html);
  expect(`${link.origin}${link.pathname}`).toBe(LEGACY_PANEL);
  expect(link.searchParams.get('action')).toBe('accept-invite');
  expect(link.searchParams.get('type')).toBe('invite');
  const tokenHash = link.searchParams.get('token_hash');

  const spent = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().endsWith('/auth/v1/verify'),
  );
  await page.goto(appPath(`admin/acceso/invitacion/${link.search}`));
  expect((await spent).postDataJSON()).toMatchObject({ token_hash: tokenHash, type: 'invite' });
  await expect(heading(page, 'Activa tu cuenta')).toBeVisible();
  // The one-time values are gone from the address bar.
  expect(page.url()).not.toContain('token_hash');
  await expect(page.getByText(rut.email, { exact: true })).toBeVisible();

  await page.getByLabel('Contraseña nueva', { exact: true }).fill(rut.password);
  await page.getByLabel('Confirma la contraseña', { exact: true }).fill(rut.password);
  await page.getByRole('button', { name: 'Crear contraseña' }).click();

  // Setting up an authenticator is optional (D-033 as amended): straight in.
  await expectInicio(page);

  // The server's view: the invitation is accepted and the new password signs in.
  expect((await stack.passwordGrant(rut.email, rut.password)).status).toBe(200);
  expect(await stack.factors(rut)).toEqual([]);
});

test('recovery with an authenticator: the code comes before the new password', async ({
  page,
  stack,
}) => {
  const ana = await stack.createAccount({ preset: 'administrador', factor: true });
  const apiOrigin = new URL(stack.keys.apiUrl).origin;

  // Ask for the email from the sign-in page; the address travels along (WCAG 3.3.7).
  await page.goto(appPath('admin/acceso/'));
  await page.getByLabel('Correo electrónico').fill(ana.email);
  await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
  await expect(heading(page, '¿Olvidaste tu contraseña?')).toBeVisible();
  await expect(page.getByLabel('Correo electrónico')).toHaveValue(ana.email);
  await page.getByRole('button', { name: 'Enviar enlace' }).click();
  await expect(page.getByText('Si la cuenta existe, te enviamos un enlace')).toBeVisible();

  const mail = await waitForMail(stack.keys.mailpitUrl, ana.email, 'Restablece tu contraseña');
  const link = emailLink(mail.html);
  expect(`${link.origin}${link.pathname}`).toBe(LEGACY_PANEL);
  expect(link.searchParams.get('action')).toBe('reset-password');
  expect(link.searchParams.get('type')).toBe('recovery');

  // The order of the writes that matter: the link, the second factor, the password.
  const writes: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== apiOrigin || request.method() === 'GET') return;
    const path = url.pathname.replace(/\/factors\/[^/]+\//, '/factors/:id/');
    if (/^\/auth\/v1\/(verify|user|factors\/:id\/verify)$/.test(path)) {
      writes.push(`${request.method()} ${path}`);
    }
  });

  await page.goto(appPath(`admin/acceso/restablecer/${link.search}`));
  await expect(heading(page, 'Verifica tu identidad')).toBeVisible();
  expect(page.url()).not.toContain('token_hash');
  // No password field exists before the code …
  await expect(page.getByLabel('Contraseña nueva', { exact: true })).toHaveCount(0);
  // … and the link's aal1 session could not use one: GoTrue wants the second factor first.
  const linkSession = (await storedSession(page, stack.storageKey))!;
  expect(jwtClaims(linkSession.access_token).aal).toBe('aal1');
  expect(
    await stack.call('PUT', '/auth/v1/user', {
      token: linkSession.access_token,
      body: { password: syntheticPassword() },
    }),
  ).toMatchObject({ status: 401, body: { error_code: 'insufficient_aal' } });
  await page.getByLabel('Código de verificación').fill(totp(ana.secret!));

  await expect(heading(page, 'Restablece tu contraseña')).toBeVisible();
  const fresh = syntheticPassword();
  await page.getByLabel('Contraseña nueva', { exact: true }).fill(fresh);
  await page.getByLabel('Confirma la contraseña', { exact: true }).fill(fresh);
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expectInicio(page);

  expect(writes).toEqual([
    'POST /auth/v1/verify',
    'POST /auth/v1/factors/:id/verify',
    'PUT /auth/v1/user',
  ]);
  // The new password signs in; the old one no longer does.
  expect((await stack.passwordGrant(ana.email, fresh)).status).toBe(200);
  expect(await stack.passwordGrant(ana.email, ana.password)).toMatchObject({
    status: 400,
    body: { error_code: 'invalid_credentials' },
  });
});
