// PR-C2 — the async-view state trio under jsdom (DESIGN-SYSTEM §5):
//   StateLoading  a skeleton per shape, aria-busy + a "Cargando…" status node
//   StateEmpty    glyph + one sentence (+ hint, + action), not a live region
//   StateError    plain-text copy in role="alert", a REQUIRED "Reintentar"
//                 that shows progress for a returned promise and re-announces
//                 a repeated failure; visually distinct from empty.
import { fireEvent, render, within } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StateEmpty from '#lib/components/StateEmpty.svelte';
import StateError from '#lib/components/StateError.svelte';
import StateLoading from '#lib/components/StateLoading.svelte';
import {
  DEFAULT_ROWS,
  LOADING_SHAPES,
  MAX_ROWS,
  STATE_BLOCK,
  STATE_ERROR_FALLBACK,
  STATE_LOADING_LABEL,
  STATE_RETRY_LABEL,
} from '#lib/components/states.js';

const root = (container: HTMLElement) => container.querySelector<HTMLElement>(`.${STATE_BLOCK}`);

function styleBlock(file: string): string {
  const src = readFileSync(resolve(process.cwd(), `src/lib/components/${file}`), 'utf8');
  const block = src.slice(src.indexOf('<style>'), src.indexOf('</style>'));
  return block.replace(/\/\*[\s\S]*?\*\//g, '');
}

function deferred() {
  let settle!: () => void;
  let fail!: (reason: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    settle = res;
    fail = rej;
  });
  return { promise, settle, fail };
}

