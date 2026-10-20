// "Cerrar sesión en todos los dispositivos" (S45, D-040) with two real
// browsers on one account: the second context stands for another device —
// its own storage, so no cross-tab broadcast can tell it anything. After this
// device signs out everywhere, the other's session is gone ON THE SERVER:
// GoTrue refuses its token at once (session_not_found), and when its access
// token runs out (jwt_exp; the test moves that browser's clock past it, as a
// laptop lid reopened later) its refresh is refused and the panel shows
// "Tu sesión expiró" in place of the page.
import { INTEGRATION_ORIGIN, jwtClaims } from './helpers/stack';
import { expect, guardNetwork, test } from './helpers/fixtures';
import { heading, openSecurity, signInToInicio, storedSession } from './helpers/ui';

test('signing out everywhere ends another browser’s session', async ({ browser, page, stack }) => {
  const ana = await stack.createAccount({ preset: 'administrador', factor: true });

  const elsewhere = await browser.newContext({ baseURL: INTEGRATION_ORIGIN });
  try {
    const blocked = await guardNetwork(elsewhere, stack.keys.apiUrl);
    await elsewhere.clock.install();
    const other = await elsewhere.newPage();
    await signInToInicio(other, ana);
    const otherSession = (await storedSession(other, stack.storageKey))!;

    await signInToInicio(page, ana);
    const here = (await storedSession(page, stack.storageKey))!;
    expect(jwtClaims(here.access_token).session_id).not.toBe(
      jwtClaims(otherSession.access_token).session_id,
    );

    await openSecurity(page);
    await page.getByRole('button', { name: 'Cerrar sesión en todos los dispositivos' }).click();
    await page
      .getByRole('dialog', { name: '¿Cerrar sesión en todos los dispositivos?' })
      .getByRole('button', { name: 'Cerrar sesión en todos' })
      .click();
    await expect(heading(page, 'Iniciar sesión')).toBeVisible();
    await expect(page.getByText('Sesión cerrada.')).toBeVisible();
    expect(await storedSession(page, stack.storageKey)).toBeNull();

    // The other device's next call to GoTrue is refused: its session no longer exists.
    expect(
      await stack.call('GET', '/auth/v1/user', { token: otherSession.access_token }),
    ).toMatchObject({ status: 403, body: { error_code: 'session_not_found' } });

    // Later, its access token expires; the refresh is refused and the panel says so.
    const refresh = other.waitForResponse((r) =>
      r.url().startsWith(`${stack.keys.apiUrl}/auth/v1/token?grant_type=refresh_token`),
    );
    await elsewhere.clock.fastForward(otherSession.expires_at * 1000 - Date.now() + 60_000);
    expect((await refresh).status()).toBe(400);
    await expect(heading(other, 'Tu sesión expiró')).toBeVisible();
    await expect(other.getByRole('link', { name: 'Iniciar sesión de nuevo' })).toBeVisible();
    expect(await storedSession(other, stack.storageKey)).toBeNull();
    expect(blocked(), 'requests outside the preview, the local stack and the CDN').toEqual([]);
  } finally {
    await elsewhere.close();
  }
});
