/* ============================================================================
 * web/src/lib/validators.ts — form-input validators (port of
 * js/lib/validators.js, S07)
 * ----------------------------------------------------------------------------
 * Email / US-phone / person-name validation used by the public registration
 * and contact flows. Behavior is byte-identical to legacy (golden-tested);
 * only types were added. The legacy `export default {...}` compat shim was
 * dropped — named exports only (CLAUDE.md §5).
 *
 * Notes carried over from legacy behavior (do not "fix" without a D-xxx):
 * - `isValidEmail` / `isValidName` expect a string (or null/undefined); a
 *   number input throws in legacy, so the types forbid it here.
 * - `normalizeUSPhone` accepts anything stringifiable; returns E.164
 *   (`+1XXXXXXXXXX`) or null.
 * - `formatUSPhoneNational` echoes the input back unchanged when it is not a
 *   valid US phone (legacy `v ?? ''`).
 *
 * Usage:
 *   import { isValidEmail, normalizeUSPhone, formatUSPhoneNational } from '$lib/validators';
 * ========================================================================== */

export const isValidEmail = (v?: string | null): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((v || '').trim());

export function normalizeUSPhone(v?: string | number | null): string | null {
  if (!v) return null;
  let digits = String(v).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  const area = digits.slice(0, 3);
  const exch = digits.slice(3, 6);
  if (!/^[2-9]\d{2}$/.test(area)) return null;
  if (!/^[2-9]\d{2}$/.test(exch)) return null;
  return `+1${digits}`;
}

export const isValidUSPhone = (v?: string | number | null): boolean => normalizeUSPhone(v) !== null;

// Character class respelled from legacy `'’\-\s` to `'’\s-` (identical set;
// avoids no-useless-escape). Behavior is golden-verified.
export const isValidName = (v?: string | null): boolean =>
  /^[A-Za-zÀ-ÖØ-öø-ÿ'’\s-]{3,}$/.test((v || '').trim());

export function formatUSPhoneNational(v?: string | null): string {
  const e164 = normalizeUSPhone(v);
  if (!e164) return v ?? '';
  const d = e164.slice(2);
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