/** Let the awaited retry's `finally` run, then let Svelte write the DOM. */
async function flush(): Promise<void> {
  for (let i = 0; i < 3; i++) await Promise.resolve();
  await tick();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('StateLoading — a skeleton of the layout it stands in for', () => {
  it('is aria-busy and says "Cargando…" through its own status node', () => {
    const { container, getByRole } = render(StateLoading);
    const el = root(container)!;
    expect(el).toHaveClass(STATE_BLOCK, `${STATE_BLOCK}--loading`, `${STATE_BLOCK}--list`);
    expect(el).toHaveAttribute('aria-busy', 'true');
    const status = getByRole('status');
    expect(status).toHaveTextContent(STATE_LOADING_LABEL);
    expect(status).toHaveClass('sr-only');
    // A busy live root may hold its own announcement; the status node is not it.
    expect(status).not.toBe(el);
    expect(status).not.toHaveAttribute('aria-busy');
  });

  it('hides every bone from assistive tech', () => {
    const { container } = render(StateLoading, { shape: 'table' });
    const skeleton = container.querySelector('.ird-state__skeleton');
    expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    expect(skeleton?.textContent?.trim()).toBe('');
  });

  it('card-grid draws N cards with an icon, a value and a label bone', () => {
    const { container } = render(StateLoading, { shape: 'card-grid', rows: 3 });
    const cards = container.querySelectorAll('.ird-state__card');
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      expect(card.querySelector('.ird-state__bone--icon')).not.toBeNull();
      expect(card.querySelector('.ird-state__bone--value')).not.toBeNull();
    }
  });

  it('table draws a header row + N rows of `columns` cells', () => {
    const { container } = render(StateLoading, { shape: 'table', rows: 6, columns: 5 });
    expect(container.querySelectorAll('.ird-state__row--head')).toHaveLength(1);
    const rows = container.querySelectorAll('.ird-state__row:not(.ird-state__row--head)');
    expect(rows).toHaveLength(6);
    for (const row of rows) expect(row.querySelectorAll('.ird-state__bone--cell')).toHaveLength(5);
  });

  it('list draws N rows with an avatar and two lines', () => {
    const { container } = render(StateLoading, { shape: 'list', rows: 2 });
    const items = container.querySelectorAll('.ird-state__item');
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.querySelector('.ird-state__bone--avatar')).not.toBeNull();
      expect(item.querySelectorAll('.ird-state__lines .ird-state__bone')).toHaveLength(2);
    }
  });

  it('detail draws a title bar + N label/value fields', () => {
    const { container } = render(StateLoading, { shape: 'detail', rows: 5 });
    expect(container.querySelectorAll('.ird-state__bone--title')).toHaveLength(1);
    const fields = container.querySelectorAll('.ird-state__field');
    expect(fields).toHaveLength(5);
    for (const field of fields) {
      expect(field.querySelector('.ird-state__bone--label')).not.toBeNull();
    }
  });

  it('every shape has its modifier and its default count', () => {
    const unit: Record<string, string> = {
      'card-grid': '.ird-state__card',
      table: '.ird-state__row:not(.ird-state__row--head)',
      list: '.ird-state__item',
      detail: '.ird-state__field',
    };
    for (const shape of LOADING_SHAPES) {
      const { container } = render(StateLoading, { shape });
      expect(root(container), shape).toHaveClass(`${STATE_BLOCK}--${shape}`);
      expect(container.querySelectorAll(unit[shape]), shape).toHaveLength(DEFAULT_ROWS[shape]);
    }
  });

  it('bounds `rows` to 1…24 and rounds it', () => {
    const count = (rows: number) =>
      render(StateLoading, { shape: 'list', rows }).container.querySelectorAll('.ird-state__item')
        .length;
    expect(count(0)).toBe(1);
    expect(count(500)).toBe(MAX_ROWS);
    expect(count(2.6)).toBe(3);
    expect(count(Number.NaN)).toBe(DEFAULT_ROWS.list);
  });

  it('takes a custom announcement and a consumer class', () => {
    const { container, getByRole } = render(StateLoading, {
      label: 'Cargando eventos…',
      class: 'dash__kpis',
    });
    expect(getByRole('status')).toHaveTextContent('Cargando eventos…');
    expect(root(container)).toHaveClass('dash__kpis');
  });

  it('pulses with the house easing, and stops under reduced motion', () => {
    const css = styleBlock('StateLoading.svelte');
    expect(css).toMatch(/animation:\s*state-pulse [^;]*cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.ird-state__bone\s*\{\s*animation:\s*none/,
    );
  });

  it('sizes from overridable component tokens and a pure-CSS grid (G-010)', () => {
    const css = styleBlock('StateLoading.svelte');
    // Whitespace-tolerant: prettier wraps the long declaration.
    expect(css).toMatch(
      /repeat\(\s*auto-fit,\s*minmax\(min\(100%, var\(--state-grid-min, 11\.25rem\)\), 1fr\)/,
    );
    expect(css).toMatch(/min-block-size:\s*var\(--state-card-height, 8rem\)/);
    expect(css).toMatch(/min-block-size:\s*var\(--state-row-height, 2\.75rem\)/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

describe('StateEmpty — calm, with an optional primary action', () => {
  it('renders the domain glyph (decorative) and one sentence, as text', () => {
    const { container } = render(StateEmpty, {
      icon: 'calendar-check',
      message: 'No hay eventos próximos.',
    });
    const el = root(container)!;
    expect(el).toHaveClass(STATE_BLOCK, `${STATE_BLOCK}--empty`);
    const glyph = el.querySelector('.ird-state__icon .icon');
    expect(glyph).toHaveClass('fa-calendar-check');
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
    expect(el.querySelector('.ird-state__message')).toHaveTextContent('No hay eventos próximos.');
  });

  it('is not a live region and has no retry (nothing failed)', () => {
    const { container, queryByRole } = render(StateEmpty, { icon: 'images', message: 'Vacío.' });
    expect(queryByRole('alert')).toBeNull();
    expect(queryByRole('status')).toBeNull();
    expect(queryByRole('button')).toBeNull();
    expect(root(container)).not.toHaveAttribute('role');
  });

  it('adds the optional hint and action', () => {
    const action = createRawSnippet(() => ({
      render: () => '<button type="button">Nuevo álbum</button>',
    }));
    const { container, getByRole } = render(StateEmpty, {
      icon: 'images',
      message: 'Aún no hay álbumes.',
      hint: 'Los álbumes publicados aparecen en la galería.',
      action,
    });
    expect(container.querySelector('.ird-state__hint')).toHaveTextContent(
      'Los álbumes publicados aparecen en la galería.',
    );
    expect(
      getByRole('button', { name: 'Nuevo álbum' }).closest('.ird-state__action'),
    ).not.toBeNull();
  });

  it('renders the copy as text, never markup', () => {
    const { container } = render(StateEmpty, {
      icon: 'inbox',
      message: '<b>x</b>',
      hint: '<i>y</i>',
    });
    expect(container.querySelector('b, i:not(.icon)')).toBeNull();
  });

  it('compact adds its modifier', () => {
    const { container } = render(StateEmpty, { icon: 'inbox', message: 'Vacío.', compact: true });
    expect(root(container)).toHaveClass(`${STATE_BLOCK}--compact`);
  });
});

describe('StateError — human copy + Reintentar, never a raw backend string', () => {
  it('announces the copy in role="alert" with a warning glyph', () => {
    const { container, getByRole } = render(StateError, {
      message: 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
      onRetry: vi.fn(),
    });
    const el = root(container)!;
    expect(el).toHaveClass(STATE_BLOCK, `${STATE_BLOCK}--error`);
    expect(getByRole('alert')).toHaveTextContent('No pudimos conectar con el servidor.');
    expect(el.querySelector('.ird-state__icon .icon')).toHaveClass('fa-triangle-exclamation');
  });

  it('falls back to generic copy when the message is blank or missing', () => {
    for (const message of [undefined, null, '', '   ']) {
      const { container } = render(StateError, { message, onRetry: vi.fn() });
      expect(within(container).getByRole('alert')).toHaveTextContent(STATE_ERROR_FALLBACK);
    }
  });

  it('cannot render HTML through the message', () => {
    const { container, getByRole } = render(StateError, {
      message: '<img src=x onerror="alert(1)"><b>42501</b>',
      onRetry: vi.fn(),
    });
    expect(container.querySelector('img, b')).toBeNull();
    expect(getByRole('alert')).toHaveTextContent('<img src=x onerror="alert(1)"><b>42501</b>');
  });

  it('always offers "Reintentar", which calls onRetry', async () => {
    const onRetry = vi.fn();
    const { getByRole } = render(StateError, { onRetry });
    const retry = getByRole('button', { name: STATE_RETRY_LABEL });
    expect(retry.querySelector('.fa-rotate-right')).not.toBeNull();
    await fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('a returned promise puts the button in its loading state until it settles', async () => {
    const pending = deferred();
    const onRetry = vi.fn(() => pending.promise);
    const { getByRole } = render(StateError, { onRetry });
    const retry = getByRole('button', { name: STATE_RETRY_LABEL });

    await fireEvent.click(retry);
    expect(retry).toHaveAttribute('aria-busy', 'true');
    expect(retry).toBeDisabled();
    // A second press while it runs does not start a second request.
    await fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);

    pending.settle();
    await flush();
    expect(retry).not.toHaveAttribute('aria-busy');
    expect(retry).not.toBeDisabled();
  });

  it('re-announces the alert when the view still shows the error after a retry', async () => {
    const pending = deferred();
    const { getByRole } = render(StateError, { onRetry: () => pending.promise });
    const before = getByRole('alert');
    await fireEvent.click(getByRole('button', { name: STATE_RETRY_LABEL }));
    pending.settle();
    await flush();
    const after = getByRole('alert');
    expect(after).not.toBe(before);
    expect(after).toHaveTextContent(STATE_ERROR_FALLBACK);
  });

  it('a synchronous onRetry shows no spinner', async () => {
    const { getByRole } = render(StateError, { onRetry: () => undefined });
    const retry = getByRole('button', { name: STATE_RETRY_LABEL });
    await fireEvent.click(retry);
    expect(retry).not.toHaveAttribute('aria-busy');
  });

  it('a throwing or rejecting onRetry is logged, never left spinning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const throwing = render(StateError, {
      onRetry: () => {
        throw new Error('boom');
      },
    });
    await fireEvent.click(throwing.getByRole('button', { name: STATE_RETRY_LABEL }));
    expect(warn).toHaveBeenCalledWith('[state-error] onRetry threw:', expect.any(Error));
    throwing.unmount();

    const pending = deferred();
    const rejecting = render(StateError, { onRetry: () => pending.promise });
    const retry = rejecting.getByRole('button', { name: STATE_RETRY_LABEL });
    await fireEvent.click(retry);
    pending.fail(new Error('network'));
    await flush();
    expect(warn).toHaveBeenCalledWith('[state-error] onRetry rejected:', expect.any(Error));
    expect(retry).not.toHaveAttribute('aria-busy');
  });

  it('takes a custom retry label, and compact uses the small button', () => {
    const { container, getByRole } = render(StateError, {
      onRetry: vi.fn(),
      retryLabel: 'Volver a intentar',
      compact: true,
    });
    expect(root(container)).toHaveClass(`${STATE_BLOCK}--compact`);
    expect(getByRole('button', { name: 'Volver a intentar' })).toHaveClass('ird-btn--sm');
  });
});

describe('States — error is visually distinct from empty (§5.3)', () => {
  it('error: solid edge in the error tone; empty: dashed and neutral', () => {
    const empty = styleBlock('StateEmpty.svelte');
    const error = styleBlock('StateError.svelte');
    expect(empty).toMatch(/\.ird-state--empty\s*\{[^}]*border:\s*1px dashed rgba\(127, 127, 127/);
    expect(empty).toMatch(/\.ird-state--empty\s*\{[^}]*background:\s*var\(--color-surface\)/);
    expect(error).toMatch(
      /\.ird-state--error\s*\{[^}]*border:\s*1px solid color-mix\([^)]*--status-overdue/,
    );
    expect(error).toMatch(/\.ird-state--error\s*\{[^}]*background:\s*var\(--status-overdue-bg\)/);
    expect(error).toMatch(/\.ird-state__icon\s*\{[^}]*color:\s*var\(--status-overdue\)/);
  });

  it('both are token-only with no px/rem font-size', () => {
    for (const file of ['StateEmpty.svelte', 'StateError.svelte', 'StateLoading.svelte']) {
      const css = styleBlock(file);
      expect(css, file).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(css, file).not.toMatch(/font-size:\s*[\d.]+(px|rem)/);
      expect(css, file).not.toContain('prefers-color-scheme');
    }
  });
});
