// S20 — real-browser proof of the ROADMAP "done when": the viewer opens from a
// tile, the keys and the backdrop work, the page underneath is scroll-locked
// and gets its position back, the download produces a real file with our
// filename (the cross-origin `download` fix), share falls back to the
// clipboard, there is no horizontal scroll at 360px, and the surface stays
// dark in both themes. Runs against `vite preview` (playwright.config);
// not part of the CI gate.
import { expect, test, type Page } from '@playwright/test';

const KIT = '/kit/lightbox/';

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Visor de imagen' });
const counter = (page: Page) => page.locator('.lightbox__counter');

/** Open the demo album on a tile, which is also what returns focus on close. */
async function openFromTile(page: Page, index = 0): Promise<void> {
  await page.locator('.tile').nth(index).click();
  await expect(dialog(page)).toBeVisible();
}

test.describe('kit/lightbox', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('opens from a tile, walks with the arrows and closes on Escape', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));

    await page.goto(KIT);
    await openFromTile(page, 0);

    await expect(counter(page)).toHaveText('1 / 4');
    await expect(page.locator('.lightbox__img')).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(counter(page)).toHaveText('2 / 4');

    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(counter(page)).toHaveText('4 / 4');

    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    // Focus went back to the tile that opened it.
    await expect(page.locator('.tile').first()).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('closes on the backdrop but not on the photo itself', async ({ page }) => {
    await page.goto(KIT);
    await openFromTile(page, 0);

    await page.locator('.lightbox__img').click();
    await expect(dialog(page)).toBeVisible();

    await page.locator('.lightbox__scrim').click({ position: { x: 5, y: 5 } });
    await expect(dialog(page)).toHaveCount(0);
  });

  test('locks the page scroll while open and gives the position back', async ({ page }) => {
    await page.goto(KIT);
    await page.evaluate(() => window.scrollTo(0, 600));
    await openFromTile(page, 1);
    // Read the position AFTER opening: clicking the tile scrolls it into view.
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(0);
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');
    await page.mouse.wheel(0, 400);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);

    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    // Restored to what the stylesheet says, not hard-cleared to '' — base/reset
    // sets `overflow-x: clip` on body and the lock must give that back.
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe(
      'clip visible',
    );
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });

  test('downloads a real file named after the photo', async ({ page }) => {
    await page.goto(KIT);
    await openFromTile(page, 0);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByLabel('Descargar la foto').click(),
    ]);
    expect(download.suggestedFilename()).toBe('foto-1.svg');
    // The viewer is still there: the legacy navigated away to the image.
    await expect(dialog(page)).toBeVisible();
  });

  test('shares by copying the link when there is no share sheet', async ({ page }) => {
    await page.addInitScript(() => {
      const copied: string[] = [];
      Object.defineProperty(window, '__copied', { value: copied });
      Reflect.deleteProperty(navigator, 'share');
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: (text: string) => {
            copied.push(text);
            return Promise.resolve();
          },
        },
      });
    });
    await page.goto(KIT);
    await openFromTile(page, 2);

    await page.getByLabel('Compartir la foto').click();
    await expect(page.locator('.toast')).toHaveText(/Enlace copiado/);
    expect(
      await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied),
    ).toEqual([`${new URL(page.url()).origin}/kit/lightbox/foto-3.svg`]);
  });

  test('a one-photo album disables both arrows', async ({ page }) => {
    await page.goto(KIT);
    await page.getByRole('button', { name: 'Álbum de una sola foto' }).click();
    await expect(dialog(page)).toBeVisible();

    await expect(counter(page)).toHaveText('1 / 1');
    await expect(page.locator('.lightbox__nav--prev')).toBeDisabled();
    await expect(page.locator('.lightbox__nav--next')).toBeDisabled();
    await page.keyboard.press('ArrowRight');
    await expect(counter(page)).toHaveText('1 / 1');
  });

  test('stays dark in both themes and never scrolls sideways at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(KIT);
    // The long-caption photo is the worst case for the bottom bar.
    await openFromTile(page, 3);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const bar = await page.locator('.lightbox__bar').boundingBox();
    expect(bar?.width).toBeLessThanOrEqual(360);

    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (value) => document.documentElement.setAttribute('data-theme', value),
        theme,
      );
      const background = await dialog(page).evaluate((el) => getComputedStyle(el).backgroundColor);
      const ink = await counter(page).evaluate((el) => getComputedStyle(el).color);
      // A photo viewer is a fixed-dark surface: it must NOT reverse with the theme.
      const channels = (background.match(/[\d.]+/g) ?? []).map(Number).slice(0, 3);
      expect(Math.max(...channels)).toBeLessThan(40);
      expect(ink).toBe('rgb(255, 255, 255)');
    }
  });

  test('honours reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(KIT);
    await openFromTile(page, 0);

    const names = await dialog(page).evaluate((el) => [
      getComputedStyle(el).animationName,
      getComputedStyle(el.querySelector('.lightbox__img') as Element).animationName,
    ]);
    expect(names).toEqual(['none', 'none']);
  });
});
