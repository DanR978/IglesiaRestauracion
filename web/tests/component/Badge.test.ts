// PR-C2 — Badge.svelte under jsdom: a status badge is glyph + words for every
// tone (D-023), role chips are distinct per role, a per-object colour reaches
// the element only as a validated --tint custom property, the words are text,
// and a badge with no words renders nothing.
import { render } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Badge from '#lib/components/Badge.svelte';
import {
  BADGE_BLOCK,
  BADGE_ROLES,
  BADGE_TONES,
  BADGE_TONE_ICONS,
  ROLE_BADGES,
} from '#lib/components/badge.js';

const root = (container: HTMLElement) => container.querySelector<HTMLElement>(`.${BADGE_BLOCK}`);

function styleBlock(): string {
  const src = readFileSync(resolve(process.cwd(), 'src/lib/components/Badge.svelte'), 'utf8');
  const block = src.slice(src.indexOf('<style>'), src.indexOf('</style>'));
  return block.replace(/\/\*[\s\S]*?\*\//g, '');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Badge — status tones', () => {
  it('every tone renders its modifier, its own glyph and the words', () => {
    const glyphs = new Set<string>();
    for (const tone of BADGE_TONES) {
      const { container } = render(Badge, { tone, label: `estado ${tone}` });
      const el = root(container);
      expect(el, tone).toHaveClass(BADGE_BLOCK, `${BADGE_BLOCK}--${tone}`);
      expect(el?.querySelector('.ird-badge__label')).toHaveTextContent(`estado ${tone}`);
      const glyph = el?.querySelector('.ird-badge__icon .icon');
      expect(glyph, tone).toHaveClass(`fa-${BADGE_TONE_ICONS[tone]}`);
      expect(glyph).toHaveAttribute('aria-hidden', 'true');
      glyphs.add(BADGE_TONE_ICONS[tone]);
    }
    // Never colour alone: five tones, five different shapes.
    expect(glyphs.size).toBe(BADGE_TONES.length);
  });

  it('defaults to the neutral tone', () => {
    const { container } = render(Badge, { label: 'Borrador' });
    expect(root(container)).toHaveClass(`${BADGE_BLOCK}--neutral`);
  });

  it('a custom glyph replaces the default one', () => {
    const { container } = render(Badge, { tone: 'warn', label: 'Pendiente', icon: 'clock' });
    expect(container.querySelector('.ird-badge__icon .icon')).toHaveClass('fa-clock');
    expect(container.querySelectorAll('.ird-badge__icon')).toHaveLength(1);
  });

  it('is a plain, non-interactive <span> with the words as its text', () => {
    const { container } = render(Badge, { tone: 'success', label: 'Activa' });
    const el = root(container);
    expect(el?.tagName).toBe('SPAN');
    expect(el).not.toHaveAttribute('role');
    expect(el).not.toHaveAttribute('tabindex');
    expect(el).toHaveTextContent('Activa');
  });

  it('renders the words as text, never markup (D-005)', () => {
    const { container } = render(Badge, { label: '<img src=x onerror="alert(1)">' });
    expect(container.querySelector('img')).toBeNull();
    expect(root(container)).toHaveTextContent('<img src=x onerror="alert(1)">');
  });

  it('renders nothing (and warns) when there are no words', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(Badge, { tone: 'success', label: '  ' });
    expect(root(container)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[badge]'));
  });
});

