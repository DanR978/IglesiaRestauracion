/* ============================================================================
 * web/src/lib/components/code-input.ts — the CodeInput contract (PR-C2, S39)
 * ----------------------------------------------------------------------------
 * The non-visual half of CodeInput.svelte: the code length, its Spanish
 * strings, and the pure editing rules the component and the tests share.
 *
 * ONE real <input>, six drawn boxes (a deliberate deviation from the plan's
 * zag pin-input, which renders six inputs). A single field is what iOS and
 * Android one-time-code autofill, password managers, paste and screen readers
 * all expect to find; the boxes are aria-hidden paint that follows the
 * caret. So every edit is an edit of one string, and these helpers are the
 * whole of the logic:
 *   sanitizeCode        digits only, the first CODE_LENGTH
 *   caretAfterSanitize  where the caret lands once the non-digits are gone
 *   insertCode          the paste rule: a whole code replaces the field, a
 *                       fragment goes in at the selection; no digits → no-op
 *   activeBox           which box draws the caret (the last one once full)
 *
 * Usage:
 *   import { CODE_LENGTH, sanitizeCode, insertCode } from '#lib/components/code-input.js';
 *   sanitizeCode('123-456');                 // '123456'
 *   insertCode('12', 2, 2, '123 456');       // { value: '123456', caret: 6 }
 * ========================================================================== */

/** TOTP codes are six digits (RFC 6238 as Supabase Auth issues them). */
export const CODE_LENGTH = 6;

export const DEFAULT_CODE_LABEL = 'Código de verificación';
export const LOADING_LABEL = 'Verificando…';

/** Every ASCII digit in `raw`, in order. */
export function onlyDigits(raw: string): string {
  return raw.replace(/\D+/g, '');
}

/** The code a raw string stands for: digits only, at most CODE_LENGTH. */
export function sanitizeCode(raw: string): string {
  return onlyDigits(raw).slice(0, CODE_LENGTH);
}

/**
 * Where the caret belongs after sanitising: the number of digits that were in
 * front of it. Typing "a" between "12" and "34" leaves the caret after "12".
 */
export function caretAfterSanitize(raw: string, caret: number): number {
  return Math.min(onlyDigits(raw.slice(0, Math.max(caret, 0))).length, CODE_LENGTH);
}

/**
 * Apply pasted text to `value` with the selection [start, end). A paste that
 * holds a whole code ("123 456", "123-456", an SMS sentence) replaces the
 * field with its first CODE_LENGTH digits; a shorter run of digits is
 * inserted at the selection and the result is cut to CODE_LENGTH. Text with
 * no digits returns null: the field is left as it was.
 */
export function insertCode(
  value: string,
  start: number,
  end: number,
  pasted: string,
): { value: string; caret: number } | null {
  const digits = onlyDigits(pasted);
  if (digits === '') return null;
  if (digits.length >= CODE_LENGTH) {
    return { value: digits.slice(0, CODE_LENGTH), caret: CODE_LENGTH };
  }
  const from = Math.min(Math.max(start, 0), value.length);
  const to = Math.min(Math.max(end, from), value.length);
  const next = sanitizeCode(value.slice(0, from) + digits + value.slice(to));
  return { value: next, caret: Math.min(from + digits.length, next.length) };
}

/** The box that shows the caret: the one at the caret, or the last once full. */
export function activeBox(caret: number): number {
  return Math.min(Math.max(caret, 0), CODE_LENGTH - 1);
}
