// PR-C2 — /kit/alert/ in a real browser: the four tones with their live-region
// roles, glyphs and spoken prefix; dismiss by pointer and keyboard (the parent
// moves focus on); a live in-form error; the message as text; 360px and
// forced dark.
import { expect, test } from '@playwright/test';
import { gotoWithTheme } from './helpers/theme';

const KIT = '/kit/alert/';

test.describe('/kit/alert/', () => {
  test('four tones: error is role=alert, the rest role=status; no console error', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(KIT);

    const tones = page.getByTestId('tones');
    await expect(tones.getByRole('alert')).toHaveCount(1);
    await expect(tones.getByRole('alert')).toHaveText('Error: Correo o contraseña incorrectos.');
    await expect(tones.getByRole('status')).toHaveCount(3);
    await expect(tones.getByRole('status').first()).toContainText('Éxito:');
    for (const [tone, glyph] of [
      ['error', 'fa-circle-exclamation'],
      ['success', 'fa-circle-check'],
      ['info', 'fa-circle-info'],
      ['warn', 'fa-triangle-exclamation'],
    ]) {
      await expect(tones.locator(`.ird-alert--${tone} .ird-alert__icon .icon`)).toHaveClass(
        new RegExp(glyph),
      );
    }
    // The spoken prefix is visually hidden, not on screen.
    await expect(tones.locator('.ird-alert--error .sr-only')).toHaveCSS('position', 'absolute');
    expect(errors).toEqual([]);
  });

  test('dismiss: "Cerrar aviso" removes it and focus moves on', async ({ page }) => {
    await page.goto(KIT);
    const list = page.getByTestId('dismissible');
    await expect(list.locator('.ird-alert')).toHaveCount(2);

    await list.getByRole('button', { name: 'Cerrar aviso' }).first().click();
    await expect(list.locator('.ird-alert')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Mostrar los avisos otra vez' })).toBeFocused();

    // Keyboard: reach the remaining one and close it with Enter.
    const close = list.getByRole('button', { name: 'Cerrar aviso' });
    await close.focus();
    await page.keyboard.press('Enter');
    await expect(list.locator('.ird-alert')).toHaveCount(0);
    await expect(page.getByTestId('notice-count')).toHaveText('0 visibles');

    await page.getByRole('button', { name: 'Mostrar los avisos otra vez' }).click();
    await expect(list.locator('.ird-alert')).toHaveCount(2);
  });

  test('the dismiss control shows a visible focus ring', async ({ page }) => {
    await page.goto(KIT);
    const close = page.getByTestId('dismissible').getByRole('button', { name: 'Cerrar aviso' });
    await close.first().focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(close.first()).toBeFocused();
    const ring = await close.first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return { width: cs.outlineWidth, style: cs.outlineStyle };
    });
    expect(ring).toEqual({ width: '2px', style: 'solid' });
  });

  test('a failed save shows the error in place, as role=alert', async ({ page }) => {
    await page.goto(KIT);
    const form = page.locator('form.form');
    await expect(form.getByRole('alert')).toHaveCount(0);
    await form.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(form.getByRole('alert')).toContainText(
      'No pudimos guardar los cambios. Revisa tu conexión e inténtalo de nuevo.',
    );
    await form.getByRole('button', { name: 'Cerrar aviso' }).click();
    await expect(form.getByRole('alert')).toHaveCount(0);
  });

  test('the message is text, never markup', async ({ page }) => {
    await page.goto(KIT);
    const block = page.getByTestId('text-only');
    await expect(block).toContainText('<img src=x onerror="alert(1)">');
    await expect(block.locator('img')).toHaveCount(0);
  });

  test('no horizontal scroll at 360px; long copy wraps inside the box', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(KIT);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const warn = page.getByTestId('tones').locator('.ird-alert--warn');
    const box = (await warn.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
  });

  test('forced dark: the tone tint reverses, the words stay the reversing ink', async ({
    page,
  }) => {
    await gotoWithTheme(page, KIT, 'dark');
    const error = page.getByTestId('tones').locator('.ird-alert--error');
    // --status-overdue-bg (= --money-neg-bg) in dark.
    await expect(error).toHaveCSS('background-color', 'rgba(242, 139, 139, 0.14)');
    await expect(error).toHaveCSS('color', 'rgb(240, 245, 247)');
    await expect(error.locator('.ird-alert__icon')).toHaveCSS('color', 'rgb(242, 139, 139)');
  });
});
