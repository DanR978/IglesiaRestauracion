// S15 — real-browser proof of the ROADMAP "done when": the three variants
// render with the right live-region role, they stack, they auto-dismiss and
// close by hand, the body is text and not markup, the fills clear AA against
// their ink in both themes, and reduced motion is honoured. Runs against
// `vite preview` (playwright.config); not part of the CI gate.
import { expect, test, type Page } from '@playwright/test';

const KIT = '/kit/toast/';

/** WCAG relative luminance of a computed colour (`rgb(…)` or `color(srgb …)`). */
function contrast(a: string, b: string): number {
  const channel = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = (value: string) => {
    const parts = (value.match(/[\d.]+/g) ?? []).map(Number);
    // color-mix() computes to `color(srgb r g b)` with 0–1 floats; rgb() is 0–255.
    const scale = value.startsWith('color(') ? 1 : 1 / 255;
    const [r, g, bl] = parts.slice(0, 3).map((n) => channel(n * scale));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

async function inkContrast(page: Page, selector: string): Promise<number> {
  const [background, color] = await page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const cs = getComputedStyle(el);
      return [cs.backgroundColor, cs.color];
    });
  return contrast(background, color);
}

test.describe('kit/toast', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('variants render with the right role, stack, and clear AA contrast', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(KIT);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Avisos (toast)');

    await page.getByRole('button', { name: 'success', exact: true }).click();
    const success = page.getByRole('status');
    await expect(success).toHaveText('Guardado');
    await expect(success).toHaveClass(/toast--success/);
    expect(await inkContrast(page, '.toast--success')).toBeGreaterThanOrEqual(4.5);

    await page.getByRole('button', { name: 'error', exact: true }).click();
    const error = page.getByRole('alert');
    await expect(error).toContainText('No pudimos guardar los cambios.');
    expect(await inkContrast(page, '.toast--error')).toBeGreaterThanOrEqual(4.5);

    await page.getByRole('button', { name: 'info', exact: true }).click();
    await expect(page.locator('.toast')).toHaveCount(3);
    expect(await inkContrast(page, '.toast--info')).toBeGreaterThanOrEqual(4.5);

    // Bottom-right anchored.
    const box = await page.locator('.toast').first().boundingBox();
    expect(box).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeGreaterThan(1280 - 40);

    expect(errors).toEqual([]);
  });

  test('the stack is capped, and toasts auto-dismiss', async ({ page }) => {
    await page.goto(KIT);
    await page.getByRole('button', { name: /Lanzar \d+ avisos/ }).click();
    await expect(page.locator('.toast')).toHaveCount(4);
    await expect(page.locator('.toast')).toHaveCount(0, { timeout: 8000 });
  });

  test('closes by hand, and holds the countdown while hovered', async ({ page }) => {
    await page.goto(KIT);
    await page.getByRole('button', { name: 'success', exact: true }).click();
    const toast = page.locator('.toast').first();
    await toast.hover();
    await page.waitForTimeout(5200);
    await expect(page.locator('.toast')).toHaveCount(1);

    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(page.locator('.toast')).toHaveCount(0);
  });

  test('the undo action runs and closes the toast', async ({ page }) => {
    await page.goto(KIT);
    await expect(page.locator('.albums__row')).toHaveCount(3);
    await page.locator('.albums__row button').first().click();
    await expect(page.locator('.albums__row')).toHaveCount(2);

    await page.getByRole('button', { name: 'Deshacer' }).click();
    await expect(page.locator('.albums__row')).toHaveCount(3);
    await expect(page.locator('.toast')).toHaveCount(0);
  });

  test('the message is text, never markup (D-005)', async ({ page }) => {
    await page.goto(KIT);
    await page.getByRole('button', { name: 'Mensaje con etiquetas' }).click();
    const body = page.locator('.toast__msg').first();
    await expect(body).toContainText('<img src=x onerror="alert(1)">');
    await expect(page.locator('.toast img')).toHaveCount(0);
    await expect(page.locator('.toast b')).toHaveCount(0);
  });

  test('dark mode keeps every fill AA against its ink', async ({ page }) => {
    await page.goto(KIT);
    await page.evaluate(() => localStorage.setItem('ird.theme', 'dark'));
    await page.reload();
    for (const [name, variant] of [
      ['success', 'toast--success'],
      ['error', 'toast--error'],
      ['info', 'toast--info'],
    ] as const) {
      await page.getByRole('button', { name, exact: true }).click();
      expect(await inkContrast(page, `.${variant}`), variant).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('reduced motion: no entry animation and an immediate dismiss', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(KIT);
    await expect(page.locator('.facts')).toContainText('activado');

    await page.getByRole('button', { name: 'info', exact: true }).click();
    const animation = await page
      .locator('.toast')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(animation).toBe('none');

    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(page.locator('.toast')).toHaveCount(0);
  });

  test('no horizontal scroll at 360px, and the toast fits', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(KIT);
    await page.getByRole('button', { name: 'Mensaje largo de la base de datos' }).click();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    const box = await page.locator('.toast').first().boundingBox();
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(360);

    const close = await page
      .getByRole('button', { name: 'Cerrar', exact: true })
      .first()
      .boundingBox();
    expect(close?.width ?? 0).toBeGreaterThanOrEqual(35);
    expect(close?.height ?? 0).toBeGreaterThanOrEqual(35);
  });
});
