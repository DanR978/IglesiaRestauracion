// S11 — real-browser proof of the ROADMAP "done when": var(--fs-lg) resolves,
// light/dark/system flips the palette, and a forced theme paints BEFORE the app
// bundle runs (no reload flash). Runs against `vite preview` (playwright.config).
import { expect, test, type Page } from '@playwright/test';

const KIT = '/kit/tokens/';
const WHITE = 'rgb(255, 255, 255)';
const DARK_BG = 'rgb(18, 28, 31)'; // --color-bg-light in the dark palette

const bodyBg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const themeAttr = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const rootVar = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

test.describe('kit/tokens — light OS', () => {
  test.use({ colorScheme: 'light', viewport: { width: 1280, height: 900 } });

  test('renders with no console errors and var(--fs-lg) resolves', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(KIT);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tokens de diseño');
    expect(await rootVar(page, '--fs-lg')).toMatch(/^clamp\(/);
    // 1280px is the top of the fluid ramp → --fs-lg = 1.5rem = 24px
    await expect(page.locator('.kit__section h2').first()).toHaveCSS('font-size', '24px');
    expect(errors).toEqual([]);
  });

  test('light / dark / system toggle flips the palette and persists', async ({ page }) => {
    await page.goto(KIT);
    expect(await themeAttr(page)).toBeNull();
    expect(await bodyBg(page)).toBe(WHITE);

    await page.getByRole('button', { name: 'Oscuro' }).click();
    expect(await themeAttr(page)).toBe('dark');
    expect(await bodyBg(page)).toBe(DARK_BG);
    expect(await page.evaluate(() => localStorage.getItem('ird.theme'))).toBe('dark');
    expect(await rootVar(page, '--money-pos')).toBe('#4fc3a1');

    await page.getByRole('button', { name: 'Claro' }).click();
    expect(await themeAttr(page)).toBe('light');
    expect(await bodyBg(page)).toBe(WHITE);
    expect(await rootVar(page, '--money-pos')).toBe('#1e6b61');

    await page.getByRole('button', { name: 'Sistema' }).click();
    expect(await themeAttr(page)).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('ird.theme'))).toBeNull();
  });

  test('no FOUC: a stored dark theme is painted with the app bundle blocked', async ({
    page,
    context,
  }) => {
    await page.goto(KIT);
    await page.getByRole('button', { name: 'Oscuro' }).click();
    await context.route('**/_app/**/*.js', (route) => route.abort());
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(await themeAttr(page)).toBe('dark');
    expect(await bodyBg(page)).toBe(DARK_BG);
    await context.unroute('**/_app/**/*.js');
    await page.reload();
    await expect(page.locator('.theme__btn.is-active')).toHaveText('Oscuro');
  });

  test('[data-surface="admin"] neutralises the brand accents to slate', async ({ page }) => {
    await page.goto(KIT);
    const cols = page.locator('.compare__col');
    const read = (i: number) =>
      cols
        .nth(i)
        .evaluate((el) => getComputedStyle(el).getPropertyValue('--color-secondary').trim());
    expect(await read(0)).toBe('#9a6a2c');
    expect(await read(1)).toBe('#475569');
    const inks = await page
      .locator('.compare__col strong')
      .evaluateAll((els) => els.map((e) => getComputedStyle(e).color));
    expect(inks[0]).not.toBe(inks[1]);
  });
});

test.describe('kit/tokens — dark OS', () => {
  test.use({ colorScheme: 'dark', viewport: { width: 1280, height: 900 } });

  test('system follows the OS; forced light opts out of the media query', async ({ page }) => {
    await page.goto(KIT);
    expect(await themeAttr(page)).toBeNull();
    expect(await bodyBg(page)).toBe(DARK_BG);
    await page.getByRole('button', { name: 'Claro' }).click();
    expect(await bodyBg(page)).toBe(WHITE);
  });
});
