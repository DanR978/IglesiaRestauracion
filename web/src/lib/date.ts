/* ============================================================================
 * web/src/lib/date.ts — date *arithmetic* primitives (port of
 * js/utils/date.js, S07)
 * ----------------------------------------------------------------------------
 * Zero-padding and local "YYYY-MM-DD" keys. Display formatting lives
 * elsewhere; this file has no locale and no timezone (G-002: calendar dates
 * stay YYYY-MM-DD strings).
 *
 * Usage:
 *   import { pad2, ymd, isoDate, todayISO } from '$lib/date';
 *   ymd(2026, 7, 6)   // "2026-08-06"  ← note: month is 0-indexed
 *   isoDate(someDate) // "2026-08-06"  ← in the *viewer's* timezone
 * ========================================================================== */

/** Zero-pad a number to two digits. */
export const pad2 = (n: number | string): string => String(n).padStart(2, '0');

/**
 * Build a "YYYY-MM-DD" key from calendar parts.
 * @param y full year
 * @param m 0-indexed month, matching Date#getMonth()
 * @param d day of month
 */
export const ymd = (y: number, m: number, d: number): string => `${y}-${pad2(m + 1)}-${pad2(d)}`;

/**
 * "YYYY-MM-DD" for a Date, read in the viewer's local timezone.
 * For a key pinned to the church's timezone, format explicitly at the call
 * site — this helper deliberately knows nothing about where the church is.
 */
export const isoDate = (date: Date): string =>
  ymd(date.getFullYear(), date.getMonth(), date.getDate());

/** Today as "YYYY-MM-DD" in the viewer's local timezone. */
export const todayISO = (): string => isoDate(new Date());
