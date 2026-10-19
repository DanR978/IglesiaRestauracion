// Mi cuenta › Seguridad (S45) against the real GoTrue: what the account's
// devices and password ARE on the server after each change, not what the
// page says.
//
//   devices   add a second authenticator in place (aal2 enrolls it), then
//             remove the first: a confirm, then a FRESH code (the step-up,
//             here from the new device, which also moves the session onto it,
//             so the removal does not step this session down — S45 landmine 2)
//   password  the change carries the current password. GoTrue's "Require
//             current password" is off on the local stack, so its verdict
//             proves nothing about that field: the request body is the check
//             (ASVS 6.2.3); the new password is then the one that signs in
import { jwtClaims, syntheticPassword, type ApiSession } from './helpers/stack';
import { expect, test } from './helpers/fixtures';
import { openSecurity, signInToInicio, storedSession } from './helpers/ui';
import { totp } from './helpers/totp';

const ONLY_DEVICE = 'Es tu único dispositivo';
const REFRESH = '/auth/v1/token?grant_type=refresh_token';

test('add a second authenticator, then remove the first behind a fresh code', async ({
  page,
  stack,
}) => {
  const ana = await stack.createAccount({ preset: 'administrador', factor: true });
  await signInToInicio(page, ana);
  await openSecurity(page);
  await expect(page.getByText(ONLY_DEVICE)).toBeVisible();

  await page.getByRole('button', { name: 'Agregar dispositivo' }).click();
  const adding = page.getByRole('dialog', { name: 'Agregar un dispositivo' });
  await expect(
    adding.getByRole('img', {
      name: 'Código QR para agregar este dispositivo a tu app de autenticación',
    }),
  ).toBeVisible();
  const secret = (await adding.locator('code').textContent())!.trim();
  await adding.getByLabel('Código de verificación').fill(totp(secret));
  await expect(adding).toBeHidden();
  await expect(page.getByText('Dispositivo agregado')).toBeVisible();

  const both = (await stack.factors(ana)).filter((f) => f.status === 'verified');
  expect(both).toHaveLength(2);
  const added = both.find((f) => f.id !== ana.factorId)!;
  await expect(page.getByText(ONLY_DEVICE)).toBeHidden();

  // The first device, by the name the suite gave it at enrollment.
  await page.getByRole('button', { name: 'Quitar Teléfono de prueba' }).click();
  const confirm = page.getByRole('dialog', { name: '¿Quitar «Teléfono de prueba»?' });
  await confirm.getByRole('button', { name: 'Quitar dispositivo' }).click();

  const stepUp = page.getByRole('dialog', { name: 'Confirma que eres tú' });
  await expect(stepUp).toBeVisible();
  // Nothing is removed before the code.
  expect((await stack.factors(ana)).filter((f) => f.status === 'verified')).toHaveLength(2);
  await stepUp.getByLabel('Código de verificación').fill(totp(secret));
  await expect(stepUp).toBeHidden();
  await expect(page.getByText('Dispositivo quitado')).toBeVisible();

  expect(await stack.factors(ana)).toEqual([
    expect.objectContaining({ id: added.id, status: 'verified' }),
  ]);
  await expect(page.getByText(ONLY_DEVICE)).toBeVisible();

  // GoTrue steps down the sessions bound to a removed factor. The step-up bound
  // this one to the new device, so a refresh still comes back at aal2.
  const { refresh_token } = (await storedSession(page, stack.storageKey))!;
  const refreshed = await stack.call<ApiSession>('POST', REFRESH, {
    token: stack.keys.anonKey,
    body: { refresh_token },
  });
  expect(refreshed.status).toBe(200);
  expect(jwtClaims(refreshed.body.access_token).aal).toBe('aal2');
});

test('the password change sends the current password; the new one signs in', async ({
  page,
  stack,
}) => {
  const ana = await stack.createAccount({ preset: 'administrador', factor: true });
  await signInToInicio(page, ana);
  await openSecurity(page);

  const fresh = syntheticPassword();
  await page.getByLabel('Contraseña actual', { exact: true }).fill(ana.password);
  await page.getByLabel(/^Nueva contraseña/).fill(fresh);
  await page.getByLabel(/^Confirma la nueva contraseña/).fill(fresh);
  const sent = page.waitForRequest(
    (r) => r.method() === 'PUT' && new URL(r.url()).pathname === '/auth/v1/user',
  );
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();

  expect((await sent).postDataJSON()).toMatchObject({
    password: fresh,
    current_password: ana.password,
  });
  await expect(page.getByText('Contraseña actualizada')).toBeVisible();
  expect((await stack.passwordGrant(ana.email, fresh)).status).toBe(200);
  expect(await stack.passwordGrant(ana.email, ana.password)).toMatchObject({
    status: 400,
    body: { error_code: 'invalid_credentials' },
  });
});
