/* ============================================================================
 * web/tests/e2e/helpers/csp.ts — hear every CSP violation a page raises (D-037)
 * ----------------------------------------------------------------------------
 * Installs a `securitypolicyviolation` listener before any of the page's
 * scripts run, in every document the page loads (a full-page leave included),
 * and hands each report to the test as it happens through an exposed
 * function — so a violation in a document that has since navigated away is
 * still counted. tests/e2e/csp.spec.ts proves it hears one (its control).
 *
 * Usage:
 *   const violations = await watchViolations(page);   // before page.goto()
 *   …
 *   expect(violations).toEqual([]);
 * ========================================================================== */
import type { Page } from '@playwright/test';

export interface Violation {
  /** The directive that refused it (`script-src-elem`, `connect-src`, …). */
  directive: string;
  /** What was refused: a URL, or `inline` / `eval`. */
  blocked: string;
  /** `file:line` of the code that tried. */
  source: string;
  sample: string;
  /** The page's path and query when it happened. */
  page: string;
}

/** Start recording; the array fills as violations are reported. */
export async function watchViolations(page: Page): Promise<Violation[]> {
  const violations: Violation[] = [];
  await page.exposeFunction('__e2eCspViolation', (violation: Violation) => {
    violations.push(violation);
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const report = (window as unknown as { __e2eCspViolation?: (v: object) => void })
        .__e2eCspViolation;
      report?.({
        directive: event.effectiveDirective,
        blocked: event.blockedURI,
        source: `${event.sourceFile}:${event.lineNumber}`,
        sample: event.sample,
        page: location.pathname + location.search,
      });
    });
  });
  return violations;
}
