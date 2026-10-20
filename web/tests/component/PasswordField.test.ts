// PR-C2 — PasswordField: the pure strength scorer (every rule, both edges),
// then the component under jsdom — a labelled password input with the right
// autocomplete, paste left alone (WCAG 3.3.8), the show/hide toggle as a real
// aria-pressed button with a name that does not flip, the strength meter
// (bars + words, aria-live polite, wired into aria-describedby), and the
// confirm field's mismatch rule (blur/submit, never while typing).
import { fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MISMATCH_MESSAGE,
  PASSWORD_MIN_LENGTH,
  TOGGLE_LABEL,
  scorePassword,
  strengthBars,
  strengthMessage,
} from '#lib/components/password-field.js';
import PasswordFieldHarness from './fixtures/PasswordFieldHarness.svelte';

/** Type into an input the way the browser reports it: value, then `input`. */
async function type(input: HTMLInputElement, value: string): Promise<void> {
  await fireEvent.input(input, { target: { value } });
}

const pwInput = (c: HTMLElement) => c.querySelectorAll<HTMLInputElement>('.ird-pw__input')[0];
const confirmInput = (c: HTMLElement) => c.querySelectorAll<HTMLInputElement>('.ird-pw__input')[1];
const toggle = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('.ird-pw__toggle')!;
const meterText = (c: HTMLElement) => c.querySelector<HTMLElement>('.ird-pw__meter-text')!;
const litBars = (c: HTMLElement) => c.querySelectorAll('.ird-pw__bar.is-on').length;

