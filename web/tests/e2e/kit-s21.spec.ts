// S21 — real-browser proof of the ROADMAP "done when": the admin-ux
// conventions (a collapsed-by-default panel behind a labelled toggle), the
// table card-collapses with NO horizontal scroll at 360px, and the wizard
// drives the field-type contract. Runs against `vite preview`
// (playwright.config); not part of the CI gate.
import { expect, test, type Page } from '@playwright/test';

const CONTROLS =
  'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), select, textarea';

async function noHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth <= window.innerWidth &&
      document.body.scrollWidth <= window.innerWidth,
  );
}

test.describe('kit/disclosure', () => {
  test('secondary panels start collapsed behind a labelled toggle', async ({ page }) => {
    await page.goto('/kit/disclosure/');
    const trigger = page.getByRole('button', { name: /^Filtros/ });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    const panelId = await trigger.getAttribute('aria-controls');
    const panel = page.locator(`#${panelId}`);
    await expect(panel).toBeHidden();

    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toBeVisible();
  });

  test('the applied state is readable while collapsed', async ({ page }) => {
    await page.goto('/kit/disclosure/');
    const trigger = page.getByRole('button', { name: /^Filtros/ });
    await trigger.click();
    await page.locator('.panel select').first().selectOption('dom');
    await trigger.click(); // collapse again

    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger.locator('.disclosure__count')).toHaveText('1');
    await expect(trigger.locator('.disclosure__summary')).toHaveText('Domingo');
  });

  test('refresh() reloads the panel without closing it', async ({ page }) => {
    await page.goto('/kit/disclosure/');
    await page.getByRole('button', { name: /^Miembros/ }).click();
    await expect(page.getByText('veces cargado').locator('xpath=following-sibling::dd')).toHaveText(
      '1',
    );
    await page.getByRole('button', { name: 'Actualizar' }).click();
    await expect(page.getByText('veces cargado').locator('xpath=following-sibling::dd')).toHaveText(
      '2',
    );
    await expect(page.getByRole('button', { name: /^Miembros/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});

test.describe('kit/data-table — 360px phone', () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });

  test('rows become labelled cards and nothing scrolls sideways', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/kit/data-table/');

    await expect(page.locator('.dt__head').first()).toBeHidden();
    const firstCell = page.locator('.dt').first().locator('.dt__td').first();
    await expect(firstCell).toHaveCSS('display', 'flex');
    // td::before carries the column label — the card view's "label : value".
    const label = await firstCell.evaluate(
      (el) => getComputedStyle(el, '::before').content as string,
    );
    expect(label).toContain('Se le debe a');

    expect(await noHorizontalScroll(page)).toBe(true);

    const sizes = await page
      .locator(CONTROLS)
      .evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
    for (const px of sizes) expect(px).toBeGreaterThanOrEqual(16);
    expect(errors).toEqual([]);
  });

  test('sorting stays reachable once the thead is hidden', async ({ page }) => {
    await page.goto('/kit/data-table/');
    // The page mounts two tables (public + admin surface); scope to the first.
    const table = page.locator('.dt').first();
    const picker = table.locator('.dt__sortpicker-select');
    await expect(picker).toBeVisible();
    await picker.selectOption('creditor');
    await expect(table.locator('.dt__td').first()).toContainText('Ábaco Papelería');
  });
});

test.describe('kit/data-table — desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('renders a real table whose sort control reorders the rows', async ({ page }) => {
    await page.goto('/kit/data-table/');
    const table = page.locator('.dt').first();
    await expect(table.locator('.dt__head')).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);

    const header = table.getByRole('button', { name: /Se le debe a/ });
    await header.click();
    await expect(table.locator('.dt__td').first()).toContainText('Ábaco Papelería');
    await expect(table.locator('.dt__th').first()).toHaveAttribute('aria-sort', 'ascending');
    await header.click();
    await expect(table.locator('.dt__th').first()).toHaveAttribute('aria-sort', 'descending');
  });

  test('loading, empty and error are three distinct built-in states', async ({ page }) => {
    await page.goto('/kit/data-table/');

    await page.getByRole('button', { name: 'Cargando' }).click();
    await expect(page.locator('.dt__row--skeleton').first()).toBeVisible();

    await page.getByRole('button', { name: 'Error' }).click();
    await expect(page.locator('.dt__state--error')).toBeVisible();
    await expect(page.locator('.dt__state--error')).toContainText('Revisa tu conexión');
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();

    await page.getByRole('button', { name: 'Vacío' }).click();
    await expect(page.locator('.dt__state--empty')).toBeVisible();
    await expect(page.locator('.dt__state--error')).toHaveCount(0);
  });
});

test.describe('kit/form-wizard — 360px phone', () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });

  test('walks the steps, blocks on a required field, reviews and reports the payload', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/kit/form-wizard/');

    await page.getByRole('button', { name: /Nuevo ingreso/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // 4 steps + the review screen.
    await expect(dialog.locator('.wiz__dot')).toHaveCount(5);
    expect(await noHorizontalScroll(page)).toBe(true);

    const amount = dialog.locator('input[type=number]');
    expect(
      await amount.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(16);

    await dialog.getByRole('button', { name: /Siguiente/ }).click();
    await expect(dialog.locator('.wiz__error')).toHaveText('Por favor completa: Monto.');

    await amount.fill('1234.5');
    await dialog.getByRole('button', { name: /Siguiente/ }).click();
    await dialog.locator('select').selectOption('Ofrenda');
    await dialog.getByRole('button', { name: /Siguiente/ }).click();
    await dialog.getByRole('button', { name: /Siguiente/ }).click();
    await dialog.getByRole('button', { name: /Revisar/ }).click();

    await expect(dialog).toContainText('Revisa antes de guardar');
    await expect(dialog).toContainText('$1,234.50');
    await expect(dialog).toContainText('Ofrenda');

    await dialog.getByRole('button', { name: /Guardar ingreso/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.payload')).toContainText('"amount": 1234.5');
    expect(errors).toEqual([]);
  });

  test('a failed save keeps the wizard open with the error inline', async ({ page }) => {
    await page.goto('/kit/form-wizard/');
    await page.getByRole('button', { name: /Guardado que falla/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[type=text]').fill('Ofrenda especial');
    await dialog.getByRole('button', { name: /Revisar/ }).click();
    await dialog.getByRole('button', { name: 'Guardar' }).click();

    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.wiz__error')).toContainText('la categoría ya existe');
    await expect(dialog.getByRole('button', { name: 'Guardar' })).toBeEnabled();
  });

  test('Escape closes and the body scroll lock is restored', async ({ page }) => {
    await page.goto('/kit/form-wizard/');
    await page.getByRole('button', { name: /Nuevo ingreso/ }).click();
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  });
});
