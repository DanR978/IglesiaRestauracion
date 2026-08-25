// S16 — real-browser proof of the facts jsdom cannot check: the computed
// z-index that puts a confirm above an open modal, the panel widths per
// variant, the real body scroll lock, keyboard focus trapping and return, the
// open animation and its reduced-motion guard, dark mode, and no horizontal
// scroll at 360px. Runs against `vite preview` (playwright.config); not part of
// the CI gate.
import { expect, test, type Page } from '@playwright/test';

const KIT = '/kit/modal/';

const scrim = (page: Page) => page.locator('.ird-modal').first();
const confirmScrim = (page: Page) => page.locator('.ird-modal--confirm');

async function zIndexOf(page: Page, selector: string): Promise<number> {
  return page
    .locator(selector)
    .first()
    .evaluate((el) => Number.parseInt(getComputedStyle(el).zIndex, 10));
}

test.describe('kit/modal', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('opens with the right size, locks the page, and closes three ways', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(KIT);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Modales y confirmación');

    const widths: Record<string, number> = {
      standard: 500,
      wide: 760,
      confirm: 360,
      tool: 420,
    };
    for (const [variant, max] of Object.entries(widths)) {
      await page.getByRole('button', { name: variant, exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toHaveAttribute('aria-modal', 'true');
      const box = await dialog.boundingBox();
      expect(box?.width).toBeLessThanOrEqual(max + 1);
      expect(box?.width).toBeGreaterThan(max - 60);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    }

    // The lock is real: <body> stops scrolling and reports it on the page.
    await page.getByRole('button', { name: 'Modal normal' }).click();
    await expect(page.getByText('hidden')).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');
    await scrim(page).click({ position: { x: 8, y: 8 } });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');

    await page.getByRole('button', { name: 'Modal normal' }).click();
    await page.getByRole('button', { name: 'Cerrar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  test('respects a modal that opts out of Escape and the scrim', async ({ page }) => {
    await page.goto(KIT);
    await page.getByRole('button', { name: 'Sin Escape ni fondo' }).click();
    const dialog = page.getByRole('dialog');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await scrim(page).click({ position: { x: 8, y: 8 } });
    await expect(dialog).toBeVisible();

    await page.getByRole('button', { name: 'Cerrar' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('traps Tab inside the dialog and returns focus to the trigger', async ({ page }) => {
    await page.goto(KIT);
    const trigger = page.getByRole('button', { name: 'Modal normal' });
    await trigger.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeFocused();

    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      expect(
        await page.evaluate(() => {
          const el = document.activeElement;
          return el !== null && document.querySelector('[role="dialog"]')!.contains(el);
        }),
      ).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  });

  test('a confirm stacks above an open modal and hands the page back to it', async ({ page }) => {
    await page.goto(KIT);
    await page.getByRole('button', { name: 'Abrir inscripción' }).click();
    const base = page.getByRole('dialog');
    await expect(base).toBeVisible();

    await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
    await expect(confirmScrim(page)).toBeVisible();

    // The elevation legacy #confirmModal had, preserved as a computed value.
    const baseZ = await zIndexOf(page, '.ird-modal:not(.ird-modal--confirm)');
    const confirmZ = await zIndexOf(page, '.ird-modal--confirm');
    expect(confirmZ).toBeGreaterThan(baseZ);
    await expect(page.getByText('Capas que bloquean el scroll')).toBeVisible();
    await expect(page.locator('.facts__row').first()).toContainText('2');

    // Focus is on the safer button, and Tab cannot reach the modal underneath.
    await expect(page.getByRole('button', { name: 'No, cancelar' })).toBeFocused();
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(
        () =>
          document.activeElement !== null &&
          document
            .querySelector('.ird-modal--confirm [role="dialog"]')!
            .contains(document.activeElement),
      ),
    ).toBe(true);

    await page.keyboard.press('Escape');
    await expect(confirmScrim(page)).toHaveCount(0);
    await expect(base).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');
    await expect(page.locator('.facts__row').first()).toContainText('1');

    await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
    await page.getByRole('button', { name: 'Sí, continuar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');
  });

  test('confirm copy is text, and the non-danger variant is not red', async ({ page }) => {
    await page.goto(KIT);

    await page.getByRole('button', { name: 'Texto, no HTML' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('<img src=x onerror="alert(1)">');
    await expect(dialog.locator('img')).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Descartar (sin peligro)' }).click();
    await expect(page.getByRole('button', { name: 'Sí, descartar' })).not.toHaveClass(
      /ird-btn--danger/,
    );
    await page.getByRole('button', { name: 'Seguir editando' }).click();
    await expect(page.getByText('false (Seguir editando)')).toBeVisible();
  });

  test('animates on the house easing and stops when motion is reduced', async ({ page }) => {
    await page.goto(KIT);
    await page.getByRole('button', { name: 'Modal normal' }).click();
    const named = await page
      .getByRole('dialog')
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(named).not.toBe('none');
    await page.keyboard.press('Escape');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Modal normal' }).click();
    // base/motion.css clamps globally to 0.01ms; the component also drops the
    // keyframes, so assert the duration rather than expecting a literal '0s'.
    const duration = await page
      .getByRole('dialog')
      .evaluate((el) => Number.parseFloat(getComputedStyle(el).animationDuration));
    expect(duration).toBeLessThanOrEqual(0.0001);
  });

  test('reads in dark mode and never scrolls sideways at 360px', async ({ page }) => {
    await page.goto(KIT);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.getByRole('button', { name: 'Modal normal' }).click();

    const panel = await page.getByRole('dialog').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { background: cs.backgroundColor, color: cs.color };
    });
    expect(panel.background).not.toBe(panel.color);
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));

    await page.setViewportSize({ width: 360, height: 780 });
    await page.getByRole('button', { name: 'Abrir inscripción' }).click();
    await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
    await expect(confirmScrim(page)).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
});
