// PR-C2 — FormField.svelte under jsdom. The wiring IS the component: label
// for/id, aria-describedby (hint, extra ids, error — only the ones present),
// aria-invalid, aria-required with a visible "(obligatorio)", and an error
// inserted with role="alert" so it is announced when it appears. Plus
// per-instance ids (G-009) and the token rules on the style block.
import { render } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ERROR_PREFIX,
  FIELD_CONTROL_CLASS,
  REQUIRED_TEXT,
  hasErrorText,
  joinIds,
} from '#lib/components/form-field.js';
import FormFieldHarness from './fixtures/FormFieldHarness.svelte';

const control = (c: HTMLElement) => c.querySelector<HTMLElement>(`.${FIELD_CONTROL_CLASS}`)!;
const field = (c: HTMLElement) => c.querySelector<HTMLElement>('.ird-field')!;

/** The component's <style> block with CSS comments stripped. */
function styleBlock(): string {
  const src = readFileSync(resolve(process.cwd(), 'src/lib/components/FormField.svelte'), 'utf8');
  return src
    .slice(src.indexOf('<style>'), src.indexOf('</style>'))
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('FormField — label and control', () => {
  it('labels the control: label[for] is the control id, so the label is its name', () => {
    const { container, getByRole } = render(FormFieldHarness, { label: 'Nombre' });
    const input = getByRole('textbox', { name: 'Nombre' });
    expect(input).toBe(control(container));
    expect(container.querySelector('label')).toHaveAttribute('for', input.id);
    expect(input.id).not.toBe('');
  });

  it('puts the label above the control and the hint below it', () => {
    const { container } = render(FormFieldHarness, { hint: 'Como aparecerá en el panel.' });
    const order = [...field(container).children].map((el) => el.className.split(' ')[0]);
    expect(order).toEqual(['ird-field__label', FIELD_CONTROL_CLASS, 'ird-field__hint']);
  });

  it('honours an explicit id', () => {
    const { container } = render(FormFieldHarness, { id: 'correo' });
    expect(control(container).id).toBe('correo');
    expect(container.querySelector('label')).toHaveAttribute('for', 'correo');
  });

  it('gives every instance its OWN ids — no shared global element id (G-009)', () => {
    const { container } = render(FormFieldHarness, { hint: 'Primero', second: true });
    const [a, b] = container.querySelectorAll<HTMLInputElement>('input');
    expect(a.id).not.toBe(b.id);
    expect(a.getAttribute('aria-describedby')).not.toBe(b.getAttribute('aria-describedby'));
  });

  it('wires a <select> and a <textarea> the same way', () => {
    const select = render(FormFieldHarness, { kind: 'select', label: 'Ministerio' });
    expect(select.getByRole('combobox', { name: 'Ministerio' })).toHaveClass(FIELD_CONTROL_CLASS);
    const area = render(FormFieldHarness, { kind: 'textarea', label: 'Nota' });
    expect(area.getByRole('textbox', { name: 'Nota' }).tagName).toBe('TEXTAREA');
  });
});

describe('FormField — hint and aria-describedby', () => {
  it('points at nothing when there is neither a hint nor an error', () => {
    const { container } = render(FormFieldHarness, {});
    expect(control(container)).not.toHaveAttribute('aria-describedby');
    expect(container.querySelector('.ird-field__hint')).toBeNull();
  });

  it('describes the control with the hint', () => {
    const { container, getByRole } = render(FormFieldHarness, { hint: 'Tal como en tu cédula.' });
    const hint = container.querySelector('.ird-field__hint')!;
    expect(control(container)).toHaveAttribute('aria-describedby', hint.id);
    expect(getByRole('textbox')).toHaveAccessibleDescription('Tal como en tu cédula.');
  });

  it('appends extra ids after the hint and the error last', () => {
    const { container } = render(FormFieldHarness, {
      hint: 'Pista',
      describedBy: 'extra-note',
      error: 'Escribe tu nombre.',
    });
    const hint = container.querySelector('.ird-field__hint')!;
    const error = container.querySelector('.ird-field__error')!;
    expect(control(container).getAttribute('aria-describedby')).toBe(
      `${hint.id} extra-note ${error.id}`,
    );
  });
});

describe('FormField — the error', () => {
  it('is absent by default: no alert, no aria-invalid', () => {
    const { container, queryByRole } = render(FormFieldHarness, {});
    expect(queryByRole('alert')).toBeNull();
    expect(control(container)).not.toHaveAttribute('aria-invalid');
    expect(field(container)).not.toHaveClass('is-invalid');
  });

  it('marks the control invalid and describes it with the message', () => {
    const { container, getByRole } = render(FormFieldHarness, { error: 'Escribe tu nombre.' });
    const input = getByRole('textbox');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(`${ERROR_PREFIX} Escribe tu nombre.`);
    expect(field(container)).toHaveClass('is-invalid');
  });

  it('is a role="alert" region that leads with a visually hidden "Error:"', () => {
    const { getByRole } = render(FormFieldHarness, { error: 'Escribe tu nombre.' });
    const alert = getByRole('alert');
    expect(alert).toHaveTextContent(`${ERROR_PREFIX} Escribe tu nombre.`);
    expect(alert.querySelector('.ird-field__sr')).toHaveTextContent(ERROR_PREFIX);
    // An icon AND words: the icon is decorative, never the only cue.
    expect(alert.querySelector('.icon')).toHaveAttribute('aria-hidden', 'true');
  });

  it('is INSERTED when it appears after a submit, so the alert is announced', async () => {
    const { rerender, queryByRole, container } = render(FormFieldHarness, { error: null });
    expect(queryByRole('alert')).toBeNull();
    await rerender({ error: 'El correo no es válido.' });
    expect(queryByRole('alert')).toHaveTextContent('El correo no es válido.');
    expect(control(container)).toHaveAttribute('aria-invalid', 'true');

    await rerender({ error: null });
    expect(queryByRole('alert')).toBeNull();
    expect(control(container)).not.toHaveAttribute('aria-invalid');
    expect(control(container)).not.toHaveAttribute('aria-describedby');
  });

  it('treats a blank message as no error', () => {
    const { queryByRole, container } = render(FormFieldHarness, { error: '   ' });
    expect(queryByRole('alert')).toBeNull();
    expect(control(container)).not.toHaveAttribute('aria-invalid');
  });
});

describe('FormField — required', () => {
  it('says "(obligatorio)" in words and sets aria-required, not the native required', () => {
    const { container, getByRole } = render(FormFieldHarness, { required: true });
    expect(container.querySelector('.ird-field__required')).toHaveTextContent(REQUIRED_TEXT);
    const input = getByRole('textbox', { name: `Nombre ${REQUIRED_TEXT}` });
    expect(input).toHaveAttribute('aria-required', 'true');
    // The native attribute would pop the browser's own (English) bubble.
    expect(input).not.toHaveAttribute('required');
  });

  it('shows no marker on an optional field', () => {
    const { container } = render(FormFieldHarness, {});
    expect(container.querySelector('.ird-field__required')).toBeNull();
    expect(control(container)).not.toHaveAttribute('aria-required');
  });
});

describe('FormField — disabled and read-only are different states', () => {
  it('disabled reaches the control and marks the block', () => {
    const { container } = render(FormFieldHarness, { disabled: true });
    expect(control(container)).toBeDisabled();
    expect(field(container)).toHaveClass('is-disabled');
  });

  it('read-only stays enabled (focusable, legible) and styles apart from disabled', () => {
    const { container } = render(FormFieldHarness, { readonly: true });
    expect(control(container)).not.toBeDisabled();
    expect(control(container)).toHaveAttribute('readonly');
    const css = styleBlock();
    expect(css).toMatch(
      /\.ird-field__control\[readonly\]\)\s*\{[^}]*background:\s*var\(--status-neutral-bg\)/,
    );
    expect(css).toMatch(/\.ird-field__control:disabled\)\s*\{[^}]*opacity:\s*0\.5/);
  });
});

