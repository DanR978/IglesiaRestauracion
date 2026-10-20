// PR-C2 — /kit/section-nav/ in a real browser: link mode driven by
// ?seccion= (deep link, click, Back), button mode's single tab stop with
// Arrow/Home/End focus and Enter/Space selection, the vertical list on a
// desktop, and at 360px the pill bar that scrolls on its own — the page never
// does — with the current item scrolled into view by moving only the bar.
// CI job `e2e` runs it.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoWithTheme } from './helpers/theme';

const KIT = '/kit/section-nav/';

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

const accountNav = (page: Page) => page.getByRole('navigation', { name: 'Secciones de Mi cuenta' });
const usersNav = (page: Page) => page.getByRole('navigation', { name: 'Pestañas de Usuarios' });

/** The item's box relative to its scrolling list: fully inside the visible part? */
async function visibleInBar(item: Locator): Promise<boolean> {
  return item.evaluate((el) => {
    const bar = el.closest('ul')!.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    return box.left >= bar.left - 1 && box.right <= bar.right + 1;
  });
}

test.describe('kit/section-nav — desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('a vertical list; the current link carries aria-current="page"', async ({ page }) => {
    await open(page);
    const nav = accountNav(page);
    const links = nav.getByRole('link');
    await expect(links).toHaveCount(3);
    const boxes = await links.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, h: r.height };
      }),
    );
    expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
    expect(boxes[2].y).toBeGreaterThan(boxes[1].y);
    expect(boxes[0].x).toBe(boxes[2].x);
    for (const b of boxes) expect(b.h).toBeGreaterThanOrEqual(24);
    await expect(nav.getByRole('link', { name: 'Perfil' })).toHaveAttribute('aria-current', 'page');
  });

  test('a click puts the section in the URL; Back returns to the previous one', async ({
    page,
  }) => {
    await open(page);
    const nav = accountNav(page);
    await nav.getByRole('link', { name: 'Seguridad' }).click();
    await expect(page).toHaveURL(/\?seccion=seguridad$/);
    await expect(nav.getByRole('link', { name: 'Seguridad' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav.getByRole('link', { name: 'Perfil' })).not.toHaveAttribute('aria-current');
    await expect(page.getByTestId('account-panel')).toContainText('Contraseña');

    await page.goBack();
    await expect(nav.getByRole('link', { name: 'Perfil' })).toHaveAttribute('aria-current', 'page');
  });

  test('a deep link opens on its section', async ({ page }) => {
    await open(page, `${KIT}?seccion=preferencias`);
    await expect(accountNav(page).getByRole('link', { name: 'Preferencias' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByTestId('account-panel')).toContainText('Tema claro');
  });

  test('links keep the natural tab order', async ({ page, browserName }) => {
    // E-1 (S05b): WebKit's Tab skips links unless Safari's "Press Tab to
    // highlight each item" is on — an engine default, not this component.
    test.skip(browserName === 'webkit', 'WebKit does not Tab to links by default');
    await open(page);
    const nav = accountNav(page);
    await nav.getByRole('link', { name: 'Perfil' }).focus();
    await page.keyboard.press('Tab');
    await expect(nav.getByRole('link', { name: 'Seguridad' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(nav.getByRole('link', { name: 'Preferencias' })).toBeFocused();
  });

  test('buttons: ONE tab stop, arrows/Home/End move focus, Enter and Space select', async ({
    page,
  }) => {
    await open(page);
    const nav = usersNav(page);
    await expect(nav.locator('[tabindex="0"]')).toHaveCount(1);
    const usuarios = nav.getByRole('button', { name: 'Usuarios' });
    await expect(usuarios).toHaveAttribute('aria-current', 'true');

    await usuarios.focus();
    await page.keyboard.press('ArrowDown');
    await expect(nav.getByRole('button', { name: 'Invitaciones' })).toBeFocused();
    await page.keyboard.press('End');
    await expect(nav.getByRole('button', { name: 'Configuración' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(usuarios).toBeFocused(); // wraps
    await page.keyboard.press('ArrowUp');
    await expect(nav.getByRole('button', { name: 'Configuración' })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(usuarios).toBeFocused();
    // Moving focus does not choose.
    await expect(page.getByTestId('users-selections')).toHaveText('0');

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    const invitaciones = nav.getByRole('button', { name: 'Invitaciones' });
    await expect(invitaciones).toHaveAttribute('aria-current', 'true');
    await expect(usuarios).not.toHaveAttribute('aria-current');
    await expect(page.getByTestId('users-panel')).toHaveText('Invitaciones');

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await expect(nav.getByRole('button', { name: 'Roles y accesos' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(page.getByTestId('users-selections')).toHaveText('2');
    await expect(nav.locator('[tabindex="0"]')).toHaveCount(1);
  });

  test('forced dark: the current item is light ink on slate with a visible edge', async ({
    page,
  }) => {
    await openWithTheme(page, 'dark');
    const current = accountNav(page).getByRole('link', { name: 'Perfil' });
    await expect(current).toHaveCSS('background-color', 'rgb(49, 53, 55)');
    await expect(current).toHaveCSS('color', 'rgb(223, 222, 220)');
    await expect(current).toHaveCSS('border-top-color', 'rgb(240, 245, 247)');
  });
});

test.describe('kit/section-nav — 360px phone', () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });

  test('the pill bar scrolls by itself; the page does not', async ({ page }) => {
    await open(page);
    const list = usersNav(page).locator('ul');
    const { scroll, client } = await list.evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
    }));
    expect(scroll).toBeGreaterThan(client);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= window.innerWidth &&
          document.body.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    // One row of pills, each a 44px target.
    const boxes = await usersNav(page)
      .getByRole('button')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect()));
    for (const b of boxes) {
      expect(Math.round(b.y)).toBe(Math.round(boxes[0].y));
      expect(b.height).toBeGreaterThanOrEqual(44);
    }

    // Scrolling the bar moves the bar, never the page.
    await list.evaluate((el) => el.scrollTo({ left: 400 }));
    await expect.poll(() => list.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollX)).toBe(0);
  });

  test('a deep link scrolls ONLY the bar so the current item is in view', async ({ page }) => {
    await open(page, `${KIT}?seccion=preferencias`);
    const current = accountNav(page).getByRole('link', { name: 'Preferencias' });
    await expect(current).toHaveAttribute('aria-current', 'page');
    await expect.poll(() => visibleInBar(current)).toBe(true);
    expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0]);
  });

  test('choosing the last tab keeps it in view in the bar', async ({ page }) => {
    await open(page);
    const nav = usersNav(page);
    await nav.getByRole('button', { name: 'Usuarios' }).focus();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    const last = nav.getByRole('button', { name: 'Configuración' });
    await expect(last).toHaveAttribute('aria-current', 'true');
    await expect.poll(() => visibleInBar(last)).toBe(true);
  });

  test('a tap selects a pill', async ({ page }) => {
    await open(page);
    const nav = usersNav(page);
    await nav.getByRole('button', { name: 'Invitaciones' }).tap();
    await expect(nav.getByRole('button', { name: 'Invitaciones' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });
});
