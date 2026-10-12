// S11 — the token files as a contract: money/type tokens defined once in
// :root, the type scale monotonic (D-015), one dark-mode mechanism (D-017),
// the admin override scoped (D-014), and one shadow definition.
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
} from '$lib/test/css';

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
    for (const s of [
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
    ]) {
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
