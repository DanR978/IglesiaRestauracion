// S12 — real-browser proof of the ROADMAP "done when": container/zigzag render,
// mobile inputs compute ≥16px, reduce-motion kills transitions. Runs against
// `vite preview` (playwright.config).
import { expect, test } from '@playwright/test';

const KIT = '/kit/base/';
const CONTROLS =
  'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), select, textarea, [contenteditable=true]';

test.describe('kit/base — 360px phone', () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });

  test('every form control computes ≥16px and nothing scrolls sideways', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(KIT);

    const sizes = await page
      .locator(CONTROLS)
      .evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
    expect(sizes.length).toBeGreaterThanOrEqual(9); // 6 inputs + select + textarea + contenteditable
    for (const px of sizes) expect(px).toBeGreaterThanOrEqual(16);

    const noHScroll = await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= window.innerWidth &&
        document.body.scrollWidth <= window.innerWidth,
    );
    expect(noHScroll).toBe(true);
    await expect(page.locator('.wrapper--zigzag-grid')).toHaveCSS(
      'grid-template-columns',
      /^\d+(\.\d+)?px$/,
    );
    expect(errors).toEqual([]);
  });
});

test.describe('kit/base — desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('container and zigzag render from tokens; the mobile floor stays off', async ({ page }) => {
    await page.goto(KIT);
    const wrapper = page.locator('.wrapper').first();
    await expect(wrapper).toHaveCSS('border-radius', '10px');
    await expect(wrapper).toHaveCSS('overflow-x', 'clip');
    await expect(wrapper).not.toHaveCSS('box-shadow', 'none');
    await expect(page.locator('.wrapper--zigzag-grid')).toHaveCSS(
      'grid-template-columns',
      /^\d+(\.\d+)?px \d+(\.\d+)?px$/,
    );
    const desktopInput = await page
      .locator('input[type=text]')
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(desktopInput).toBeLessThan(16);
  });

  test('skip link is hidden until Tab, then visible with the global focus ring', async ({
    page,
  }) => {
    await page.goto(KIT);
    const skip = page.locator('.skip-link');
    await expect(skip).not.toHaveCSS('transform', 'none');
    await page.keyboard.press('Tab');
    await expect(skip).toBeFocused();
    await expect(skip).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    await expect(skip).toHaveCSS('outline-style', 'solid');
  });

  test('prefers-reduced-motion kills transitions, shows reveals, and reduced-motion.ts reacts', async ({
    page,
  }) => {
    await page.goto(KIT);
    const reveal = page.locator('.scroll-fade-up').first();
    await expect(reveal).toHaveCSS('transition-duration', '0.85s, 0.85s, 0.85s');
    await expect(reveal).toHaveCSS('opacity', '0');
    await expect(page.locator('.facts')).toContainText('no solicitado');
    await expect(page.locator('.facts')).toContainText('motionMs(240) = 240');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(reveal).toHaveCSS('transition-duration', '0s');
    await expect(reveal).toHaveCSS('opacity', '1');
    await expect(page.locator('.autoRotate')).toHaveCSS('animation-name', 'none');
    await expect(page.locator('.facts')).toContainText('activado');
    await expect(page.locator('.facts')).toContainText('motionMs(240) = 0');
  });
});