function styleBlock(): string {
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/components/PasswordField.svelte'),
    'utf8',
  );
  return src
    .slice(src.indexOf('<style>'), src.indexOf('</style>'))
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('scorePassword — the pure meter', () => {
  it('reports an empty password as empty, not weak', () => {
    expect(scorePassword('')).toEqual({ level: 'empty', reason: null, acceptable: false });
  });

  it('is weak below the server minimum of 8 characters, and acceptable from 8', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(scorePassword('Luz.Sol')).toEqual({ level: 'weak', reason: 'short', acceptable: false });
    expect(scorePassword('Luz.Sol7')).toMatchObject({ level: 'ok', acceptable: true });
  });

  it('counts characters, not UTF-16 units', () => {
    // Four emoji are 8 code units but 4 characters — still too short.
    expect(scorePassword('😀😀😀😀').reason).toBe('short');
    expect(scorePassword('ñandú-sé')).toMatchObject({ level: 'ok' });
  });

  it.each([
    ['aaaaaaaa', 'one repeated character'],
    ['abababab', 'two characters'],
    ['12345678', 'an ascending run'],
    ['87654321', 'a descending run'],
    ['abcdefgh', 'a letter run'],
    ['12345678!', 'a run with a trailing symbol'],
    ['19850312', 'digits only (a date)'],
    ['30912345678', 'digits only under 12 (a phone number)'],
    ['password', 'a common password'],
    ['Password2024!', 'a common word + year + symbol'],
    ['Contraseña2024!', 'the Spanish common word, accent and suffix stripped'],
    ['qwerty123', 'a keyboard walk'],
    ['1qaz2wsx', 'a column walk'],
    ['Iglesia2025', 'a church word + year'],
  ])('is weak (predictable) for %s — %s', (password) => {
    expect(scorePassword(password)).toEqual({
      level: 'weak',
      reason: 'predictable',
      acceptable: false,
    });
  });

  it.each([
    ['luzdelalba', 'ten lower-case letters'],
    ['MiIglesiaFiel', 'thirteen letters, two classes'],
    ['correcthorse1', '13 characters but only two classes'],
    ['483920571936', 'twelve digits that are no run'],
  ])('is ok for %s — %s', (password) => {
    expect(scorePassword(password)).toEqual({ level: 'ok', reason: null, acceptable: true });
  });

  it.each([
    ['caballo correcto batería', 'a passphrase of 16+ characters'],
    ['luzdelalbaquebrilla', '19 lower-case letters'],
    ['Atardecer#2025', '12+ with four classes'],
    ['Montes-Verdes', '12+ with three classes (upper, lower, symbol)'],
  ])('is strong for %s — %s', (password) => {
    expect(scorePassword(password)).toEqual({ level: 'strong', reason: null, acceptable: true });
  });

  it('maps levels to 0–3 bars', () => {
    expect(['empty', 'weak', 'ok', 'strong'].map((l) => strengthBars(l as never))).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it('leads every sentence with the level and says what to do', () => {
    expect(strengthMessage(scorePassword(''))).toBe('Usa al menos 8 caracteres.');
    expect(strengthMessage(scorePassword('abc'))).toBe('Débil: usa al menos 8 caracteres.');
    expect(strengthMessage(scorePassword('password'))).toBe(
      'Débil: evita palabras comunes, fechas, repeticiones y secuencias.',
    );
    expect(strengthMessage(scorePassword('luzdelalba'))).toBe(
      'Aceptable: una frase más larga sería más segura.',
    );
    expect(strengthMessage(scorePassword('caballo correcto batería'))).toBe('Fuerte.');
  });
});

describe('PasswordField — the input', () => {
  it('is a labelled password input, current-password by default', () => {
    const { container, getByLabelText } = render(PasswordFieldHarness, {});
    const input = getByLabelText('Contraseña');
    expect(input).toBe(pwInput(container));
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('autocomplete', 'current-password');
    // iOS capitalises the first letter of a visible text field otherwise.
    expect(input).toHaveAttribute('autocapitalize', 'off');
    expect(input).toHaveAttribute('spellcheck', 'false');
  });

  it('takes autocomplete="new-password" and a custom label', () => {
    const { getByLabelText } = render(PasswordFieldHarness, {
      label: 'Nueva contraseña',
      autocomplete: 'new-password',
    });
    expect(getByLabelText('Nueva contraseña')).toHaveAttribute('autocomplete', 'new-password');
  });

  it('binds its value two-way', async () => {
    const { container, getByTestId } = render(PasswordFieldHarness, { password: 'inicial' });
    expect(pwInput(container).value).toBe('inicial');
    await type(pwInput(container), 'nueva-clave');
    expect(getByTestId('password')).toHaveTextContent('nueva-clave');
  });

  it('never blocks paste (WCAG 3.3.8)', async () => {
    const { container } = render(PasswordFieldHarness, {});
    const notCancelled = await fireEvent.paste(pwInput(container), {
      clipboardData: { getData: () => 'Clave-Desde-El-Gestor' },
    });
    expect(notCancelled).toBe(true);
  });

  it('passes hint, error and required through FormField', () => {
    const { getByLabelText, getByRole } = render(PasswordFieldHarness, {
      hint: 'La que usas para entrar.',
      error: 'El correo o la contraseña no son correctos.',
      required: true,
    });
    const input = getByLabelText(/^Contraseña/);
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(
      'La que usas para entrar. Error: El correo o la contraseña no son correctos.',
    );
    expect(getByRole('alert')).toHaveTextContent('El correo o la contraseña no son correctos.');
  });

  it('focus() moves focus into the input', async () => {
    const { container, getByTestId } = render(PasswordFieldHarness, {});
    await fireEvent.click(getByTestId('focus'));
    expect(document.activeElement).toBe(pwInput(container));
  });
});

describe('PasswordField — show/hide', () => {
  it('is a real button, in the tab order, with a name and aria-pressed="false"', () => {
    const { container, getByRole } = render(PasswordFieldHarness, {});
    const btn = getByRole('button', { name: TOGGLE_LABEL });
    expect(btn).toBe(toggle(container));
    expect(btn).toHaveAttribute('type', 'button');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(btn).not.toHaveAttribute('tabindex');
    expect(btn).toHaveAttribute('aria-controls', pwInput(container).id);
    // The eye is decorative; the name is on the button.
    expect(btn.querySelector('.icon')).toHaveAttribute('aria-hidden', 'true');
  });

  it('reveals and hides — pressed means shown, and the NAME does not flip', async () => {
    const { container } = render(PasswordFieldHarness, { password: 'secreta-1' });
    await fireEvent.click(toggle(container));
    expect(pwInput(container)).toHaveAttribute('type', 'text');
    expect(toggle(container)).toHaveAttribute('aria-pressed', 'true');
    expect(toggle(container)).toHaveAccessibleName(TOGGLE_LABEL);
    expect(toggle(container).querySelector('.icon')).toHaveClass('fa-eye-slash');

    await fireEvent.click(toggle(container));
    expect(pwInput(container)).toHaveAttribute('type', 'password');
    expect(toggle(container)).toHaveAttribute('aria-pressed', 'false');
    expect(pwInput(container).value).toBe('secreta-1');
  });

  it('hides the password again when the form submits (password managers)', async () => {
    const { container, getByTestId } = render(PasswordFieldHarness, { password: 'secreta-1' });
    await fireEvent.click(toggle(container));
    expect(pwInput(container)).toHaveAttribute('type', 'text');
    await fireEvent.submit(getByTestId('form'));
    expect(pwInput(container)).toHaveAttribute('type', 'password');
    expect(getByTestId('submits')).toHaveTextContent('1');
  });

  it('can be left out', () => {
    const { container } = render(PasswordFieldHarness, { toggle: false });
    expect(toggle(container)).toBeNull();
    expect(pwInput(container)).not.toHaveClass('has-toggle');
  });

  it('is disabled with the field', () => {
    const { container } = render(PasswordFieldHarness, { disabled: true });
    expect(pwInput(container)).toBeDisabled();
    expect(toggle(container)).toBeDisabled();
  });
});

describe('PasswordField — strength meter', () => {
  it('is not rendered unless asked for', () => {
    const { container } = render(PasswordFieldHarness, {});
    expect(container.querySelector('.ird-pw__meter')).toBeNull();
  });

  it('states the minimum up front, politely live, and describes the input', () => {
    const { container } = render(PasswordFieldHarness, {
      strength: true,
      autocomplete: 'new-password',
    });
    const text = meterText(container);
    expect(text).toHaveTextContent('Usa al menos 8 caracteres.');
    expect(text).toHaveAttribute('aria-live', 'polite');
    expect(pwInput(container).getAttribute('aria-describedby')).toContain(text.id);
    expect(litBars(container)).toBe(0);
    expect(container.querySelector('.ird-pw__bars')).toHaveAttribute('aria-hidden', 'true');
  });

  it('follows the scorer: weak → 1 bar, ok → 2, strong → 3, always with words', async () => {
    const { container } = render(PasswordFieldHarness, { strength: true });
    const meter = container.querySelector('.ird-pw__meter')!;

    await type(pwInput(container), 'abc');
    expect(meter).toHaveAttribute('data-level', 'weak');
    expect(litBars(container)).toBe(1);
    expect(meterText(container)).toHaveTextContent('Débil: usa al menos 8 caracteres.');

    await type(pwInput(container), 'luzdelalba');
    expect(meter).toHaveAttribute('data-level', 'ok');
    expect(litBars(container)).toBe(2);
    expect(meterText(container)).toHaveTextContent(/^Aceptable/);

    await type(pwInput(container), 'caballo correcto batería');
    expect(meter).toHaveAttribute('data-level', 'strong');
    expect(litBars(container)).toBe(3);
    expect(meterText(container)).toHaveTextContent('Fuerte.');
  });
});

describe('PasswordField — confirm (match)', () => {
  it('says nothing while the person is still typing a mismatch', async () => {
    const { container, queryByRole } = render(PasswordFieldHarness, {
      withConfirm: true,
      password: 'luzdelalba',
    });
    await type(confirmInput(container), 'luzdel');
    expect(queryByRole('alert')).toBeNull();
    expect(confirmInput(container)).not.toHaveAttribute('aria-invalid');
  });

  it('reports the mismatch on blur, as an announced error on the confirm field', async () => {
    const { container, getByRole } = render(PasswordFieldHarness, {
      withConfirm: true,
      password: 'luzdelalba',
    });
    await type(confirmInput(container), 'luzdelalva');
    await fireEvent.blur(confirmInput(container));
    expect(getByRole('alert')).toHaveTextContent(MISMATCH_MESSAGE);
    expect(confirmInput(container)).toHaveAttribute('aria-invalid', 'true');
    expect(pwInput(container)).not.toHaveAttribute('aria-invalid');
  });

  it('clears the moment the two agree, and waits for the next blur to report again', async () => {
    const { container, queryByRole } = render(PasswordFieldHarness, {
      withConfirm: true,
      password: 'luzdelalba',
    });
    await type(confirmInput(container), 'luzdelalva');
    await fireEvent.blur(confirmInput(container));
    expect(queryByRole('alert')).not.toBeNull();

    await type(confirmInput(container), 'luzdelalba');
    expect(queryByRole('alert')).toBeNull();

    await type(confirmInput(container), 'luzdelalbaX');
    expect(queryByRole('alert')).toBeNull();
    await fireEvent.blur(confirmInput(container));
    expect(queryByRole('alert')).toHaveTextContent(MISMATCH_MESSAGE);
  });

  it('clears when the FIRST field changes to match', async () => {
    const { container, queryByRole } = render(PasswordFieldHarness, {
      withConfirm: true,
      password: 'luzdelalba',
    });
    await type(confirmInput(container), 'luzdelalva');
    await fireEvent.blur(confirmInput(container));
    expect(queryByRole('alert')).not.toBeNull();
    await type(pwInput(container), 'luzdelalva');
    await tick();
    expect(queryByRole('alert')).toBeNull();
  });

  it('does not nag when someone tabs past an empty confirm field', async () => {
    const { container, queryByRole } = render(PasswordFieldHarness, {
      withConfirm: true,
      password: 'luzdelalba',
    });
    await fireEvent.blur(confirmInput(container));
    expect(queryByRole('alert')).toBeNull();
  });

  it('reports the mismatch on submit, even for an empty confirm field', async () => {
    const { getByTestId, getByRole } = render(PasswordFieldHarness, {
      withConfirm: true,
      password: 'luzdelalba',
    });
    await fireEvent.submit(getByTestId('form'));
    expect(getByRole('alert')).toHaveTextContent(MISMATCH_MESSAGE);
  });

  it('stays quiet on submit when the two match', async () => {
    const { container, getByTestId, queryByRole } = render(PasswordFieldHarness, {
      withConfirm: true,
      password: 'luzdelalba',
    });
    await type(confirmInput(container), 'luzdelalba');
    await fireEvent.submit(getByTestId('form'));
    expect(queryByRole('alert')).toBeNull();
  });

  it("lets the caller's error win over the mismatch message", async () => {
    const { container, getByRole } = render(PasswordFieldHarness, {
      withConfirm: true,
      password: 'luzdelalba',
      confirmError: 'No pudimos guardar la contraseña.',
    });
    await type(confirmInput(container), 'otra-cosa');
    await fireEvent.blur(confirmInput(container));
    expect(getByRole('alert')).toHaveTextContent('No pudimos guardar la contraseña.');
  });
});

describe('PasswordField — styles honour the design-system rules', () => {
  const css = styleBlock();

  it('is token-only: no hex literal, no font-size in px or raw rem', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/font-size:\s*[\d.]+(px|rem)/);
  });

  it('keeps a 44px toggle with a visible focus ring and no hover-only affordance', () => {
    expect(css).toMatch(/\.ird-pw__toggle\s*\{[^}]*width:\s*2\.75rem/);
    expect(css).toMatch(
      /\.ird-pw__toggle:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-focus\)/,
    );
    expect(css).not.toMatch(/outline:\s*none/);
    expect(css).not.toMatch(/opacity:\s*0[;\s]/);
  });

  it('colours the bars with the semantic inks only', () => {
    expect(css).toMatch(/data-level='weak'\][^{]*\{\s*background:\s*var\(--money-neg\)/);
    expect(css).toMatch(/data-level='ok'\][^{]*\{\s*background:\s*var\(--money-warn\)/);
    expect(css).toMatch(/data-level='strong'\][^{]*\{\s*background:\s*var\(--money-pos\)/);
  });

  it('uses the house easing and guards every transition with reduced motion', () => {
    expect(css).toMatch(/cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transition:\s*none/);
  });
});
