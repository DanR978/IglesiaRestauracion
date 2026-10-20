/* ============================================================================
 * web/src/lib/components/password-field.ts — the PasswordField contract (PR-C2)
 * ----------------------------------------------------------------------------
 * The non-visual half of PasswordField.svelte: the strength scorer (pure,
 * unit-tested), its Spanish copy, and the strings the field renders. Owned by
 * S21 (the primitive) and S39 (invite / reset / change-password consumers).
 *
 * THE SCORER IS A METER, NOT THE GATE. GoTrue enforces the real minimum
 * (`password_min_length` ≥ 8, supabase/apply-auth-email.mjs); the meter states
 * that minimum before the request instead of after a failed one, and steers
 * people off the passwords that fall first to guessing:
 *   weak    shorter than 8 characters, or predictable at any length: two or
 *           fewer distinct characters, a straight run (12345678, abcdefgh,
 *           98765432), digits only under 12 (dates, phone numbers), or a
 *           common password — compared without case, accents or a trailing
 *           run of digits/symbols, so "Contraseña2024!" is still "contrasena".
 *   strong  16+ characters (a passphrase), or 12+ mixing three of: lower
 *           case, upper case, digits, symbols/spaces.
 *   ok      everything else from 8 characters up.
 * Length is counted in characters (code points), the way a person counts.
 * `acceptable` (ok or strong) is what a form should require before submitting.
 *
 * Usage:
 *   import { scorePassword, strengthMessage } from '#lib/components/password-field.js';
 *   const score = scorePassword(pw);   // { level: 'ok', reason: null, acceptable: true }
 *   strengthMessage(score);            // 'Aceptable: una frase más larga sería más segura.'
 * ========================================================================== */

/** The server minimum (GoTrue `password_min_length`). */
export const PASSWORD_MIN_LENGTH = 8;
/** A passphrase this long is strong whatever it is made of. */
const PASSPHRASE_LENGTH = 16;
/** From this length, mixing three character classes makes it strong. */
const MIXED_LENGTH = 12;
/** Digits-only passwords shorter than this are dates or phone numbers. */
const DIGITS_ONLY_MIN = 12;

/** The two values a password field ever needs (WCAG 1.3.5 / 3.3.8). */
export type PasswordAutocomplete = 'current-password' | 'new-password';

export type PasswordLevel = 'empty' | 'weak' | 'ok' | 'strong';
export type PasswordWeakness = 'short' | 'predictable';

export interface PasswordScore {
  level: PasswordLevel;
  /** Why a weak password is weak; null for every other level. */
  reason: PasswordWeakness | null;
  /** Long enough for the server and not trivially guessable (ok or strong). */
  acceptable: boolean;
}

export const DEFAULT_PASSWORD_LABEL = 'Contraseña';
/**
 * The toggle's accessible name. It does NOT change with the state: the button
 * is `aria-pressed`, and "Ocultar contraseña, presionado" would read as the
 * opposite of what is on screen (WAI-ARIA APG, Button pattern).
 */
export const TOGGLE_LABEL = 'Mostrar contraseña';
export const MISMATCH_MESSAGE = 'Las contraseñas no coinciden.';

/** Short name of each level, shown before the advice. */
export const STRENGTH_LABEL: Readonly<Record<Exclude<PasswordLevel, 'empty'>, string>> = {
  weak: 'Débil',
  ok: 'Aceptable',
  strong: 'Fuerte',
};

/**
 * Cores of the most-used passwords (and their Spanish and church-flavoured
 * cousins), lower case, no accents, no trailing digits — see `core()`.
 */
const COMMON = new Set([
  'password',
  'passw0rd',
  'contrasena',
  'clave',
  'qwerty',
  'qwertyui',
  'qwertyuiop',
  'asdfgh',
  'asdfghjk',
  'asdfghjkl',
  'zxcvbnm',
  '1q2w3e4r',
  '1qaz2wsx',
  'qazwsx',
  'iloveyou',
  'teamo',
  'teamomucho',
  'abc',
  'abcd',
  'admin',
  'administrador',
  'bienvenido',
  'bienvenida',
  'welcome',
  'letmein',
  'football',
  'futbol',
  'baseball',
  'sunshine',
  'princess',
  'superman',
  'batman',
  'dragon',
  'monkey',
  'master',
  'shadow',
  'jesus',
  'jesucristo',
  'jesusteama',
  'diosesamor',
  'diosteama',
  'dios',
  'cristo',
  'aleluya',
  'amen',
  'bendiciones',
  'iglesia',
  'restauracion',
]);

/** Lower case with accents stripped (ñ → n, á → a): how the lists compare. */
function normalize(password: string): string {
  return password
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
}

/** True when every character is one step from the previous, in one direction. */
function isStraightRun(text: string): boolean {
  const points = [...text].map((ch) => ch.codePointAt(0) ?? 0);
  if (points.length < 4) return false;
  const step = points[1] - points[0];
  if (Math.abs(step) !== 1) return false;
  return points.every((point, i) => i === 0 || point - points[i - 1] === step);
}

function isPredictable(password: string): boolean {
  const norm = normalize(password);
  if (new Set(norm).size <= 2) return true;
  // "12345678!" and "Abcdefgh." are still runs; "Contraseña2024!" is still a word.
  const stem = norm.replace(/[^\p{L}\p{Nd}]+$/u, '');
  const core = norm.replace(/[^\p{L}]+$/u, '');
  if (isStraightRun(stem)) return true;
  if (/^\p{Nd}+$/u.test(stem) && [...stem].length < DIGITS_ONLY_MIN) return true;
  return COMMON.has(core) || COMMON.has(stem);
}

/** How many of lower / upper / digit / other (symbols, spaces) appear. */
function characterClasses(password: string): number {
  return [/\p{Ll}/u, /\p{Lu}/u, /\p{Nd}/u, /[^\p{L}\p{Nd}]/u].filter((re) => re.test(password))
    .length;
}

/** Rate a password. Pure: no network, no storage, nothing logged. */
export function scorePassword(password: string): PasswordScore {
  const length = [...password].length;
  if (length === 0) return { level: 'empty', reason: null, acceptable: false };
  if (length < PASSWORD_MIN_LENGTH) return { level: 'weak', reason: 'short', acceptable: false };
  if (isPredictable(password)) return { level: 'weak', reason: 'predictable', acceptable: false };
  const strong =
    length >= PASSPHRASE_LENGTH || (length >= MIXED_LENGTH && characterClasses(password) >= 3);
  return { level: strong ? 'strong' : 'ok', reason: null, acceptable: true };
}

/** How many of the meter's three bars are filled. */
export function strengthBars(level: PasswordLevel): number {
  return { empty: 0, weak: 1, ok: 2, strong: 3 }[level];
}

/** The meter's sentence: the level first, then what to do about it. */
export function strengthMessage(score: PasswordScore): string {
  switch (score.level) {
    case 'empty':
      return `Usa al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
    case 'weak':
      return score.reason === 'short'
        ? `${STRENGTH_LABEL.weak}: usa al menos ${PASSWORD_MIN_LENGTH} caracteres.`
        : `${STRENGTH_LABEL.weak}: evita palabras comunes, fechas, repeticiones y secuencias.`;
    case 'ok':
      return `${STRENGTH_LABEL.ok}: una frase más larga sería más segura.`;
    case 'strong':
      return `${STRENGTH_LABEL.strong}.`;
  }
}
