// S14 — Button.svelte under jsdom: the element is chosen by `href`, the class
// contract is the `.ird-btn` family, disabled is real on both elements, and
// `loading` disables + announces aria-busy while keeping the label (and so the
// width) in place. The style block is held to the token/a11y rules too, since
// that is where most of this component lives.
import { fireEvent, render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import Button from '$lib/components/Button.svelte';
import { BUTTON_BLOCK, BUTTON_SIZES, BUTTON_VARIANTS } from '$lib/components/button';

/** A children snippet holding plain text — the label every Button should have. */
const label = (text: string) => createRawSnippet(() => ({ render: () => `<span>${text}</span>` }));

const root = (container: HTMLElement) => container.querySelector<HTMLElement>(`.${BUTTON_BLOCK}`);

/** The component's <style> block with CSS comments stripped (they cite hexes). */
function styleBlock(): string {
  const src = readFileSync(resolve(process.cwd(), 'src/lib/components/Button.svelte'), 'utf8');
  const block = src.slice(src.indexOf('<style>'), src.indexOf('</style>'));
  return block.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('Button — element choice', () => {
  it('renders a <button> when there is no href, defaulting to type="button"', () => {
    const { container, getByRole } = render(Button, { children: label('Guardar') });
    const el = root(container);
    expect(el?.tagName).toBe('BUTTON');
    expect(el).toHaveAttribute('type', 'button');
    expect(getByRole('button', { name: 'Guardar' })).toBe(el);
  });

  it('renders an <a> when href is given, and never a <button>', () => {
    const { container, getByRole } = render(Button, {
      href: '/app/eventos/',
      children: label('Ver eventos'),
    });
    const el = root(container);
    expect(el?.tagName).toBe('A');
    expect(el).toHaveAttribute('href', '/app/eventos/');
    expect(el).not.toHaveAttribute('type');
    expect(container.querySelector('button')).toBeNull();
    expect(getByRole('link', { name: 'Ver eventos' })).toBe(el);
  });

  it('forwards type/form on the button and target/rel on the link', () => {
    const submit = render(Button, { type: 'submit', form: 'alta', children: label('Enviar') });
    expect(root(submit.container)).toHaveAttribute('type', 'submit');
    expect(root(submit.container)).toHaveAttribute('form', 'alta');

    // `target` is a reserved testing-library option name — props must be nested.
    const blank = render(Button, {
      props: { href: 'https://irdlex.org/', target: '_blank', children: label('Abrir') },
    });
    expect(root(blank.container)).toHaveAttribute('target', '_blank');
    // A new tab without noopener hands the opener window to the target page.
    expect(root(blank.container)).toHaveAttribute('rel', 'noopener noreferrer');

    const owned = render(Button, {
      props: {
        href: 'https://irdlex.org/',
        target: '_blank',
        rel: 'nofollow',
        children: label('Abrir'),
      },
    });
    expect(root(owned.container)).toHaveAttribute('rel', 'nofollow');
  });
});

describe('Button — class contract (.ird-btn, kept for coexistence)', () => {
  it('every variant renders its modifier on the ird-btn block', () => {
    for (const variant of BUTTON_VARIANTS) {
      const { container } = render(Button, { variant, children: label('X') });
      expect(root(container), variant).toHaveClass(BUTTON_BLOCK, `${BUTTON_BLOCK}--${variant}`);
    }
  });

  it('defaults to the primary variant and the default size (no size modifier)', () => {
    const { container } = render(Button, { children: label('X') });
    expect(root(container)).toHaveClass(`${BUTTON_BLOCK}--primary`);
    expect(root(container)).not.toHaveClass(`${BUTTON_BLOCK}--default`);
    expect(root(container)).not.toHaveClass(`${BUTTON_BLOCK}--sm`, `${BUTTON_BLOCK}--full`);
  });

  it('sm and full render a size modifier; default renders none', () => {
    for (const size of BUTTON_SIZES) {
      const { container } = render(Button, { size, children: label('X') });
      const has = root(container)?.className.includes(`${BUTTON_BLOCK}--${size}`);
      expect(has, size).toBe(size !== 'default');
    }
  });

  it('appends a consumer class without dropping its own', () => {
    const { container } = render(Button, { class: 'wiz__next', children: label('X') });
    expect(root(container)).toHaveClass(BUTTON_BLOCK, `${BUTTON_BLOCK}--primary`, 'wiz__next');
  });

  it('renders a leading icon as a decorative glyph inside its own slot', () => {
    const { container } = render(Button, { icon: 'plus', children: label('Agregar') });
    const glyph = container.querySelector('.ird-btn__icon .icon');
    expect(glyph).toHaveClass('fas', 'fa-plus');
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.ird-btn__label')).toHaveTextContent('Agregar');
  });

  it('drops an icon name that is not a Font Awesome token (Icon refuses it)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(Button, { icon: 'plus fa-spin', children: label('Agregar') });
    expect(container.querySelector('.ird-btn__icon .icon')).toBeNull();
    expect(container.querySelector('.fa-spin')).toBeNull();
    warn.mockRestore();
  });
});

describe('Button — disabled', () => {
  it('marks a disabled button with the disabled attribute and the state class', () => {
    const { container } = render(Button, { disabled: true, children: label('Guardar') });
    const el = root(container);
    expect(el).toBeDisabled();
    expect(el).toHaveClass('is-disabled');
    expect(el).not.toHaveClass('is-loading');
    expect(el).not.toHaveAttribute('aria-busy');
  });

  it('a disabled link drops its href, leaves the tab order and says aria-disabled', () => {
    const { container } = render(Button, {
      href: '/app/eventos/',
      disabled: true,
      children: label('Ver eventos'),
    });
    const el = root(container);
    expect(el?.tagName).toBe('A');
    expect(el).not.toHaveAttribute('href');
    expect(el).toHaveAttribute('aria-disabled', 'true');
    expect(el).toHaveAttribute('tabindex', '-1');
    expect(el).toHaveAttribute('role', 'link');
  });

  it('swallows a click on a disabled link (an <a> has no disabled attribute)', async () => {
    const onclick = vi.fn();
    const { container } = render(Button, {
      href: '/app/eventos/',
      disabled: true,
      onclick,
      children: label('Ver eventos'),
    });
    await fireEvent.click(root(container)!);
    expect(onclick).not.toHaveBeenCalled();
  });

  it('calls onclick when it is enabled', async () => {
    const onclick = vi.fn();
    const { container } = render(Button, { onclick, children: label('Guardar') });
    await fireEvent.click(root(container)!);
    expect(onclick).toHaveBeenCalledTimes(1);
  });
});

describe('Button — loading', () => {
  it('disables, sets aria-busy and shows a spinning glyph', () => {
    const { container } = render(Button, { loading: true, children: label('Guardar') });
    const el = root(container);
    expect(el).toHaveAttribute('aria-busy', 'true');
    expect(el).toBeDisabled();
    expect(el).toHaveClass('is-loading', 'is-disabled');
    const spinner = container.querySelector('.ird-btn__spinner .icon');
    expect(spinner).toHaveClass('fa-spinner', 'fa-spin');
  });

  it('keeps the label in the DOM so the width and the accessible name survive', () => {
    const { container, getByRole } = render(Button, { loading: true, children: label('Guardar') });
    expect(container.querySelector('.ird-btn__label')).toHaveTextContent('Guardar');
    expect(getByRole('button', { name: 'Guardar' })).toBe(root(container));
    // The label is hidden with opacity, never display/visibility: both would
    // collapse the box (layout shift) and drop the accessible name.
    expect(styleBlock()).toMatch(/\.is-loading[^{]*\{\s*opacity:\s*0;\s*\}/);
    expect(styleBlock()).not.toMatch(/\.is-loading[^{]*\{[^}]*(display|visibility)\s*:/);
  });

  it('does not fire onclick while loading (no double save)', async () => {
    const onclick = vi.fn();
    const { container } = render(Button, { loading: true, onclick, children: label('Guardar') });
    await fireEvent.click(root(container)!);
    expect(onclick).not.toHaveBeenCalled();
  });

  it('a loading link is inert too', () => {
    const { container } = render(Button, {
      href: '/app/eventos/',
      loading: true,
      children: label('Ver'),
    });
    expect(root(container)).not.toHaveAttribute('href');
    expect(root(container)).toHaveAttribute('aria-busy', 'true');
  });
});

describe('Button — styles honour the design-system rules', () => {
  const css = styleBlock();

  it('is token-only: no hex literal, no font-size in px or raw rem', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/font-size:\s*[\d.]+(px|rem)/);
    expect(css).toMatch(/font-size:\s*var\(--fs-btn\)/);
  });

  it('draws a visible focus-visible ring instead of relying on outline:none', () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-focus\)/);
    expect(css).not.toMatch(/outline:\s*none/);
  });

  it('carries the full state matrix', () => {
    expect(css).toMatch(/:hover/);
    expect(css).toMatch(/:active\s*\{\s*transform:\s*scale\(0\.97\)/);
    expect(css).toMatch(/\.is-disabled\s*\{[^}]*opacity:\s*0\.5[^}]*cursor:\s*not-allowed/);
  });

  it('uses the house easing and guards every transition with reduced motion', () => {
    expect(css).toMatch(/cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transition:\s*none/);
  });
});
