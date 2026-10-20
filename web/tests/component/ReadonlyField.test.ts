// PR-C2 — ReadonlyField under jsdom: a label/value pair (dt/dd), static text
// that nothing can focus or edit, an optional lock note, a missing value as an
// em dash for the eye and "Sin dato" for a screen reader, a rich value through
// `children` — and no input chrome in the style block.
import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import ReadonlyField from '#lib/components/ReadonlyField.svelte';
import { MISSING_MARK, MISSING_TEXT, isMissingValue } from '#lib/components/readonly-field.js';

const value = (c: HTMLElement) => c.querySelector<HTMLElement>('.ird-readonly__value')!;

function styleBlock(): string {
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/components/ReadonlyField.svelte'),
    'utf8',
  );
  return src
    .slice(src.indexOf('<style>'), src.indexOf('</style>'))
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

/** The rule body for an exact selector in the style block. */
function rule(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`);
  return at === -1 ? '' : css.slice(at, css.indexOf('}', at));
}

describe('ReadonlyField — a fact, not a control', () => {
  it('pairs the label and the value as a term and its description', () => {
    const { container, getByRole } = render(ReadonlyField, {
      label: 'Correo',
      value: 'ana@irdlex.org',
    });
    const list = container.querySelector('dl.ird-readonly')!;
    expect(list.querySelector('dt')).toHaveTextContent('Correo');
    expect(value(container).tagName).toBe('DD');
    expect(value(container)).toHaveTextContent('ana@irdlex.org');
    expect(getByRole('term')).toHaveTextContent('Correo');
    expect(getByRole('definition')).toHaveTextContent('ana@irdlex.org');
  });

  it('cannot be focused or edited: no input, no button, no tabindex', () => {
    const { container, queryByRole } = render(ReadonlyField, { label: 'Correo', value: 'a@b.org' });
    expect(container.querySelector('input, textarea, select, button, [tabindex]')).toBeNull();
    expect(queryByRole('textbox')).toBeNull();
  });

  it('renders a number, including 0, as a value', () => {
    const { container } = render(ReadonlyField, { label: 'Grupos', value: 0 });
    expect(value(container)).toHaveTextContent('0');
    expect(value(container)).not.toHaveClass('is-missing');
  });
});

describe('ReadonlyField — a missing value', () => {
  it.each([null, undefined, '', '   '])('%j → an em dash for the eye, "Sin dato" for AT', (v) => {
    const { container } = render(ReadonlyField, { label: 'Último inicio', value: v });
    const dd = value(container);
    expect(dd).toHaveClass('is-missing');
    const dash = dd.querySelector('[aria-hidden="true"]');
    expect(dash).toHaveTextContent(MISSING_MARK);
    expect(dd.querySelector('.ird-readonly__sr')).toHaveTextContent(MISSING_TEXT);
    // What a screen reader gets: the hidden text, never the dash or "null".
    expect(dd.textContent).not.toMatch(/null|undefined/);
  });

  it('isMissingValue is true only for no value at all', () => {
    expect(isMissingValue(null)).toBe(true);
    expect(isMissingValue(undefined)).toBe(true);
    expect(isMissingValue('  ')).toBe(true);
    expect(isMissingValue(Number.NaN)).toBe(true);
    expect(isMissingValue(0)).toBe(false);
    expect(isMissingValue('—')).toBe(false);
    expect(isMissingValue('Ana')).toBe(false);
  });
});

describe('ReadonlyField — the lock note and a rich value', () => {
  it('adds the owner note as a second description, with a decorative lock', () => {
    const { container } = render(ReadonlyField, {
      label: 'Correo',
      value: 'ana@irdlex.org',
      note: 'El correo lo gestiona un administrador.',
    });
    const note = container.querySelector('.ird-readonly__note')!;
    expect(note.tagName).toBe('DD');
    expect(note).toHaveTextContent('El correo lo gestiona un administrador.');
    expect(note.querySelector('.icon')).toHaveClass('fa-lock');
    expect(note.querySelector('.icon')).toHaveAttribute('aria-hidden', 'true');
  });

  it('has no note unless one is given', () => {
    const { container } = render(ReadonlyField, { label: 'Rol', value: 'Administrador' });
    expect(container.querySelector('.ird-readonly__note')).toBeNull();
  });

  it('renders `children` in place of the value, never as missing', () => {
    const children = createRawSnippet(() => ({
      render: () => '<ul class="chips"><li>Alabanza</li><li>Jóvenes</li></ul>',
    }));
    const { container } = render(ReadonlyField, { label: 'Ministerios', children });
    expect(value(container).querySelectorAll('li')).toHaveLength(2);
    expect(value(container)).not.toHaveClass('is-missing');
  });
});

describe('ReadonlyField — styles: visibly not an input', () => {
  const css = styleBlock();

  it('gives the value no border, no fill and no padding box', () => {
    const body = rule(css, '.ird-readonly__value');
    expect(body).not.toBe('');
    expect(body).not.toMatch(/border|background|box-shadow/);
    expect(body).not.toMatch(/padding-inline|padding:/);
  });

  it('lines up with a one-line FormField control: 44px, its line centred', () => {
    const body = rule(css, '.ird-readonly__value');
    expect(body).toMatch(/min-height:\s*2\.75rem/);
    // 0.625rem + 1.5rem + 0.625rem = 2.75rem.
    expect(body).toMatch(/padding-block:\s*0\.625rem/);
    expect(body).toMatch(/line-height:\s*1\.5rem/);
  });

  it('is token-only: no hex literal, no font-size in px or raw rem', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/font-size:\s*[\d.]+(px|rem)/);
  });

  it('wraps long values instead of widening a 360px screen', () => {
    expect(rule(css, '.ird-readonly__value')).toMatch(/overflow-wrap:\s*anywhere/);
  });
});
