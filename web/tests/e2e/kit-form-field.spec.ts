// PR-C2 — /kit/form-field/ in a real browser: the label really labels its
// control, a submit with nothing filled in surfaces every error as an
// announced alert wired to its control and sends focus to the first, an edit
// clears it, read-only stays focusable while disabled does not, the controls
// compute ≥16px at 360px with nothing scrolling sideways, and the control
// border keeps 3:1 against its surface in both themes. CI job `e2e` runs it.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoWithTheme } from './helpers/theme';

const KIT = '/kit/form-field/';

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
const CONTROLS =
  'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), select, textarea';

/** WCAG contrast of two CSS colours, resolved by the page's own canvas (any colour syntax). */
async function contrast(page: Page, a: string, b: string): Promise<number> {
  return page.evaluate(
    ([fg, bg]) => {
      const ctx = document.createElement('canvas').getContext('2d')!;
      const rgb = (colour: string): number[] => {
        ctx.fillStyle = '#010203';
        ctx.fillStyle = colour;
        if (ctx.fillStyle === '#010203') throw new Error(`unparsed colour ${colour}`);
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
      };
      const lum = (c: number[]): number => {
        const [r, g, b] = c.map((v) => {
          const s = v / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const [hi, lo] = [lum(rgb(fg)), lum(rgb(bg))].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    },
    [a, b],
  );
}

async function borderContrast(field: Locator): Promise<number> {
  const { border, surface } = await field.evaluate((el) => ({
    border: getComputedStyle(el).borderTopColor,
    surface: getComputedStyle(el).backgroundColor,
  }));
  return contrast(field.page(), border, surface);
}

async function noHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth <= window.innerWidth &&
      document.body.scrollWidth <= window.innerWidth,
  );
}

test.describe('kit/form-field', () => {
  test('a click on the label focuses its control', async ({ page }) => {
    await open(page);
    const form = page.locator('form.form');
    await form.locator('label', { hasText: 'Correo' }).click();
    await expect(form.getByRole('textbox', { name: /^Correo/ })).toBeFocused();
  });

  test('an empty submit announces each error, wires it, and focuses the first', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await open(page);
    const form = page.locator('form.form');
    const name = form.getByRole('textbox', { name: /^Nombre/ });
    await expect(form.getByRole('alert')).toHaveCount(0);

    await form.getByRole('button', { name: 'Guardar' }).click();

    await expect(name).toBeFocused();
    await expect(form.getByRole('alert')).toHaveCount(3);
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toHaveAccessibleDescription(
      'Como aparecerá en el panel. Error: Escribe tu nombre.',
    );
    await expect(form.getByRole('combobox', { name: /^Ministerio/ })).toHaveAccessibleDescription(
      'Error: Elige un ministerio.',
    );
    // The required marker is words, part of the visible label and the name.
    await expect(name).toHaveAccessibleName('Nombre (obligatorio)');
    await expect(name).toHaveAttribute('aria-required', 'true');

    // An edit clears that field's error, and only that one.
    await name.fill('Ana');
    await expect(name).not.toHaveAttribute('aria-invalid');
    await expect(form.getByRole('alert')).toHaveCount(2);
    expect(errors).toEqual([]);
  });

  test('a malformed email gets its own message; a valid form reports success', async ({ page }) => {
    await open(page);
    const form = page.locator('form.form');
    await form.getByRole('textbox', { name: /^Nombre/ }).fill('Ana Morales');
    const email = form.getByRole('textbox', { name: /^Correo/ });
    await email.fill('ana@');
    await form.getByRole('combobox', { name: /^Ministerio/ }).selectOption('jovenes');
    await form.getByRole('button', { name: 'Guardar' }).click();
    await expect(email).toBeFocused();
    await expect(form.getByRole('alert')).toHaveText(
      'Error: Escribe un correo válido, como nombre@ejemplo.org.',
    );

    await email.fill('ana@irdlex.org');
    await form.getByRole('button', { name: 'Guardar' }).click();
    await expect(form.getByRole('alert')).toHaveCount(0);
    await expect(form.getByRole('status')).toHaveText('Guardado: Ana Morales · ana@irdlex.org');
  });

  test('read-only stays focusable and legible; disabled is out of reach', async ({ page }) => {
    await open(page);
    const readonly = page.getByRole('textbox', { name: 'Solo lectura' });
    await readonly.focus();
    await expect(readonly).toBeFocused();
    await expect(readonly).toHaveJSProperty('readOnly', true);
    await expect(readonly).toHaveCSS('opacity', '1');

    const disabled = page.getByRole('textbox', { name: 'Deshabilitado' });
    await expect(disabled).toBeDisabled();
    await expect(disabled).toHaveCSS('opacity', '0.5');
  });

  test('keyboard focus draws the ring on the control', async ({ page }) => {
    await open(page);
    const name = page.locator('form.form').getByRole('textbox', { name: /^Nombre/ });
    await name.focus();
    await expect(name).toHaveCSS('outline-style', 'solid');
    await expect(name).toHaveCSS('outline-width', '2px');
  });

  test('the border keeps 3:1 against the surface in light mode', async ({ page }) => {
    await openWithTheme(page, 'light');
    const name = page.locator('form.form').getByRole('textbox', { name: /^Nombre/ });
    await expect(name).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    expect(await borderContrast(name)).toBeGreaterThanOrEqual(3);
  });

  test('forced dark reverses the surface and keeps the border at 3:1', async ({ page }) => {
    await openWithTheme(page, 'dark');
    const name = page.locator('form.form').getByRole('textbox', { name: /^Nombre/ });
    await expect(name).toHaveCSS('background-color', 'rgb(26, 38, 42)');
    await expect(name).toHaveCSS('color', 'rgb(240, 245, 247)');
    expect(await borderContrast(name)).toBeGreaterThanOrEqual(3);
    // An error is the AA red ink of the dark palette, not the light one.
    await page.locator('form.form').getByRole('button', { name: 'Guardar' }).click();
    await expect(page.locator('form.form .ird-field__error').first()).toHaveCSS(
      'color',
      'rgb(242, 139, 139)',
    );
  });
});

test.describe('kit/form-field — 360px phone', () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });

  test('nothing scrolls sideways and every control computes ≥16px', async ({ page }) => {
    await open(page);
    expect(await noHorizontalScroll(page)).toBe(true);
    const sizes = await page
      .locator(CONTROLS)
      .evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
    expect(sizes.length).toBeGreaterThan(5);
    for (const px of sizes) expect(px).toBeGreaterThanOrEqual(16);
  });

  test('controls are at least 44px tall', async ({ page }) => {
    await open(page);
    const heights = await page
      .locator('.ird-field__control')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
  });
});
