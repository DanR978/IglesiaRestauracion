// PR-C2 — /kit/code-input/ in a real browser, all four projects: ONE real
// one-time-code input under six drawn boxes; typing (letters dropped), paste
// of "123 456" / "123-456" / longer text, an autofill-style fill in a single
// input event, keyboard editing (arrows, Home/End, Backspace) with the ring
// following the caret, a click on a box selecting that digit, onComplete once
// per code, the error clearing on edit, disabled/loading, 360px, dark, and
// reduced motion. CI job `e2e` runs it.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoWithTheme } from './helpers/theme';

const KIT = '/kit/code-input/';

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

/** The CodeInput whose label is `name` — its root FormField block. */
const fieldOf = (page: Page, name: string) =>
  page.locator('.ird-code').filter({ has: page.getByRole('textbox', { name, exact: true }) });

const verifyInput = (page: Page) =>
  page.getByRole('textbox', { name: 'Código de verificación', exact: true });
const emptyInput = (page: Page) => page.getByRole('textbox', { name: 'Vacío', exact: true });

/** The digits the boxes show, in order ('' for an empty box). */
async function shown(field: Locator): Promise<string> {
  const digits = await field.locator('.ird-code__box').allTextContents();
  return digits.map((d) => d.trim()).join('');
}

const activeIndex = (field: Locator) =>
  field
    .locator('.ird-code__box')
    .evaluateAll((boxes) => boxes.findIndex((b) => b.classList.contains('is-active')));

/** Dispatch a paste carrying `text` (a ClipboardEvent stand-in every engine accepts). */
async function paste(input: Locator, text: string): Promise<void> {
  await input.evaluate((el, value) => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => value } });
    el.dispatchEvent(event);
  }, text);
}

/** Autofill as iOS / password managers deliver it: the whole value in ONE input event. */
async function autofill(input: Locator, text: string): Promise<void> {
  await input.evaluate((el, value) => {
    const field = el as HTMLInputElement;
    field.value = value;
    field.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: value }),
    );
  }, text);
}

