// js/utils/format-date.js
// Spanish display formatting for date-only ("YYYY-MM-DD") and clock ("HH:MM")
// values. Kept separate from date.js, which does arithmetic and knows no locale.
//
// THE RULE THAT MAKES THIS FILE NECESSARY: never `new Date('2026-08-06')`.
// A bare date string is parsed as UTC midnight, so west of Greenwich it renders
// as the *previous day* — "5 de agosto". Every function here splits the string
// and rebuilds via `new Date(y, m - 1, d)`, which is local and correct. The
// repo already did this correctly in most places; centralizing it is what stops
// the next call site from getting it wrong.
//
// Nothing here takes a timezone. These format a calendar date the church typed
// in, not an instant on a clock — a timestamp needs an explicit tz at its call
// site instead.
//
// Usage:
//   import { fmtDateLong, fmtDateShort, fmtClock } from '/js/utils/format-date.js';
//   fmtDateLong('2026-08-06')            // "6 de agosto de 2026"
//   fmtDateShort('2026-08-06')           // "6 ago 2026"
//   fmtDateShort('', { empty: '' })      // ""      (default is "—")
//   fmtClock('19:30:00')                 // "7:30 PM"

// 'es' and 'es-ES' render identically for every option bag used here; the repo
// had both spellings, so this normalizes them without changing any output.
const LOCALE = 'es';

/** Split "YYYY-MM-DD" into a *local* Date. Returns null when unparseable. */
function localDate(value) {
  const [y, m, d] = String(value ?? '').split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * "6 de agosto de 2026".
 * @param {string} value "YYYY-MM-DD"
 * @param {{empty?: string}} [opts] what to render for a missing/invalid date.
 */
export function fmtDateLong(value, { empty = '' } = {}) {
  const date = localDate(value);
  if (!date) return empty;
  return date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * "6 ago 2026". Defaults to the treasury's em-dash placeholder; the report
 * builder passes `{ empty: '' }` because it renders into PDF table cells.
 * @param {string} value "YYYY-MM-DD"
 * @param {{empty?: string}} [opts]
 */
export function fmtDateShort(value, { empty = '—' } = {}) {
  const date = localDate(value);
  if (!date) return empty;
  return date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * 24-hour clock string → 12-hour display: "19:30:00" or "19:30" → "7:30 PM".
 * Tolerates a bare hour ("19" → "7:00 PM"), which the discipleship group
 * schedules rely on.
 * @param {string} value
 */
export function fmtClock(value) {
  if (!value) return '';
  const [hStr, mStr] = String(value).split(':');
  const h24 = Number(hStr) || 0;
  const minutes = String(mStr ?? '00').padStart(2, '0');
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${minutes} ${h24 < 12 ? 'AM' : 'PM'}`;
}
