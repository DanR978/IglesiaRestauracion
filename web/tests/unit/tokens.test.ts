// S11 — the token files as a contract: money/type tokens defined once in
// :root, the type scale monotonic (D-015), one dark-mode mechanism (D-017),
// the admin override scoped (D-014), and one shadow definition.
// PR-C2 (D-038, A11Y-1/A11Y-2) — WCAG contrast recomputed from the token text
// for every ink the palette pairs with a surface, a page or its own tint, in
// both themes and on both surfaces (public, [data-surface="admin"]).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appCssImports,
  blockOf,
  bundleAppCss,
  declarations,
  declaredNames,
  listCssFiles,
  readStyle,
  stripComments,
  stylesDir,
} from '#lib/test/css.js';

const colors = readStyle('tokens/colors.css');
const typography = readStyle('tokens/typography.css');
const shadows = readStyle('tokens/shadows.css');
const admin = readStyle('tokens/admin.css');

const ROOT_LIGHT = blockOf(colors, ':root');
const ROOT_DARK_FORCED = blockOf(colors, ":root[data-theme='dark']");
const ROOT_DARK_SYSTEM = blockOf(
  colors,
  ":root:not([data-theme='light']):not([data-theme='dark'])",
);

const MONEY = [
  '--money-pos',
  '--money-pos-bg',
  '--money-neg',
  '--money-neg-bg',
  '--money-warn',
  '--money-warn-bg',
];
const STATUS = [
  'paid',
  'pending',
  'open',
  'overdue',
  'active',
  'inactive',
  'restricted',
  'closed',
  'completed',
  'finished',
];
const FS_SCALE = [
  '--fs-xxs',
  '--fs-xs',
  '--fs-sm',
  '--fs-base',
  '--fs-md',
  '--fs-lg',
  '--fs-xl',
  '--fs-2xl',
  '--fs-3xl',
  '--fs-4xl',
];

/** All source files under src/ (css + svelte + ts) except the token files. */
function nonTokenSources(): string[] {
  const srcDir = resolve(stylesDir, '..', '..');
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(css|svelte|ts)$/.test(name)) out.push(full);
    }
  };
  walk(srcDir);
  const tokens = join(stylesDir, 'tokens');
  return out.filter((f) => !f.startsWith(tokens));
}

function rem(value: string): number {
  const m = value.match(/^([\d.]+)rem$/);
  if (!m) throw new Error(`not a rem value: ${value}`);
  return Number(m[1]);
}

function clampParts(value: string): { min: number; max: number } {
  const m = value.match(/^clamp\(\s*([^,]+),\s*[^,]+,\s*([^)]+)\)$/);
  if (!m) throw new Error(`not a clamp(): ${value}`);
  return { min: rem(m[1].trim()), max: rem(m[2].trim()) };
}

/** r, g, b in 0–255 and alpha in 0–1. */
type Rgba = readonly [number, number, number, number];

/** A token value as RGBA. A format this test cannot read fails loudly, never passes. */
function parseColor(value: string): Rgba {
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const full = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16));
    return [r, g, b, 1];
  }
  const fn = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3]), fn[4] ? Number(fn[4]) : 1];
  throw new Error(`not a colour the contrast test can read: ${value}`);
}

/** A translucent `top` painted over an opaque `under`, rounded to 8 bits as painted. */
function over(top: Rgba, under: Rgba): Rgba {
  const [r, g, b] = [0, 1, 2].map((i) => Math.round(top[i] * top[3] + under[i] * (1 - top[3])));
  return [r, g, b, 1];
}

function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2.2 contrast ratio of two opaque colours. */
function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * A custom property as an element sees it. `layers` are the declarations of the
 * element and its ancestors, outermost (:root) first. A var() resolves where it
 * is DECLARED — `:root { --a: var(--b) }` keeps :root's --b even inside a scope
 * that re-declares --b — which is the cascade's own computed-value rule.
 */
function computedToken(layers: readonly Map<string, string>[], name: string): string {
  for (let i = layers.length - 1; i >= 0; i--) {
    const raw = layers[i].get(name);
    if (raw === undefined) continue;
    const upTo = layers.slice(0, i + 1);
    return raw.replace(/var\(\s*(--[\w-]+)\s*\)/g, (_m, ref: string) => computedToken(upTo, ref));
  }
  throw new Error(`${name} is not declared`);
}

