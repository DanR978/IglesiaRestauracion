// S14 — Card.svelte under jsdom: the false-affordance rule is structural (a
// static card is an inert <div>; an interactive one is a REAL <a>/<button>, so
// Enter/Space work without a keydown handler), the KPI tile always states its
// scope, and content is text — never {@html}.
import { fireEvent, render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import Card from '$lib/components/Card.svelte';
import { CARD_BLOCK, CARD_VARIANTS } from '$lib/components/card';

const body = (text: string) => createRawSnippet(() => ({ render: () => `<p>${text}</p>` }));

const root = (container: HTMLElement) => container.querySelector<HTMLElement>(`.${CARD_BLOCK}`);

/** The component's <style> block with CSS comments stripped (they cite hexes). */
function styleBlock(): string {
  const src = readFileSync(resolve(process.cwd(), 'src/lib/components/Card.svelte'), 'utf8');
  const block = src.slice(src.indexOf('<style>'), src.indexOf('</style>'));
  return block.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('Card — the false-affordance rule is structural', () => {
  it('static is the default and renders an inert <div>', () => {
    const { container } = render(Card, { children: body('Contenido') });
    const el = root(container);
    expect(el?.tagName).toBe('DIV');
    expect(el).toHaveClass(CARD_BLOCK, `${CARD_BLOCK}--static`);
    expect(container.querySelector('a, button')).toBeNull();
    expect(el).not.toHaveAttribute('role');
    expect(el).not.toHaveAttribute('tabindex');
  });

  it('a static card ignores href — it never becomes a link by accident', () => {
    const { container } = render(Card, { href: '/app/eventos/', children: body('Contenido') });
    expect(root(container)?.tagName).toBe('DIV');
    expect(container.querySelector('a')).toBeNull();
  });

  it('interactive + href renders a real <a>', () => {
    const { container, getByRole } = render(Card, {
      variant: 'interactive',
      href: '/app/eventos/vbs/',
      children: body('Vacaciones Bíblicas'),
    });
    const el = root(container);
    expect(el?.tagName).toBe('A');
    expect(el).toHaveAttribute('href', '/app/eventos/vbs/');
    expect(getByRole('link', { name: /Vacaciones/ })).toBe(el);
  });

  it('interactive without href renders a real <button> (Enter/Space work natively)', async () => {
    const onclick = vi.fn();
    const { container } = render(Card, {
      variant: 'interactive',
      onclick,
      children: body('Abrir grupo'),
    });
    const el = root(container);
    expect(el?.tagName).toBe('BUTTON');
    expect(el).toHaveAttribute('type', 'button');
    // Never a div with role="button" + a click listener (the designer library bug).
    expect(el).not.toHaveAttribute('role');
    await fireEvent.click(el!);
    expect(onclick).toHaveBeenCalledTimes(1);
  });

  it('takes an explicit accessible name when the content does not read as one', () => {
    const { getByRole } = render(Card, {
      variant: 'interactive',
      href: '/app/discipulado/',
      ariaLabel: 'Abrir discipulado',
      children: body('12'),
    });
    expect(getByRole('link', { name: 'Abrir discipulado' })).toBeInTheDocument();
  });

  it('defaults rel to noopener noreferrer for a new tab', () => {
    // `target` is a reserved testing-library option name — props must be nested.
    const { container } = render(Card, {
      props: {
        variant: 'interactive',
        href: 'https://irdlex.org/',
        target: '_blank',
        children: body('Sitio'),
      },
    });
    expect(root(container)).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders the variant modifier for every variant', () => {
    for (const variant of CARD_VARIANTS) {
      const { container } = render(Card, { variant, children: body('X') });
      expect(root(container), variant).toHaveClass(CARD_BLOCK, `${CARD_BLOCK}--${variant}`);
    }
  });

  it('appends a consumer class', () => {
    const { container } = render(Card, { class: 'dash__tile', children: body('X') });
    expect(root(container)).toHaveClass(CARD_BLOCK, 'dash__tile');
  });
});

describe('Card — heading', () => {
  it('renders the heading at the requested level with a decorative icon', () => {
    const { container, getByRole } = render(Card, {
      heading: 'Resumen del mes',
      headingLevel: 2,
      headingIcon: 'chart-line',
      children: body('X'),
    });
    const h = getByRole('heading', { name: 'Resumen del mes', level: 2 });
    expect(h).toHaveClass('ird-card__heading');
    expect(container.querySelector('.ird-card__heading-icon .icon')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('defaults to <h3>', () => {
    const { getByRole } = render(Card, { heading: 'Notas', children: body('X') });
    expect(getByRole('heading', { level: 3 })).toHaveTextContent('Notas');
  });

  it('renders no heading element when there is no heading', () => {
    const { container } = render(Card, { children: body('X') });
    expect(container.querySelector('.ird-card__heading')).toBeNull();
  });
});

describe('Card — KPI tile', () => {
  it('renders icon, value, label and the honest scope', () => {
    const { container } = render(Card, {
      kpi: { icon: 'users', value: 128, label: 'Inscritos', scope: 'Este mes' },
    });
    const el = root(container);
    expect(el).toHaveClass(`${CARD_BLOCK}--kpi`);
    expect(el).not.toHaveClass(`${CARD_BLOCK}--alert`);
    expect(container.querySelector('.ird-card__kpi-icon .icon')).toHaveClass('fa-users');
    expect(container.querySelector('.ird-card__kpi-value')).toHaveTextContent('128');
    expect(container.querySelector('.ird-card__kpi-label')).toHaveTextContent('Inscritos');
    // The scope is what stops a month figure sitting beside an all-time one
    // looking identical (PORT-DEBT S14) — it is required, so it always renders.
    expect(container.querySelector('.ird-card__kpi-scope')).toHaveTextContent('Este mes');
  });

  it('an all-time tile is visibly distinguishable from a month-scoped one', () => {
    const month = render(Card, {
      kpi: { value: '$1,200.00', label: 'Ingresos', scope: 'Este mes' },
    });
    const all = render(Card, {
      kpi: { value: '$430.00', label: 'Por pagar', scope: 'Todo el tiempo' },
    });
    expect(month.container.querySelector('.ird-card__kpi-scope')?.textContent).not.toBe(
      all.container.querySelector('.ird-card__kpi-scope')?.textContent,
    );
  });

  it('the alert tone tints the tile and is opt-in', () => {
    const { container } = render(Card, {
      kpi: { icon: 'triangle-exclamation', value: 3, label: 'Pendientes', scope: 'Hoy' },
    });
    expect(root(container)).not.toHaveClass(`${CARD_BLOCK}--alert`);

    const alert = render(Card, {
      kpi: {
        icon: 'triangle-exclamation',
        value: 3,
        label: 'Pendientes',
        scope: 'Hoy',
        tone: 'alert',
      },
    });
    expect(root(alert.container)).toHaveClass(`${CARD_BLOCK}--alert`);
  });

  it('an interactive KPI tile is still a real control', () => {
    const onclick = vi.fn();
    const { container } = render(Card, {
      variant: 'interactive',
      onclick,
      ariaLabel: 'Ver inscritos',
      kpi: { value: 12, label: 'Inscritos', scope: 'Este mes' },
    });
    expect(root(container)?.tagName).toBe('BUTTON');
    expect(root(container)).toHaveClass(`${CARD_BLOCK}--kpi`, `${CARD_BLOCK}--interactive`);
  });

  it('renders KPI text as TEXT, never markup (D-005)', () => {
    const { container } = render(Card, {
      kpi: {
        value: '<img src=x onerror=alert(1)>',
        label: '<b>Inscritos</b>',
        scope: '<script>bad()</script>',
      },
    });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('.ird-card__kpi-label')).toHaveTextContent('<b>Inscritos</b>');
  });
});

describe('Card — styles honour the design-system rules', () => {
  const css = styleBlock();

  it('is token-only: no hex literal, no font-size in px or raw rem', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/font-size:\s*[\d.]+(px|rem)/);
  });

  it('uses ONE radius (--radius-md) and ONE resting shadow — not .dash-card', () => {
    expect(css).toMatch(/border-radius:\s*var\(--radius-md\)/);
    expect(css).toMatch(/box-shadow:\s*var\(--shadow-sm\)/);
    expect(css).not.toMatch(/var\(--radius-lg\)/);
    expect(css).not.toMatch(/translateY/); // no 3px lift
  });

  it('hovers to the reversing ink, never an amber accent or a decorative wipe', () => {
    expect(css).toMatch(/:hover\s*\{[^}]*border-color:\s*var\(--color-text\)/);
    expect(css).not.toMatch(/--gold-bright|--color-accent|--color-add/);
    expect(css).not.toMatch(/::before/);
  });

  it('never sets grid-column (the autoBalance/grid-balance hack, G-010)', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/lib/components/Card.svelte'), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toMatch(/gridColumn|grid-column/);
  });

  it('rings on focus-visible and guards its motion', () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-focus\)/);
    expect(css).toMatch(/cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transition:\s*none/);
  });

  it('only the interactive variant has hover, cursor and active state', () => {
    for (const rule of [':hover', ':active', 'cursor: pointer']) {
      const occurrences = css.split(rule).length - 1;
      expect(occurrences, rule).toBeGreaterThan(0);
    }
    // every hover/active selector is scoped to --interactive
    for (const match of css.matchAll(/^\s*(\.[^{]*?:(?:hover|active))\s*\{/gm)) {
      expect(match[1], match[1]).toContain(`${CARD_BLOCK}--interactive`);
    }
  });
});
