// PR-C2 — /kit/avatar/ in a real browser: the four rendered sizes, the photo
// as a real <img> (no background-image anywhere), the broken-photo fallback —
// including a failure that happens before hydration — and the refused URL,
// decorative vs named avatars in the accessibility tree, keyboard reach of the
// footer's logout, 360px and forced dark.
import { expect, test } from '@playwright/test';
import { gotoWithTheme } from './helpers/theme';

const KIT = '/kit/avatar/';

test.describe('/kit/avatar/', () => {
  test('four sizes at 24/36/48/96px, photos as <img>, no console error', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(KIT);

    const widths = await page
      .getByTestId('sizes-initials')
      .locator('.ird-avatar')
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
    expect(widths).toEqual([24, 36, 48, 96]);

    const photos = page.getByTestId('sizes-photo').locator('img');
    await expect(photos).toHaveCount(4);
    await expect(photos.first()).toHaveAttribute('alt', 'Flor Alfaro');

    const painted = await page
      .locator('.ird-avatar, .ird-avatar *')
      .evaluateAll(
        (els) => els.filter((el) => getComputedStyle(el).backgroundImage !== 'none').length,
      );
    expect(painted).toBe(0);
    expect(errors).toEqual([]);
  });

  test('a photo that fails to load leaves initials that carry the name', async ({ page }) => {
    await page.goto(KIT);
    const broken = page.locator('[data-case="broken"] .ird-avatar');
    // In view, so the lazy image actually loads (and fails). A data URL can fail
    // before hydration, when no onerror handler exists yet — the fallback must
    // still happen.
    await broken.scrollIntoViewIfNeeded();
    await expect(broken.locator('img')).toHaveCount(0);
    await expect(broken).toHaveAttribute('role', 'img');
    await expect(broken).toHaveAttribute('aria-label', 'Ana Pastor');
    await expect(broken.locator('.ird-avatar__fallback')).toHaveText('AP');
  });

  test('a refused URL never becomes an <img>; a name without letters shows the glyph', async ({
    page,
  }) => {
    await page.goto(KIT);
    const refused = page.locator('[data-case="refused"] .ird-avatar');
    await expect(refused.locator('img')).toHaveCount(0);
    await expect(refused.locator('.ird-avatar__fallback')).toHaveText('JP');
    await expect(page.locator('img[src^="javascript:"]')).toHaveCount(0);
    await expect(page.locator('[data-case="no-letters"] .ird-avatar .fa-user')).toHaveCount(1);
  });

  test('named alone, decorative beside a visible name', async ({ page }) => {
    await page.goto(KIT);
    // Named once (the standalone photo); the list row and the footer hide theirs.
    await expect(
      page.getByRole('img', { name: 'Pastor Raúl García Guerra', exact: true }),
    ).toHaveCount(1);
    await expect(page.locator('.people .ird-avatar').first()).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    await expect(page.locator('.people img').first()).toHaveAttribute('alt', '');
  });

  test('keyboard: the footer logout is reachable and named; avatars are not stops', async ({
    page,
  }) => {
    await page.goto(KIT);
    const logout = page.getByRole('button', { name: 'Cerrar sesión' });
    await logout.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.locator('.facts__row', { hasText: 'Cierres de sesión simulados' }).locator('dd'),
    ).toHaveText('1');
    const focusable = await page
      .locator('.ird-avatar, .ird-avatar *')
      .evaluateAll((els) => els.filter((el) => (el as HTMLElement).tabIndex >= 0).length);
    expect(focusable).toBe(0);
  });

  test('no horizontal scroll at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(KIT);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('the disc: slate with fixed white initials, in both themes', async ({ page }) => {
    await page.goto(KIT);
    const disc = page.locator('[data-case="none"] .ird-avatar');
    await expect(disc).toHaveCSS('background-color', 'rgb(57, 69, 72)');
    await expect(disc).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(disc).toHaveCSS('border-radius', /^(9999px|50%)$/);

    await gotoWithTheme(page, KIT, 'dark');
    const dark = page.locator('[data-case="none"] .ird-avatar');
    await expect(dark).toHaveCSS('background-color', 'rgb(49, 53, 55)');
    await expect(dark).toHaveCSS('color', 'rgb(255, 255, 255)');
  });
});
