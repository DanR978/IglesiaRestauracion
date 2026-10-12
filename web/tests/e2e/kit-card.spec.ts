// S14 — /kit/card/ in a real browser: one radius and one shadow, the false
// affordance made structural (only interactive cards get a pointer), the KPI
// type steps resolved from the fluid scale, the pure-CSS grid, 360px and dark.
// Not part of the CI gate — run with `npm run test:e2e`.
import { expect, test } from '@playwright/test';

test.describe('/kit/card/', () => {
  test('one radius, one surface, no console error', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/kit/card/');

    const card = page.locator('.ird-card').first();
    // --radius-md, not .dash-card's 16px.
    await expect(card).toHaveCSS('border-radius', '10px');
    await expect(card).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    expect(errors).toEqual([]);
  });

  test('static renders a <div>, interactive a real <a>/<button>', async ({ page }) => {
    await page.goto('/kit/card/');
    const tags = await page
      .locator('.ird-card')
      .evaluateAll((els) => [...new Set(els.map((e) => e.tagName))].sort());
    expect(tags).toEqual(['A', 'BUTTON', 'DIV']);
  });

  test('only an interactive card offers the pointer (no false affordance)', async ({ page }) => {
    await page.goto('/kit/card/');
    await expect(page.locator('.ird-card--static').first()).toHaveCSS('cursor', 'auto');
    await expect(page.locator('.ird-card--interactive').first()).toHaveCSS('cursor', 'pointer');
  });

  test('the KPI tile spans the re-tuned type scale and states its scope', async ({ page }) => {
    await page.goto('/kit/card/');
    const tile = page.locator('.ird-card--kpi').first();
    const value = parseFloat(
      await tile.locator('.ird-card__kpi-value').evaluate((el) => getComputedStyle(el).fontSize),
    );
    const label = parseFloat(
      await tile.locator('.ird-card__kpi-label').evaluate((el) => getComputedStyle(el).fontSize),
    );
    // --fs-xl (24–32) over --fs-xs (12–14), with --fs-lg available between them
    // for a heading — the mid-range step the legacy scale never had (D-015).
    expect(value).toBeGreaterThanOrEqual(24);
    expect(value).toBeLessThanOrEqual(32);
    expect(label).toBeGreaterThanOrEqual(12);
    expect(label).toBeLessThanOrEqual(14);
    await expect(tile.locator('.ird-card__kpi-scope')).not.toBeEmpty();
  });

  test('the alert tone reads from the semantic status token', async ({ page }) => {
    await page.goto('/kit/card/');
    await expect(page.locator('.ird-card--alert .ird-card__kpi-value')).toHaveCSS(
      'color',
      'rgb(176, 32, 48)',
    );
  });

  test('the card grid is pure CSS — nothing sets grid-column at runtime (G-010)', async ({
    page,
  }) => {
    await page.goto('/kit/card/');
    const inline = await page
      .locator('.cardgrid .ird-card')
      .evaluateAll((els) => els.some((e) => (e as HTMLElement).style.gridColumn));
    expect(inline).toBe(false);
  });

  test('no horizontal scroll at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/kit/card/');
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      inner: window.innerWidth,
    }));
    expect(overflow.doc).toBeLessThanOrEqual(overflow.inner);
  });

  test('forced dark flips the surface and keeps the border subtle', async ({ page }) => {
    await page.goto('/kit/card/');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const card = page.locator('.ird-card').first();
    await expect(card).toHaveCSS('background-color', 'rgb(26, 38, 42)');
    await expect(card).toHaveCSS('border-top-color', 'rgba(127, 127, 127, 0.18)');
  });
});
