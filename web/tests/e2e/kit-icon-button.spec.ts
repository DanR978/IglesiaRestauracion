// PR-C2 — /kit/icon-button/ in a real browser: what jsdom cannot answer. The
// rendered squares (32/40px) and the 44px touch hit area, keyboard toggling of
// aria-pressed with a visible ring, the disclosure burger on the dark top bar,
// loading without a size change, link mode, 360px, forced dark and reduced
// motion. Runs on all four projects (playwright.config.ts).
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoWithTheme } from './helpers/theme';

const KIT = '/kit/icon-button/';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

async function size(locator: Locator): Promise<{ width: number; height: number }> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return { width: Math.round(box!.width), height: Math.round(box!.height) };
}

test.describe('/kit/icon-button/', () => {
  test('every variant renders at its size, named by its label, with no title tooltip', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto(KIT);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Botones de icono');

    expect(await size(page.getByRole('button', { name: 'Más acciones (subtle, sm)' }))).toEqual({
      width: 32,
      height: 32,
    });
    expect(await size(page.getByRole('button', { name: 'Eliminar (danger, md)' }))).toEqual({
      width: 40,
      height: 40,
    });
    await expect(page.locator('.ird-icon-btn[title]')).toHaveCount(0);
    // Every icon control on the page has a non-empty accessible name.
    const unnamed = await page
      .locator('.ird-icon-btn')
      .evaluateAll((els) => els.filter((el) => !el.getAttribute('aria-label')?.trim()).length);
    expect(unnamed).toBe(0);
    expect(errors).toEqual([]);
  });

  test('`touch` grows the hit area to 44px around the same 32px square', async ({ page }) => {
    await page.goto(KIT);
    const plain = page.getByTestId('hit-plain');
    const touch = page.getByTestId('hit-touch');
    await touch.scrollIntoViewIfNeeded();
    expect(await size(plain)).toEqual({ width: 32, height: 32 });
    expect(await size(touch)).toEqual({ width: 32, height: 32 });

    // 20px right of centre: inside a 44px target, outside a 32px one.
    const hits = async (locator: Locator) =>
      locator.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const at = document.elementFromPoint(r.left + r.width / 2 + 20, r.top + r.height / 2);
        return at?.closest('.ird-icon-btn') === el;
      });
    expect(await hits(touch)).toBe(true);
    expect(await hits(plain)).toBe(false);

    const box = (await touch.boundingBox())!;
    const before = Number(await page.getByTestId('clicks').textContent());
    await page.mouse.click(box.x + box.width / 2 + 20, box.y + box.height / 2);
    await expect(page.getByTestId('clicks')).toHaveText(String(before + 1));
  });

  test('keyboard: a toggle flips aria-pressed with Space and Enter, ring visible', async ({
    page,
  }) => {
    await page.goto(KIT);
    const bold = page.getByRole('button', { name: 'Negrita' });
    await expect(bold).toHaveAttribute('aria-pressed', 'true');

    await bold.focus();
    await page.keyboard.press('Space');
    await expect(bold).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('format')).toContainText('negrita desactivado');
    await page.keyboard.press('Enter');
    await expect(bold).toHaveAttribute('aria-pressed', 'true');

    const ring = await bold.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { width: cs.outlineWidth, style: cs.outlineStyle };
    });
    expect(ring).toEqual({ width: '2px', style: 'solid' });
  });

  test('the burger is a disclosure on the dark bar, in the bar’s light ink', async ({ page }) => {
    await page.goto(KIT);
    const burger = page.getByTestId('burger');
    const panelId = await burger.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    const panel = page.locator(`[id="${panelId}"]`);

    await expect(burger).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toBeHidden();
    await burger.click();
    await expect(burger).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toBeVisible();

    // Reach it from the previous control with Tab, as a keyboard user would.
    await page.getByRole('button', { name: 'Subrayado' }).focus();
    await page.keyboard.press('Tab');
    await expect(burger).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(burger).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toBeHidden();

    // ghost inherits the bar's --color-white ink, and its ring follows it —
    // the global --color-focus would be slate on the slate bar.
    const ink = await burger.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { color: cs.color, outline: cs.outlineColor, style: cs.outlineStyle };
    });
    expect(ink.color).toBe('rgb(255, 255, 255)');
    expect(ink).toEqual({ color: ink.color, outline: ink.color, style: 'solid' });
  });

  test('loading keeps the square, disables the control and sets aria-busy', async ({ page }) => {
    await page.goto(KIT);
    const save = page.getByRole('button', { name: 'Guardar borrador' });
    const rest = await size(save);
    await save.click();
    await expect(save).toHaveAttribute('aria-busy', 'true');
    await expect(save).toBeDisabled();
    expect(await size(save)).toEqual(rest);
    await expect(save.locator('.ird-icon-btn__spinner .icon')).toBeVisible();
    await expect(save).not.toHaveAttribute('aria-busy', { timeout: 5000 });
  });

  test('href renders a named link; a disabled one drops its destination', async ({ page }) => {
    await page.goto(KIT);
    await expect(page.getByRole('link', { name: 'Ir a la página de botones' })).toHaveAttribute(
      'href',
      /\/kit\/button\/$/,
    );
    await expect(
      page.getByRole('link', { name: 'Abrir el sitio público en otra pestaña' }),
    ).toHaveAttribute('rel', 'noopener noreferrer');
    const disabled = page.locator('a.ird-icon-btn.is-disabled');
    await expect(disabled).not.toHaveAttribute('href');
    await expect(disabled).toHaveAttribute('aria-disabled', 'true');
    await expect(disabled).toHaveAttribute('tabindex', '-1');
  });

  test('hover tints follow the ink (pointer devices only)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'touch profiles have no hover');
    await page.goto(KIT);
    const subtle = page.getByRole('button', { name: 'Más acciones (subtle, md)' });
    await subtle.hover();
    await expect(subtle).toHaveCSS('background-color', 'rgba(127, 127, 127, 0.2)');
    await expect(subtle).toHaveCSS('color', 'rgb(57, 69, 72)');
  });

  test('no horizontal scroll at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(KIT);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('forced dark: the neutral tint stays, pressed inverts the reversing pair', async ({
    page,
  }) => {
    await gotoWithTheme(page, KIT, 'dark');
    await expect(page.getByRole('button', { name: 'Más acciones (subtle, md)' })).toHaveCSS(
      'background-color',
      'rgba(127, 127, 127, 0.12)',
    );
    const bold = page.getByRole('button', { name: 'Negrita' });
    await expect(bold).toHaveAttribute('aria-pressed', 'true');
    // --color-text / --color-surface in dark: #f0f5f7 fill, #1a262a glyph.
    await expect(bold).toHaveCSS('background-color', 'rgb(240, 245, 247)');
    await expect(bold).toHaveCSS('color', 'rgb(26, 38, 42)');
  });

  // emulateMedia() in the body: the fixture option did not reach matchMedia()
  // in this Playwright build (see kit-button.spec.ts).
  test('reduced motion neutralises every transition', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(KIT);
    const durations = await page.getByRole('button', { name: 'Negrita' }).evaluate((el) =>
      getComputedStyle(el)
        .transitionDuration.split(',')
        .map((d) => parseFloat(d)),
    );
    for (const d of durations) expect(d).toBeLessThanOrEqual(0.0001);
  });
});
