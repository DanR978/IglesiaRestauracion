// PR-C2 — /kit/password-field/ in a real browser: the show/hide toggle is a
// real button reached and operated from the keyboard (name constant, pressed =
// shown), paste is never blocked, the strength meter speaks in words, the
// confirm field reports a mismatch on blur/submit and clears as soon as the
// two agree, the password hides again on submit, and the page holds at 360px
// and in dark mode. CI job `e2e` runs it.
import { expect, test, type Page } from '@playwright/test';
import { gotoWithTheme } from './helpers/theme';

const KIT = '/kit/password-field/';

/** Open the kit page and wait until it is hydrated (keyboard handlers attached). */
async function open(page: Page, path = KIT): Promise<void> {
  await page.goto(path);
  await expect(page.locator('main[data-hydrated]')).toBeAttached();
}

/** The same, with a theme stored before the page boots (helpers/theme.ts). */
async function openWithTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await gotoWithTheme(page, KIT, theme);
  await expect(page.locator('main[data-hydrated]')).toBeAttached();
}

const loginForm = (page: Page) => page.locator('form').nth(0);
const newForm = (page: Page) => page.locator('form').nth(1);

/** A paste event carrying `text`; resolves true when nothing cancelled it. */
async function pasteIsAllowed(page: Page, selector: string, text: string): Promise<boolean> {
  return page.locator(selector).evaluate((el, value) => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => value } });
    return el.dispatchEvent(event);
  }, text);
}

