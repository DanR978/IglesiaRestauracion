// js/utils/date.js
// Date *arithmetic* primitives — zero-padding and local "YYYY-MM-DD" keys.
// Display formatting lives elsewhere; this file has no locale and no timezone.
//
// These lived in js/pages/admin/state.js, which is the admin SPA's state module
// and imports Supabase at module scope. The public site needs the same three
// helpers, so js/components/calendar.js, js/components/CalendarGrid.js and
// js/pages/eventos/hub.js each re-declared them rather than pull the whole
// admin auth layer into a public page load. That's why there were eight copies.
//
// state.js still re-exports these names so its 23 admin importers are unchanged.
// Public modules must import from HERE, never from state.js.
//
// Usage:
//   import { pad2, ymd, isoDate, todayISO } from '/js/utils/date.js';
//   ymd(2026, 7, 6)   // "2026-08-06"  ← note: month is 0-indexed
//   isoDate(someDate) // "2026-08-06"  ← in the *viewer's* timezone

/** Zero-pad a number to two digits. */
export const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Build a "YYYY-MM-DD" key from calendar parts.
 * @param {number} y
 * @param {number} m 0-indexed month, matching Date#getMonth().
 * @param {number} d
 */
export const ymd = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

/**
 * "YYYY-MM-DD" for a Date, read in the viewer's local timezone.
 * For a key pinned to the church's timezone, format explicitly at the call
 * site — this helper deliberately knows nothing about where the church is.
 */
export const isoDate = (date) => ymd(date.getFullYear(), date.getMonth(), date.getDate());

/** Today as "YYYY-MM-DD" in the viewer's local timezone. */
export const todayISO = () => isoDate(new Date());
