// PR-C2 — /kit/states/ in a real browser: each skeleton shape at its stable
// size with aria-busy and a hidden "Cargando…", the pulse stopped by reduced
// motion, the empty state's primary action, error ≠ empty at a glance, and the
// live view: Reintentar shows progress, a repeated failure is re-announced,
// the next retry brings the content. Plus words-as-text, 360px, forced dark.
import { expect, test } from '@playwright/test';
import { gotoWithTheme } from './helpers/theme';

const KIT = '/kit/states/';

test.describe('/kit/states/', () => {
  test('every skeleton shape is aria-busy with a hidden status, at a stable size', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(KIT);

    for (const shape of ['card-grid', 'table', 'list', 'detail']) {
      const loading = page.locator(`[data-shape="${shape}"] .ird-state--loading`);
      await expect(loading, shape).toHaveAttribute('aria-busy', 'true');
      const status = loading.getByRole('status');
      await expect(status, shape).toHaveText('Cargando…');
      await expect(status, shape).toHaveCSS('position', 'absolute');
      await expect(loading.locator('.ird-state__skeleton'), shape).toHaveAttribute(
        'aria-hidden',
        'true',
      );
    }

    const cards = page.locator('[data-shape="card-grid"] .ird-state__card');
    await expect(cards).toHaveCount(4);
    const cardHeight = (await cards.first().boundingBox())!.height;
    expect(cardHeight).toBeGreaterThanOrEqual(128); // --state-card-height: 8rem
    const rows = page.locator('[data-shape="table"] .ird-state__row:not(.ird-state__row--head)');
    await expect(rows).toHaveCount(3);
    expect((await rows.first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(errors).toEqual([]);
  });

  test('the bones pulse, and stop under reduced motion', async ({ page }) => {
    await page.goto(KIT);
    const bone = page.locator('[data-shape="list"] .ird-state__bone').first();
    expect(await bone.evaluate((el) => getComputedStyle(el).animationName)).not.toBe('none');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(page.locator('.facts')).toContainText('activado');
    expect(
      await page
        .locator('[data-shape="list"] .ird-state__bone')
        .first()
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe('none');
  });

  test('empty: glyph, one sentence, a hint and a working primary action', async ({ page }) => {
    await page.goto(KIT);
    const empty = page.getByTestId('empty').locator('.ird-state--empty').first();
    await expect(empty.locator('.ird-state__message')).toHaveText('Aún no hay álbumes.');
    await expect(empty.locator('.ird-state__hint')).toContainText('galería');
    await expect(empty.getByRole('alert')).toHaveCount(0);
    await empty.getByRole('button', { name: 'Nuevo álbum' }).click();
    await expect(page.getByText('Álbumes creados en esta página: 1')).toBeVisible();
  });

  test('error never looks like empty: solid error tone vs dashed neutral', async ({ page }) => {
    await page.goto(KIT);
    const error = page.locator('.ird-state--error').first();
    const empty = page.locator('.ird-state--empty').first();
    await expect(error).toHaveCSS('border-top-style', 'solid');
    await expect(empty).toHaveCSS('border-top-style', 'dashed');
    const [errorBg, emptyBg] = await Promise.all([
      error.evaluate((el) => getComputedStyle(el).backgroundColor),
      empty.evaluate((el) => getComputedStyle(el).backgroundColor),
    ]);
    expect(errorBg).not.toBe(emptyBg);
    await expect(error.locator('.fa-triangle-exclamation')).toHaveCount(1);
    await expect(error.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  });

  test('live view: retry shows progress, a repeat failure is re-announced, then content', async ({
    page,
  }) => {
    await page.goto(KIT);
    const live = page.getByTestId('live');
    await expect(live).toHaveAttribute('data-view', 'error');
    const retry = live.getByRole('button', { name: 'Reintentar' });
    // Mark the current alert node: a re-announcement replaces it.
    await live.getByRole('alert').evaluate((el) => el.setAttribute('data-seen', ''));

    await retry.click();
    await expect(retry).toHaveAttribute('aria-busy', 'true');
    await expect(live).toHaveAttribute('data-view', 'error'); // the error stays while it runs
    await expect(retry).not.toHaveAttribute('aria-busy', { timeout: 5000 });
    await expect(page.getByTestId('attempts')).toHaveText('1');
    await expect(live.getByRole('alert')).toHaveText(
      'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
    );
    await expect(live.locator('[role="alert"][data-seen]')).toHaveCount(0);

    // Second try by keyboard: succeeds.
    await retry.focus();
    await page.keyboard.press('Enter');
    await expect(live).toHaveAttribute('data-view', 'ok', { timeout: 5000 });
    await expect(live.locator('.events__row')).toHaveCount(3);
  });

  test('the message is text, never markup', async ({ page }) => {
    await page.goto(KIT);
    const block = page.getByTestId('text-only');
    await expect(block.getByRole('alert')).toContainText('<img src=x onerror="alert(1)">');
    await expect(block.locator('img')).toHaveCount(0);
  });

  test('no horizontal scroll at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(KIT);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('forced dark: error tint, empty surface and bones reverse via tokens', async ({ page }) => {
    await gotoWithTheme(page, KIT, 'dark');
    await expect(page.locator('.ird-state--error').first()).toHaveCSS(
      'background-color',
      'rgba(242, 139, 139, 0.14)',
    );
    await expect(page.locator('.ird-state--empty').first()).toHaveCSS(
      'background-color',
      'rgb(26, 38, 42)',
    );
    await expect(page.locator('.ird-state__message').first()).toHaveCSS(
      'color',
      'rgb(240, 245, 247)',
    );
    await expect(page.locator('.ird-state__bone').first()).toHaveCSS(
      'background-color',
      'rgba(127, 127, 127, 0.16)',
    );
  });
});
