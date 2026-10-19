/* ============================================================================
 * web/tests/e2e/helpers/click-focus.ts — does this engine focus a clicked button?
 * ----------------------------------------------------------------------------
 * Safari doesn't move focus to a <button> the user clicks, and that is what
 * G-038 / X-1 trips over (an overlay records <body> as its opener). Playwright's
 * WebKit builds disagree with each other: the Windows and macOS builds behave
 * like Safari, the Linux build (GitHub Actions) focuses the button. So an
 * expectation about X-1 keys on what the engine actually does, measured on a
 * blank page — not on `browserName`.
 *
 * Usage:
 *   test.fail(!(await focusesClickedButtons(page)), 'G-038 / X-1 …');
 *   await page.goto(KIT);
 * ========================================================================== */
import type { Page } from '@playwright/test';

/** Click a bare <button> on a blank page and report whether it took focus. */
export async function focusesClickedButtons(page: Page): Promise<boolean> {
  await page.setContent('<button type="button" id="probe">probe</button>');
  await page.click('#probe');
  return page.evaluate(() => document.activeElement?.id === 'probe');
}
