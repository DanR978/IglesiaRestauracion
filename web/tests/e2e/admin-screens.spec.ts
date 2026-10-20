// PR-C2 "Verification · by eye" — full-page screenshots of the admin for a
// person to review: acceso/, verificar/ (the code; the QR to enrol), Inicio
// for a Desarrollador and for a treasurer, and each section of Mi cuenta, at
// 360 / 768 / 1280 px in light and dark, with reduced motion so nothing is
// caught mid-transition. Not a gate: it asserts only that each screen is
// settled, and writes PNGs to E2E_SCREENSHOTS_DIR — a folder outside the
// repository. playwright.config.ts loads this file only when that variable is
// set, and it runs in the `chromium` project.
//
// Usage:
//   E2E_SCREENSHOTS_DIR=/path/outside/the/repo npx playwright test admin-screens --project=chromium
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  CHALLENGE,
  DEVELOPER,
  ENROLL,
  TREASURER,
  signedOutBackend,
  staffBackend,
  type StaffAccount,
} from './helpers/admin-backend';
import { THEME_STORAGE_KEYS } from './helpers/theme';

const DIR = process.env.E2E_SCREENSHOTS_DIR ?? '';
const WIDTHS = [360, 768, 1280] as const;
const THEMES = ['light', 'dark'] as const;

interface Screen {
  name: string;
  account: StaffAccount | null;
  path: string;
  h1: string;
}

const SCREENS: readonly Screen[] = [
  { name: 'acceso', account: null, path: '/admin/acceso/', h1: 'Iniciar sesión' },
  {
    name: 'verificar-codigo',
    account: CHALLENGE,
    path: '/admin/acceso/verificar/',
    h1: 'Verifica tu identidad',
  },
  {
    name: 'verificar-inscribir',
    account: ENROLL,
    path: '/admin/acceso/verificar/',
    h1: 'Protege tu cuenta',
  },
  { name: 'inicio-desarrollador', account: DEVELOPER, path: '/admin/', h1: 'Inicio' },
  { name: 'inicio-tesoreria', account: TREASURER, path: '/admin/', h1: 'Inicio' },
  { name: 'cuenta-perfil', account: DEVELOPER, path: '/admin/cuenta/', h1: 'Mi cuenta' },
  {
    name: 'cuenta-seguridad',
    account: DEVELOPER,
    path: '/admin/cuenta/?seccion=seguridad',
    h1: 'Mi cuenta',
  },
  {
    name: 'cuenta-preferencias',
    account: DEVELOPER,
    path: '/admin/cuenta/?seccion=preferencias',
    h1: 'Mi cuenta',
  },
];

/** The screen is done: its heading, no skeleton left, nothing in flight, fonts in. */
async function settled(page: Page, h1: string): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible();
  await expect(page.locator('.ird-state--loading')).toHaveCount(0);
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

test.beforeAll(() => {
  expect(DIR, 'E2E_SCREENSHOTS_DIR names where the screenshots go').not.toBe('');
});

for (const screen of SCREENS) {
  test(`${screen.name} at ${WIDTHS.join(' / ')} px, light and dark`, async ({
    browser,
    baseURL,
  }) => {
    for (const theme of THEMES) {
      for (const width of WIDTHS) {
        const context = await browser.newContext({
          baseURL,
          viewport: { width, height: 800 },
          reducedMotion: 'reduce',
          colorScheme: theme,
        });
        const page = await context.newPage();
        await page.addInitScript(
          ({ keys, value }) => {
            for (const key of keys) localStorage.setItem(key, value);
          },
          { keys: THEME_STORAGE_KEYS, value: theme },
        );
        if (screen.account) await staffBackend(page, screen.account);
        else await signedOutBackend(page);
        await page.goto(screen.path);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await settled(page, screen.h1);
        await page.screenshot({
          path: join(DIR, `${screen.name}-${width}-${theme}.png`),
          fullPage: true,
        });
        await context.close();
      }
    }
  });
}
