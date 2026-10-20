// PR-C2 — /kit/segmented-control/ in a real browser: a named radiogroup with
// exactly one checked option, the arrow keys moving AND selecting (the
// browser's own radio behaviour, wrapping), Tab entering at the checked option
// and leaving the group, the theme choice really switching the page, 44px
// targets, wrapping at 360px without sideways scroll, and dark mode. CI job
// `e2e` runs it.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoWithTheme } from './helpers/theme';

const KIT = '/kit/segmented-control/';

/** Open the kit page and wait until it is hydrated (keyboard handlers attached). */
async function open(page: Page, path = KIT): Promise<void> {
  await page.goto(path);
  await expect(page.locator('main[data-hydrated]')).toBeAttached();
}

/** The same, with a theme stored before the page boots (helpers/theme.ts). */
async function openWithTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await gotoWithTheme(page, KIT, theme);
  await expect(page.locator('main[data-hydrated]')).toBeAttached();
}

const themeGroup = (page: Page) => page.getByRole('radiogroup', { name: 'Tema', exact: true });
const periodGroup = (page: Page) => page.getByRole('radiogroup', { name: 'Período', exact: true });

/** The segment (the <label>) whose text is exactly `text`. */
const segment = (group: Locator, text: string) =>
  group.locator('.ird-seg__option').filter({ has: group.page().getByText(text, { exact: true }) });

test.describe('kit/segmented-control', () => {
  test('a named radiogroup with exactly one checked option', async ({ page }) => {
    await open(page);
    const group = periodGroup(page);
    await expect(group.getByRole('radio')).toHaveCount(4);
    await expect(group.getByRole('radio', { checked: true })).toHaveCount(1);
    await expect(group.getByRole('radio', { name: 'Mes', exact: true })).toBeChecked();
  });

  test('the arrow keys move AND select, in both directions', async ({ page }) => {
    await open(page);
    const group = periodGroup(page);
    const radio = (name: string) => group.getByRole('radio', { name, exact: true });
    await radio('Mes').focus();

    await page.keyboard.press('ArrowRight');
    await expect(radio('Trimestre')).toBeChecked();
    await expect(radio('Trimestre')).toBeFocused();
    await expect(page.getByTestId('period-value')).toHaveText('quarter');
    // The nested quarter control appears with the choice.
    await expect(page.getByRole('radiogroup', { name: 'Trimestre', exact: true })).toBeVisible();

    await page.keyboard.press('ArrowDown');
    await expect(radio('Año')).toBeChecked();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowUp');
    await expect(radio('Mes')).toBeChecked();
    await expect(radio('Mes')).toBeFocused();
    await expect(group.getByRole('radio', { checked: true })).toHaveCount(1);
    await expect(page.getByTestId('period-changes')).toHaveText('4');
  });

  test('at the ends each engine keeps its native radio behaviour', async ({
    page,
    browserName,
  }) => {
    await open(page);
    const group = periodGroup(page);
    const radio = (name: string) => group.getByRole('radio', { name, exact: true });
    await radio('Mes').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(radio('Año')).toBeChecked();
    await page.keyboard.press('ArrowRight');
    // Chromium wraps to the first option; WebKit's radios stop at the last.
    await expect(radio(browserName === 'webkit' ? 'Año' : 'Semana')).toBeChecked();
    await expect(group.getByRole('radio', { checked: true })).toHaveCount(1);
  });

  test('the focused segment draws the focus ring', async ({ page }) => {
    await open(page);
    const group = periodGroup(page);
    await group.getByRole('radio', { name: 'Mes', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    const focused = segment(group, 'Trimestre');
    await expect(focused).toHaveCSS('outline-style', 'solid');
    await expect(focused).toHaveCSS('outline-width', '2px');
  });

  test('Tab enters at the checked option and leaves the group', async ({ page, browserName }) => {
    // E-1 (S05b): WebKit's Tab only visits text fields by default.
    test.skip(browserName === 'webkit', 'WebKit does not Tab to radios by default');
    await open(page);
    const theme = themeGroup(page);
    await theme.getByRole('radio', { name: 'Sistema', exact: true }).focus();
    await page.keyboard.press('Tab');
    // Next stop is the Período group, at its checked option — not "Semana".
    await expect(periodGroup(page).getByRole('radio', { name: 'Mes', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    const inPeriod = await periodGroup(page).evaluate((group) =>
      group.contains(document.activeElement),
    );
    expect(inPeriod).toBe(false);
  });

  test('a click on a segment selects it, and the theme choice switches the page', async ({
    page,
  }) => {
    await openWithTheme(page, 'light');
    const theme = themeGroup(page);
    await expect(theme.getByRole('radio', { name: 'Claro', exact: true })).toBeChecked();

    await segment(theme, 'Oscuro').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(theme.getByRole('radio', { name: 'Oscuro', exact: true })).toBeChecked();
    await expect(page.getByTestId('theme-current')).toHaveText('dark');

    await theme.getByRole('radio', { name: 'Sistema', exact: true }).check();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    await expect(page.getByTestId('theme-current')).toHaveText('system');
  });

  test('disabled options cannot be chosen', async ({ page }) => {
    await open(page);
    const group = page.getByRole('radiogroup', { name: 'Deshabilitado', exact: true });
    for (const radio of await group.getByRole('radio').all()) await expect(radio).toBeDisabled();
    await segment(group, 'Mes').click({ force: true });
    await expect(group.getByRole('radio', { name: 'Año', exact: true })).toBeChecked();
  });

  test('a hidden label still names the group', async ({ page }) => {
    await open(page);
    const group = page.getByRole('radiogroup', { name: 'Densidad (sin etiqueta visible)' });
    await expect(group).toBeVisible();
    // Visually hidden: a clipped 1px box, still in the accessibility tree.
    const box = await page.getByText('Densidad (sin etiqueta visible)').boundingBox();
    expect(box!.width).toBeLessThanOrEqual(1);
    expect(box!.height).toBeLessThanOrEqual(1);
  });

  test('every segment is a 44px target', async ({ page }) => {
    await open(page);
    const heights = await page
      .locator('.ird-seg__option')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
  });

  test('forced dark: the checked segment is light ink on slate with a visible edge', async ({
    page,
  }) => {
    await openWithTheme(page, 'dark');
    const checked = periodGroup(page).locator('.ird-seg__option.is-checked');
    await expect(checked).toHaveText('Mes');
    await expect(checked).toHaveCSS('background-color', 'rgb(49, 53, 55)');
    await expect(checked).toHaveCSS('color', 'rgb(223, 222, 220)');
    await expect(checked).toHaveCSS('border-top-color', 'rgb(240, 245, 247)');
  });
});

test.describe('kit/segmented-control — 360px phone', () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });

  test('segments wrap inside the screen; nothing scrolls sideways', async ({ page }) => {
    await open(page);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= window.innerWidth &&
          document.body.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const rights = await page
      .locator('.ird-seg__option')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().right));
    for (const r of rights) expect(r).toBeLessThanOrEqual(360);
  });

  test('a tap selects', async ({ page }) => {
    await open(page);
    const group = periodGroup(page);
    await segment(group, 'Año').tap();
    await expect(group.getByRole('radio', { name: 'Año', exact: true })).toBeChecked();
  });
});
