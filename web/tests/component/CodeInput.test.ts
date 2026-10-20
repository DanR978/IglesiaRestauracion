// PR-C2 — CodeInput: the pure editing rules (sanitise, caret, the paste rule,
// the active box), then the component under jsdom — ONE real input with the
// autofill/paste/screen-reader attributes, six aria-hidden boxes that follow
// it, digits-only typing, paste ("123 456", "123-456", longer text), an
// autofill-style single-event fill, keyboard editing, onComplete exactly once
// per completed code, the bindable error that clears on edit, and the
// disabled / loading states.
import { fireEvent, render } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CODE_LENGTH,
  LOADING_LABEL,
  activeBox,
  caretAfterSanitize,
  insertCode,
  onlyDigits,
  sanitizeCode,
} from '#lib/components/code-input.js';
import CodeInputHarness from './fixtures/CodeInputHarness.svelte';

const input = (c: HTMLElement) => c.querySelector<HTMLInputElement>('.ird-code__input')!;
const boxes = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('.ird-code__box')];
const shown = (c: HTMLElement) =>
  boxes(c)
    .map((b) => b.textContent ?? '')
    .join('');
const activeIndex = (c: HTMLElement) =>
  boxes(c).findIndex((b) => b.classList.contains('is-active'));

/** What the browser does for a keystroke or an autofill: new value + caret, then `input`. */
async function edit(el: HTMLInputElement, raw: string, caret = raw.length): Promise<void> {
  if (document.activeElement !== el) el.focus(); // people type into a focused field
  el.value = raw;
  el.setSelectionRange(caret, caret);
  await fireEvent.input(el);
}

/** A paste carrying `text`; resolves to whether the event was NOT cancelled. */
function paste(el: HTMLInputElement, text: string): Promise<boolean> {
  return fireEvent.paste(el, { clipboardData: { getData: () => text } });
}

