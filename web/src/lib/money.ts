/* ============================================================================
 * web/src/lib/money.ts — integer-cent money arithmetic + USD formatting (S08)
 * ----------------------------------------------------------------------------
 * Port of the legacy USD formatter in js/utils/number.js (`money`, imported in
 * treasury as `fmt`), extended per MIGRATION.md D-003: the new app computes in
 * INTEGER CENTS; the DB column stays `numeric` dollars; convert at the
 * boundary — toCents() on read/parse, toNumeric() on write.
 *
 * Every treasury figure on screen and in every generated PDF goes through
 * formatUSD, so it must stay byte-identical to the legacy formatter (golden:
 * web/tests/golden/money.test.ts against fixtures run through the legacy
 * module). Arithmetic goes through sumC so amounts never touch float addition.
 *
 * Error policy (documented choice): toCents / sumC / toNumeric THROW on input
 * that is not a valid amount — silent zeroes corrupt a ledger. formatUSD is
 * display-only and keeps the legacy `Number(n) || 0` guard: garbage renders
 * as "$0.00", exactly as every legacy call site relied on.
 *
 * Usage:
 *   import { toCents, sumC, formatUSD, toNumeric } from '$lib/money';
 *   toCents('1,234.56')                      // 123456
 *   toCents(10.075)                          // 1008 (half up at the cent)
 *   sumC(toCents('0.10'), toCents('0.20'))   // 30 — exact, no float drift
 *   formatUSD(123456)                        // "$1,234.56"
 *   toNumeric(123456)                        // 1234.56 (for DB writes)
 * ========================================================================== */

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const MAX_CENTS = BigInt(Number.MAX_SAFE_INTEGER);

// Optional sign, optional "$", then either comma-grouped thousands or plain
// digits, then an optional fraction. At least one digit overall is enforced
// after the match ("." / "" / "$" alone must not parse as zero).
const AMOUNT_RE = /^([+-]?)\$?(\d{1,3}(?:,\d{3})+|\d*)(?:\.(\d*))?$/;

/**
 * Parse a dollars amount (number, or a string like "1,234.56" / "$5" / "-0.25")
 * into integer cents, rounding half up at the cent (half away from zero, in
 * exact decimal — "1.005" → 101, "1.0049" → 100).
 *
 * Numbers are converted via their shortest decimal representation
 * (`String(x)`), which is also what the legacy Intl formatter rounded, so
 * `formatUSD(toCents(x))` reproduces legacy `money(x)` for every double.
 *
 * @throws TypeError on non-numeric input (legacy rendered these as $0.00 —
 *         that leniency now lives only in formatUSD).
 * @throws RangeError when |amount| exceeds Number.MAX_SAFE_INTEGER cents.
 */
export function toCents(input: string | number): number {
  let s: string;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      throw new TypeError(`toCents: not a finite amount: ${input}`);
    }
    s = String(input);
    if (/e/i.test(s)) {
      // Exponent notation only appears for |x| < 1e-6 (sub-cent dust → 0) or
      // |x| >= 1e21 (beyond exact integer cents).
      if (Math.abs(input) < 0.005) return 0;
      throw new RangeError(`toCents: amount out of range: ${input}`);
    }
  } else {
    s = input.trim();
  }

  const m = AMOUNT_RE.exec(s);
  const int = m ? m[2].replace(/,/g, '') : '';
  const frac = m?.[3] ?? '';
  if (!m || (int === '' && frac === '')) {
    throw new TypeError(`toCents: unparseable amount: ${JSON.stringify(input)}`);
  }

  const base = BigInt(int || '0') * 100n + BigInt((frac + '00').slice(0, 2));
  // Decimal round half up at the cent: the remainder beyond two fraction
  // digits is >= half a cent iff its first digit is >= '5'.
  const rounded = base + (frac.length > 2 && frac.charCodeAt(2) >= 53 ? 1n : 0n);
  if (rounded > MAX_CENTS) {
    throw new RangeError(`toCents: amount out of range: ${JSON.stringify(input)}`);
  }
  const cents = Number(rounded);
  return m[1] === '-' && cents !== 0 ? -cents : cents;
}

/**
 * Exact integer sum of cent amounts. `sumC()` is 0.
 * @throws TypeError if any argument is not a safe-integer cent amount.
 * @throws RangeError if the total leaves the exact-integer range.
 */
export function sumC(...cents: number[]): number {
  let total = 0;
  for (const c of cents) {
    if (!Number.isSafeInteger(c)) {
      throw new TypeError(`sumC: not an integer cent amount: ${c}`);
    }
    total += c;
  }
  if (!Number.isSafeInteger(total)) {
    throw new RangeError('sumC: total exceeds the exact integer range');
  }
  return total;
}

/**
 * Integer cents → dollars number for a DB `numeric` write (123456 → 1234.56).
 * The result is the double nearest cents/100; its JSON serialization is the
 * exact 2-decimal value, and `toCents(toNumeric(c)) === c` for every safe c.
 * @throws TypeError if cents is not a safe integer.
 */
export function toNumeric(cents: number): number {
  if (!Number.isSafeInteger(cents)) {
    throw new TypeError(`toNumeric: not an integer cent amount: ${cents}`);
  }
  return cents / 100;
}

/**
 * Format integer cents as US dollars, byte-identical to legacy
 * `money(dollars)`. Keeps the legacy guard: non-numeric and nullish input
 * becomes $0.00 (`Number(n) || 0`), which is what every call site relied on.
 */
export function formatUSD(cents: number): string {
  return USD.format((Number(cents) || 0) / 100);
}
