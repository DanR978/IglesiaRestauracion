// PR-C2 — the additive ARIA / data-* passthrough on Button.svelte (the S14
// suite in Button.test.ts is untouched). A Button can be a disclosure trigger,
// a menu button or a toggle; nothing outside the allowlist reaches the element,
// the attributes Button manages itself cannot be overridden, and no spread is
// compiled in (it would ship Svelte's generic attribute runtime to every page).
import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import Button from '#lib/components/Button.svelte';
import { BUTTON_BLOCK, dataAttributes, dataAttributesOf } from '#lib/components/button.js';

const label = (text: string) => createRawSnippet(() => ({ render: () => `<span>${text}</span>` }));
const root = (container: HTMLElement) => container.querySelector<HTMLElement>(`.${BUTTON_BLOCK}`);

describe('Button — ARIA passthrough', () => {
  it('forwards the disclosure states to the <button>', () => {
    const { container, getByRole } = render(Button, {
      'aria-expanded': false,
      'aria-controls': 'filtros-panel',
      children: label('Filtros'),
    });
    const el = root(container);
    expect(el).toHaveAttribute('aria-expanded', 'false');
    expect(el).toHaveAttribute('aria-controls', 'filtros-panel');
    expect(getByRole('button', { name: 'Filtros', expanded: false })).toBe(el);
  });

  it('forwards aria-haspopup, aria-pressed, aria-describedby and aria-label', () => {
    const { container } = render(Button, {
      'aria-haspopup': 'menu',
      'aria-pressed': true,
      'aria-describedby': 'ayuda-1',
      'aria-label': 'Opciones del evento',
      children: label('Opciones'),
    });
    const el = root(container);
    expect(el).toHaveAttribute('aria-haspopup', 'menu');
    expect(el).toHaveAttribute('aria-pressed', 'true');
    expect(el).toHaveAttribute('aria-describedby', 'ayuda-1');
    expect(el).toHaveAttribute('aria-label', 'Opciones del evento');
  });

  it('forwards to the <a> as well', () => {
    const { container } = render(Button, {
      href: '/app/eventos/',
      'aria-describedby': 'nota',
      'data-testid': 'ver-eventos',
      children: label('Ver eventos'),
    });
    const el = root(container);
    expect(el?.tagName).toBe('A');
    expect(el).toHaveAttribute('aria-describedby', 'nota');
    expect(el).toHaveAttribute('data-testid', 'ver-eventos');
  });

  it('forwards data-* attributes', () => {
    const { container } = render(Button, {
      'data-testid': 'guardar',
      'data-row': 7,
      children: label('Guardar'),
    });
    expect(root(container)).toHaveAttribute('data-testid', 'guardar');
    expect(root(container)).toHaveAttribute('data-row', '7');
  });

  it('managed attributes win: aria-busy and disabled stay the component’s own', () => {
    const props = {
      loading: true,
      'aria-busy': 'false',
      disabled: false,
      type: 'button',
      children: label('Guardar'),
    } as unknown as { loading: boolean };
    const { container } = render(Button, props);
    const el = root(container);
    expect(el).toHaveAttribute('aria-busy', 'true');
    expect(el).toBeDisabled();
  });

  it('drops attributes outside the allowlist', () => {
    const props = {
      style: 'color:red',
      onmouseover: 'alert(1)',
      'aria-hidden': 'true',
      children: label('Guardar'),
    } as unknown as Record<string, never>;
    const { container } = render(Button, props);
    const el = root(container);
    expect(el).not.toHaveAttribute('style');
    expect(el).not.toHaveAttribute('onmouseover');
    expect(el).not.toHaveAttribute('aria-hidden');
  });

  it('never puts aria-pressed on a link — a link is not a toggle', () => {
    const { container } = render(Button, {
      href: '/app/eventos/',
      'aria-pressed': true,
      children: label('Ver eventos'),
    });
    expect(root(container)).not.toHaveAttribute('aria-pressed');
  });

  it('data-* follow the props: a new value replaces, a removed one goes', async () => {
    const { container, rerender } = render(Button, {
      'data-testid': 'a',
      'data-row': 1,
      children: label('Guardar'),
    });
    // rerender() merges props, so a removed attribute is passed as undefined.
    await rerender({ 'data-testid': 'b', 'data-row': undefined });
    expect(root(container)).toHaveAttribute('data-testid', 'b');
    expect(root(container)).not.toHaveAttribute('data-row');
  });

  it('renders exactly as before when nothing is passed through', () => {
    const { container } = render(Button, { children: label('Guardar') });
    const el = root(container)!;
    const names = el.getAttributeNames().sort();
    expect(names).toEqual(['class', 'type']);
  });

  it('compiles no attribute spread into Button or IconButton', () => {
    for (const file of ['Button.svelte', 'IconButton.svelte']) {
      const src = readFileSync(resolve(process.cwd(), `src/lib/components/${file}`), 'utf8');
      const markup = src.slice(src.indexOf('</script>'), src.indexOf('<style>'));
      expect(markup, file).not.toMatch(/\{\s*\.\.\./);
    }
  });
});

describe('dataAttributesOf / dataAttributes', () => {
  it('keeps only data-* keys, as strings, dropping null and undefined', () => {
    const rest: Record<string, unknown> = {
      'data-a': 1,
      'data-flag': false,
      'data-long-name': 'x',
      'data-gone': undefined,
      'data-none': null,
      style: 'x',
      onclick: 'x',
      role: 'menuitem',
      tabindex: 0,
      'aria-busy': 'true',
      'aria-label': 'y',
    };
    expect(dataAttributesOf(rest)).toEqual({
      'data-a': '1',
      'data-flag': 'false',
      'data-long-name': 'x',
    });
  });

  it('the attachment sets the attributes and its cleanup removes them', () => {
    const el = document.createElement('button');
    const cleanup = dataAttributes({ 'data-testid': 'x', 'data-row': '2' })(el);
    expect(el).toHaveAttribute('data-testid', 'x');
    expect(el).toHaveAttribute('data-row', '2');
    if (typeof cleanup === 'function') cleanup();
    expect(el.getAttributeNames()).toEqual([]);
  });
});
