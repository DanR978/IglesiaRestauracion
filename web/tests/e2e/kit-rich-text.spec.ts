// S18 — /kit/rich-text/ in a real browser: the things jsdom cannot answer.
// jsdom has no contenteditable editing and no execCommand at all, so the caret
// claim ("typing never moves the cursor") only has real evidence HERE — typed
// through the keyboard, with the selection read back from the live document.
// Not part of the CI gate — run with `npm run test:e2e` after
// `npx playwright install chromium`.
import { expect, test } from '@playwright/test';

const EDITOR = '.rt';
const AREA = '.rt__area';
const TOGGLE = '.rt__toggle';

/** The caret's (node text, offset) as the browser actually holds it. */
async function caret(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const selection = document.getSelection();
    return {
      text: selection?.anchorNode?.textContent ?? null,
      offset: selection?.anchorOffset ?? -1,
    };
  });
}

test.describe('/kit/rich-text/', () => {
  test('renders both halves with no console error, and pours the seed value in', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/kit/rich-text/');

    await expect(page.locator(AREA).first()).toContainText('Vacaciones Bíblicas');
    // The render half fills in after hydration (the sanitizer needs DOMParser).
    await expect(page.locator('.rich-content').first()).toContainText('Vacaciones Bíblicas');
    expect(errors).toEqual([]);
  });

  test('typing in the middle of a word leaves the caret where it was', async ({ page }) => {
    await page.goto('/kit/rich-text/');
    const area = page.locator(AREA).first();

    // Put the caret between "Bíblic" and "as" and type — the classic
    // contenteditable regression is the caret snapping back to position 0.
    await area.click();
    await page.evaluate(() => {
      const node = document.querySelector('.rt__area p')?.firstChild as Text;
      const range = document.createRange();
      range.setStart(node, 12);
      range.collapse(true);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    });

    await page.keyboard.type('XYZ');
    const after = await caret(page);
    expect(after.offset).toBe(15);
    expect(after.text?.slice(0, 15)).toBe('Vacaciones BXYZ');
    await expect(area).toContainText('Vacaciones BXYZíblicas');
  });

  test('the public preview follows the editor, sanitized both ways', async ({ page }) => {
    await page.goto('/kit/rich-text/');
    await page.locator(AREA).first().click();
    await page.keyboard.type(' ¡Apúntate!');
    await expect(page.locator('.rich-content').first()).toContainText('¡Apúntate!');

    // Load deliberately hostile markup through the imperative API.
    await page.getByRole('button', { name: 'Cargar HTML hostil' }).click();
    await expect(page.locator(AREA).first()).toContainText('Traer agua');
    expect(await page.locator(AREA).first().innerHTML()).not.toContain('onerror');
    expect(await page.locator('.rich-content').first().innerHTML()).not.toContain('onerror');
    expect(await page.locator('.rich-content').first().innerHTML()).not.toContain('javascript:');
    await expect(page.locator('.rich-content script')).toHaveCount(0);
  });

  test('bold really formats the selection and the value comes back sanitized', async ({ page }) => {
    await page.goto('/kit/rich-text/');
    await page.locator(EDITOR).first().locator(TOGGLE).click();

    await page.locator(AREA).first().click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.locator(EDITOR).first().getByRole('button', { name: 'Negrita (Ctrl+B)' }).click();

    const value = await page.locator('.facts__row', { hasText: 'Valor guardado' }).innerText();
    expect(value).toMatch(/<(b|span style="font-weight)/);
    expect(value).not.toContain('<script');
  });

  test('the toolbar is one tab stop with arrow-key navigation', async ({ page }) => {
    await page.goto('/kit/rich-text/');
    const editor = page.locator(EDITOR).first();
    await editor.locator(TOGGLE).click();
    await editor.locator('[data-rt-key="bold"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(editor.locator('[data-rt-key="italic"]')).toBeFocused();
    await page.keyboard.press('End');
    await expect(editor.locator('[data-rt-key="removeFormat"]')).toBeFocused();
  });

  test('the colour and link panels stay inside the box (no floating popover)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/kit/rich-text/');
    const editor = page.locator(EDITOR).first();
    await editor.locator(TOGGLE).click();
    await editor.getByRole('button', { name: 'Color del texto' }).click();

    const panel = (await editor.locator('.rt__panel').boundingBox())!;
    const box = (await editor.locator('.rt__box').boundingBox())!;
    expect(panel.x).toBeGreaterThanOrEqual(box.x - 1);
    expect(panel.x + panel.width).toBeLessThanOrEqual(box.x + box.width + 1);

    await page.keyboard.press('Escape');
    await expect(editor.locator('.rt__panel')).toHaveCount(0);
  });

  test('no horizontal scroll at 360px, and the surface clears the iOS 16px floor', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/kit/rich-text/');
    await page.locator(EDITOR).first().locator(TOGGLE).click();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(overflow).toBe(true);

    const fontSize = await page
      .locator(AREA)
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);

    // Thumb-sized toolbar buttons on a phone.
    const height = await page
      .locator('[data-rt-key="bold"]')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).minHeight));
    expect(height).toBeGreaterThanOrEqual(44);
  });

  test('read-only is visibly and functionally locked', async ({ page }) => {
    await page.goto('/kit/rich-text/');
    const locked = page.locator('.rt--readonly').first();
    await expect(locked.locator(AREA)).toHaveAttribute('contenteditable', 'false');
    await expect(locked.locator(TOGGLE)).toBeDisabled();
  });

  test('forced dark reverses through the tokens alone', async ({ page }) => {
    await page.goto('/kit/rich-text/');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const box = page.locator('.rt__box').first();
    await expect(box).toHaveCSS('background-color', 'rgb(26, 38, 42)');
    // The hairline stays translucent — never the gray ramp, which glares in dark.
    await expect(box).toHaveCSS('border-top-color', 'rgba(127, 127, 127, 0.25)');
  });

  test('reduced motion kills the toolbar reveal', async ({ page }) => {
    await page.goto('/kit/rich-text/');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('.kit .facts')).toContainText('activado');

    await page.locator(EDITOR).first().locator(TOGGLE).click();
    const duration = await page
      .locator('.rt__toolbar')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).animationDuration));
    // S12's global guard clamps to 0.01ms, not 0s (so animationend still fires).
    expect(duration).toBeLessThanOrEqual(0.0001);
  });
});