describe('tokens — money (D-016)', () => {
  it('defines every --money-* token exactly once in :root', () => {
    const names = declaredNames(ROOT_LIGHT);
    for (const t of MONEY) expect(names.filter((n) => n === t)).toHaveLength(1);
  });

  it('reverses every --money-* token in BOTH dark blocks', () => {
    for (const block of [ROOT_DARK_FORCED, ROOT_DARK_SYSTEM]) {
      const names = declaredNames(block);
      for (const t of MONEY) expect(names.filter((n) => n === t)).toHaveLength(1);
    }
  });

  it('collapses the two legacy greens to one (no #1c7a52 anywhere in web/ styles)', () => {
    expect(stripComments(bundleAppCss()).toLowerCase()).not.toContain('#1c7a52');
  });

  it('status vocabulary (2.5) exists as ink + tint pairs', () => {
    const decl = declarations(ROOT_LIGHT);
    for (const s of STATUS) {
      expect(decl.has(`--status-${s}`), `--status-${s}`).toBe(true);
      expect(decl.has(`--status-${s}-bg`), `--status-${s}-bg`).toBe(true);
    }
  });
});

describe('tokens — type scale (D-015)', () => {
  const root = blockOf(typography, ':root');
  const decl = declarations(root);

  it('defines every --fs-* token exactly once in :root', () => {
    const names = declaredNames(root);
    for (const t of [...FS_SCALE, '--fs-btn']) {
      expect(
        names.filter((n) => n === t),
        t,
      ).toHaveLength(1);
    }
  });

  it('every step is a clamp() whose min and max STRICTLY increase up the scale', () => {
    const parts = FS_SCALE.map((t) => clampParts(decl.get(t)!));
    for (let i = 1; i < parts.length; i++) {
      expect(parts[i].min, `${FS_SCALE[i]} min > ${FS_SCALE[i - 1]} min`).toBeGreaterThan(
        parts[i - 1].min,
      );
      expect(parts[i].max, `${FS_SCALE[i]} max > ${FS_SCALE[i - 1]} max`).toBeGreaterThan(
        parts[i - 1].max,
      );
      expect(parts[i].max).toBeGreaterThan(parts[i].min);
    }
  });

  it('has a real mid-range step between the label size and the KPI size', () => {
    // labels ≈ --fs-xs (12–14px); KPI numbers ≈ --fs-xl (24–32px, legacy 1.85rem/800).
    const xs = clampParts(decl.get('--fs-xs')!);
    const lg = clampParts(decl.get('--fs-lg')!);
    const xl = clampParts(decl.get('--fs-xl')!);
    expect(lg.min).toBeGreaterThan(xs.max);
    expect(lg.max).toBeLessThanOrEqual(xl.min);
  });

  it('never states a font-size token in px', () => {
    for (const t of [...FS_SCALE, '--fs-btn']) expect(decl.get(t)).not.toMatch(/\dpx/);
  });
});

describe('tokens — one dark-mode mechanism (D-017)', () => {
  it('only tokens/colors.css mentions data-theme or prefers-color-scheme', () => {
    for (const rel of listCssFiles()) {
      if (rel === 'tokens/colors.css') continue;
      const text = stripComments(readStyle(rel));
      expect(text, rel).not.toContain('prefers-color-scheme');
      expect(text, rel).not.toContain('data-theme');
    }
  });

  it('no non-token source file (css/svelte/ts) contains prefers-color-scheme', () => {
    for (const file of nonTokenSources()) {
      if (file.endsWith('theme.svelte.ts')) continue; // the resolver reads the OS query on purpose
      // code only — a comment explaining the rule is allowed to name it
      const text = stripComments(readFileSync(file, 'utf8')).replace(/^\s*\/\/.*$/gm, '');
      expect(text, file).not.toContain('prefers-color-scheme');
    }
  });

  it('the system-dark block opts out of both forced themes', () => {
    expect(ROOT_DARK_SYSTEM).not.toBe('');
    expect(stripComments(colors)).toMatch(
      /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme='light'\]\):not\(\[data-theme='dark'\]\)/,
    );
  });

  it('forced-dark and system-dark declare the SAME tokens with IDENTICAL values', () => {
    const forced = declarations(ROOT_DARK_FORCED);
    const system = declarations(ROOT_DARK_SYSTEM);
    expect([...forced.keys()].sort()).toEqual([...system.keys()].sort());
    for (const [name, value] of forced) expect(system.get(name), name).toBe(value);
  });

  it('every dark override names a token that exists in :root', () => {
    const light = declarations(ROOT_LIGHT);
    for (const name of declarations(ROOT_DARK_FORCED).keys()) {
      expect(light.has(name), name).toBe(true);
    }
  });

  it('--color-primary stays removed', () => {
    expect(declarations(ROOT_LIGHT).has('--color-primary')).toBe(false);
  });
});