test.describe('kit/password-field', () => {
  test('the toggle reveals and hides from the keyboard; its name never flips', async ({ page }) => {
    await open(page);
    const form = loginForm(page);
    const input = form.getByLabel('Contraseña', { exact: true });
    await input.fill('secreta-1');
    await expect(input).toHaveAttribute('type', 'password');

    const toggle = form.getByRole('button', { name: 'Mostrar contraseña' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(input).toHaveAttribute('type', 'text');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toHaveAccessibleName('Mostrar contraseña');
    await expect(input).toHaveValue('secreta-1');

    await page.keyboard.press('Enter');
    await expect(input).toHaveAttribute('type', 'password');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  test('Tab goes from the password to its toggle (never hover-only)', async ({
    page,
    browserName,
  }) => {
    // E-1 (S05b): WebKit's Tab only visits text fields unless Safari's
    // "Press Tab to highlight each item" is on — an engine default.
    test.skip(browserName === 'webkit', 'WebKit does not Tab to buttons by default');
    await open(page);
    const form = loginForm(page);
    await form.getByLabel('Contraseña', { exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(form.getByRole('button', { name: 'Mostrar contraseña' })).toBeFocused();
  });

  test('the toggle is visible without hovering, and 44px wide', async ({ page }) => {
    await open(page);
    const toggle = loginForm(page).getByRole('button', { name: 'Mostrar contraseña' });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveCSS('opacity', '1');
    const box = await toggle.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });

  test('paste is never blocked (WCAG 3.3.8)', async ({ page }) => {
    await open(page);
    const input = loginForm(page).getByLabel('Contraseña', { exact: true });
    const id = await input.getAttribute('id');
    expect(await pasteIsAllowed(page, `#${id}`, 'Clave-Del-Gestor-9')).toBe(true);
    // What the paste inserts arrives as one insertion, like a manager's fill.
    await input.focus();
    await page.keyboard.insertText('Clave-Del-Gestor-9');
    await expect(input).toHaveValue('Clave-Del-Gestor-9');
  });

  test('a real clipboard paste lands in the field', async ({ page, browserName, context }) => {
    test.skip(browserName !== 'chromium', 'Clipboard permissions are Chromium-only in Playwright');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page);
    const input = loginForm(page).getByLabel('Contraseña', { exact: true });
    await page.evaluate(() => navigator.clipboard.writeText('Pegada-Desde-El-Gestor'));
    await input.focus();
    await page.keyboard.press('ControlOrMeta+V');
    await expect(input).toHaveValue('Pegada-Desde-El-Gestor');
  });

  test('autocomplete pairs username with current-password, and new-password for the new one', async ({
    page,
  }) => {
    await open(page);
    await expect(loginForm(page).getByRole('textbox', { name: 'Correo' })).toHaveAttribute(
      'autocomplete',
      'username',
    );
    await expect(loginForm(page).getByLabel('Contraseña', { exact: true })).toHaveAttribute(
      'autocomplete',
      'current-password',
    );
    await expect(newForm(page).getByLabel(/^Nueva contraseña/)).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
  });

  test('the strength meter names the level in words, politely live', async ({ page }) => {
    await open(page);
    const form = newForm(page);
    const input = form.getByLabel(/^Nueva contraseña/);
    const text = form.locator('.ird-pw__meter-text');
    await expect(text).toHaveText('Usa al menos 8 caracteres.');
    await expect(text).toHaveAttribute('aria-live', 'polite');

    await input.fill('abc');
    await expect(text).toHaveText('Débil: usa al menos 8 caracteres.');
    await expect(form.locator('.ird-pw__bar.is-on')).toHaveCount(1);

    await input.fill('Contraseña2024!');
    await expect(text).toHaveText(/^Débil: evita palabras comunes/);

    await input.fill('luzdelalba');
    await expect(text).toHaveText('Aceptable: una frase más larga sería más segura.');
    await expect(form.locator('.ird-pw__bar.is-on')).toHaveCount(2);

    await input.fill('caballo correcto batería');
    await expect(text).toHaveText('Fuerte.');
    await expect(form.locator('.ird-pw__bar.is-on')).toHaveCount(3);
    await expect(input).toHaveAccessibleDescription('Fuerte.');
  });

  test('the confirm field reports a mismatch on blur and clears when they agree', async ({
    page,
  }) => {
    await open(page);
    const form = newForm(page);
    await form.getByLabel(/^Nueva contraseña/).fill('luzdelalba');
    const confirm = form.getByLabel(/^Confirma la contraseña/);
    await confirm.fill('luzdelalva');
    await expect(form.getByRole('alert')).toHaveCount(0); // not while typing

    await confirm.blur();
    await expect(form.getByRole('alert')).toHaveText('Error: Las contraseñas no coinciden.');
    await expect(confirm).toHaveAttribute('aria-invalid', 'true');

    await confirm.fill('luzdelalba');
    await expect(form.getByRole('alert')).toHaveCount(0);
  });

  test('a submit reports the mismatch, and a good pair is accepted', async ({ page }) => {
    await open(page);
    const form = newForm(page);
    await form.getByLabel(/^Nueva contraseña/).fill('caballo correcto batería');
    await form.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(form.getByRole('alert')).toHaveText('Error: Las contraseñas no coinciden.');

    await form.getByLabel(/^Confirma la contraseña/).fill('caballo correcto batería');
    await form.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(form.getByRole('alert')).toHaveCount(0);
    await expect(form.getByRole('status')).toHaveText(
      'Contraseña aceptada (demo, no se guardó nada).',
    );
  });

  test('a weak password is refused with the focus sent back to it', async ({ page }) => {
    await open(page);
    const form = newForm(page);
    const input = form.getByLabel(/^Nueva contraseña/);
    await input.fill('password');
    await form.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  test('a revealed password is hidden again when the form submits', async ({ page }) => {
    await open(page);
    const form = loginForm(page);
    const input = form.getByLabel('Contraseña', { exact: true });
    await input.fill('secreta-1');
    await form.getByRole('button', { name: 'Mostrar contraseña' }).click();
    await expect(input).toHaveAttribute('type', 'text');
    await form.getByRole('textbox', { name: 'Correo' }).fill('ana@irdlex.org');
    await form.getByRole('button', { name: 'Entrar' }).click();
    await expect(input).toHaveAttribute('type', 'password');
    await expect(form.getByRole('status')).not.toBeEmpty();
  });

  test('forced dark reverses the field and keeps the toggle legible', async ({ page }) => {
    await openWithTheme(page, 'dark');
    const input = loginForm(page).getByLabel('Contraseña', { exact: true });
    await expect(input).toHaveCSS('background-color', 'rgb(26, 38, 42)');
    // --color-muted in the dark palette: 5.7:1 on the dark surface.
    await expect(loginForm(page).getByRole('button', { name: 'Mostrar contraseña' })).toHaveCSS(
      'color',
      'rgb(170, 155, 140)',
    );
  });
});

test.describe('kit/password-field — 360px phone', () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });

  test('nothing scrolls sideways and the inputs compute ≥16px', async ({ page }) => {
    await open(page);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const sizes = await page
      .locator('input')
      .evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
    for (const px of sizes) expect(px).toBeGreaterThanOrEqual(16);
  });

  test('a tap on the toggle reveals the password', async ({ page }) => {
    await open(page);
    const form = loginForm(page);
    const input = form.getByLabel('Contraseña', { exact: true });
    await input.fill('secreta-1');
    await form.getByRole('button', { name: 'Mostrar contraseña' }).tap();
    await expect(input).toHaveAttribute('type', 'text');
  });
});
