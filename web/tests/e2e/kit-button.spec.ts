// S14 — /kit/button/ in a real browser: the things jsdom cannot answer.
// Computed token values, the focus ring, the loading width, the palette swap,
// 360px and reduced motion. Not part of the CI gate — run with
// `npm run test:e2e` after `npx playwright install chromium`.
import { expect, test } from '@playwright/test';

test.describe('/kit/button/', () => {
  test('the primary variant resolves to its tokens and renders with no console error', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/kit/button/');

    const primary = page.locator('.ird-btn--primary').first();
    // --color-dark #394548 fill, fixed white ink (--color-white would drop
    // danger/secondary below 4.5:1 in dark), --radius-md, --fs-btn, weight 600.
    await expect(primary).toHaveCSS('background-color', 'rgb(57, 69, 72)');
    await expect(primary).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(primary).toHaveCSS('border-radius', '10px');
    await expect(primary).toHaveCSS('font-weight', '600');
    const fontSize = parseFloat(await primary.evaluate((el) => getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(15);
    expect(fontSize).toBeLessThanOrEqual(17);
    const minHeight = parseFloat(await primary.evaluate((el) => getComputedStyle(el).minHeight));
    expect(minHeight).toBeGreaterThanOrEqual(44);

    expect(errors).toEqual([]);
  });

  test('href picks the element: <a> with it, <button> without', async ({ page }) => {
    await page.goto('/kit/button/');
    const facts = await page.locator('.facts').innerText();
    expect(facts).toContain('<button>');
    expect(facts).toContain('<a>');
  });

  test('disabled is dimmed and refuses the pointer', async ({ page }) => {
    await page.goto('/kit/button/');
    const disabled = page.locator('.ird-btn.is-disabled').first();
    await expect(disabled).toHaveCSS('opacity', '0.5');
    await expect(disabled).toHaveCSS('cursor', 'not-allowed');
  });

  test('loading keeps the width and hides the label with opacity', async ({ page }) => {
    await page.goto('/kit/button/');
    const row = page.locator('.matrix__row', { hasText: 'primary' }).first();
    const rest = await row.locator('.ird-btn').nth(0).boundingBox();
    const loading = await row.locator('.ird-btn').nth(2).boundingBox();
    expect(Math.abs(rest!.width - loading!.width)).toBeLessThan(0.5);

    const label = row.locator('.ird-btn.is-loading .ird-btn__label');
    await expect(label).toHaveCSS('opacity', '0');
    await expect(row.locator('.ird-btn.is-loading .ird-btn__spinner .icon')).toBeVisible();
    await expect(row.locator('.ird-btn.is-loading')).toHaveAttribute('aria-busy', 'true');
  });

  test('keyboard focus draws a visible ring', async ({ page }) => {
    await page.goto('/kit/button/');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => {
      const cs = getComputedStyle(document.activeElement as Element);
      return { width: cs.outlineWidth, style: cs.outlineStyle };
    });
    expect(ring).toEqual({ width: '2px', style: 'solid' });
  });

  test('the accent follows the surface: gold on public, slate in admin', async ({ page }) => {
    await page.goto('/kit/button/');
    await expect(page.locator('.compare__col:not([data-surface]) .ird-btn--secondary')).toHaveCSS(
      'background-color',
      'rgb(154, 106, 44)',
    );
    await expect(page.locator('.compare__col[data-surface="admin"] .ird-btn--secondary')).toHaveCSS(
      'background-color',
      'rgb(71, 85, 105)',
    );
  });

  test('no horizontal scroll at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/kit/button/');
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      inner: window.innerWidth,
    }));
    expect(overflow.doc).toBeLessThanOrEqual(overflow.inner);
  });

  test('forced dark flips the surface without a light hairline border', async ({ page }) => {
    await page.goto('/kit/button/');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const ghost = page.locator('.ird-btn--ghost').first();
    await expect(ghost).toHaveCSS('background-color', 'rgb(26, 38, 42)');
    // --gray-50 goes LIGHTER in dark (#cccccc); the translucent idiom does not.
    await expect(ghost).toHaveCSS('border-top-color', 'rgba(127, 127, 127, 0.25)');
  });

  // emulateMedia() in the body, not test.use({ reducedMotion }): the fixture
  // option did not reach matchMedia() in this Playwright build (verified — the
  // query still read `false`), which would have made this test pass vacuously.
  test('reduced motion neutralises every transition', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/kit/button/');
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      true,
    );

    const durations = await page
      .locator('.ird-btn--primary')
      .first()
      .evaluate((el) =>
        getComputedStyle(el)
          .transitionDuration.split(',')
          .map((d) => parseFloat(d)),
      );
    for (const d of durations) expect(d).toBeLessThanOrEqual(0.0001);
    // The page's own readout is auto-retried: the rune settles asynchronously.
    await expect(page.locator('.facts')).toContainText('activado');
  });
});
