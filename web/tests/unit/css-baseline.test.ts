// S12 — the global CSS baseline as text assertions: cascade order, the
// reduced-motion kill-switch, the ≥16px mobile-input floor, the layout
// scaffolds, base/ holding no classes, and the canonical breakpoint set.
import { describe, expect, it } from 'vitest';
import {
  appCssImports,
  blockOf,
  bundleAppCss,
  listCssFiles,
  readStyle,
  stripComments,
} from '$lib/test/css';

const bundle = stripComments(bundleAppCss());
const imports = appCssImports();
const CANONICAL_BREAKPOINTS = new Set([768, 640, 600, 480, 900, 1100]);

/** Body of the first @media block whose query text equals `query`. */
function mediaBlock(css: string, query: string): string {
  return blockOf(css, `@media ${query}`);
}

/** The rule bodies inside `css` whose selector list contains `selector`. */
function rulesFor(css: string, selector: string): string[] {
  const src = stripComments(css);
  const out: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of src.matchAll(re)) {
    const selectors = m[1].split(',').map((s) => s.trim());
    if (selectors.includes(selector)) out.push(m[2]);
  }
  return out;
}

describe('app.css — cascade order', () => {
  it('imports tokens → base → layout → utilities, each group contiguous', () => {
    const folder = (spec: string) => spec.split('/')[1];
    const order = imports.map(folder);
    const groups = order.filter((f, i) => order[i - 1] !== f);
    expect(groups).toEqual(['tokens', 'base', 'layout', 'utilities']);
  });

  it('every stylesheet under src/lib/styles is imported exactly once', () => {
    const files = listCssFiles().filter((f) => f !== 'app.css');
    const imported = imports.map((s) => s.replace(/^\.\//, ''));
    expect([...imported].sort()).toEqual(files);
    expect(new Set(imported).size).toBe(imported.length);
  });
});

describe('reduced motion — the global guard (base/motion.css)', () => {
  const motion = readStyle('base/motion.css');
  const block = mediaBlock(motion, '(prefers-reduced-motion: reduce)');

  it('exists at the base level, not as a class hook', () => {
    expect(block).not.toBe('');
    expect(bundle).not.toContain('adm-reduce-motion');
  });

  it('targets every element and pseudo-element', () => {
    expect(block).toMatch(/^\s*\*,\s*\*::before,\s*\*::after\s*\{/);
  });

  it('kills animation and transition durations with !important', () => {
    const body =
      blockOf(block, '*,\n  *::before,\n  *::after') || blockOf(block, '*, *::before, *::after');
    const decl = body || block;
    expect(decl).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(decl).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    expect(decl).toMatch(/animation-iteration-count:\s*1\s*!important/);
    expect(decl).toMatch(/animation-delay:\s*0m?s\s*!important/);
    expect(decl).toMatch(/transition-delay:\s*0m?s\s*!important/);
    expect(decl).toMatch(/scroll-behavior:\s*auto\s*!important/);
  });

  it('every utility file that animates carries its own reduce guard', () => {
    for (const rel of [
      'utilities/animations.css',
      'utilities/scroll-reveal.css',
      'utilities/a11y.css',
    ]) {
      const text = stripComments(readStyle(rel));
      if (/animation:|transition:/.test(text)) {
        expect(text, rel).toContain('@media (prefers-reduced-motion: reduce)');
      }
    }
  });

  it('shows hidden-by-default reveal classes outright under reduce', () => {
    const anim = readStyle('utilities/animations.css');
    const guard = mediaBlock(anim, '(prefers-reduced-motion: reduce)');
    for (const cls of ['.autoShow', '.animate-fade-up', '.animate-fade-in', '.fade-in']) {
      expect(guard, cls).toContain(cls);
    }
    expect(guard).toMatch(/opacity:\s*1\s*!important/);
    expect(guard).toMatch(/animation:\s*none\s*!important/);
  });
});

describe('forms — mobile inputs compute ≥16px (base/forms.css)', () => {
  const forms = readStyle('base/forms.css');
  const mobile = mediaBlock(forms, '(max-width: 768px)');

  it('floors text-like inputs, select, textarea and contenteditable at 768px and below', () => {
    expect(mobile).not.toBe('');
    expect(mobile).toMatch(/input:not\(\[type='checkbox'\]\)/);
    expect(mobile).toMatch(/\bselect\b/);
    expect(mobile).toMatch(/\btextarea\b/);
    expect(mobile).toMatch(/\[contenteditable='true'\]/);
  });

  it('gives select/textarea/contenteditable the same (0,4,1) specificity via :is()', () => {
    // Bare `select`/`textarea` at (0,0,1) lose to any component class — the
    // legacy bug. Inside :is() every control inherits the input selector's weight.
    const sel = mobile.slice(0, mobile.indexOf('{')).replace(/\s+/g, ' ').trim();
    expect(sel.startsWith(':is(')).toBe(true);
    expect(sel.endsWith(')')).toBe(true);
    expect(sel).toMatch(
      /:is\(\s*input:not\(.+\),\s*select,\s*textarea,\s*\[contenteditable='true'\]\s*\)/,
    );
  });

  it('the floor resolves to at least 16px for any operand', () => {
    const m = mobile.match(/font-size:\s*([^;]+);/);
    expect(m).not.toBeNull();
    const value = m![1].trim();
    // max(a, b): every operand must itself be ≥ 16px at the default 16px root.
    const inner = value.match(/^max\((.+)\)$/);
    expect(inner, `expected a max(): ${value}`).not.toBeNull();
    const px = (len: string): number => {
      const n = Number.parseFloat(len);
      if (len.endsWith('rem')) return n * 16;
      if (len.endsWith('px')) return n;
      throw new Error(`unsupported length ${len}`);
    };
    const operands = inner![1].split(',').map((s) => px(s.trim()));
    expect(operands.length).toBeGreaterThanOrEqual(2);
    for (const op of operands) expect(op).toBeGreaterThanOrEqual(16);
    expect(Math.max(...operands)).toBeGreaterThanOrEqual(16);
  });

  it('does not exclude the checkbox/radio/range/color inputs by accident', () => {
    expect(mobile).toMatch(
      /:not\(\[type='radio'\]\):not\(\[type='range'\]\):not\(\[type='color'\]\)/,
    );
  });
});

describe('layout — container and zigzag scaffolds', () => {
  it('.wrapper / .info-container / zigzag grid are present and token-driven', () => {
    for (const sel of [
      '.wrapper',
      '.info-container',
      '.wrapper--zigzag-grid',
      '.zigzag-card',
      '.zigzag-image',
    ]) {
      expect(rulesFor(bundle, sel).length, sel).toBeGreaterThan(0);
    }
    const wrapper = rulesFor(readStyle('layout/container.css'), '.wrapper')[0];
    expect(wrapper).toMatch(/overflow:\s*clip/);
    expect(wrapper).toMatch(/border-radius:\s*var\(--radius-md\)/);
    expect(wrapper).toMatch(/box-shadow:\s*var\(--container-shadow\)/);
  });

  it('zigzag is a 2-col grid that collapses to 1 col at ≤768px', () => {
    const zig = readStyle('layout/zigzag.css');
    expect(rulesFor(zig, '.wrapper--zigzag-grid')[0]).toMatch(/grid-template-columns:\s*1fr 1fr/);
    const mobile = mediaBlock(zig, '(max-width: 768px)');
    expect(rulesFor(mobile, '.wrapper--zigzag-grid')[0]).toMatch(/grid-template-columns:\s*1fr;/);
  });

  it('the dead var(--bp-xs) media query was not ported', () => {
    expect(bundle).not.toMatch(/@media[^{]*var\(/);
  });
});

describe('base — hygiene', () => {
  it('base/ contains element selectors only (no classes, no ids)', () => {
    for (const rel of listCssFiles().filter((f) => f.startsWith('base/'))) {
      const text = stripComments(readStyle(rel))
        // drop declarations so `0.01ms` / `max(1rem, 16px)` cannot false-positive
        .replace(/[\w-]+\s*:\s*[^;{}]+;/g, '');
      expect(text, rel).not.toMatch(/\.[A-Za-z_]/);
      expect(text, rel).not.toMatch(/#[A-Za-z_]/);
    }
  });

  it('paints the body with reversing tokens and defines one global focus ring', () => {
    const reset = readStyle('base/reset.css');
    const body = rulesFor(reset, 'body')[0];
    expect(body).toMatch(/color:\s*var\(--color-text\)/);
    expect(body).toMatch(/background-color:\s*var\(--color-bg-light\)/);
    const ring = rulesFor(reset, ':focus-visible')[0];
    expect(ring).toMatch(/outline:\s*2px solid var\(--color-focus\)/);
    expect(ring).not.toMatch(/outline:\s*none/);
  });

  it('sets no font-size in px anywhere except the iOS floor', () => {
    const px = bundle.match(/font-size:\s*[^;]*\d+px[^;]*;/g) ?? [];
    expect(px).toEqual(['font-size: max(1rem, 16px);']);
  });
});

describe('breakpoints — canonical set only', () => {
  it('every max-width/min-width media query uses 768/640/600/480/900/1100', () => {
    for (const m of bundle.matchAll(/@media[^{]*?\((?:max|min)-width:\s*(\d+)px\)/g)) {
      expect(CANONICAL_BREAKPOINTS.has(Number(m[1])), `breakpoint ${m[1]}px`).toBe(true);
    }
  });
});
