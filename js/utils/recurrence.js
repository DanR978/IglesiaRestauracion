// js/utils/recurrence.js
// Recurrence rules → concrete calendar days. Zero-dependency and timezone-free:
// the results are "YYYY-MM-DD" keys; the caller decides what clock time they get.
//
// A rule is { pattern_type, day_of_week, nth_week } (the event_presets columns):
//   'none'         never repeats
//   'weekly'       every `day_of_week` (0 = domingo … 6 = sábado)
//   'lastWeekday'  the last `day_of_week` of the month
//   'nthWeekday'   the `nth_week`-th (1–5) `day_of_week` of the month — a month
//                  without a 5th one simply has no date
//
// Usage:
//   import { datesInMonth, nextOccurrence, monthsFrom } from '/js/utils/recurrence.js';
//   datesInMonth({ pattern_type: 'lastWeekday', day_of_week: 6 }, 2026, 10) // ["2026-11-28"]  ← month 0-indexed
//   nextOccurrence(rule)            // first date from today on, or ""
//   monthsFrom(new Date(), 12)      // [{ year: 2026, month: 9 }, …] — spans the year boundary

import { ymd, isoDate } from './date.js';

const REPEATING = ['weekly', 'lastWeekday', 'nthWeekday'];

// Form selects hand over strings and an unset column is null; Number(null) would
// silently read as 0 (domingo), so blank means "not a number".
const toInt = (v) => (v === null || v === undefined || v === '') ? NaN : Number(v);

/** True when the rule produces dates at all. */
export function isRepeating(rule) {
  const dow = toInt(rule?.day_of_week);
  if (!REPEATING.includes(rule?.pattern_type) || !Number.isInteger(dow) || dow < 0 || dow > 6) return false;
  if (rule.pattern_type !== 'nthWeekday') return true;
  const nth = toInt(rule.nth_week);
  return Number.isInteger(nth) && nth >= 1 && nth <= 5;
}

/** The rule's days in one month (0-indexed), sorted. */
export function datesInMonth(rule, year, month) {
  if (!isRepeating(rule)) return [];
  const dow   = toInt(rule.day_of_week);
  const last  = new Date(year, month + 1, 0).getDate();
  const first = (dow - new Date(year, month, 1).getDay() + 7) % 7 + 1;
  const all = [];
  for (let d = first; d <= last; d += 7) all.push(ymd(year, month, d));
  if (rule.pattern_type === 'weekly') return all;
  if (rule.pattern_type === 'lastWeekday') return all.slice(-1);
  const nth = all[toInt(rule.nth_week) - 1];
  return nth ? [nth] : [];
}

/** `count` consecutive { year, month } starting with `from`'s month. */
export function monthsFrom(from, count) {
  return Array.from({ length: count }, (_, i) => {
    const m = from.getMonth() + i;
    return { year: from.getFullYear() + Math.floor(m / 12), month: m % 12 };
  });
}

/** First day of the rule on or after `from` (within two years), or "". */
export function nextOccurrence(rule, from = new Date()) {
  const today = isoDate(from);
  for (const { year, month } of monthsFrom(from, 24)) {
    const hit = datesInMonth(rule, year, month).find(d => d >= today);
    if (hit) return hit;
  }
  return '';
}