describe('FormField — helpers', () => {
  it('joinIds keeps the present ids in order, once, and returns undefined for none', () => {
    expect(joinIds('a', null, undefined, false, 'b')).toBe('a b');
    expect(joinIds('a b', 'b', ' c ')).toBe('a b c');
    expect(joinIds(null, '', '  ')).toBeUndefined();
  });

  it('hasErrorText is true only for a non-blank string', () => {
    expect(hasErrorText('Falta')).toBe(true);
    expect(hasErrorText('')).toBe(false);
    expect(hasErrorText('  ')).toBe(false);
    expect(hasErrorText(null)).toBe(false);
    expect(hasErrorText(undefined)).toBe(false);
  });
});

describe('FormField — styles honour the design-system rules', () => {
  const css = styleBlock();

  it('is token-only: no hex literal, no font-size in px or raw rem', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/font-size:\s*[\d.]+(px|rem)/);
  });

  it('draws the control border at 3:1 from tokens and the error in the AA red ink', () => {
    expect(css).toMatch(
      /--field-border:\s*color-mix\(in srgb, var\(--color-text\) 60%, var\(--color-surface\)\)/,
    );
    expect(css).toMatch(
      /\.is-invalid :global\(\.ird-field__control\)\s*\{\s*border-color:\s*var\(--money-neg\)/,
    );
    expect(css).toMatch(/\.ird-field__error\s*\{[^}]*color:\s*var\(--money-neg\)/);
  });

  it('keeps a visible focus ring and moves hover/focus toward --color-text, never --color-dark', () => {
    expect(css).toMatch(/:focus-visible\)\s*\{[^}]*outline:\s*2px solid var\(--color-focus\)/);
    expect(css).not.toMatch(/outline:\s*none/);
    expect(css).not.toMatch(/border-color:\s*var\(--color-dark\)/);
    expect(css).toMatch(/@media \(hover: hover\)/);
  });

  it('uses the house easing and guards the transition with reduced motion', () => {
    expect(css).toMatch(/cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transition:\s*none/);
  });
});
