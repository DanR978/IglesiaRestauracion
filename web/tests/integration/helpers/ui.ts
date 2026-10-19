/* ============================================================================
 * web/tests/integration/helpers/ui.ts — the admin's screens, as a person uses them
 * ----------------------------------------------------------------------------
 * The steps several specs share, written against what the pages show (labels,
 * roles, headings — the same names the S39 / S45 screens give assistive
 * tech), plus a read of the session the app stored for this page.
 *
 * Usage:
 *   await signInToInicio(page, ana);                      // password + TOTP
 *   const session = await storedSession(page, stack.storageKey);
 * ========================================================================== */
import { expect, type Page } from '@playwright/test';
import { appPath, type Account, type ApiSession } from './stack';
import { totp } from './totp';

/** The h1 of the page, by its exact text. */
export const heading = (page: Page, name: string) =>
  page.getByRole('heading', { level: 1, name, exact: true });

/** Open the sign-in page and submit an email and a password. */
export async function submitSignIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto(appPath('admin/acceso/'));
  await expect(heading(page, 'Iniciar sesión')).toBeVisible();
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/** Type the code an authenticator shows now; CodeInput submits on the sixth digit. */
export async function enterCode(page: Page, secret: string): Promise<void> {
  await page.getByLabel('Código de verificación').fill(totp(secret));
}

/**
 * The setup key on the enrollment screen once GoTrue's enrollment has
 * arrived (the field is empty until then), in the groups of four it shows.
 */
export async function setupKey(page: Page): Promise<string> {
  const key = page.getByLabel('Clave de configuración');
  await expect(key).toHaveValue(/^[A-Z2-7]{4}( [A-Z2-7]{1,4})+$/);
  return key.inputValue();
}

/** Inicio, inside the shell, at the admin's home address. */
export async function expectInicio(page: Page): Promise<void> {
  await expect(heading(page, 'Inicio')).toBeVisible();
  await expect(page).toHaveURL(appPath('admin/'));
}

/** Sign in with the account's password and its authenticator, ending on Inicio. */
export async function signInToInicio(page: Page, account: Account): Promise<void> {
  if (!account.secret) throw new Error('[integration] the account has no authenticator');
  await submitSignIn(page, account.email, account.password);
  await expect(heading(page, 'Verifica tu identidad')).toBeVisible();
  await enterCode(page, account.secret);
  await expectInicio(page);
}

/** The session supabase-js keeps in this page's localStorage (null: signed out). */
export async function storedSession(page: Page, storageKey: string): Promise<ApiSession | null> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), storageKey);
  return raw ? (JSON.parse(raw) as ApiSession) : null;
}

/** Mi cuenta › Seguridad. */
export async function openSecurity(page: Page): Promise<void> {
  await page.goto(appPath('admin/cuenta/?seccion=seguridad'));
  await expect(heading(page, 'Mi cuenta')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Seguridad' })).toBeVisible();
}