test.describe('kit/code-input', () => {
  test('one labelled one-time-code input; the boxes are paint', async ({ page }) => {
    await open(page);
    const field = fieldOf(page, 'Código de verificación');
    await expect(field.locator('input')).toHaveCount(1);
    const input = verifyInput(page);
    await expect(input).toHaveAttribute('autocomplete', 'one-time-code');
    await expect(input).toHaveAttribute('inputmode', 'numeric');
    await expect(input).toHaveAttribute('maxlength', '6');
    await expect(input).toHaveAccessibleDescription(
      'Escribe el código de 6 dígitos que muestra tu app de autenticación.',
    );
    await expect(field.locator('.ird-code__boxes')).toHaveAttribute('aria-hidden', 'true');
    await expect(field.locator('.ird-code__box')).toHaveCount(6);
  });

  test('typing fills the boxes, drops letters, and completes ONCE', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await open(page);
    const input = verifyInput(page);
    const field = fieldOf(page, 'Código de verificación');
    await input.focus();
    await page.keyboard.type('12a3');
    await expect(input).toHaveValue('123');
    expect(await shown(field)).toBe('123');
    await expect(page.getByTestId('code-completions')).toHaveText('0');

    await page.keyboard.type('456');
    await expect(input).toHaveValue('123456');
    await expect(page.getByTestId('code-completions')).toHaveText('1');
    await expect(page.getByTestId('code-last')).toHaveText('123456');
    await expect(field.getByRole('status')).toHaveText('Verificando…');
    await expect(page.locator('.card__status')).toHaveText('Código correcto. Ya puedes continuar.');
    // Typing on into a full field changes nothing and does not complete again.
    await page.keyboard.type('7');
    await expect(input).toHaveValue('123456');
    await expect(page.getByTestId('code-completions')).toHaveText('1');
    expect(errors).toEqual([]);
  });

  for (const [text, code] of [
    ['123 456', '123456'],
    ['123-456', '123456'],
    ['9876543210', '987654'],
    ['Tu código es 482915. No lo compartas.', '482915'],
  ] as const) {
    test(`pasting ${JSON.stringify(text)} keeps the first six digits`, async ({ page }) => {
      await open(page);
      const input = verifyInput(page);
      await input.focus();
      await paste(input, text);
      await expect(input).toHaveValue(code);
      expect(await shown(fieldOf(page, 'Código de verificación'))).toBe(code);
      await expect(page.getByTestId('code-value')).toHaveText(code);
      await expect(page.getByTestId('code-completions')).toHaveText('1');
    });
  }

  test('a real clipboard paste of "123 456" is not cut by maxlength', async ({
    page,
    browserName,
    context,
  }) => {
    test.skip(browserName !== 'chromium', 'Clipboard permissions are Chromium-only in Playwright');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page);
    const input = verifyInput(page);
    await page.evaluate(() => navigator.clipboard.writeText('123 456'));
    await input.focus();
    await page.keyboard.press('ControlOrMeta+V');
    await expect(input).toHaveValue('123456');
    await expect(page.getByTestId('code-completions')).toHaveText('1');
  });

  test('an autofill-style fill (one input event) fills every box and completes once', async ({
    page,
  }) => {
    await open(page);
    const input = verifyInput(page);
    await autofill(input, '482915');
    await expect(input).toHaveValue('482915');
    expect(await shown(fieldOf(page, 'Código de verificación'))).toBe('482915');
    await expect(page.getByTestId('code-completions')).toHaveText('1');
    // The demo rejects it: the error is announced on the field.
    await expect(fieldOf(page, 'Código de verificación').getByRole('alert')).toHaveText(
      /El código no es válido/,
    );
    await expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  test('Playwright fill() — a single-shot set — is sanitised too', async ({ page }) => {
    await open(page);
    const input = emptyInput(page);
    await input.fill('12 34');
    await expect(input).toHaveValue('1234');
  });

  test('the error clears on the next edit', async ({ page }) => {
    await open(page);
    const input = verifyInput(page);
    const field = fieldOf(page, 'Código de verificación');
    await autofill(input, '111111');
    await expect(field.getByRole('alert')).toBeVisible();
    await input.focus();
    await page.keyboard.press('End');
    await page.keyboard.press('Backspace');
    await expect(field.getByRole('alert')).toHaveCount(0);
    await expect(input).not.toHaveAttribute('aria-invalid');
    await expect(input).toHaveValue('11111');
  });

  test('keyboard editing: the ring follows the caret through arrows, Home/End and Backspace', async ({
    page,
  }) => {
    await open(page);
    const input = emptyInput(page);
    const field = fieldOf(page, 'Vacío');
    await input.focus();
    await expect.poll(() => activeIndex(field)).toBe(0);
    await page.keyboard.type('12345');
    await expect.poll(() => activeIndex(field)).toBe(5);

    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => activeIndex(field)).toBe(3);
    await page.keyboard.press('Backspace');
    await expect(input).toHaveValue('1245');
    await expect.poll(() => activeIndex(field)).toBe(2);

    await page.keyboard.press('Home');
    await expect.poll(() => activeIndex(field)).toBe(0);
    await page.keyboard.press('End');
    await expect.poll(() => activeIndex(field)).toBe(4);
    await page.keyboard.type('6');
    await expect(input).toHaveValue('12456');
    expect(await shown(field)).toBe('12456');
  });

  test('a click on a box selects its digit, so typing replaces it', async ({ page }) => {
    await open(page);
    const input = emptyInput(page);
    const field = fieldOf(page, 'Vacío');
    await input.focus();
    await page.keyboard.type('1234');
    await field.scrollIntoViewIfNeeded();
    const box = await field.locator('.ird-code__box').nth(1).boundingBox();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect.poll(() => input.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(1);
    await page.keyboard.type('9');
    await expect(input).toHaveValue('1934');
  });

  test('the active box carries the focus ring', async ({ page }) => {
    await open(page);
    const field = fieldOf(page, 'Vacío');
    await emptyInput(page).focus();
    const active = field.locator('.ird-code__box.is-active');
    await expect(active).toHaveCount(1);
    await expect(active).toHaveCSS('outline-style', 'solid');
    await expect(active).toHaveCSS('outline-width', '2px');
  });

  test('disabled is locked; loading is read-only and says "Verificando…"', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('textbox', { name: 'Deshabilitado', exact: true })).toBeDisabled();
    const loading = page.getByRole('textbox', { name: 'Verificando', exact: true });
    await expect(loading).toBeEnabled();
    await expect(loading).toHaveAttribute('readonly', '');
    await expect(fieldOf(page, 'Verificando').getByRole('status')).toHaveText('Verificando…');
    await loading.focus();
    await expect(loading).toBeFocused();
    await page.keyboard.type('7');
    await paste(loading, '111111');
    await expect(loading).toHaveValue('482915');
    await expect(page.getByTestId('code-completions')).toHaveText('0');
  });

  test('forced dark reverses the boxes', async ({ page }) => {
    await openWithTheme(page, 'dark');
    const box = fieldOf(page, 'Vacío').locator('.ird-code__box').first();
    await expect(box).toHaveCSS('background-color', 'rgb(26, 38, 42)');
    await expect(box).toHaveCSS('color', 'rgb(240, 245, 247)');
    // Disabled digits stay legible: muted ink, not faded.
    const locked = fieldOf(page, 'Deshabilitado').locator('.ird-code__box').first();
    await expect(locked).toHaveCSS('color', 'rgb(170, 155, 140)');
    await expect(locked).toHaveCSS('opacity', '1');
  });

  test('reduced motion: a steady caret', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await emptyInput(page).focus();
    const caret = fieldOf(page, 'Vacío').locator('.ird-code__box.has-caret');
    await expect(caret).toHaveCount(1);
    expect(await caret.evaluate((el) => getComputedStyle(el, '::after').animationName)).toBe(
      'none',
    );
  });
});

test.describe('kit/code-input — 360px phone', () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });

  test('the six boxes fit, nothing scrolls sideways, the input never zooms iOS', async ({
    page,
  }) => {
    await open(page);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= window.innerWidth &&
          document.body.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const field = fieldOf(page, 'Código de verificación');
    const card = await page.locator('.card').first().boundingBox();
    const boxes = await field.locator('.ird-code__box').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { right: r.right, width: r.width, height: r.height };
      }),
    );
    for (const b of boxes) {
      expect(b.right).toBeLessThanOrEqual(card!.x + card!.width);
      expect(b.width).toBeGreaterThanOrEqual(32);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    const fontSizes = await page
      .locator('.ird-code__input')
      .evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
    for (const px of fontSizes) expect(px).toBeGreaterThanOrEqual(16);
  });

  test('a tap anywhere on the boxes focuses the field', async ({ page }) => {
    await open(page);
    const field = fieldOf(page, 'Vacío');
    await field.scrollIntoViewIfNeeded();
    const box = await field.locator('.ird-code__box').nth(4).boundingBox();
    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect(emptyInput(page)).toBeFocused();
  });
});