describe('tokens — admin slate override (D-014)', () => {
  it('is scoped to [data-surface="admin"], never :root', () => {
    const src = stripComments(admin);
    expect(src).toContain("[data-surface='admin']");
    expect(src).not.toMatch(/(^|[^\w-]):root/);
    expect(src).not.toContain('data-theme');
  });

  it('neutralises exactly the four D-014 tokens to slate', () => {
    const decl = declarations(blockOf(admin, "[data-surface='admin']"));
    expect(decl.get('--color-secondary')).toBe('#475569');
    expect(decl.get('--color-accent')).toBe('#475569');
    expect(decl.get('--gold-bright')).toBe('#64748b');
    expect(decl.get('--color-info')).toBe('#334155');
  });

  it('loads after colors.css so it wins on equal specificity', () => {
    const order = appCssImports();
    expect(order.indexOf('./tokens/admin.css')).toBeGreaterThan(
      order.indexOf('./tokens/colors.css'),
    );
  });
});

const ADMIN_SCOPE = declarations(blockOf(admin, "[data-surface='admin']"));
/** The :root element's own declarations per theme (a dark block overrides the light one). */
const ROOT_BY_THEME = {
  light: declarations(ROOT_LIGHT),
  'dark (forced)': new Map([...declarations(ROOT_LIGHT), ...declarations(ROOT_DARK_FORCED)]),
  'dark (system)': new Map([...declarations(ROOT_LIGHT), ...declarations(ROOT_DARK_SYSTEM)]),
};
type ThemeCase = keyof typeof ROOT_BY_THEME;
type Surface = 'public' | 'admin';

/** :root, plus the admin root inside it when the element is on the admin surface. */
function layersFor(theme: ThemeCase, surface: Surface): Map<string, string>[] {
  return surface === 'admin' ? [ROOT_BY_THEME[theme], ADMIN_SCOPE] : [ROOT_BY_THEME[theme]];
}

const colorOf = (layers: readonly Map<string, string>[], name: string): Rgba =>
  parseColor(computedToken(layers, name));

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;
/** What text sits on: raised panels and the page itself. */
const UNDERLAYS = ['--color-surface', '--color-bg-light'];
const TEXT_INKS = ['--color-text', '--color-muted', '--color-accent-ink'];
/** Every semantic ink, and the tint a Badge / pill puts under it. */
const INK_ON_TINT = [
  ...['pos', 'neg', 'warn'].map((m) => [`--money-${m}`, `--money-${m}-bg`] as const),
  ...STATUS.map((s) => [`--status-${s}`, `--status-${s}-bg`] as const),
];
const CASES = (Object.keys(ROOT_BY_THEME) as ThemeCase[]).flatMap((theme) =>
  (['public', 'admin'] as const).map((surface) => ({ theme, surface })),
);

describe('tokens — accent ink (D-038)', () => {
  it('outside the admin, the light accent ink aliases the gold fill (it already clears AA)', () => {
    expect(declarations(ROOT_LIGHT).get('--color-accent-ink')).toBe('var(--color-secondary)');
    expect(computedToken(layersFor('light', 'public'), '--color-accent-ink')).toBe('#9a6a2c');
  });

  it('gets its own dark value, because the gold fill has none', () => {
    for (const theme of ['dark (forced)', 'dark (system)'] as const) {
      expect(computedToken(layersFor(theme, 'public'), '--color-accent-ink')).toBe('#d9ab66');
      // Fills stay on --color-secondary, untouched.
      expect(computedToken(layersFor(theme, 'public'), '--color-secondary')).toBe('#9a6a2c');
    }
  });

  it('the admin maps it onto the reversing slate pair, without naming a theme', () => {
    expect(ADMIN_SCOPE.get('--color-accent-ink')).toBe('var(--slate-ink)');
    expect(computedToken(layersFor('light', 'admin'), '--color-accent-ink')).toBe('#475569');
    for (const theme of ['dark (forced)', 'dark (system)'] as const) {
      expect(computedToken(layersFor(theme, 'admin'), '--color-accent-ink')).toBe('#cbd5e1');
      expect(computedToken(layersFor(theme, 'admin'), '--color-secondary')).toBe('#475569');
    }
  });

  it('no `color:` reads an accent FILL token — text uses --color-accent-ink', () => {
    const fillAsInk =
      /(?<![\w-])color\s*:\s*var\(\s*--(?:color-secondary|color-accent|gold-bright)\s*[,)]/;
    for (const file of nonTokenSources()) {
      expect(stripComments(readFileSync(file, 'utf8')), file).not.toMatch(fillAsInk);
    }
  });
});

