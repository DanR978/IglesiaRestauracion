// S13 — real-browser proof of the ROADMAP "done when": <Icon set="fas"> and
// <Icon set="sprite"> paint, the sprite is injected once, `label` toggles
// aria-label/aria-hidden, and spin honours reduced motion. Runs against
// `vite preview` (playwright.config); the Font Awesome check needs network.
import { expect, test } from '@playwright/test';

const KIT = '/kit/icon/';

test.describe('kit/icon', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('renders with no console errors; Font Awesome and the sprite both paint', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(KIT);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Iconos');

    // Font Awesome: the webfont resolved and the glyph pseudo-element has content.
    await expect(page.locator('.facts')).toContainText('cargado');
    const faReady = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check('900 1em "Font Awesome 6 Free"');
    });
    expect(faReady).toBe(true);
    const glyph = page.locator('i.fas.fa-church').first();
    const content = await glyph.evaluate((el) => getComputedStyle(el, '::before').content);
    expect(content).not.toBe('none');
    expect(content).not.toBe('');

    // Sprite: exactly one holder, every symbol present, and a <use> that has a box.
    expect(await page.locator('#svg-sprite-holder').count()).toBe(1);
    expect(await page.locator('#svg-sprite-holder symbol').count()).toBe(5);
    // (getBBox() returns a DOMRect, which does not serialise — copy the numbers out.)
    const box = await page
      .locator('svg.icon--sprite')
      .first()
      .evaluate((el) => {
        const r = (el as SVGGraphicsElement).getBBox();
        return { width: r.width, height: r.height };
      });
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);

    // Unknown names render nothing; the console gets a warning, not an error.
    await expect(page.locator('#h-invalid ~ .card__demo')).toContainText('0 iconos renderizados');
    expect(errors).toEqual([]);
  });

  test('`label` toggles aria-label vs aria-hidden', async ({ page }) => {
    await page.goto(KIT);
    const named = page.getByRole('img', { name: 'Notificaciones' });
    await expect(named).toHaveCount(1);
    await expect(named).toHaveAttribute('aria-label', 'Notificaciones');
    await expect(named).not.toHaveAttribute('aria-hidden', /.*/);

    const decorative = page.locator('.tile i.fa-bell').first();
    await expect(decorative).toHaveAttribute('aria-hidden', 'true');
    await expect(decorative).not.toHaveAttribute('role', /.*/);

    // The sprite branch behaves identically.
    const logo = page.getByRole('img', { name: 'Iglesia Restauración' });
    await expect(logo).toHaveAttribute('aria-label', 'Iglesia Restauración');
    const plainSprite = page.locator('.tile svg.icon--sprite').first();
    await expect(plainSprite).toHaveAttribute('aria-hidden', 'true');

    // Icon-only controls are named on the control, their icon stays decorative.
    const menu = page.getByRole('button', { name: 'Menú' });
    await expect(menu).toBeVisible();
    await expect(menu.locator('i')).toHaveAttribute('aria-hidden', 'true');
  });

  test('spin animates, and stops under prefers-reduced-motion', async ({ page }) => {
    await page.goto(KIT);
    const sprite = page.locator('svg.icon--spin').first();
    const fa = page.locator('i.fa-spin').first();
    await expect(sprite).toHaveCSS('animation-name', /icon-spin/);
    await expect(fa).toHaveCSS('animation-name', 'fa-spin');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('.facts')).toContainText('activado');
    await expect(sprite).toHaveCSS('animation-name', 'none');
    // Font Awesome's own guard collapses the loop to a single 1ms iteration.
    await expect(fa).toHaveCSS('animation-iteration-count', '1');
  });
});

test.describe('kit/icon — 360px', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('no horizontal scroll and the footer-size logo keeps its box', async ({ page }) => {
    await page.goto(KIT);
    await expect(page.locator('.facts')).toContainText('360px');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const logo = page.getByRole('img', { name: 'Iglesia Restauración' });
    const rect = await logo.boundingBox();
    expect(rect?.width).toBe(56);
    expect(rect?.height).toBe(70);
  });
});
