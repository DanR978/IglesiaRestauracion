// S19 — real-browser proof of the ROADMAP "done when": the pad draws at the
// device pixel ratio, toDataURL() returns a PNG trimmed to the stroke, and
// clear / loadDataURL / isEmpty drive it from outside the component. Runs
// against `vite preview` (playwright.config); not part of the CI gate.
import { expect, test, type Page } from '@playwright/test';

const KIT = '/kit/signature-pad/';
const PAD = '#kit-framed canvas';

/** Draw a real stroke with the mouse — Chromium turns it into pointer events. */
async function signWithMouse(page: Page, selector = PAD): Promise<void> {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  const y = box.y + box.height * 0.6;
  await page.mouse.move(box.x + box.width * 0.2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, y - 18, { steps: 6 });
  await page.mouse.move(box.x + box.width * 0.45, y + 10, { steps: 6 });
  await page.mouse.up();
}

test.describe('kit/signature-pad @2x', () => {
  test.use({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });

  test('the backing store is sized for the device pixel ratio', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto(KIT);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Firma');
    await expect(page.locator('.facts')).toContainText('2×');

    const size = await page.locator(PAD).evaluate((el) => {
      const canvas = el as HTMLCanvasElement;
      return {
        backing: [canvas.width, canvas.height],
        css: [Math.round(canvas.clientWidth), Math.round(canvas.clientHeight)],
      };
    });
    expect(size.backing).toEqual([size.css[0] * 2, size.css[1] * 2]);
    expect(size.css[1]).toBe(170);
    expect(errors).toEqual([]);
  });

  test('a stroke exports a PNG trimmed to its bounding box, under the cap', async ({ page }) => {
    await page.goto(KIT);
    await expect(page.locator('#kit-framed-state')).toContainText('vacía');

    await signWithMouse(page);
    await expect(page.locator('#kit-framed-state')).toContainText('firmada');

    const preview = page.locator('.preview img');
    await expect(preview).toBeVisible();
    const png = await preview.evaluate((el) => {
      const img = el as HTMLImageElement;
      return { w: img.naturalWidth, h: img.naturalHeight, bytes: img.src.length };
    });
    const pad = await page.locator(PAD).evaluate((el) => {
      const canvas = el as HTMLCanvasElement;
      return { w: canvas.width, h: canvas.height };
    });

    // Trimmed: the stroke covered ~25% of the width and ~30px of the height.
    expect(png.w).toBeGreaterThan(0);
    expect(png.h).toBeGreaterThan(0);
    expect(png.w).toBeLessThan(pad.w * 0.6);
    expect(png.h).toBeLessThan(pad.h * 0.6);
    // …and small enough that the SEC-09 cap never has to fire.
    expect(png.bytes).toBeLessThan(128 * 1024);
  });

  test('clear / isEmpty / toDataURL / loadDataURL drive the pad from outside', async ({ page }) => {
    await page.goto(KIT);
    await signWithMouse(page);

    await page.getByRole('button', { name: 'toDataURL()' }).click();
    await expect(page.locator('#kit-api-out')).not.toHaveText('0 bytes');

    // loadDataURL() paints the captured signature onto the second pad.
    await page.getByRole('button', { name: 'Copiar la firma de arriba' }).click();
    await expect(page.locator('#kit-bare-report')).toHaveText('Copiada al recuadro sin marco.');
    await expect(page.locator('.doc .sigpad')).toHaveClass(/sigpad--inked/);

    await page.getByRole('button', { name: 'clear()' }).click();
    await expect(page.locator('#kit-framed-state')).toContainText('vacía');
    await page.getByRole('button', { name: 'isEmpty()' }).click();
    await expect(page.locator('#kit-api-out')).toHaveText('true');
  });

  test('the paper stays light in dark mode so the fixed ink still reads', async ({ page }) => {
    await page.goto(KIT);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await expect(page.locator('.sigpad__paper').first()).toHaveCSS(
      'background-color',
      'rgb(255, 255, 255)',
    );
    // The page around it did reverse.
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(18, 28, 31)');
  });
});

test.describe('kit/signature-pad — 360px', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('no horizontal scroll, and a touch drag draws instead of scrolling', async ({ page }) => {
    await page.goto(KIT);
    await expect(page.locator('.facts')).toContainText('360px');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // touch-action: none is what stops the page scrolling under a signature.
    await expect(page.locator(PAD)).toHaveCSS('touch-action', 'none');

    // The clear button keeps a ≥44px target at the narrow width.
    const clear = page.getByRole('button', { name: 'Borrar firma' }).first();
    const box = await clear.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });
});