describe('tokens — WCAG contrast, both themes, public and admin', () => {
  describe.each(CASES)('$surface · $theme', ({ theme, surface }) => {
    const layers = layersFor(theme, surface);

    it('body, muted and accent ink clear 4.5:1 on the surface and on the page', () => {
      for (const under of UNDERLAYS) {
        for (const ink of TEXT_INKS) {
          const ratio = contrast(colorOf(layers, ink), colorOf(layers, under));
          expect(ratio, `${ink} on ${under}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
            AA_TEXT,
          );
        }
      }
    });

    it('every money/status ink clears 4.5:1 on its own tint and on the bare surface (A11Y-2)', () => {
      for (const under of UNDERLAYS) {
        const base = colorOf(layers, under);
        for (const [ink, tint] of INK_ON_TINT) {
          const fg = colorOf(layers, ink);
          const bare = contrast(fg, base);
          const tinted = contrast(fg, over(colorOf(layers, tint), base));
          expect(bare, `${ink} on ${under}: ${bare.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_TEXT);
          expect(
            tinted,
            `${ink} on ${tint} over ${under}: ${tinted.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(AA_TEXT);
        }
      }
    });

    it('the focus ring clears 3:1 against the surface and the page', () => {
      for (const under of UNDERLAYS) {
        const ratio = contrast(colorOf(layers, '--color-focus'), colorOf(layers, under));
        expect(ratio, `--color-focus on ${under}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
          AA_NON_TEXT,
        );
      }
    });
  });

  it('the contrast maths matches the A11Y-2 measurement it replaces', () => {
    // axe measured the old amber at 4.38:1 on its painted tint #f2e8de.
    const oldInk = parseColor('#a05a10');
    const painted = over(parseColor('rgba(160, 90, 16, 0.14)'), parseColor('#ffffff'));
    expect(painted).toEqual(parseColor('#f2e8de'));
    expect(contrast(oldInk, painted)).toBeCloseTo(4.38, 2);
  });
});

describe('tokens — one shadow definition', () => {
  it('shadow tokens are declared only in tokens/shadows.css', () => {
    for (const t of ['--btn-shadow', '--container-shadow', '--image-shadow']) {
      expect(declaredNames(ROOT_LIGHT)).not.toContain(t);
      expect(declaredNames(blockOf(shadows, ':root')).filter((n) => n === t)).toHaveLength(1);
    }
  });

  it('shadows build on --shadow-rgb so they reverse without a media query', () => {
    const src = stripComments(shadows);
    expect(src).toContain('var(--shadow-rgb)');
    expect(src).not.toContain('@media');
    expect(declarations(ROOT_LIGHT).get('--shadow-rgb')).toBe('0 0 0');
    expect(declarations(ROOT_DARK_FORCED).get('--shadow-rgb')).toBe('255 255 255');
  });
});

describe('tokens — cascade & hygiene', () => {
  it('app.css imports tokens in the documented order, colors first', () => {
    const order = appCssImports().filter((s) => s.startsWith('./tokens/'));
    expect(order[0]).toBe('./tokens/colors.css');
    expect(order).toContain('./tokens/typography.css');
    expect(order.at(-1)).toBe('./tokens/admin.css');
  });

  it('token files contain only custom-property declarations (no element/class rules)', () => {
    for (const rel of listCssFiles().filter((f) => f.startsWith('tokens/'))) {
      const body = stripComments(readStyle(rel));
      // any `prop: value;` that is not a custom property is a smell in tokens/
      const plain = body.match(/(^|[\s{;])(?!--)[a-z-]+\s*:\s*[^;{}]+;/g) ?? [];
      expect(plain, `${rel}: ${plain.join(' | ')}`).toHaveLength(0);
    }
  });

  it('no hex colour literal outside tokens/', () => {
    for (const rel of listCssFiles().filter((f) => !f.startsWith('tokens/'))) {
      const text = stripComments(readStyle(rel));
      expect(text, rel).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });

  it('the legacy category hex map is gone from web/ (one source: --cat-* tokens)', () => {
    const srcDir = resolve(stylesDir, '..', '..');
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const f = join(dir, n);
        return statSync(f).isDirectory() ? walk(f) : /\.(ts|svelte)$/.test(n) ? [f] : [];
      });
    for (const file of walk(srcDir)) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/CAT_COLORS/);
      expect(text, file).not.toMatch(/#(1e6b61|2a4a9e|5c3d9c|a05a10|b02030)\b/i);
    }
  });
});
