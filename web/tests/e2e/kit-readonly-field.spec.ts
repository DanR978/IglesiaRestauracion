// PR-C2 — /kit/readonly-field/ in a real browser: values that the Tab key
// skips and no input chrome, the em dash that a screen reader hears as
// "Sin dato", the lock note, alignment beside an editable field, 360px and
// dark mode. CI job `e2e` runs it.
import { expect, test, type Page } from '@playwright/test';
import { gotoWithTheme } from './helpers/theme';

const KIT = '/kit/readonly-field/';

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

test.describe('kit/readonly-field', () => {
  test('Tab skips the read-only values: they are text, not controls', async ({ page }) => {
    await open(page);
    await page.getByRole('textbox', { name: 'Nombre visible' }).focus();
    await page.keyboard.press('Tab');
    // Five read-only facts sit between the two inputs; none takes focus.
    await expect(page.getByRole('textbox', { name: 'Teléfono' })).toBeFocused();
    await expect(page.locator('.ird-readonly [tabindex], .ird-readonly input')).toHaveCount(0);
  });

  test('a value has no input chrome', async ({ page }) => {
    await open(page);
    const value = page.locator('.ird-readonly__value').first();
    await expect(value).toHaveText('ana.morales@irdlex.org');
    await expect(value).toHaveCSS('border-top-width', '0px');
    await expect(value).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  });

  test('a missing value is a dash for the eye and "Sin dato" for a screen reader', async ({
    page,
  }) => {
    await open(page);
    const fact = page.locator('.ird-readonly', { hasText: 'Último inicio de sesión' });
    await expect(fact).toMatchAriaSnapshot(`
      - term: Último inicio de sesión
      - definition: Sin dato
    `);
    // What is painted is the dash; "Sin dato" is a clipped 1px box.
    await expect(fact.locator('.ird-readonly__value [aria-hidden="true"]')).toHaveText('—');
    const hidden = await fact.getByText('Sin dato').boundingBox();
    expect(hidden!.width).toBeLessThanOrEqual(1);
    expect(hidden!.height).toBeLessThanOrEqual(1);
  });

  test('the lock note says who owns the value', async ({ page }) => {
    await open(page);
    const fact = page.locator('.ird-readonly', { hasText: 'ana.morales@irdlex.org' });
    await expect(fact).toMatchAriaSnapshot(`
      - term: Correo
      - definition: ana.morales@irdlex.org
      - definition: El correo lo gestiona un administrador.
    `);
    await expect(fact.locator('.ird-readonly__note')).toBeVisible();
  });

  test('beside an editable field the value sits on the same line', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page);
    const row = page.locator('.row');
    const input = await row.getByRole('textbox', { name: 'Teléfono' }).boundingBox();
    const value = await row.locator('.ird-readonly__value').boundingBox();
    expect(Math.abs(input!.y - value!.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(input!.height - value!.height)).toBeLessThanOrEqual(2);
  });

  test('forced dark: the value is reversing ink on no fill', async ({ page }) => {
    await openWithTheme(page, 'dark');
    const value = page.locator('.ird-readonly__value').first();
    await expect(value).toHaveCSS('color', 'rgb(240, 245, 247)');
    await expect(value).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  });
});

test.describe('kit/readonly-field — 360px phone', () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });

  test('long values wrap and nothing scrolls sideways', async ({ page }) => {
    await open(page);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= window.innerWidth &&
          document.body.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    // The two-column row stacks at ≤640px.
    const row = page.locator('.row');
    const input = await row.getByRole('textbox', { name: 'Teléfono' }).boundingBox();
    const value = await row.locator('.ird-readonly__value').boundingBox();
    expect(value!.y).toBeGreaterThan(input!.y + input!.height);
  });
});
