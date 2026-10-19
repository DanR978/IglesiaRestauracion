// PR-C2 — /kit/badge/ in a real browser: every badge is glyph + words, the
// three roles look different, a record colour reaches the element only as a
// validated --tint, the words clear AA against what they actually sit on in
// both themes (composited through every translucent layer), long chips
// truncate inside their row at 360px, and badges stay out of the tab order.
import { expect, test, type Page } from '@playwright/test';
import { gotoWithTheme } from './helpers/theme';

const KIT = '/kit/badge/';

interface Measured {
  text: string;
  className: string;
  ratio: number;
}

/**
 * WCAG contrast of every badge's ink against its EFFECTIVE background: the
 * badge's own (often translucent) fill composited over each ancestor up to the
 * first opaque one. Parses rgb()/rgba() and the color(srgb …) that color-mix()
 * computes to.
 */
async function badgeContrasts(page: Page): Promise<Measured[]> {
  return page.locator('.ird-badge').evaluateAll((badges) => {
    type Rgba = [number, number, number, number];
    const parse = (value: string): Rgba => {
      const n = (value.match(/-?[\d.]+(?:e-?\d+)?/g) ?? []).map(Number);
      const scale = value.startsWith('color(') ? 255 : 1;
      return [n[0] * scale, n[1] * scale, n[2] * scale, n[3] ?? 1];
    };
    const over = (top: Rgba, under: Rgba): Rgba => [
      top[0] * top[3] + under[0] * (1 - top[3]),
      top[1] * top[3] + under[1] * (1 - top[3]),
      top[2] * top[3] + under[2] * (1 - top[3]),
      1,
    ];
    const luminance = ([r, g, b]: Rgba) => {
      const ch = (c: number) => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    };
    return badges.map((badge) => {
      const layers: Rgba[] = [];
      for (let el: Element | null = badge; el; el = el.parentElement) {
        const bg = parse(getComputedStyle(el).backgroundColor);
        if (bg[3] > 0) layers.push(bg);
        if (bg[3] >= 1) break;
      }
      let ground: Rgba = [255, 255, 255, 1];
      for (const layer of layers.reverse()) ground = over(layer, ground);
      const ink = over(parse(getComputedStyle(badge).color), ground);
      const [hi, lo] = [luminance(ink), luminance(ground)].sort((a, b) => b - a);
      return {
        text: badge.textContent?.trim() ?? '',
        className: badge.className,
        ratio: (hi + 0.05) / (lo + 0.05),
      };
    });
  });
}

const isWarn = (m: Measured) => m.className.includes('ird-badge--warn');

test.describe('/kit/badge/', () => {
  test('tones, roles and record colours render glyph + words, with no console error', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(KIT);

    const tones = page.getByTestId('tones').locator('.ird-badge');
    await expect(tones).toHaveCount(5);
    for (const badge of await tones.all()) {
      await expect(badge.locator('.ird-badge__icon .icon')).toHaveAttribute('aria-hidden', 'true');
      await expect(badge.locator('.ird-badge__label')).not.toBeEmpty();
    }
    await expect(page.getByTestId('roles').locator('.ird-badge')).toHaveCount(4);
    expect(errors).toEqual([]);
  });

  test('admin, treasurer and leader are three different treatments', async ({ page }) => {
    await page.goto(KIT);
    const looks = await page
      .getByTestId('roles')
      .locator('.ird-badge--admin, .ird-badge--treasurer, .ird-badge--ministry-leader')
      .evaluateAll((els) =>
        els.slice(0, 3).map((el) => {
          const cs = getComputedStyle(el);
          return `${cs.backgroundColor}|${cs.color}|${cs.boxShadow}`;
        }),
      );
    expect(new Set(looks).size).toBe(3);
  });

  test('a record colour reaches the element only as a validated --tint', async ({ page }) => {
    await page.goto(KIT);
    const tinted = page.getByTestId('tinted').locator('.ird-badge');
    await expect(tinted).toHaveCount(7);
    // Upper-case input, normalised by badgeTint().
    await expect(tinted.first()).toHaveAttribute('style', /^--tint:\s*#2563eb;?$/);
    await expect(tinted.first().locator('.ird-badge__dot')).toHaveCSS(
      'background-color',
      'rgb(37, 99, 235)',
    );
    // "azul; background:url(x)" never reaches a style attribute.
    const refused = tinted.filter({ hasText: 'Sin color válido' });
    await expect(refused).toHaveClass(/ird-badge--neutral/);
    expect((await refused.getAttribute('style')) ?? '').toBe('');
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`every badge clears AA (4.5:1) on what it sits on — ${theme}`, async ({ page }) => {
      await gotoWithTheme(page, KIT, theme);
      const measured = await badgeContrasts(page);
      expect(measured.length).toBeGreaterThan(20);
      // The light warn pair is A11Y-2 (tripwire test below), owned by the tokens session.
      const checked = theme === 'light' ? measured.filter((m) => !isWarn(m)) : measured;
      const failing = checked.filter((m) => m.ratio < 4.5).map((m) => `${m.text} ${m.ratio}`);
      expect(failing).toEqual([]);
    });
  }

  test('A11Y-2 tripwire: the warn ink on its own tint in light', async ({ page }) => {
    test.fail(
      true,
      'A11Y-2 (S05b): --status-pending on --status-pending-bg is 4.38:1 in light. The token ' +
        'session re-tunes the pair; delete this test.fail line when it lands.',
    );
    await gotoWithTheme(page, KIT, 'light');
    const warn = (await badgeContrasts(page)).filter(isWarn);
    expect(warn.length).toBeGreaterThan(0);
    for (const m of warn) expect(m.ratio, m.text).toBeGreaterThanOrEqual(4.5);
  });

  test('the words are text, never markup', async ({ page }) => {
    await page.goto(KIT);
    const block = page.getByTestId('text-only');
    await expect(block).toContainText('<img src=x onerror="alert(1)">');
    await expect(block.locator('img')).toHaveCount(0);
  });

  test('badges are not in the tab order', async ({ page }) => {
    await page.goto(KIT);
    const focusable = await page
      .locator('.ird-badge, .ird-badge *')
      .evaluateAll((els) => els.filter((el) => (el as HTMLElement).tabIndex >= 0).length);
    expect(focusable).toBe(0);
  });

  test('360px: no horizontal scroll; a long chip truncates inside its row', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(KIT);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    const long = page.locator('.ird-badge', {
      hasText: 'Ministerio de Matrimonios y Familias Restauradas',
    });
    const box = (await long.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    const label = long.locator('.ird-badge__label');
    await expect(label).toHaveCSS('text-overflow', 'ellipsis');
    // The full words stay in the DOM for assistive tech.
    await expect(label).toHaveText('Ministerio de Matrimonios y Familias Restauradas');
  });

  test('forced dark: status inks and the solid admin chip reverse correctly', async ({ page }) => {
    await gotoWithTheme(page, KIT, 'dark');
    const tones = page.getByTestId('tones');
    // --status-active (= --money-pos) in dark: #4fc3a1.
    await expect(tones.locator('.ird-badge--success')).toHaveCSS('color', 'rgb(79, 195, 161)');
    const admin = page.getByTestId('roles').locator('.ird-badge--admin').first();
    await expect(admin).toHaveCSS('background-color', 'rgb(49, 53, 55)');
    await expect(admin).toHaveCSS('color', 'rgb(255, 255, 255)');
  });
});