function styleBlock(): string {
  const src = readFileSync(resolve(process.cwd(), 'src/lib/components/CodeInput.svelte'), 'utf8');
  return src
    .slice(src.indexOf('<style>'), src.indexOf('</style>'))
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('code-input — the pure rules', () => {
  it('keeps digits only, at most six', () => {
    expect(CODE_LENGTH).toBe(6);
    expect(onlyDigits('a1 b2-c3')).toBe('123');
    expect(sanitizeCode('123 456')).toBe('123456');
    expect(sanitizeCode('123-456-789')).toBe('123456');
    expect(sanitizeCode('abc')).toBe('');
  });

  it('puts the caret after the digits that were in front of it', () => {
    expect(caretAfterSanitize('12a34', 3)).toBe(2);
    expect(caretAfterSanitize('1 2 3', 5)).toBe(3);
    expect(caretAfterSanitize('12345678', 8)).toBe(6);
    expect(caretAfterSanitize('12', -1)).toBe(0);
  });

  it('replaces the field with a pasted whole code — the first six digits win', () => {
    expect(insertCode('', 0, 0, '123 456')).toEqual({ value: '123456', caret: 6 });
    expect(insertCode('98', 2, 2, '123-456')).toEqual({ value: '123456', caret: 6 });
    expect(insertCode('', 0, 0, 'Tu código es 654321. No lo compartas.')).toEqual({
      value: '654321',
      caret: 6,
    });
    expect(insertCode('111111', 6, 6, '12345678')).toEqual({ value: '123456', caret: 6 });
  });

  it('inserts a fragment at the selection and cuts the result to six', () => {
    expect(insertCode('12', 2, 2, '34')).toEqual({ value: '1234', caret: 4 });
    expect(insertCode('1256', 2, 2, '3-4')).toEqual({ value: '123456', caret: 4 });
    expect(insertCode('12999', 2, 5, '34')).toEqual({ value: '1234', caret: 4 });
    expect(insertCode('12345', 5, 5, '67')).toEqual({ value: '123456', caret: 6 });
  });

  it('ignores a paste without digits', () => {
    expect(insertCode('12', 0, 2, 'hola')).toBeNull();
  });

  it('draws the caret in the box at the caret, the last one once full', () => {
    expect([0, 3, 5, 6, 9, -2].map(activeBox)).toEqual([0, 3, 5, 5, 5, 0]);
  });
});

describe('CodeInput — one real field for autofill, paste and screen readers', () => {
  it('renders exactly ONE input with the one-time-code attributes', () => {
    const { container } = render(CodeInputHarness, {});
    const fields = container.querySelectorAll('input');
    expect(fields).toHaveLength(1);
    const el = fields[0];
    expect(el).toHaveAttribute('type', 'text');
    expect(el).toHaveAttribute('inputmode', 'numeric');
    expect(el).toHaveAttribute('autocomplete', 'one-time-code');
    expect(el).toHaveAttribute('pattern', '[0-9]*');
    expect(el).toHaveAttribute('maxlength', '6');
    expect(el).toHaveAttribute('spellcheck', 'false');
  });

  it('is labelled by the visible label and described by the hint', () => {
    const { container, getByRole } = render(CodeInputHarness, {
      hint: 'Escribe el código de 6 dígitos de tu app de autenticación.',
    });
    const field = getByRole('textbox', { name: 'Código de verificación' });
    expect(field).toBe(input(container));
    expect(field).toHaveAccessibleDescription(
      'Escribe el código de 6 dígitos de tu app de autenticación.',
    );
  });

  it('draws six aria-hidden boxes that nothing can focus', () => {
    const { container } = render(CodeInputHarness, {});
    const wrap = container.querySelector('.ird-code__boxes')!;
    expect(wrap).toHaveAttribute('aria-hidden', 'true');
    expect(boxes(container)).toHaveLength(CODE_LENGTH);
    expect(wrap.querySelector('[tabindex], input, button')).toBeNull();
  });
});

describe('CodeInput — typing', () => {
  it('shows each digit in its box and binds the value', async () => {
    const { container, getByTestId } = render(CodeInputHarness, {});
    await edit(input(container), '1');
    await edit(input(container), '12');
    await edit(input(container), '123');
    expect(shown(container)).toBe('123');
    expect(boxes(container).filter((b) => b.classList.contains('is-filled'))).toHaveLength(3);
    expect(getByTestId('value')).toHaveTextContent('123');
  });

  it('drops a non-digit and keeps the caret where the digit would have gone', async () => {
    const { container, getByTestId } = render(CodeInputHarness, { value: '1234' });
    await edit(input(container), '12a34', 3);
    expect(input(container).value).toBe('1234');
    expect(input(container).selectionStart).toBe(2);
    expect(getByTestId('value')).toHaveTextContent('1234');
  });

  it('fires onComplete ONCE when the sixth digit lands, with the code', async () => {
    const { container, getByTestId } = render(CodeInputHarness, {});
    for (const v of ['1', '12', '123', '1234', '12345']) await edit(input(container), v);
    expect(getByTestId('completions')).toHaveTextContent('');
    await edit(input(container), '123456');
    expect(getByTestId('completions')).toHaveTextContent(/^123456$/);
    // A keystroke that changes nothing (a letter in a full field) does not re-fire.
    await edit(input(container), '123456x', 7);
    expect(getByTestId('completions')).toHaveTextContent(/^123456$/);
  });

  it('fires again for a NEW complete code after a correction', async () => {
    const { container, getByTestId } = render(CodeInputHarness, { value: '123456' });
    await edit(input(container), '12346', 4); // Backspace on the 5th digit
    await edit(input(container), '123476', 5); // and a 7 in its place
    expect(getByTestId('completions')).toHaveTextContent(/^123476$/);
  });
});

describe('CodeInput — paste', () => {
  it.each([
    ['123 456', '123456'],
    ['123-456', '123456'],
    ['12345678', '123456'],
    ['Tu código es 654321.', '654321'],
  ])('pasting %j keeps the first six digits (%s) and completes once', async (text, code) => {
    const { container, getByTestId } = render(CodeInputHarness, {});
    input(container).focus();
    await paste(input(container), text);
    expect(input(container).value).toBe(code);
    expect(shown(container)).toBe(code);
    expect(getByTestId('value')).toHaveTextContent(code);
    expect(getByTestId('completions')).toHaveTextContent(new RegExp(`^${code}$`));
  });

  it('applies the paste itself — maxlength would have cut "123 456" to "123 45"', async () => {
    const { container } = render(CodeInputHarness, {});
    const notCancelled = await paste(input(container), '123 456');
    // Handled, not blocked: the default insert is replaced by ours.
    expect(notCancelled).toBe(false);
    expect(input(container).value).toBe('123456');
  });

  it('inserts a fragment at the caret', async () => {
    const { container } = render(CodeInputHarness, { value: '1256' });
    input(container).focus();
    input(container).setSelectionRange(2, 2);
    await paste(input(container), '34');
    expect(input(container).value).toBe('123456');
    expect(input(container).selectionStart).toBe(4);
  });

  it('leaves the field alone for a paste without digits', async () => {
    const { container, getByTestId } = render(CodeInputHarness, { value: '12' });
    input(container).setSelectionRange(0, 2);
    await paste(input(container), 'hola');
    expect(getByTestId('value')).toHaveTextContent('12');
  });
});

describe('CodeInput — autofill sets the whole code in ONE input event', () => {
  it('fills every box and completes once', async () => {
    const { container, getByTestId } = render(CodeInputHarness, {});
    await edit(input(container), '482915');
    expect(shown(container)).toBe('482915');
    expect(getByTestId('completions')).toHaveTextContent(/^482915$/);
  });

  it('does not pull focus when the code lands in an unfocused field', async () => {
    const { container, getByTestId } = render(CodeInputHarness, {});
    const el = input(container);
    el.value = '482915';
    await fireEvent.input(el);
    expect(getByTestId('completions')).toHaveTextContent(/^482915$/);
    expect(document.activeElement).not.toBe(el);
  });

  it('sanitises an autofill that carries separators', async () => {
    const { container, getByTestId } = render(CodeInputHarness, {});
    await edit(input(container), '482 915');
    expect(input(container).value).toBe('482915');
    expect(getByTestId('completions')).toHaveTextContent(/^482915$/);
  });
});

describe('CodeInput — keyboard editing and the drawn caret', () => {
  it('rings the box at the caret while focused, and nothing when blurred', async () => {
    const { container } = render(CodeInputHarness, { value: '123' });
    expect(activeIndex(container)).toBe(-1);
    input(container).focus();
    input(container).setSelectionRange(3, 3);
    await fireEvent.keyUp(input(container), { key: 'End' });
    expect(activeIndex(container)).toBe(3);
    expect(boxes(container)[3]).toHaveClass('has-caret', 'caret-center');

    input(container).setSelectionRange(1, 1);
    await fireEvent.keyUp(input(container), { key: 'ArrowLeft' });
    expect(activeIndex(container)).toBe(1);
    expect(boxes(container)[1]).toHaveClass('caret-start');

    input(container).setSelectionRange(0, 0);
    await fireEvent.keyUp(input(container), { key: 'Home' });
    expect(activeIndex(container)).toBe(0);

    input(container).blur();
    await fireEvent.blur(input(container));
    expect(activeIndex(container)).toBe(-1);
  });

  it('rings the last box after the sixth digit', async () => {
    const { container } = render(CodeInputHarness, { value: '123456' });
    input(container).focus();
    input(container).setSelectionRange(6, 6);
    await fireEvent.select(input(container));
    expect(activeIndex(container)).toBe(5);
    expect(boxes(container)[5]).toHaveClass('caret-end');
  });

  it('Backspace removes the digit before the caret', async () => {
    const { container, getByTestId } = render(CodeInputHarness, { value: '12345' });
    await edit(input(container), '1245', 2);
    expect(shown(container)).toBe('1245');
    expect(getByTestId('value')).toHaveTextContent('1245');
  });

  it('a click on a filled box selects that digit; on an empty one, lands on the next free box', async () => {
    const { container } = render(CodeInputHarness, { value: '1234' });
    boxes(container).forEach((box, i) => {
      box.getBoundingClientRect = () => new DOMRect(i * 50, 0, 44, 52);
    });
    input(container).focus();
    input(container).setSelectionRange(4, 4);
    await fireEvent.click(input(container), { clientX: 60 });
    expect([input(container).selectionStart, input(container).selectionEnd]).toEqual([1, 2]);
    expect(boxes(container)[1]).toHaveClass('is-selected', 'is-active');

    input(container).setSelectionRange(1, 1);
    await fireEvent.click(input(container), { clientX: 280 });
    expect([input(container).selectionStart, input(container).selectionEnd]).toEqual([4, 4]);
  });

  it('keeps a double-click selection', async () => {
    const { container } = render(CodeInputHarness, { value: '1234' });
    input(container).setSelectionRange(0, 4);
    await fireEvent.click(input(container), { clientX: 60 });
    expect([input(container).selectionStart, input(container).selectionEnd]).toEqual([0, 4]);
  });

  it('focus() moves focus into the field', async () => {
    const { container, getByTestId } = render(CodeInputHarness, {});
    await fireEvent.click(getByTestId('focus'));
    expect(document.activeElement).toBe(input(container));
  });
});

describe('CodeInput — the error', () => {
  it('shows inline and announced, marks the field and the boxes invalid', async () => {
    const { container, getByTestId, getByRole } = render(CodeInputHarness, {});
    await fireEvent.click(getByTestId('set-error'));
    expect(getByRole('alert')).toHaveTextContent('El código no es válido.');
    expect(input(container)).toHaveAttribute('aria-invalid', 'true');
    expect(container.querySelector('.ird-code__field')).toHaveClass('is-invalid');
  });

  it('clears on the next edit — through the binding too', async () => {
    const { container, getByTestId, queryByRole } = render(CodeInputHarness, { value: '12' });
    await fireEvent.click(getByTestId('set-error'));
    await edit(input(container), '123');
    expect(queryByRole('alert')).toBeNull();
    expect(input(container)).not.toHaveAttribute('aria-invalid');
    expect(getByTestId('error')).toHaveTextContent('');
  });
});

describe('CodeInput — disabled and loading', () => {
  it('disabled locks the field and ignores a paste', async () => {
    const { container, getByTestId } = render(CodeInputHarness, { value: '12', disabled: true });
    expect(input(container)).toBeDisabled();
    expect(container.querySelector('.ird-code__field')).toHaveClass('is-disabled');
    await paste(input(container), '654321');
    expect(getByTestId('value')).toHaveTextContent('12');
    expect(getByTestId('completions')).toHaveTextContent('');
  });

  it('loading keeps focus (read-only, not disabled) and says "Verificando…" politely', async () => {
    const { container, getByRole, getByTestId } = render(CodeInputHarness, {
      value: '123456',
      loading: true,
    });
    expect(input(container)).not.toBeDisabled();
    expect(input(container)).toHaveAttribute('readonly');
    expect(getByRole('status')).toHaveTextContent(LOADING_LABEL);
    await paste(input(container), '654321');
    await edit(input(container), '654321');
    expect(input(container).value).toBe('123456');
    expect(getByTestId('completions')).toHaveTextContent('');
  });

  it('keeps an empty status region in place when idle, so the message is announced', () => {
    const { getByRole } = render(CodeInputHarness, {});
    expect(getByRole('status')).toHaveTextContent('');
  });
});

describe('CodeInput — a value from the parent', () => {
  it('is normalised to digits and shown, without firing onComplete', async () => {
    const { container, getByTestId } = render(CodeInputHarness, {});
    await fireEvent.click(getByTestId('set-value'));
    expect(getByTestId('value')).toHaveTextContent(/^1234$/);
    expect(shown(container)).toBe('1234');
    await fireEvent.click(getByTestId('set-full'));
    expect(input(container).value).toBe('654321');
    expect(getByTestId('completions')).toHaveTextContent('');
  });
});

describe('CodeInput — styles honour the design-system rules', () => {
  const css = styleBlock();

  it('is token-only: no hex literal, no font-size in px or raw rem', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/font-size:\s*[\d.]+(px|rem)/);
  });

  it('keeps the real input at a ≥16px font size so iOS never zooms', () => {
    expect(css).toMatch(/\.ird-code__input\s*\{[^}]*font-size:\s*var\(--fs-base\)/);
  });

  it('removes the invisible input ring only because the active box draws one', () => {
    expect(css).toMatch(/\.ird-code__input:focus-visible\s*\{\s*outline:\s*none/);
    expect(css).toMatch(
      /\.ird-code__box\.is-active\s*\{[^}]*outline:\s*2px solid var\(--color-focus\)/,
    );
  });

  it('stops the caret blink and the transitions under reduced motion', () => {
    expect(css).toMatch(/cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
    const reduce = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduce).toMatch(/transition:\s*none/);
    expect(reduce).toMatch(/has-caret::after\s*\{\s*animation:\s*none/);
  });

  it('keeps disabled digits legible (muted ink, not faded opacity)', () => {
    expect(css).toMatch(/is-disabled \.ird-code__box\s*\{[^}]*color:\s*var\(--color-muted\)/);
    expect(css).not.toMatch(/\.ird-code__box[^{]*\{[^}]*opacity:\s*0\.\d/);
  });
});
