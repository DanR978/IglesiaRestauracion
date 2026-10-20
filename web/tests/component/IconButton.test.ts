// PR-C2 — IconButton.svelte under jsdom: the accessible name is required and
// is the aria-label (no title= tooltip), the glyph is decorative, every
// variant/size/state renders its class contract, `pressed` makes a real
// toggle, `href` makes a link, loading/disabled are inert, and only ARIA
// states + data-* pass through. The style block is held to the token rules.
import { fireEvent, render } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import IconButton from '#lib/components/IconButton.svelte';
import {
  ICON_BUTTON_BLOCK,
  ICON_BUTTON_PX,
  ICON_BUTTON_SIZES,
  ICON_BUTTON_TOUCH_PX,
  ICON_BUTTON_VARIANTS,
  hasAccessibleName,
} from '#lib/components/icon-button.js';

const root = (container: HTMLElement) =>
  container.querySelector<HTMLElement>(`.${ICON_BUTTON_BLOCK}`);

/** The component's <style> block with CSS comments stripped. */
function styleBlock(): string {
  const src = readFileSync(resolve(process.cwd(), 'src/lib/components/IconButton.svelte'), 'utf8');
  const block = src.slice(src.indexOf('<style>'), src.indexOf('</style>'));
  return block.replace(/\/\*[\s\S]*?\*\//g, '');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('IconButton — the accessible name', () => {
  it('renders a <button type="button"> named by `label` through aria-label', () => {
    const { container, getByRole } = render(IconButton, { icon: 'xmark', label: 'Cerrar aviso' });
    const el = root(container);
    expect(el?.tagName).toBe('BUTTON');
    expect(el).toHaveAttribute('type', 'button');
    expect(el).toHaveAttribute('aria-label', 'Cerrar aviso');
    expect(getByRole('button', { name: 'Cerrar aviso' })).toBe(el);
  });

  it('never sets a title= tooltip (invisible on touch and to most assistive tech)', () => {
    const { container } = render(IconButton, { icon: 'xmark', label: 'Cerrar aviso' });
    expect(root(container)).not.toHaveAttribute('title');
  });

  it('keeps the glyph decorative, so the label is the only name', () => {
    const { container } = render(IconButton, { icon: 'ellipsis-vertical', label: 'Acciones' });
    const glyph = container.querySelector('.ird-icon-btn__icon .icon');
    expect(glyph).toHaveClass('fas', 'fa-ellipsis-vertical');
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
    expect(glyph).not.toHaveAttribute('aria-label');
  });

  it('warns when the label is blank — an unnamed icon control is unusable', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(IconButton, { icon: 'trash', label: '   ' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[icon-button]'));
  });

  it('hasAccessibleName accepts only non-blank strings', () => {
    expect(hasAccessibleName('Cerrar')).toBe(true);
    for (const bad of ['', '  ', undefined, null, 3]) expect(hasAccessibleName(bad)).toBe(false);
  });

  it('is reachable by keyboard focus', () => {
    const { container } = render(IconButton, { icon: 'bars', label: 'Abrir menú' });
    const el = root(container)!;
    el.focus();
    expect(document.activeElement).toBe(el);
  });
});

describe('IconButton — variants, sizes and the touch target', () => {
  it('every variant renders its modifier; ghost is the default', () => {
    for (const variant of ICON_BUTTON_VARIANTS) {
      const { container } = render(IconButton, { icon: 'pen', label: 'Editar', variant });
      expect(root(container), variant).toHaveClass(
        ICON_BUTTON_BLOCK,
        `${ICON_BUTTON_BLOCK}--${variant}`,
      );
    }
    const { container } = render(IconButton, { icon: 'pen', label: 'Editar' });
    expect(root(container)).toHaveClass(`${ICON_BUTTON_BLOCK}--ghost`);
  });

  it('every size renders its modifier; md is the default', () => {
    for (const size of ICON_BUTTON_SIZES) {
      const { container } = render(IconButton, { icon: 'pen', label: 'Editar', size });
      expect(root(container), size).toHaveClass(`${ICON_BUTTON_BLOCK}--${size}`);
    }
    const { container } = render(IconButton, { icon: 'pen', label: 'Editar' });
    expect(root(container)).toHaveClass(`${ICON_BUTTON_BLOCK}--md`);
  });

  it('`touch` adds the 44px hit-area modifier; it is off by default', () => {
    const plain = render(IconButton, { icon: 'bars', label: 'Abrir menú' });
    expect(root(plain.container)).not.toHaveClass(`${ICON_BUTTON_BLOCK}--touch`);
    const touch = render(IconButton, { icon: 'bars', label: 'Abrir menú', touch: true });
    expect(root(touch.container)).toHaveClass(`${ICON_BUTTON_BLOCK}--touch`);
  });

  it('documents squares that clear WCAG 2.5.8 and a 44px touch target', () => {
    expect(ICON_BUTTON_PX.sm).toBeGreaterThanOrEqual(24);
    expect(ICON_BUTTON_PX.md).toBeGreaterThanOrEqual(24);
    expect(ICON_BUTTON_TOUCH_PX).toBe(44);
    const css = styleBlock();
    expect(css).toMatch(/\.ird-icon-btn--sm\s*\{[^}]*--icon-btn-size:\s*2rem/);
    expect(css).toMatch(/\.ird-icon-btn--md\s*\{[^}]*--icon-btn-size:\s*2\.5rem/);
    expect(css).toMatch(/--touch::after\s*\{[^}]*max\(100%, 2\.75rem\)/);
  });

  it('appends a consumer class without dropping its own', () => {
    const { container } = render(IconButton, {
      icon: 'xmark',
      label: 'Cerrar',
      class: 'ird-alert__dismiss',
    });
    expect(root(container)).toHaveClass(ICON_BUTTON_BLOCK, 'ird-alert__dismiss');
  });
});

describe('IconButton — states', () => {
  it('calls onclick when enabled', async () => {
    const onclick = vi.fn();
    const { container } = render(IconButton, { icon: 'trash', label: 'Eliminar', onclick });
    await fireEvent.click(root(container)!);
    expect(onclick).toHaveBeenCalledTimes(1);
  });

  it('disabled: the attribute, the state class, and no click', async () => {
    const onclick = vi.fn();
    const { container } = render(IconButton, {
      icon: 'trash',
      label: 'Eliminar',
      disabled: true,
      onclick,
    });
    const el = root(container)!;
    expect(el).toBeDisabled();
    expect(el).toHaveClass('is-disabled');
    await fireEvent.click(el);
    expect(onclick).not.toHaveBeenCalled();
  });

  it('loading: disabled + aria-busy + a spinner in the same square, name intact', async () => {
    const onclick = vi.fn();
    const { container, getByRole } = render(IconButton, {
      icon: 'floppy-disk',
      label: 'Guardar',
      loading: true,
      onclick,
    });
    const el = root(container)!;
    expect(el).toBeDisabled();
    expect(el).toHaveAttribute('aria-busy', 'true');
    expect(el).toHaveClass('is-loading', 'is-disabled');
    expect(container.querySelector('.ird-icon-btn__spinner .icon')).toHaveClass(
      'fa-spinner',
      'fa-spin',
    );
    // The glyph stays (at opacity 0) so the square never changes.
    expect(container.querySelector('.ird-icon-btn__icon .fa-floppy-disk')).not.toBeNull();
    expect(getByRole('button', { name: 'Guardar' })).toBe(el);
    await fireEvent.click(el);
    expect(onclick).not.toHaveBeenCalled();
  });

  it('a plain action has no aria-pressed at all', () => {
    const { container } = render(IconButton, { icon: 'bold', label: 'Negrita' });
    expect(root(container)).not.toHaveAttribute('aria-pressed');
    expect(root(container)).not.toHaveClass('is-pressed');
  });

  it('`pressed` makes a toggle: aria-pressed true/false and the "on" look', () => {
    const on = render(IconButton, { icon: 'bold', label: 'Negrita', pressed: true });
    expect(root(on.container)).toHaveAttribute('aria-pressed', 'true');
    expect(root(on.container)).toHaveClass('is-pressed');
    expect(on.getByRole('button', { name: 'Negrita', pressed: true })).toBe(root(on.container));

    const off = render(IconButton, { icon: 'italic', label: 'Cursiva', pressed: false });
    expect(root(off.container)).toHaveAttribute('aria-pressed', 'false');
    expect(root(off.container)).not.toHaveClass('is-pressed');
  });

  it('a toggle reflects the new state when the parent flips it', async () => {
    const { container, rerender } = render(IconButton, {
      icon: 'eye',
      label: 'Mostrar capa',
      pressed: false,
    });
    await rerender({ icon: 'eye', label: 'Mostrar capa', pressed: true });
    expect(root(container)).toHaveAttribute('aria-pressed', 'true');
  });

  it('forwards type and form on the button', () => {
    const { container } = render(IconButton, {
      icon: 'paper-plane',
      label: 'Enviar',
      type: 'submit',
      form: 'contacto',
    });
    expect(root(container)).toHaveAttribute('type', 'submit');
    expect(root(container)).toHaveAttribute('form', 'contacto');
  });
});

describe('IconButton — as a link', () => {
  it('href renders an <a> named by the label', () => {
    const { container, getByRole } = render(IconButton, {
      icon: 'arrow-up-right-from-square',
      label: 'Abrir panel actual',
      href: '/admin/',
    });
    const el = root(container);
    expect(el?.tagName).toBe('A');
    expect(el).toHaveAttribute('href', '/admin/');
    expect(container.querySelector('button')).toBeNull();
    expect(getByRole('link', { name: 'Abrir panel actual' })).toBe(el);
  });

  it('a new tab gets rel="noopener noreferrer" unless the caller owns rel', () => {
    const blank = render(IconButton, {
      props: { icon: 'globe', label: 'Sitio', href: 'https://www.irdlex.org/', target: '_blank' },
    });
    expect(root(blank.container)).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('a disabled or loading link drops its href, leaves the tab order and says so', () => {
    for (const state of [{ disabled: true }, { loading: true }]) {
      const { container } = render(IconButton, {
        icon: 'download',
        label: 'Descargar',
        href: '/x.pdf',
        ...state,
      });
      const el = root(container);
      expect(el).not.toHaveAttribute('href');
      expect(el).toHaveAttribute('aria-disabled', 'true');
      expect(el).toHaveAttribute('tabindex', '-1');
      expect(el).toHaveAttribute('role', 'link');
    }
  });

  it('ignores `pressed` on a link — a link is not a toggle', () => {
    const { container } = render(IconButton, {
      icon: 'star',
      label: 'Favorito',
      href: '/x/',
      pressed: true,
    });
    expect(root(container)).not.toHaveAttribute('aria-pressed');
    expect(root(container)).not.toHaveClass('is-pressed');
  });
});

describe('IconButton — ARIA / data-* passthrough', () => {
  it('forwards the disclosure and menu-button states and data-*', () => {
    const { container } = render(IconButton, {
      icon: 'bars',
      label: 'Abrir menú',
      'aria-expanded': true,
      'aria-controls': 'nav-drawer',
      'aria-haspopup': 'menu',
      'aria-describedby': 'hint-1',
      'data-testid': 'burger',
    });
    const el = root(container);
    expect(el).toHaveAttribute('aria-expanded', 'true');
    expect(el).toHaveAttribute('aria-controls', 'nav-drawer');
    expect(el).toHaveAttribute('aria-haspopup', 'menu');
    expect(el).toHaveAttribute('aria-describedby', 'hint-1');
    expect(el).toHaveAttribute('data-testid', 'burger');
  });

  it('drops anything else, and never lets a stray aria-label override `label`', () => {
    const props = {
      icon: 'bars',
      label: 'Abrir menú',
      style: 'display:none',
      onmouseover: 'alert(1)',
      'aria-label': 'Otro nombre',
    } as unknown as { icon: string; label: string };
    const { container } = render(IconButton, props);
    const el = root(container);
    expect(el).not.toHaveAttribute('style');
    expect(el).not.toHaveAttribute('onmouseover');
    expect(el).toHaveAttribute('aria-label', 'Abrir menú');
  });
});

describe('IconButton — styles honour the design-system rules', () => {
  const css = styleBlock();

  it('is token-only: no hex literal, no font-size in px or raw rem', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/font-size:\s*[\d.]+(px|rem)/);
    expect(css).not.toContain('prefers-color-scheme');
  });

  it('draws a visible focus ring in the control ink, never outline:none', () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid currentColor/);
    expect(css).toMatch(/is-pressed:focus-visible\s*\{[^}]*outline-color:\s*var\(--color-focus\)/);
    expect(css).not.toMatch(/outline:\s*none/);
  });

  it('keeps hover inside @media (hover: hover) — never the only affordance', () => {
    const outside = css.replace(/@media \(hover: hover\)\s*\{[\s\S]*?\n {2}\}/, '');
    expect(css).toMatch(/@media \(hover: hover\)/);
    expect(outside).not.toMatch(/:hover/);
  });

  it('uses the house easing and guards motion', () => {
    expect(css).toMatch(/cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transition:\s*none/);
  });

  it('dims disabled like Button (opacity .5, not-allowed)', () => {
    expect(css).toMatch(/\.is-disabled\s*\{[^}]*opacity:\s*0\.5[^}]*cursor:\s*not-allowed/);
  });
});
