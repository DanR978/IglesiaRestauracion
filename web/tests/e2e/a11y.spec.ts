// S05b — VERIFICATION box 15: axe on every prerendered page, light and dark,
// in all four projects. Fails on any `serious` or `critical` violation that is
// not a recorded exception; the full list (every impact) is attached to the
// report.
//
// The theme is forced through the app's own boot path — localStorage
// `ird.theme` (D-022), read by the inline script in app.html — so the scan
// sees the palette a visitor who picked it gets. Reduced motion is emulated
// so scroll reveals render settled and visible: axe skips `opacity: 0`
// content and would mis-measure contrast mid-transition.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { watchOffOriginRequests } from './helpers/network';
import { prerenderedRoutes } from './helpers/routes';

// axe-core's own result types, reached through the one package we depend on.
type Violation = Awaited<ReturnType<AxeBuilder['analyze']>>['violations'][number];
type ViolationNode = Violation['nodes'][number];
type Theme = 'light' | 'dark';

interface KnownException {
  id: string;
  rule: string;
  theme: Theme;
  /** Foreground colours axe measured (lowercase hex). */
  fg: readonly string[];
  /** Background colours axe measured; any background when omitted. */
  bg?: readonly string[];
}

/**
 * Violations recorded with an owner in
 * docs/migration/sessions/S05b-quality-gates.md (Box 15 — axe). Each one is
 * matched per failing node on rule + theme + the exact colours axe measured,
 * so the same rule failing anywhere else still fails the run. The PR that
 * fixes one deletes its entry.
 */
const KNOWN_EXCEPTIONS: readonly KnownException[] = [
  // --color-secondary used as INK (base `strong`, RichText links) has no dark
  // value: gold #9a6a2c on the dark page/surface (3.7 / 3.3:1), the admin slate
  // #475569 on the dark surface (2.0:1). Owner: PR-C2's --color-accent-ink
  // (planned D-038).
  { id: 'A11Y-1', rule: 'color-contrast', theme: 'dark', fg: ['#9a6a2c', '#475569'] },
  // --money-warn (= --status-pending) on its own -bg tint: 4.38:1. The pair was
  // only ever measured against the surface (D-023). Owner: S11b token layering.
  { id: 'A11Y-2', rule: 'color-contrast', theme: 'light', fg: ['#a05a10'], bg: ['#f2e8de'] },
];

const BLOCKING_IMPACTS = new Set(['serious', 'critical']);
const THEMES: readonly Theme[] = ['light', 'dark'];
const ROUTES = prerenderedRoutes();

function measuredColours(node: ViolationNode): { fg: string; bg: string } {
  const data = node.any[0]?.data as { fgColor?: string; bgColor?: string } | undefined;
  return { fg: data?.fgColor?.toLowerCase() ?? '', bg: data?.bgColor?.toLowerCase() ?? '' };
}

function knownException(
  violation: Violation,
  node: ViolationNode,
  theme: Theme,
): KnownException | undefined {
  const { fg, bg } = measuredColours(node);
  return KNOWN_EXCEPTIONS.find(
    (known) =>
      known.rule === violation.id &&
      known.theme === theme &&
      known.fg.includes(fg) &&
      (known.bg === undefined || known.bg.includes(bg)),
  );
}

function describeViolation(violation: Violation, nodes: readonly ViolationNode[]): string {
  const targets = nodes.slice(0, 5).map((node) => {
    const { fg, bg } = measuredColours(node);
    return `${node.target.join(' ')}${fg ? ` (${fg} on ${bg})` : ''}`;
  });
  return `${violation.id} [${violation.impact}] ${violation.help} — ${nodes.length} node(s): ${targets.join(' | ')}`;
}

/**
 * WebKit's mobile emulation can keep a stale computed style on <body> for a
 * long page (seen on /kit/base/): getComputedStyle reports no inherited custom
 * properties — black ink on a transparent body — while the page paints
 * correctly, so axe would "see" dark-theme text on white. Touching a custom
 * property on the root makes the engine re-resolve them; elsewhere it is a no-op.
 */
async function settleComputedStyles(page: Page): Promise<void> {
  await page.evaluate(() => {
    const root = document.documentElement.style;
    root.setProperty('--e2e-restyle', '1');
    void getComputedStyle(document.body).color;
    root.removeProperty('--e2e-restyle');
  });
}

test('axe — the build prerendered pages to scan', () => {
  expect(ROUTES.length, 'no prerendered pages found in build/').toBeGreaterThan(0);
});

for (const theme of THEMES) {
  test.describe(`axe — ${theme}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((value) => {
        try {
          localStorage.setItem('ird.theme', value);
        } catch {
          // Storage refused: the data-theme assertion below fails loudly instead.
        }
      }, theme);
      await page.emulateMedia({ reducedMotion: 'reduce' });
    });

    for (const route of ROUTES) {
      test(`${route} has no serious or critical violations`, async ({ page }, testInfo) => {
        const offOrigin = watchOffOriginRequests(page);
        await page.goto(route, { waitUntil: 'networkidle' });
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await settleComputedStyles(page);

        const { violations } = await new AxeBuilder({ page }).analyze();
        await testInfo.attach('axe-violations.json', {
          body: JSON.stringify(violations, null, 2),
          contentType: 'application/json',
        });

        const blocking: string[] = [];
        for (const violation of violations) {
          if (!BLOCKING_IMPACTS.has(violation.impact ?? '')) continue;
          const open = violation.nodes.filter((node) => {
            const known = knownException(violation, node, theme);
            if (known) {
              testInfo.annotations.push({
                type: 'a11y exception',
                description: `${known.id}: ${describeViolation(violation, [node])}`,
              });
            }
            return known === undefined;
          });
          if (open.length > 0) blocking.push(describeViolation(violation, open));
        }

        expect(blocking, `axe (${theme}) on ${route}`).toEqual([]);
        expect(offOrigin(), 'requests outside the preview origin and the pinned CDN').toEqual([]);
      });
    }
  });
}
