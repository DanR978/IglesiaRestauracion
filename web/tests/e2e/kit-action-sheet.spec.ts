// S17 — real-browser proof of the ROADMAP "done when": the desktop popover
// anchors to its trigger and repositions on scroll/resize/viewport edges, ≤640px
// becomes a bottom sheet, and the menu is a keyboard-navigable role=menu that
// Escape closes with focus back on the trigger. Runs against `vite preview`
// (playwright.config); not part of the CI gate.
import { expect, test, type Page } from '@playwright/test';

const KIT = '/kit/action-sheet/';
const GUTTER = 12;

const menu = (page: Page) => page.getByRole('menu');

test.describe('kit/action-sheet — desktop popover', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('anchors to the trigger, right-aligned and below it, with no console errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(KIT);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Menú de acciones');
    await expect(page.locator('.facts')).toContainText('popover anclado');

    const trigger = page.getByRole('button', { name: 'Acciones de Vigilia de oración' });
    // Park it mid-viewport so the popover's default placement (below) is the
    // one under test; the flip is covered by the next case.
    await trigger.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await trigger.click();
    await expect(menu(page)).toBeVisible();

    const t = (await trigger.boundingBox())!;
    const m = (await menu(page).boundingBox())!;
    expect(Math.abs(m.x + m.width - (t.x + t.width))).toBeLessThanOrEqual(1);
    expect(m.y).toBeGreaterThan(t.y + t.height);
    expect(m.y - (t.y + t.height)).toBeLessThanOrEqual(10);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(errors).toEqual([]);
  });

  test('flips up and clamps inside both gutters at the viewport corners', async ({ page }) => {
    await page.goto(KIT);

    for (const name of ['Arriba izq.', 'Arriba der.', 'Abajo izq.', 'Abajo der.']) {
      const trigger = page.getByRole('button', { name, exact: true });
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();
      await expect(menu(page)).toBeVisible();
      const t = (await trigger.boundingBox())!;
      const m = (await menu(page).boundingBox())!;
      expect(m.x, name).toBeGreaterThanOrEqual(GUTTER - 1);
      expect(m.x + m.width, name).toBeLessThanOrEqual(1280 - GUTTER + 1);
      expect(m.y, name).toBeGreaterThanOrEqual(GUTTER - 1);
      // Either below the trigger, or flipped above it — never overlapping the edge.
      const below = m.y >= t.y + t.height;
      expect(below || m.y + m.height <= t.y + 1, name).toBe(true);
      await page.keyboard.press('Escape');
      await expect(menu(page)).toHaveCount(0);
    }
  });

  test('repositions while the page scrolls under it', async ({ page }) => {
    await page.goto(KIT);
    const trigger = page.getByRole('button', { name: 'Acciones de Retiro de matrimonios' });
    await trigger.click();
    await expect(menu(page)).toBeVisible();

    const before = (await menu(page).boundingBox())!;
    await page.mouse.move(640, 400);
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(120);
    const after = (await menu(page).boundingBox())!;
    const t = (await trigger.boundingBox())!;

    expect(after.y).not.toBe(before.y);
    expect(Math.abs(after.x + after.width - (t.x + t.width))).toBeLessThanOrEqual(1);
  });

  test('is a keyboard-navigable menu that Escape closes back onto the trigger', async ({
    page,
  }) => {
    await page.goto(KIT);
    const trigger = page.getByRole('button', { name: 'Acciones de Escuela Bíblica de Vacaciones' });
    await trigger.click();

    const items = page.getByRole('menuitem');
    await expect(items).toHaveCount(4);
    await expect(items.first()).toBeFocused();

    await page.keyboard.press('ArrowDown');
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(items.nth(3)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(items.first()).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).not.toHaveAttribute('aria-expanded', /.*/);
  });

  test('runs the chosen action, and a disabled row does nothing', async ({ page }) => {
    await page.goto(KIT);
    await page.getByRole('button', { name: 'Con fila deshabilitada' }).click();

    const disabled = page.getByRole('menuitem', { name: /Marcar pagado/ });
    await expect(disabled).toHaveAttribute('aria-disabled', 'true');
    // Playwright refuses to click it (aria-disabled fails the actionability
    // check) — dispatch anyway to prove the handler ignores it too.
    await disabled.dispatchEvent('click');
    await expect(menu(page)).toBeVisible();

    await page.getByRole('menuitem', { name: 'Duplicar' }).click();
    await expect(menu(page)).toHaveCount(0);
    await expect(page.locator('.facts')).toContainText('Duplicar');
  });

  test('groups render a labelled section, a separator and an empty fallback', async ({ page }) => {
    await page.goto(KIT);
    await page.getByRole('button', { name: 'Con grupos' }).click();
    const group = page.getByRole('group', { name: 'Mover a otro grupo' });
    await expect(group.getByRole('menuitem')).toHaveCount(2);
    await expect(page.getByRole('separator')).toHaveCount(1);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Sección vacía' }).click();
    await expect(page.getByRole('group', { name: 'Mover a otro grupo' })).toContainText(
      'No hay otros grupos todavía.',
    );
    await expect(page.getByRole('menuitem')).toHaveCount(1);
  });
});

test.describe('kit/action-sheet — 360px bottom sheet', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('slides up from the bottom, offers Cancelar, and never scrolls sideways', async ({
    page,
  }) => {
    await page.goto(KIT);
    await expect(page.locator('.facts')).toContainText('hoja inferior');

    await page.getByRole('button', { name: 'Acciones de Vigilia de oración' }).click();
    const sheet = menu(page);
    await expect(sheet).toBeVisible();

    const box = (await sheet.boundingBox())!;
    expect(box.x).toBeGreaterThan(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    expect(box.y + box.height).toBeGreaterThan(740 - 40);

    const cancel = page.getByRole('menuitem', { name: 'Cancelar', exact: true });
    await expect(cancel).toBeVisible();
    // Every row clears the 44px touch target.
    for (const item of await page.getByRole('menuitem').all()) {
      expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    await cancel.click();
    await expect(sheet).toHaveCount(0);
  });
});