describe('Badge — role chips', () => {
  it('derives the Spanish label and glyph from the role', () => {
    for (const role of BADGE_ROLES) {
      const { container } = render(Badge, { role });
      const el = root(container);
      expect(el, role).toHaveClass(`${BADGE_BLOCK}--role`);
      expect(el).toHaveTextContent(ROLE_BADGES[role].label);
      expect(el?.querySelector('.icon')).toHaveClass(`fa-${ROLE_BADGES[role].icon}`);
    }
  });

  it('admin, treasurer and leader never render identically (users.css:108-119)', () => {
    const signatures = BADGE_ROLES.map((role) => {
      const { container } = render(Badge, { role });
      const el = root(container)!;
      return `${el.className}|${el.textContent}|${el.querySelector('.icon')?.className}`;
    });
    expect(new Set(signatures).size).toBe(BADGE_ROLES.length);
    const { container } = render(Badge, { role: 'ministry_leader' });
    expect(root(container)).toHaveClass(`${BADGE_BLOCK}--ministry-leader`);
  });

  it('takes a label override (e.g. an access preset name)', () => {
    const { container } = render(Badge, { role: 'admin', label: 'Desarrollador' });
    expect(root(container)).toHaveTextContent('Desarrollador');
    expect(root(container)).toHaveClass(`${BADGE_BLOCK}--admin`);
  });

  it('an unknown role from the database renders nothing rather than a guess', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(Badge, { role: 'pastor' as never });
    expect(root(container)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown role'));
  });

  it('the three role treatments are three different rules in the stylesheet', () => {
    const css = styleBlock();
    const rule = (sel: string) => css.match(new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    const admin = rule('.ird-badge--admin');
    const treasurer = rule('.ird-badge--treasurer');
    const leader = rule('.ird-badge--ministry-leader');
    expect(admin).toMatch(/background:\s*var\(--color-dark\)/);
    expect(treasurer).toMatch(/box-shadow:\s*inset 0 0 0 1px currentColor/);
    expect(leader).toMatch(/background:\s*rgba\(127, 127, 127, 0\.12\)/);
    expect(new Set([admin, treasurer, leader]).size).toBe(3);
  });
});

describe('Badge — a record colour (tinted)', () => {
  it('sets the validated colour as --tint and shows a dot', () => {
    const { container } = render(Badge, { tint: '#3B82F6', label: 'Jóvenes' });
    const el = root(container)!;
    expect(el).toHaveClass(`${BADGE_BLOCK}--tinted`);
    expect(el.style.getPropertyValue('--tint')).toBe('#3b82f6');
    expect(el.querySelector('.ird-badge__dot')).toHaveAttribute('aria-hidden', 'true');
    expect(el).toHaveTextContent('Jóvenes');
  });

  it('expands a short hex and takes a preset glyph instead of the dot', () => {
    const { container } = render(Badge, { tint: '#0a8', label: 'Medios', icon: 'camera' });
    const el = root(container)!;
    expect(el.style.getPropertyValue('--tint')).toBe('#00aa88');
    expect(el.querySelector('.ird-badge__dot')).toBeNull();
    expect(el.querySelector('.icon')).toHaveClass('fa-camera');
  });

  it('an invalid colour never reaches the style attribute — the chip goes neutral', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const tint of [
      'red; background:url(https://evil.example/x)',
      'url(javascript:alert(1))',
      'rgb(0,0,0)',
      '#12345',
      null,
    ]) {
      const { container } = render(Badge, { tint, label: 'Ministerio' });
      const el = root(container)!;
      expect(el, String(tint)).toHaveClass(`${BADGE_BLOCK}--neutral`);
      expect(el).not.toHaveClass(`${BADGE_BLOCK}--tinted`);
      expect(el.getAttribute('style') ?? '').toBe('');
      expect(el.querySelector('.ird-badge__dot')).toBeNull();
    }
    expect(warn).toHaveBeenCalled();
  });

  it('keeps the words in the reversing ink; the colour paints only tint, dot and glyph', () => {
    const css = styleBlock();
    expect(css).toMatch(
      /\.ird-badge--tinted\s*\{[^}]*color-mix\(in srgb, var\(--tint\) 14%, transparent\)[^}]*color:\s*var\(--color-text\)/,
    );
    expect(css).toMatch(/\.ird-badge__dot\s*\{[^}]*background:\s*var\(--tint\)/);
  });
});

describe('Badge — styles honour the design-system rules', () => {
  const css = styleBlock();

  it('is token-only: no hex literal, no px/rem font-size, no colour-scheme query', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/font-size:\s*[\d.]+(px|rem)/);
    expect(css).toMatch(/font-size:\s*var\(--fs-xs\)/);
    expect(css).not.toContain('prefers-color-scheme');
  });

  it('every tone reads a --status-* ink and tint pair', () => {
    for (const [tone, status] of [
      ['neutral', 'inactive'],
      ['info', 'open'],
      ['success', 'active'],
      ['warn', 'pending'],
      ['danger', 'overdue'],
    ]) {
      expect(css, tone).toMatch(
        new RegExp(
          `\\.ird-badge--${tone}\\s*\\{[^}]*background:\\s*var\\(--status-${status}-bg\\)[^}]*color:\\s*var\\(--status-${status}\\)`,
        ),
      );
    }
  });
});
